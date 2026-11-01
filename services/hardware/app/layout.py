"""Print-ready page layout.

Builds one 4x6 inch portrait page at 300 dpi (1200 x 1800 px) from the
generated picture: header, title, picture, Trace & Learn guides and a name
line. Coloring pages are turned into clean black line art; Free Play pages
keep their colors. Letters, numbers and shapes for tracing are drawn here as
dots, never by the AI, so they are always correct.
"""

from __future__ import annotations

import io
import math
import os
from dataclasses import dataclass, field
from datetime import datetime
from functools import lru_cache

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageOps

from .config import get_settings

DPI = 300
PAGE_W, PAGE_H = 4 * DPI, 6 * DPI
MARGIN = 70
INK = (40, 46, 58)
GUIDE = (201, 208, 219)
NAVY = (17, 40, 74)
MUTED = (138, 148, 166)

TEXT = {
    "fil": {
        "Color me!": "Kulayan mo ako!",
        "Name:": "Pangalan:",
        "{letter} is for {word}": "Ang {letter} ay para sa {word}",
        "Count and trace": "Bilangin at bakatin",
        "Trace the {shape}s": "Bakatin ang mga {shape}",
        "Follow the dotted line": "Sundan ang tuldok-tuldok na linya",
        "Trace the word": "Bakatin ang salita",
        "Trace & Learn": "Bakat at Matuto",
        "Test page": "Pansubok na pahina",
        "The printer is working!": "Gumagana ang printer!",
        "circle": "bilog",
        "square": "parisukat",
        "triangle": "tatsulok",
        "star": "bituin",
        "heart": "puso",
        "Animals": "Mga Hayop",
        "Transportation": "Mga Sasakyan",
        "Fruits": "Mga Prutas",
        "Community Helpers": "Mga Katulong sa Komunidad",
        "Shapes": "Mga Hugis",
        "Colors": "Mga Kulay",
        "Nature": "Kalikasan",
    }
}
MONTHS_FIL = ["Ene", "Peb", "Mar", "Abr", "May", "Hun", "Hul", "Ago", "Set", "Okt", "Nob", "Dis"]


@dataclass
class PageRequest:
    kind: str = "child"  # child | reprint | test
    activity_type: str | None = None
    theme: str | None = None
    sheet: dict | None = None
    label: str | None = None
    caption: str | None = None
    colorful: bool = False
    language: str = "en"
    date: datetime = field(default_factory=datetime.now)


def tr(lang: str, text: str, **values: str) -> str:
    out = TEXT.get(lang, {}).get(text, text)
    for k, v in values.items():
        out = out.replace("{" + k + "}", v)
    return out


# ---------- Fonts ----------

FONT_CANDIDATES = [
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/TTF/DejaVuSans-Bold.ttf",
    "C:/Windows/Fonts/arialbd.ttf",
    "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
]


@lru_cache(maxsize=64)
def font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    for path in [get_settings().font_path, *FONT_CANDIDATES]:
        if path and os.path.exists(path):
            return ImageFont.truetype(path, size)
    return ImageFont.load_default(size)


def text_width(draw: ImageDraw.ImageDraw, text: str, f) -> int:
    left, _, right, _ = draw.textbbox((0, 0), text, font=f)
    return right - left


def fit_font(draw: ImageDraw.ImageDraw, text: str, max_width: int, start: int, minimum: int = 28):
    size = start
    while size > minimum and text_width(draw, text, font(size)) > max_width:
        size -= 4
    return font(size)


# ---------- Picture processing ----------


def line_art(img: Image.Image) -> Image.Image:
    """Clean black outlines on white, ready to color in."""
    gray = np.array(ImageOps.grayscale(img))
    gray = cv2.GaussianBlur(gray, (3, 3), 0)
    _, binary = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    # Big dark fills would waste ink and leave nothing to color: keep only edges.
    if (binary == 0).mean() > 0.35:
        binary = cv2.adaptiveThreshold(gray, 255, cv2.ADAPTIVE_THRESH_MEAN_C, cv2.THRESH_BINARY, 25, 10)
    # Remove specks.
    binary = cv2.morphologyEx(binary, cv2.MORPH_CLOSE, np.ones((2, 2), np.uint8))
    return Image.fromarray(binary).convert("RGB")


def colorful(img: Image.Image) -> Image.Image:
    img = ImageOps.autocontrast(img.convert("RGB"), cutoff=1)
    return img.filter(ImageFilter.UnsharpMask(radius=2, percent=60, threshold=3))


