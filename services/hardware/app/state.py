"""Printer counters that survive a restart: sheets in the tray, estimated
ink, and practice faults (mock mode)."""

from __future__ import annotations

import json
import threading
from dataclasses import asdict, dataclass
from pathlib import Path


@dataclass
class PrinterCounters:
    paper: int
    ink: float = 100.0
    fault: str = "none"  # none | jam | offline (mock practice problems)


class StateStore:
    def __init__(self, path: Path, capacity: int):
        self.path = path
        self.capacity = capacity
        self._lock = threading.Lock()
        self.counters = self._load()

    def _load(self) -> PrinterCounters:
        try:
            data = json.loads(self.path.read_text(encoding="utf-8"))
            return PrinterCounters(
                paper=int(data.get("paper", self.capacity)),
                ink=float(data.get("ink", 100)),
                fault=str(data.get("fault", "none")),
            )
        except (FileNotFoundError, ValueError):
            return PrinterCounters(paper=self.capacity)

    def update(self, **changes) -> PrinterCounters:
        with self._lock:
            for k, v in changes.items():
                setattr(self.counters, k, v)
            self.path.parent.mkdir(parents=True, exist_ok=True)
            tmp = self.path.with_suffix(".tmp")
            tmp.write_text(json.dumps(asdict(self.counters)), encoding="utf-8")
            tmp.replace(self.path)
            return self.counters
