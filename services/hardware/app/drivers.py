"""Printer drivers.

CupsPrinter talks to CUPS with its command-line tools (lp, lpstat, cancel,
cupsenable), so no C library bindings are needed on the Raspberry Pi. It
drives the recommended inkjet.
EscPosPrinter sends ESC/POS raster commands straight to an optional 58 mm
thermal printer (USB device or network).
MockPrinter stands in for both during development and practice: pages are
saved as PNG files and faults can be simulated.
"""

from __future__ import annotations

import logging
import os
import re
import select
import shutil
import socket
import subprocess
import threading
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Literal, Protocol

from PIL import Image

from .state import StateStore
from .thermal import raster

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


# ---------- ESC/POS thermal printer (optional) ----------


class EscPosPrinter:
    """A 58 mm thermal printer that speaks ESC/POS, on USB (/dev/usb/lp0)
    or the network (tcp://host:9100). Pages arrive already dithered."""

    mode = "escpos"

    def __init__(self, device: str, cut: bool, dots: int, dpi: int, mm_per_second: float):
        self.device = device
        self.name = f"Thermal printer ({device})"
        self.cut = cut
        self.dots = dots
        self.dpi = dpi
        self.speed = max(5.0, mm_per_second)
        self._lock = threading.Lock()  # one conversation with the printer at a time
        self._jobs: dict[str, float | None] = {}  # job -> when it is out (None = failed)
        self._last = DriverStatus(problem=None, ink=None)
        self._next = 1

    def _tcp(self) -> tuple[str, int] | None:
        if not self.device.startswith("tcp://"):
            return None
        host, _, port = self.device[6:].partition(":")
        return host, int(port or 9100)

    def _send(self, data: bytes, reply: bool = False) -> int | None:
        """Writes data; with reply, waits up to 1.5 s for one status byte."""
        address = self._tcp()
        if address:
            with socket.create_connection(address, timeout=5) as conn:
                conn.sendall(data)
                if not reply:
                    return None
                conn.settimeout(1.5)
                try:
                    got = conn.recv(1)
                except TimeoutError:
                    return None
                return got[0] if got else None
        if not os.path.exists(self.device):
            raise OSError(f"{self.device} not found. Is the printer plugged in and on?")
        fd = os.open(self.device, os.O_RDWR | getattr(os, "O_NONBLOCK", 0))
        try:
            view = memoryview(data)
            while view:
                try:
                    view = view[os.write(fd, view) :]
                except BlockingIOError:
                    select.select([], [fd], [], 1.0)
            if not reply:
                return None
            ready, _, _ = select.select([fd], [], [], 1.5)
            if not ready:
                return None
            got = os.read(fd, 1)
            return got[0] if got else None
        finally:
            os.close(fd)

    def status(self) -> DriverStatus:
        # Never ask in the middle of a page: the question would land inside the picture.
        if not self._lock.acquire(blocking=False):
            return self._last
        try:
            # DLE EOT 4: the paper sensor. Bits 5 and 6 = the roll is empty.
            answer = self._send(b"\x10\x04\x04", reply=True)
            problem = "no_paper" if answer is not None and answer & 0x60 else None
            self._last = DriverStatus(problem=problem, ink=None)
        except (OSError, ValueError) as err:
            log.warning("thermal printer status: %s", err)
            self._last = DriverStatus(problem="offline", ink=None)
        finally:
            self._lock.release()
        return self._last

    def submit(self, page: Path, colorful: bool) -> str:
        img = Image.open(page)
        if img.width > self.dots and img.height <= self.dots:
            img = img.rotate(90, expand=True)  # a landscape page goes along the roll
        if img.width != self.dots:
            img = img.convert("L").resize((self.dots, max(1, round(img.height * self.dots / img.width))), Image.LANCZOS)
        job_id = f"escpos-{self._next}"
        self._next += 1
        with self._lock:
            try:
                self._send(raster(img, self.cut))
            except (OSError, ValueError) as err:
                log.warning("thermal printer: %s", err)
                self._jobs[job_id] = None
                return job_id
        length_mm = img.height / self.dpi * 25.4
        self._jobs[job_id] = time.monotonic() + length_mm / self.speed + 1
        return job_id

    def job_state(self, job_id: str) -> JobState:
        out_at = self._jobs.get(job_id)
        if out_at is None:
            return "failed"
        return "done" if time.monotonic() >= out_at else "pending"

    def cancel(self, job_id: str) -> None:
        # What was sent is already printing; just stop waiting for it.
        self._jobs[job_id] = None

    def resume(self) -> None:
        self._last = DriverStatus(problem=None, ink=None)