def paste_fit(page: Image.Image, img: Image.Image, box: tuple[int, int, int, int]) -> tuple[int, int, int, int]:
    """Scales img into box (keeping its shape), centered. Returns where it landed."""
    x0, y0, x1, y1 = box
    w, h = x1 - x0, y1 - y0
    scale = min(w / img.width, h / img.height)
    size = (max(1, int(img.width * scale)), max(1, int(img.height * scale)))
    resized = img.resize(size, Image.LANCZOS)
    x = x0 + (w - size[0]) // 2
    y = y0 + (h - size[1]) // 2
    page.paste(resized, (x, y))
    return x, y, x + size[0], y + size[1]


# ---------- Dotted tracing guides ----------


def dots_along(draw: ImageDraw.ImageDraw, points: np.ndarray, spacing: float, radius: float, closed: bool = True):
    """Dots at even distances along a polyline."""
    if len(points) < 2:
        return
    pts = np.vstack([points, points[:1]]) if closed else points
    carry = 0.0
    for (ax, ay), (bx, by) in zip(pts[:-1], pts[1:], strict=False):
        seg = math.hypot(bx - ax, by - ay)
        d = carry
        while d <= seg:
            t = d / seg if seg else 0
            x, y = ax + (bx - ax) * t, ay + (by - ay) * t
            draw.ellipse((x - radius, y - radius, x + radius, y + radius), fill=INK)
            d += spacing
        carry = d - seg


def dotted_mask(draw: ImageDraw.ImageDraw, mask: np.ndarray, offset: tuple[int, int], spacing: float, radius: float):
    """Turns the outline of every filled area in mask into dots."""
    contours, _ = cv2.findContours(mask, cv2.RETR_LIST, cv2.CHAIN_APPROX_NONE)
    ox, oy = offset
    for c in contours:
        if cv2.contourArea(c) < 30:
            continue
        pts = c.reshape(-1, 2).astype(float) + (ox, oy)
        dots_along(draw, pts, spacing, radius)


def dotted_text(page: Image.Image, text: str, box: tuple[int, int, int, int], guides: bool = True):
    draw = ImageDraw.Draw(page)
    x0, y0, x1, y1 = box
    height = y1 - y0
    size = int(height * 0.95)
    while size > 40 and text_width(draw, text, font(size)) > (x1 - x0):
        size -= 6
    f = font(size)
    left, top, right, bottom = draw.textbbox((0, 0), text, font=f)
    w, h = right - left, bottom - top
    mask_img = Image.new("L", (w + 20, h + 20), 0)
    ImageDraw.Draw(mask_img).text((10 - left, 10 - top), text, font=f, fill=255)
    tx = x0 + ((x1 - x0) - w) // 2 - 10
    ty = y1 - h - 30
    if guides:
        base = ty + 10 + h
        mid = ty + 10 + h // 2
        draw.line((x0, base, x1, base), fill=GUIDE, width=4)
        for x in range(x0, x1, 36):
            draw.line((x, mid, min(x + 18, x1), mid), fill=(226, 230, 236), width=3)
    spacing = max(14, size / 14)
    dotted_mask(draw, np.array(mask_img), (tx, ty), spacing, max(3.5, size / 55))


SHAPES = {
    "circle": lambda d, b: d.ellipse(b, fill=255),
    "square": lambda d, b: d.rectangle(b, fill=255),
    "triangle": lambda d, b: d.polygon([((b[0] + b[2]) / 2, b[1]), (b[2], b[3]), (b[0], b[3])], fill=255),
    "heart": lambda d, b: _heart(d, b),
    "star": lambda d, b: _star(d, b),
}


def _star(d: ImageDraw.ImageDraw, b):
    cx, cy, r = (b[0] + b[2]) / 2, (b[1] + b[3]) / 2, (b[2] - b[0]) / 2
    pts = []
    for i in range(10):
        ang = -math.pi / 2 + i * math.pi / 5
        rr = r if i % 2 == 0 else r * 0.45
        pts.append((cx + rr * math.cos(ang), cy + rr * math.sin(ang)))
    d.polygon(pts, fill=255)


def _heart(d: ImageDraw.ImageDraw, b):
    cx, cy, s = (b[0] + b[2]) / 2, (b[1] + b[3]) / 2, (b[2] - b[0]) / 34
    pts = [
        (
            cx + s * 16 * math.sin(t) ** 3,
            cy - s * (13 * math.cos(t) - 5 * math.cos(2 * t) - 2 * math.cos(3 * t) - math.cos(4 * t)),
        )
        for t in np.linspace(0, 2 * math.pi, 200)
    ]
    d.polygon(pts, fill=255)


