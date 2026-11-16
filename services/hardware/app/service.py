"""The print queue: one job at a time, in order, on a background thread.

A job is either one child's page (laid out here from the picture) or a
teacher's file (Print to Kiosk): some pages of a PNG, JPG or PDF, each
printed `copies` times.
"""

from __future__ import annotations

import logging
import queue
import threading
import time
import uuid
from dataclasses import dataclass, field
from pathlib import Path

from .config import Settings
from .drivers import CupsPrinter, EscPosPrinter, MockPrinter, PrinterDriver
from .files import file_page
from .layout import FORMATS, PageRequest, render_page, to_png
from .state import StateStore

log = logging.getLogger("wishpix.hardware")

LOW_PAPER = 3
LOW_INK = 15
# Estimated ink per inkjet page when the printer does not report its levels
# (teacher files may be in color; children's pages are black and white).
INK_PER_PAGE = {True: 4.0, False: 1.0}


@dataclass
class Job:
    id: str
    request_id: int | None
    kind: str  # child | reprint | test | file
    page: PageRequest | None = None
    image: bytes | None = None
    # Teacher files
    file: bytes | None = None
    file_kind: str = ""
    pages: list[int] = field(default_factory=list)
    copies: int = 1
    status: str = "queued"  # queued | printing | done | failed
    problem: str | None = None
    page_file: Path | None = None
    done: int = 0  # sheets printed so far
    total: int = 1
    created: float = field(default_factory=time.time)


class PrintService:
    def __init__(self, settings: Settings, driver: PrinterDriver | None = None):
        self.settings = settings
        self.format = FORMATS[settings.format_id]
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
        if s.printer_mode == "escpos":
            return EscPosPrinter(
                s.escpos_device, s.escpos_cut, self.format.width, self.format.dpi, s.escpos_mm_per_second
            )
        return MockPrinter(self.state, s.mock_page_seconds)

    @property
    def uses_ink(self) -> bool:
        """A thermal printer has no ink (or toner) to run out of."""
        return not self.format.thermal

    # ---------- Status ----------

    def driver_status(self):
        # lpstat/ipptool are slow-ish; the web app polls every few seconds.
        now = time.monotonic()
        if self._status_cache and now - self._status_cache[0] < 2:
            return self._status_cache[1]
        status = self.driver.status()
        self._status_cache = (now, status)
        return status

    def ink(self) -> float | None:
        if not self.uses_ink:
            return None
        reported = self.driver_status().ink
        return float(reported) if reported is not None else self.state.counters.ink

    def problem(self) -> str | None:
        """Why the printer cannot print right now, or None when it can."""
        status = self.driver_status()
        if status.problem and (self.uses_ink or status.problem != "no_ink"):
            return status.problem
        if self.state.counters.paper <= 0:
            return "no_paper"
        ink = self.ink()
        if ink is not None and ink <= 0:
            return "no_ink"
        return None

    def status(self) -> dict:
        paper = self.state.counters.paper
        ink = self.ink()
        ink = round(ink) if ink is not None else None
        with self._lock:
            printing = self.current
            waiting = list(self.waiting)
        return {
            "mode": self.driver.mode,
            "printerName": self.driver.name,
            "format": self.format.id,
            "paper": paper,
            "capacity": self.settings.paper_capacity,
            "ink": ink,
            "problem": self.problem(),
            "lowPaper": 0 < paper <= LOW_PAPER,
            "lowInk": ink is not None and 0 < ink <= LOW_INK,
            "printing": printing and {"requestId": printing.request_id, "kind": printing.kind},
            "queue": [{"requestId": j.request_id, "kind": j.kind} for j in waiting],
        }

    # ---------- Jobs ----------

    def submit(self, page: PageRequest, image: bytes | None, request_id: int | None) -> Job:
        return self._add(Job(id=uuid.uuid4().hex[:12], request_id=request_id, kind=page.kind, page=page, image=image))

    def submit_file(self, data: bytes, kind: str, pages: list[int], copies: int) -> Job:
        job = Job(
            id=uuid.uuid4().hex[:12],
            request_id=None,
            kind="file",
            file=data,
            file_kind=kind,
            pages=pages,
            copies=copies,
            total=len(pages) * copies,
        )
        return self._add(job)

    def _add(self, job: Job) -> Job:
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
                job.status = "printing"
                if job.kind == "file":
                    self._print_file(job)
                else:
                    self._print_page(job)
            except Exception:  # noqa: BLE001 - one bad page must never stop the queue
                log.exception("Print job %s crashed", job.id)
                job.status, job.problem = "failed", job.problem or "error"
            finally:
                with self._lock:
                    self.current = None
                job.image = None
                job.file = None

    def _save(self, job: Job, page, suffix: str = "") -> Path:
        path = self.settings.pages_dir / f"{time.strftime('%Y%m%d-%H%M%S')}-{job.id}{suffix}.png"
        path.write_bytes(to_png(page, self.format))
        self._prune_pages()
        return path

    def _print_page(self, job: Job):
        job.page_file = self._save(job, render_page(job.page, job.image, self.format))
        problem = self._send(job.page_file, colorful=False)
        if problem:
            job.status, job.problem = "failed", problem
            return
        job.done = 1
        job.status = "done"

    def _print_file(self, job: Job):
        for n, index in enumerate(job.pages):
            page = file_page(job.file, job.file_kind, index, self.format)
            job.page_file = self._save(job, page, f"-p{index + 1}")
            for copy in range(job.copies):
                problem = self._send(job.page_file, colorful=not self.format.thermal)
                if problem:
                    job.status, job.problem = "failed", problem
                    log.info("Teacher file %s stopped at page %d copy %d: %s", job.id, n + 1, copy + 1, problem)
                    return
                job.done += 1
        job.status = "done"

    def _send(self, page_file: Path, colorful: bool) -> str | None:
        """Prints one sheet and waits until it is out. Returns the problem, or None."""
        problem = self.problem()
        if problem:
            return problem
        driver_id = self.driver.submit(page_file, colorful)
        started = time.monotonic()
        problem_since: float | None = None
        while True:
            time.sleep(0.5 if self.format.thermal else 1)
            state = self.driver.job_state(driver_id)
            if state == "done":
                break
            if state == "failed":
                self._status_cache = None
                return self.problem() or "error"
            # A real printer waits while jammed; after a while the job is
            # cancelled so the kiosk can move on and the teacher reprints it.
            self._status_cache = None
            problem = self.problem()
            if problem:
                problem_since = problem_since or time.monotonic()
                if time.monotonic() - problem_since > self.settings.problem_grace_seconds:
                    self.driver.cancel(driver_id)
                    return problem
            else:
                problem_since = None
            if time.monotonic() - started > self.settings.job_timeout_seconds:
                self.driver.cancel(driver_id)
                return "error"

        counters = self.state.counters
        changes: dict = {"paper": max(0, counters.paper - 1)}
        if self.uses_ink and self.driver_status().ink is None:
            changes["ink"] = max(0.0, counters.ink - INK_PER_PAGE[colorful])
        self.state.update(**changes)
        return None

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
