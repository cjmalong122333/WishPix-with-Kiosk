"""58mm thermal printing (optional; the 4x6 inkjet is the recommended printer).

A thermal printer only makes black dots, so every page goes through the same
steps before it is printed: fit to the printer's dot width, raise the
contrast, then Floyd-Steinberg dithering to pure black and white. Lines that
are already black (the tracing dots and dashes, the coloring outlines) come
through unchanged; photos and gray areas in a teacher's file become dot
patterns. `raster()` turns the result into ESC/POS "GS v 0" commands.
"""

from __future__ import annotations

import numpy as np
from PIL import Image, ImageOps


def thermal_ready(img: Image.Image, width: int | None = None, photo: bool = False) -> Image.Image:
    """Mode "1" (black and white), ready for the printer. width: scale to this
    many dots across first (pages laid out at the printer's size need none)."""
    gray = ImageOps.grayscale(img if img.mode != "1" else img.convert("L"))
    if width and gray.width != width:
        gray = gray.resize((width, max(1, round(gray.height * width / gray.width))), Image.LANCZOS)
    if photo:
        # Stretch the tones so the dithering has the whole range to work with.
        gray = ImageOps.autocontrast(gray, cutoff=1)
    else:
        # Line art: near-black is black and near-white is paper, so thin dots
        # and dashes stay solid instead of being dithered into speckles.
        lut = [0 if v < 110 else 255 if v > 190 else round((v - 110) * 255 / 80) for v in range(256)]
        gray = gray.point(lut)
    return gray.convert("1", dither=Image.Dither.FLOYDSTEINBERG)


INIT = b"\x1b@"
FEED = b"\x1bd\x04"  # feed 4 lines so the page clears the tear bar
CUT = b"\x1dV\x42\x00"  # partial cut (ignored by printers without a cutter)
BAND = 255  # rows per raster command; some printers can't take more at once


def raster(img: Image.Image, cut: bool = True) -> bytes:
    """ESC/POS bytes that print img (any mode; black pixels become dots)."""
    black = np.array(img.convert("L")) < 128
    width_bytes = (black.shape[1] + 7) // 8
    packed = np.packbits(black, axis=1)  # MSB first, rows padded to whole bytes
    out = bytearray(INIT)
    for top in range(0, packed.shape[0], BAND):
        band = packed[top : top + BAND]
        rows = band.shape[0]
        out += b"\x1dv0\x00" + bytes([width_bytes & 255, width_bytes >> 8, rows & 255, rows >> 8])
        out += band.tobytes()
    out += FEED
    if cut:
        out += CUT
    return bytes(out)