def dotted_shape(page: Image.Image, shape: str, box: tuple[int, int, int, int]):
    x0, y0, x1, y1 = box
    side = min(x1 - x0, y1 - y0)
    mask_img = Image.new("L", (side + 20, side + 20), 0)
    SHAPES.get(shape, SHAPES["circle"])(ImageDraw.Draw(mask_img), (10, 10, side + 10, side + 10))
    ox = x0 + ((x1 - x0) - side) // 2 - 10
    oy = y0 + ((y1 - y0) - side) // 2 - 10
    mask = cv2.erode(np.array(mask_img), np.ones((3, 3), np.uint8))
    dotted_mask(ImageDraw.Draw(page), mask, (ox, oy), 20, 5)


def path_points(kind: str, box: tuple[int, int, int, int]) -> np.ndarray:
    x0, y0, x1, y1 = box
    w, h = x1 - x0, y1 - y0
    t = np.linspace(0, 1, 600)
    if kind == "zigzag":
        y = 1 - np.abs((t * 10) % 2 - 1)
    elif kind == "bumps":
        y = 1 - np.abs(np.sin(t * math.pi * 5))
    elif kind == "loops":
        # Prolate cycloid: a rolling point that makes small loops.
        u = t * 2 * math.pi * 5
        x = u - 2.2 * np.sin(u)
        y = -2.2 * np.cos(u)
        x = (x - x.min()) / (x.max() - x.min())
        y = 1 - (y - y.min()) / (y.max() - y.min())
        return np.column_stack([x0 + 20 + x * (w - 40), y0 + 10 + y * (h - 20)])
    else:  # wave
        y = 0.5 + 0.5 * np.sin(t * math.pi * 8)
    return np.column_stack([x0 + 20 + t * (w - 40), y0 + 10 + y * (h - 20)])


def dotted_path(page: Image.Image, kind: str, box: tuple[int, int, int, int]):
    draw = ImageDraw.Draw(page)
    pts = path_points(kind, box)
    sx, sy = pts[0]
    draw.ellipse((sx - 13, sy - 13, sx + 13, sy + 13), fill=(22, 163, 74))
    dots_along(draw, pts, 22, 6, closed=False)


# ---------- Page ----------


def format_date(d: datetime, lang: str) -> str:
    if lang == "fil":
        return f"{MONTHS_FIL[d.month - 1]} {d.day}, {d.year}"
    return d.strftime("%b %d, %Y").replace(" 0", " ")


def trace_title(sheet: dict | None, lang: str) -> str:
    kind = (sheet or {}).get("kind")
    if kind == "letter":
        return tr(lang, "{letter} is for {word}", letter=sheet["letter"], word=sheet["word"])
    if kind == "number":
        return tr(lang, "Count and trace")
    if kind == "shape":
        return tr(lang, "Trace the {shape}s", shape=tr(lang, sheet["shape"]))
    if kind == "prewriting":
        return tr(lang, "Follow the dotted line")
    if kind == "word":
        return tr(lang, "Trace the word")
    return tr(lang, "Trace & Learn")


