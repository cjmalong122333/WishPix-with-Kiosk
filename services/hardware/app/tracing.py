"""Dotted and dashed lines for tracing.

The tracing letters and the Trace Image outline are both made the same way:
thin a black shape down to its centre line (one pixel wide), follow that
line as a list of paths, then draw evenly spaced dots or dashes along each
path. So a letter becomes one row of dots along each stroke (not a dotted
outline around it), and a solid AI outline becomes a dashed one.
"""

from __future__ import annotations

import math

import numpy as np
from PIL import ImageDraw

# Neighbours, straight ones first so a path follows the line instead of
# cutting corners across a staircase of pixels.
NEIGHBOURS = [(-1, 0), (0, 1), (1, 0), (0, -1), (-1, 1), (1, 1), (1, -1), (-1, -1)]


def _thinning_tables() -> tuple[np.ndarray, np.ndarray]:
    """For each of the 256 neighbourhoods (bit i = neighbour P2..P9 is set):
    may the centre pixel be removed in Zhang-Suen step 1 / step 2?"""
    tables = (np.zeros(256, bool), np.zeros(256, bool))
    for code in range(256):
        p = [(code >> i) & 1 for i in range(8)]  # P2, P3, P4, P5, P6, P7, P8, P9
        p2, _, p4, _, p6, _, p8, _ = p
        filled = sum(p)
        turns = sum(1 for i in range(8) if p[i] == 0 and p[(i + 1) % 8] == 1)
        if 2 <= filled <= 6 and turns == 1:
            tables[0][code] = p2 * p4 * p6 == 0 and p4 * p6 * p8 == 0
            tables[1][code] = p2 * p4 * p8 == 0 and p2 * p6 * p8 == 0
    return tables


THINNING = _thinning_tables()


def thin(mask: np.ndarray) -> np.ndarray:
    """Zhang-Suen thinning: the one-pixel centre line of every shape in mask."""
    full = np.zeros(mask.shape, np.uint8)
    ys, xs = np.nonzero(mask)
    if len(ys) == 0:
        return full
    y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    img = np.pad((mask[y0:y1, x0:x1] > 0).astype(np.uint8), 1)
    while True:
        changed = False
        for table in THINNING:
            code = (
                img[:-2, 1:-1]
                | img[:-2, 2:] << 1
                | img[1:-1, 2:] << 2
                | img[2:, 2:] << 3
                | img[2:, 1:-1] << 4
                | img[2:, :-2] << 5
                | img[1:-1, :-2] << 6
                | img[:-2, :-2] << 7
            )
            remove = (img[1:-1, 1:-1] == 1) & table[code]
            if remove.any():
                img[1:-1, 1:-1][remove] = 0
                changed = True
        if not changed:
            full[y0:y1, x0:x1] = img[1:-1, 1:-1]
            return full


def paths(skeleton: np.ndarray, min_length: float = 3, trim: float = 0) -> list[tuple[np.ndarray, bool]]:
    """Follows a one-pixel skeleton. Returns (points as x, y floats, closed).
    trim: shortens open lines at both ends by this much, which removes the
    little hooks thinning leaves in sharp corners (the foot of an A)."""
    ys, xs = np.nonzero(skeleton)
    pixels = set(zip(ys.tolist(), xs.tolist(), strict=True))

    def around(p):
        return [(p[0] + dy, p[1] + dx) for dy, dx in NEIGHBOURS if (p[0] + dy, p[1] + dx) in pixels]

    degree = {p: len(around(p)) for p in pixels}
    seen: set[tuple[int, int]] = set()
    out: list[tuple[np.ndarray, bool]] = []
    # Line ends first, then junctions, then whatever is left (closed loops like "O").
    for start in sorted(pixels, key=lambda p: (degree[p] != 1, degree[p] < 3, p)):
        if start in seen:
            continue
        line = [start]
        seen.add(start)
        cur = start
        while True:
            nxt = next((q for q in around(cur) if q not in seen), None)
            if nxt is None:
                break
            seen.add(nxt)
            line.append(nxt)
            cur = nxt
        closed = len(line) > 4 and max(abs(line[-1][0] - start[0]), abs(line[-1][1] - start[1])) <= 1
        pts = np.array([(x, y) for y, x in line], dtype=float)
        if len(pts) >= 3:
            pts = smooth(pts, closed)
        if trim and not closed:
            # Only free ends get the hook; an end at a junction (the bar of an
            # A meeting its legs) must reach the other stroke.
            pts = trim_ends(pts, trim, degree[line[0]] <= 1, degree[line[-1]] <= 1)
        if length(pts, closed) >= min_length:
            out.append((pts, closed))
    return out


def trim_ends(pts: np.ndarray, amount: float, start: bool = True, end: bool = True) -> np.ndarray:
    total = length(pts)
    if total <= 3 * amount or not (start or end):
        return pts
    seq, cumulative = _walk(pts, False)
    a, b = (amount if start else 0), (total - amount if end else total)
    inner = [point_at(seq, cumulative, a)]
    inner += [tuple(p) for p, c in zip(seq, cumulative, strict=True) if a < c < b]
    inner.append(point_at(seq, cumulative, b))
    return np.array(inner, dtype=float)


