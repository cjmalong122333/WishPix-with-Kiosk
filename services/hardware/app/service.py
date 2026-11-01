"""The print queue: one page at a time, in order, on a background thread."""

from __future__ import annotations

import logging
import queue
import threading
import time
import uuid
from dataclasses import dataclass, field
from pathlib import Path

from .config import Settings
from .drivers import CupsPrinter, MockPrinter, PrinterDriver
from .layout import PageRequest, render_page, to_png
from .state import StateStore

log = logging.getLogger("wishpix.hardware")

LOW_PAPER = 3
LOW_INK = 15
# Estimated ink per page when the printer does not report its levels.
INK_PER_PAGE = {True: 4.0, False: 1.0}


@dataclass
class Job:
    id: str
    request_id: int | None
    kind: str
    page: PageRequest
    image: bytes | None
    status: str = "queued"  # queued | printing | done | failed
    problem: str | None = None
    page_file: Path | None = None
    created: float = field(default_factory=time.time)


class PrintService:
    def __init__(self, settings: Settings, driver: PrinterDriver | None = None):
        self.settings = settings
        settings.pages_dir.mkdir(parents=True, exist_ok=True)
        self.state = StateStore(settings.state_dir / "printer.json", settings.paper_capacity)
        self.driver: PrinterDriver = driver or self._make_driver()
        self.jobs: dict[str, Job] = {}
        self.waiting: list[Job] = []
        self.current: Job | None = None
        self._queue: queue.Queue[Job] = queue.Queue()
        self._lock = threading.Lock()
        self._status_cache: tuple[float, object] | None = None
        threading.Thread(target=self._worker, name="print-worker", daemon=True).start()

    def _make_driver(self) -> PrinterDriver:
        s = self.settings
        if s.printer_mode == "cups":
            return CupsPrinter(s.cups_printer, s.cups_media, s.cups_extra_options)
        return MockPrinter(self.state, s.mock_page_seconds)

    # ---------- Status ----------

    def driver_status(self):
        # lpstat/ipptool are slow-ish; the web app polls every few seconds.
        now = time.monotonic()
        if self._status_cache and now - self._status_cache[0] < 2:
            return self._status_cache[1]
        status = self.driver.status()
        self._status_cache = (now, status)
        return status

    def ink(self) -> float:
        reported = self.driver_status().ink
        return float(reported) if reported is not None else self.state.counters.ink

    def problem(self) -> str | None:
        """Why the printer cannot print right now, or None when it can."""
        status = self.driver_status()
        if status.problem:
            return status.problem
        if self.state.counters.paper <= 0:
            return "no_paper"
        if self.ink() <= 0:
            return "no_ink"
        return None

    def status(self) -> dict:
        paper = self.state.counters.paper
        ink = round(self.ink())
        with self._lock:
            printing = self.current
            waiting = list(self.waiting)
        return {
            "mode": self.driver.mode,
            "printerName": self.driver.name,
            "paper": paper,
            "capacity": self.settings.paper_capacity,
            "ink": ink,
            "problem": self.problem(),
            "lowPaper": 0 < paper <= LOW_PAPER,
            "lowInk": 0 < ink <= LOW_INK,
            "printing": printing and {"requestId": printing.request_id, "kind": printing.kind},
            "queue": [{"requestId": j.request_id, "kind": j.kind} for j in waiting],
        }

    # ---------- Jobs ----------

    def submit(self, page: PageRequest, image: bytes | None, request_id: int | None) -> Job:
        job = Job(id=uuid.uuid4().hex[:12], request_id=request_id, kind=page.kind, page=page, image=image)
        with self._lock:
            self.jobs[job.id] = job
            self.waiting.append(job)
            self._forget_old_jobs()
        self._queue.put(job)
        return job

    def _forget_old_jobs(self):
        cutoff = time.time() - 3600
        for job_id in [j.id for j in self.jobs.values() if j.created < cutoff and j.status in ("done", "failed")]:
            self.jobs.pop(job_id, None)

    def _worker(self):
        while True:
            job = self._queue.get()
            with self._lock:
                self.waiting = [j for j in self.waiting if j.id != job.id]
                self.current = job
            try:
                self._print(job)
            except Exception:  # noqa: BLE001 - one bad page must never stop the queue
                log.exception("Print job %s crashed", job.id)
                job.status, job.problem = "failed", job.problem or "error"
            finally:
                with self._lock:
                    self.current = None
                job.image = None

    def _print(self, job: Job):
        job.status = "printing"
        page = render_page(job.page, job.image)
        job.page_file = self.settings.pages_dir / f"{time.strftime('%Y%m%d-%H%M%S')}-{job.id}.png"
        job.page_file.write_bytes(to_png(page))
        self._prune_pages()

        problem = self.problem()
        if problem:
            job.status, job.problem = "failed", problem
            return

        driver_id = self.driver.submit(job.page_file, job.page.colorful)
        started = time.monotonic()
        problem_since: float | None = None
        while True:
            time.sleep(1)
            state = self.driver.job_state(driver_id)
            if state == "done":
                break
            if state == "failed":
                job.status, job.problem = "failed", self.problem() or "error"
                return
            # A real printer waits while jammed; after a while the job is
            # cancelled so the kiosk can move on and the teacher reprints it.
            self._status_cache = None
            problem = self.problem()
            if problem:
                problem_since = problem_since or time.monotonic()
                if time.monotonic() - problem_since > self.settings.problem_grace_seconds:
                    self.driver.cancel(driver_id)
                    job.status, job.problem = "failed", problem
                    return
            else:
                problem_since = None
            if time.monotonic() - started > self.settings.job_timeout_seconds:
                self.driver.cancel(driver_id)
                job.status, job.problem = "failed", "error"
                return

        counters = self.state.counters
        changes: dict = {"paper": max(0, counters.paper - 1)}
        if self.driver_status().ink is None:
            changes["ink"] = max(0.0, counters.ink - INK_PER_PAGE[job.page.colorful])
        self.state.update(**changes)
        job.status = "done"

    def _prune_pages(self):
        pages = sorted(self.settings.pages_dir.glob("*.png"))
        for old in pages[: max(0, len(pages) - self.settings.keep_pages)]:
            old.unlink(missing_ok=True)

    # ---------- Teacher fixes ----------

    def refill_paper(self, sheets: int | None = None):
        self.state.update(paper=min(self.settings.paper_capacity, sheets or self.settings.paper_capacity))

    def replace_ink(self):
        self.state.update(ink=100.0)
        self._status_cache = None

    def clear(self):
        self.driver.resume()
        self._status_cache = None

    # ---------- Practice problems (mock mode only) ----------

    SIMULATIONS = ("jam", "offline", "low_paper", "low_ink", "no_ink")

    def simulate(self, problem: str):
        counters = self.state.counters
        if problem in ("jam", "offline"):
            self.state.update(fault=problem)
        elif problem == "low_paper":
            self.state.update(paper=min(counters.paper, 2))
        elif problem == "low_ink":
            self.state.update(ink=min(counters.ink, 10.0))
        elif problem == "no_ink":
            self.state.update(ink=0.0)
        self._status_cache = None