def render_page(req: PageRequest, image_bytes: bytes | None) -> Image.Image:
    lang = req.language if req.language in ("en", "fil") else "en"
    page = Image.new("RGB", (PAGE_W, PAGE_H), "white")
    draw = ImageDraw.Draw(page)
    inner = (MARGIN, PAGE_W - MARGIN)

    # Header: brand left, theme and date right.
    small = font(34)
    draw.text((MARGIN, MARGIN), "WishPix", font=font(38), fill=NAVY)
    right = " · ".join(x for x in [tr(lang, req.theme) if req.theme else "", format_date(req.date, lang)] if x)
    draw.text((PAGE_W - MARGIN - text_width(draw, right, small), MARGIN + 4), right, font=small, fill=MUTED)
    y = MARGIN + 66
    draw.line((MARGIN, y, PAGE_W - MARGIN, y), fill=(229, 233, 240), width=3)
    y += 30

    picture = None
    if image_bytes:
        picture = Image.open(io.BytesIO(image_bytes))
        picture = ImageOps.exif_transpose(picture).convert("RGB")
        picture = colorful(picture) if req.colorful else line_art(picture)

    if req.kind == "test":
        title = tr(lang, "Test page")
        f = fit_font(draw, title, inner[1] - inner[0], 96)
        draw.text(((PAGE_W - text_width(draw, title, f)) // 2, y + 40), title, font=f, fill=INK)
        msg = tr(lang, "The printer is working!")
        f2 = fit_font(draw, msg, inner[1] - inner[0], 64)
        draw.text(((PAGE_W - text_width(draw, msg, f2)) // 2, y + 200), msg, font=f2, fill=INK)
        for i, shade in enumerate([0, 64, 128, 192]):
            x = MARGIN + 40 + i * 260
            draw.rectangle((x, y + 420, x + 220, y + 640), fill=(shade, shade, shade))
        dotted_shape(page, "star", (MARGIN, y + 760, PAGE_W - MARGIN, y + 1300))
        return page

    # Title.
    title = None
    if req.activity_type == "color_create":
        title = tr(lang, "Color me!")
    elif req.activity_type == "trace_learn":
        title = trace_title(req.sheet, lang)
    if title:
        f = fit_font(draw, title, inner[1] - inner[0], 92)
        draw.text(((PAGE_W - text_width(draw, title, f)) // 2, y), title, font=f, fill=INK)
        y += 130

    # Bottom: caption (Free Play / label) and the name line.
    bottom = PAGE_H - MARGIN
    name = tr(lang, "Name:")
    nf = font(52)
    draw.text((MARGIN, bottom - 60), name, font=nf, fill=INK)
    nx = MARGIN + text_width(draw, name, nf) + 24
    draw.line((nx, bottom - 12, PAGE_W - MARGIN, bottom - 12), fill=(51, 51, 51), width=5)
    bottom -= 110

    caption = req.caption if req.activity_type == "free_play" else req.label
    if caption and req.activity_type != "trace_learn":
        text = caption[:40]
        text = text[0].upper() + text[1:]
        cf = fit_font(draw, text, inner[1] - inner[0], 84)
        draw.text(((PAGE_W - text_width(draw, text, cf)) // 2, bottom - 100), text, font=cf, fill=INK)
        bottom -= 130

    body = (MARGIN, y, PAGE_W - MARGIN, bottom)
    sheet = req.sheet if req.activity_type == "trace_learn" else None
    if sheet:
        draw_trace(page, sheet, picture, body)
    elif picture:
        paste_fit(page, picture, body)
    return page


def draw_trace(page: Image.Image, sheet: dict, picture: Image.Image | None, body: tuple[int, int, int, int]):
    x0, y0, x1, y1 = body
    h = y1 - y0
    kind = sheet.get("kind")

    def pic(top: float, bottom: float, width: float = 0.6):
        if picture:
            w = (x1 - x0) * width
            cx = (x0 + x1) / 2
            paste_fit(page, picture, (int(cx - w / 2), int(y0 + h * top), int(cx + w / 2), int(y0 + h * bottom)))

    if kind == "letter":
        letter = sheet["letter"]
        pic(0, 0.34)
        dotted_text(page, f"{letter}{letter.lower()}", (x0, int(y0 + h * 0.36), x1, int(y0 + h * 0.72)))
        dotted_text(page, f"{letter} {letter.lower()} " * 2, (x0, int(y0 + h * 0.76), x1, y1))
    elif kind == "number":
        n = str(sheet["count"])
        pic(0, 0.32, 0.92)
        dotted_text(page, n, (x0, int(y0 + h * 0.36), x1, int(y0 + h * 0.72)))
        dotted_text(page, " ".join([n] * 5), (x0, int(y0 + h * 0.78), x1, y1))
    elif kind == "shape":
        pic(0, 0.34)
        top = y0 + h * 0.38
        cell_h = (y1 - top) / 2
        cell_w = (x1 - x0) / 2
        for i in range(4):
            cx, cy = x0 + (i % 2) * cell_w, top + (i // 2) * cell_h
            pad = 30
            dotted_shape(
                page,
                sheet.get("shape", "circle"),
                (int(cx + pad), int(cy + pad), int(cx + cell_w - pad), int(cy + cell_h - pad)),
            )
    elif kind == "prewriting":
        pic(0, 0.26, 0.5)
        row = (y1 - (y0 + h * 0.3)) / 3
        for i in range(3):
            top = y0 + h * 0.3 + i * row
            dotted_path(page, sheet.get("path", "wave"), (x0, int(top + 30), x1, int(top + row - 30)))
    elif kind == "word":
        word = str(sheet.get("word", "")).lower()[:10]
        pic(0, 0.36)
        dotted_text(page, word, (x0, int(y0 + h * 0.4), x1, int(y0 + h * 0.7)))
        dotted_text(page, word, (x0 + 120, int(y0 + h * 0.76), x1 - 120, y1))
    elif picture:
        paste_fit(page, picture, body)


def to_png(page: Image.Image) -> bytes:
    out = io.BytesIO()
    page.save(out, "PNG", dpi=(DPI, DPI))
    return out.getvalue()


def font_in_use() -> str:
    """For /health: which font the pages use."""
    path = getattr(font(20), "path", None)
    return os.path.basename(path) if path else "built-in"