def smooth(pts: np.ndarray, closed: bool, window: int = 2) -> np.ndarray:
    """Evens out the pixel staircase so dots and dashes sit on a smooth line."""
    if len(pts) <= 2 * window:
        return pts
    padded = (
        np.vstack([pts[-window:], pts, pts[:window]])
        if closed
        else np.vstack([pts[:1].repeat(window, 0), pts, pts[-1:].repeat(window, 0)])
    )
    kernel = np.ones(2 * window + 1) / (2 * window + 1)
    xs = np.convolve(padded[:, 0], kernel, mode="valid")
    ys = np.convolve(padded[:, 1], kernel, mode="valid")
    out = np.column_stack([xs, ys])
    if not closed:
        out[0], out[-1] = pts[0], pts[-1]
    return out


def length(pts: np.ndarray, closed: bool = False) -> float:
    if len(pts) < 2:
        return 0.0
    seq = np.vstack([pts, pts[:1]]) if closed else pts
    return float(np.hypot(*np.diff(seq, axis=0).T).sum())


def point_at(pts: np.ndarray, cumulative: np.ndarray, d: float) -> tuple[float, float]:
    i = int(np.searchsorted(cumulative, d, side="right")) - 1
    i = max(0, min(i, len(pts) - 2))
    seg = cumulative[i + 1] - cumulative[i]
    t = 0.0 if seg == 0 else (d - cumulative[i]) / seg
    return float(pts[i][0] + (pts[i + 1][0] - pts[i][0]) * t), float(pts[i][1] + (pts[i + 1][1] - pts[i][1]) * t)


def _walk(pts: np.ndarray, closed: bool):
    seq = np.vstack([pts, pts[:1]]) if closed else pts
    cumulative = np.concatenate([[0.0], np.cumsum(np.hypot(*np.diff(seq, axis=0).T))])
    return seq, cumulative


def draw_dots(
    draw: ImageDraw.ImageDraw,
    lines: list[tuple[np.ndarray, bool]],
    spacing: float,
    radius: float,
    scale: float = 1.0,
    offset: tuple[float, float] = (0, 0),
    fill=0,
):
    """Evenly spaced round dots along each line (ends included), never two dots on top of each other."""
    placed: dict[tuple[int, int], list[tuple[float, float]]] = {}
    cell = max(1.0, spacing)
    too_close = spacing * 0.6

    def free(x: float, y: float) -> bool:
        cx, cy = int(x // cell), int(y // cell)
        for gx in (cx - 1, cx, cx + 1):
            for gy in (cy - 1, cy, cy + 1):
                for px, py in placed.get((gx, gy), ()):
                    if math.hypot(px - x, py - y) < too_close:
                        return False
        return True

    ox, oy = offset
    for pts, closed in lines:
        pts = pts * scale + (ox, oy)
        seq, cumulative = _walk(pts, closed)
        total = cumulative[-1]
        if total < spacing * 0.5:
            spots = [point_at(seq, cumulative, total / 2)]
        else:
            n = max(1, round(total / spacing))
            count = n if closed else n + 1
            spots = [point_at(seq, cumulative, total * i / n) for i in range(count)]
        for x, y in spots:
            if free(x, y):
                placed.setdefault((int(x // cell), int(y // cell)), []).append((x, y))
                draw.ellipse((x - radius, y - radius, x + radius, y + radius), fill=fill)


def draw_dashes(
    draw: ImageDraw.ImageDraw,
    lines: list[tuple[np.ndarray, bool]],
    dash: float,
    gap: float,
    width: int,
    scale: float = 1.0,
    offset: tuple[float, float] = (0, 0),
    fill=0,
):
    """Short dashes with small gaps along each line, stretched a little so
    every line starts and ends with a dash ("cut here" lines)."""
    ox, oy = offset
    for pts, closed in lines:
        pts = pts * scale + (ox, oy)
        seq, cumulative = _walk(pts, closed)
        total = cumulative[-1]
        if total <= dash * 1.3:
            _line(draw, seq, width, fill)
            continue
        n = max(1, round((total + gap) / (dash + gap)))
        if closed:
            stretch = total / (n * (dash + gap))
        else:
            stretch = total / (n * dash + (n - 1) * gap)
        d, g = dash * stretch, gap * stretch
        for i in range(n):
            a = i * (d + g)
            b = min(total, a + d)
            inner = [point_at(seq, cumulative, a)]
            inner += [tuple(p) for p, c in zip(seq, cumulative, strict=True) if a < c < b]
            inner.append(point_at(seq, cumulative, b))
            _line(draw, np.array(inner), width, fill)


def _line(draw: ImageDraw.ImageDraw, pts: np.ndarray, width: int, fill):
    flat = [(float(x), float(y)) for x, y in pts]
    if len(flat) == 1:
        flat.append(flat[0])
    draw.line(flat, fill=fill, width=width, joint="curve")
    r = width / 2
    for x, y in (flat[0], flat[-1]):
        draw.ellipse((x - r, y - r, x + r, y + r), fill=fill)
