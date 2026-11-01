"""Printer drivers.

CupsPrinter talks to CUPS with its command-line tools (lp, lpstat, cancel,
cupsenable), so no C library bindings are needed on the Raspberry Pi.
MockPrinter stands in for it during development and practice: pages are
saved as PNG files and faults can be simulated.
"""

from __future__ import annotations

import logging
import re
import shutil
import subprocess
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Literal, Protocol

from .state import StateStore

log = logging.getLogger("wishpix.hardware")

JobState = Literal["pending", "done", "failed"]


@dataclass
class DriverStatus:
    problem: str | None  # offline | jam | no_paper | no_ink | error | None
    ink: int | None  # percent reported by the printer, or None when unknown


class PrinterDriver(Protocol):
    mode: str
    name: str | None

    def status(self) -> DriverStatus: ...
    def submit(self, page: Path, colorful: bool) -> str: ...
    def job_state(self, job_id: str) -> JobState: ...
    def cancel(self, job_id: str) -> None: ...
    def resume(self) -> None: ...


# ---------- Mock ----------


class MockPrinter:
    mode = "mock"
    name = "Simulated printer"

    def __init__(self, state: StateStore, page_seconds: float):
        self.state = state
        self.page_seconds = page_seconds
        self._jobs: dict[str, float] = {}
        self._failed: set[str] = set()
        self._next = 1

    def status(self) -> DriverStatus:
        fault = self.state.counters.fault
        return DriverStatus(problem=None if fault == "none" else fault, ink=None)

    def submit(self, page: Path, colorful: bool) -> str:
        job_id = f"mock-{self._next}"
        self._next += 1
        self._jobs[job_id] = time.monotonic()
        return job_id

    def job_state(self, job_id: str) -> JobState:
        if job_id in self._failed:
            return "failed"
        started = self._jobs.get(job_id)
        if started is None:
            return "failed"
        # A jam or power-off while printing loses the page.
        if self.state.counters.fault != "none":
            self._failed.add(job_id)
            return "failed"
        return "done" if time.monotonic() - started >= self.page_seconds else "pending"

    def cancel(self, job_id: str) -> None:
        self._failed.add(job_id)

    def resume(self) -> None:
        self.state.update(fault="none")


# ---------- CUPS ----------

# printer-state-reasons (see `lpstat -l -p`) mapped to WishPix problems.
REASONS = [
    ("media-jam", "jam"),
    ("media-empty", "no_paper"),
    ("media-needed", "no_paper"),
    ("marker-supply-empty", "no_ink"),
    ("toner-empty", "no_ink"),
    ("cover-open", "jam"),
    ("door-open", "jam"),
    ("offline", "offline"),
    ("shutdown", "offline"),
    ("connecting-to-device", "offline"),
]


class CupsError(RuntimeError):
    pass


class CupsPrinter:
    mode = "cups"

    def __init__(self, printer: str, media: str, extra_options: str):
        if not shutil.which("lp"):
            raise CupsError("CUPS is not installed (the lp command was not found). Install the cups package.")
        self.name = printer or self._default_printer()
        self.media = media
        self.extra = [o for o in extra_options.split() if o]
        self._submitted: dict[str, float] = {}

    @staticmethod
    def _run(*args: str, timeout: float = 10) -> str:
        result = subprocess.run(args, capture_output=True, text=True, timeout=timeout, check=False)
        if result.returncode != 0:
            raise CupsError(f"{' '.join(args)} failed: {result.stderr.strip() or result.stdout.strip()}")
        return result.stdout

    def _default_printer(self) -> str:
        out = self._run("lpstat", "-d")
        match = re.search(r"system default destination:\s*(\S+)", out)
        if not match:
            raise CupsError("No CUPS printer chosen. Set CUPS_PRINTER or run: lpoptions -d <printer>")
        return match.group(1)

    def status(self) -> DriverStatus:
        try:
            out = self._run("lpstat", "-l", "-p", self.name)
        except (CupsError, subprocess.TimeoutExpired) as err:
            log.warning("lpstat failed: %s", err)
            return DriverStatus(problem="offline", ink=None)
        problem = None
        if re.search(r"\bdisabled\b", out):
            problem = "offline"
        alerts = " ".join(re.findall(r"Alerts:\s*(.*)", out)) + " " + " ".join(re.findall(r"reason\(s\):\s*(.*)", out))
        for reason, mapped in REASONS:
            if reason in alerts:
                problem = mapped
                break
        return DriverStatus(problem=problem, ink=self._ink_level())

    def _ink_level(self) -> int | None:
        """Lowest ink level the printer reports over IPP (needs ipptool)."""
        if not shutil.which("ipptool"):
            return None
        try:
            out = self._run(
                "ipptool",
                "-T",
                "5",
                "-tv",
                f"ipp://localhost/printers/{self.name}",
                "get-printer-attributes.test",
                timeout=8,
            )
        except (CupsError, subprocess.TimeoutExpired):
            return None
        match = re.search(r"marker-levels \([^)]*\) = ([-\d,]+)", out)
        if not match:
            return None
        levels = [int(v) for v in match.group(1).split(",") if v.strip().lstrip("-").isdigit() and int(v) >= 0]
        return min(levels) if levels else None

    def submit(self, page: Path, colorful: bool) -> str:
        options = [f"media={self.media}", *self.extra]
        if not colorful:
            options.append("print-color-mode=monochrome")
        args = ["lp", "-d", self.name, "-t", "WishPix"]
        for o in options:
            args += ["-o", o]
        out = self._run(*args, str(page), timeout=30)
        match = re.search(r"request id is (\S+)", out)
        if not match:
            raise CupsError(f"Unexpected lp output: {out.strip()}")
        job_id = match.group(1)
        self._submitted[job_id] = time.monotonic()
        return job_id

    def job_state(self, job_id: str) -> JobState:
        try:
            pending = self._run("lpstat", "-W", "not-completed", "-o", self.name)
            if re.search(rf"^{re.escape(job_id)}\s", pending, re.M):
                return "pending"
            completed = self._run("lpstat", "-W", "completed", "-o", self.name)
        except (CupsError, subprocess.TimeoutExpired):
            return "pending"
        # Finished jobs are listed as completed; cancelled or aborted ones vanish.
        return "done" if re.search(rf"^{re.escape(job_id)}\s", completed, re.M) else "failed"

    def cancel(self, job_id: str) -> None:
        try:
            self._run("cancel", job_id)
        except CupsError as err:
            log.warning("cancel %s failed: %s", job_id, err)

    def resume(self) -> None:
        # After the teacher fixes a jam or turns the printer on: let CUPS print again.
        for cmd in (("cupsenable", self.name), ("cupsaccept", self.name)):
            try:
                self._run(*cmd)
            except CupsError as err:
                log.warning("%s failed: %s", cmd[0], err)
