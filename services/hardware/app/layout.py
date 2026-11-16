"""Print-ready pages.

Two page formats, picked by the printer (PAGE_FORMAT in .env):
- "4x6": 4x6 in portrait at 300 dpi (1200 x 1800 px) for the inkjet. This is
  the recommended printer and the default.
- "58mm": the 48 mm printable width of a 58 mm thermal roll at 203 dpi
  (384 dots), 72 mm long. Optional. These pages go through thermal_ready()
  (contrast + Floyd-Steinberg dithering) before printing.

Children's pages, all black on white (no gray, no color):
- trace_word:  the word in dotted capitals, 4 rows, "CAT / PUSA". No picture.
- trace_image: the picture as a dashed outline to trace (eyes and other small
  details stay solid), then one dotted row "CAT / PUSA".
- coloring:    the picture with thick solid outlines to color, then the word
  in heavy capitals, in the kiosk's display language.
Letters are always drawn here with a font, never by the AI, so they are
always spelled right and sharp.
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
from PIL import Image, ImageDraw, ImageFont, ImageOps

from .config import get_settings
from .thermal import thermal_ready
from .tracing import draw_dashes, draw_dots, paths, thin


@dataclass(frozen=True)
class PageFormat:
    id: str
    width: int
    height: int
    dpi: int
    thermal: bool

    def mm(self, value: float) -> float:
        return value * self.dpi / 25.4


FORMATS = {
    "4x6": PageFormat("4x6", 1200, 1800, 300, False),
    "58mm": PageFormat("58mm", 384, 576, 203, True),
}
INKJET = FORMATS["4x6"]

TEXT = {
    "fil": {
        "Color the picture and share something about it with your teacher or classmates.": (
            "Kulayan ang larawan at magkuwento tungkol dito sa iyong guro o mga kaklase."
        ),
        "Test page": "Pansubok na pahina",
        "The printer is working!": "Gumagana ang printer!",
    }
}
INSTRUCTION = "Color the picture and share something about it with your teacher or classmates."


@dataclass
class PageRequest:
    kind: str = "child"  # child | reprint | test
    activity_type: str | None = None
    theme: str | None = None
    sheet: dict | None = None
    label: str | None = None  # pages made before the bilingual words: the label in one language
    language: str = "en"
    date: datetime = field(default_factory=datetime.now)


def tr(lang: str, text: str) -> str:
    return TEXT.get(lang, {}).get(text, text)


# ---------- Fonts ----------

FONT_CANDIDATES = [
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/TTF/DejaVuSans-Bold.ttf",
    "C:/Windows/Fonts/arialbd.ttf",
    "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
]


@lru_cache(maxsize=128)
def font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    size = max(6, int(size))
    for path in [get_settings().font_path, *FONT_CANDIDATES]:
        if path and os.path.exists(path):
            return ImageFont.truetype(path, size)
    return ImageFont.load_default(size)


def text_width(draw: ImageDraw.ImageDraw, text: str, f, stroke: int = 0) -> int:
    left, _, right, _ = draw.textbbox((0, 0), text, font=f, stroke_width=stroke)
    return right - left


# ---------- What goes on a child's page ----------


def page_content(req: PageRequest) -> tuple[str, str, str]:
    """(kind, English word, Filipino word). Pages made before November 2026
    still print: old tracing sheets become Trace Image, everything else
    (Color & Create, Free Play) a coloring page."""
    sheet = req.sheet or {}
    kind = sheet.get("kind")
    en = str(sheet.get("en") or "").strip()
    fil = str(sheet.get("fil") or "").strip()
    if kind in ("trace_word", "trace_image", "coloring"):
        return kind, en or (req.label or ""), fil
    word = str(sheet.get("word") or "").strip()
    if req.activity_type == "trace_learn":
        return "trace_image", word or (req.label or ""), ""
    return "coloring", req.label or word, ""


def bilingual(en: str, fil: str) -> str:
    """'CAT / PUSA', or just one word when there is no translation."""
    en, fil = en.strip().upper(), fil.strip().upper()
    if en and fil and en != fil:
        return f"{en} / {fil}"
    return en or fil


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


def fit(img: Image.Image, width: int, height: int) -> Image.Image:
    """img scaled to fit inside width x height, keeping its shape."""
    scale = min(width / img.width, height / img.height)
    return img.resize((max(1, round(img.width * scale)), max(1, round(img.height * scale))), Image.LANCZOS)


def crop_to_ink(img: Image.Image, pad: int = 4) -> Image.Image:
    """Cuts away empty paper around the drawing, so it fills its box."""
    black = np.array(ImageOps.grayscale(img)) < 128
    ys, xs = np.nonzero(black)
    if len(xs) == 0:
        return img
    return img.crop(
        (
            max(0, xs.min() - pad),
            max(0, ys.min() - pad),
            min(img.width, xs.max() + pad + 1),
            min(img.height, ys.max() + pad + 1),
        )
    )


def ellipse_kernel(size: float) -> np.ndarray:
    k = max(1, int(round(size)))
    k += 1 - k % 2
    return cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k))


def stroke_half_width(black: np.ndarray, skeleton: np.ndarray | None = None) -> float:
    """Typical half thickness of the lines in a black mask."""
    if not black.any():
        return 1.0
    dist = cv2.distanceTransform(black.astype(np.uint8), cv2.DIST_L2, 3)
    centre = thin(black) if skeleton is None else skeleton
    values = dist[centre > 0]
    return float(np.median(values)) if len(values) else 1.0


def approx_half_width(black: np.ndarray) -> float:
    """Half thickness of the lines, quickly (no thinning): most line pixels
    are less than half a line width from the paper."""
    dist = cv2.distanceTransform(black.astype(np.uint8), cv2.DIST_L2, 3)
    values = dist[dist > 0]
    return float(np.percentile(values, 90)) if len(values) else 1.0


def paste_black(page: Image.Image, black: np.ndarray, at: tuple[int, int]):
    """Paints the True pixels of black onto the page at (x, y)."""
    mask = Image.fromarray((black * 255).astype(np.uint8))
    page.paste(0, at, mask)


def coloring_picture(page: Image.Image, picture: Image.Image, box: tuple[int, int, int, int], fmt: PageFormat):
    """Thick, solid, smooth outlines with white insides, filling the box."""
    x0, y0, x1, y1 = box
    art = crop_to_ink(line_art(picture))
    fitted = fit(ImageOps.grayscale(art), x1 - x0, y1 - y0)
    black = np.array(fitted) < 140
    # Thin AI lines would print faint (and vanish on a thermal roll): thicken them.
    want = fmt.mm(0.8)
    have = 2 * approx_half_width(black)
    if have < want:
        black = cv2.dilate(black.astype(np.uint8), ellipse_kernel(want - have + 1)).astype(bool)
    paste_black(page, black, (x0 + (x1 - x0 - fitted.width) // 2, y0 + (y1 - y0 - fitted.height) // 2))


def dashed_picture(page: Image.Image, picture: Image.Image, box: tuple[int, int, int, int], fmt: PageFormat):
    """The picture as a dashed outline to trace. Eyes, nose, mouth and other
    small details stay solid so the subject is easy to recognize."""
    x0, y0, x1, y1 = box
    art = crop_to_ink(line_art(picture))
    page_size = fit(art, x1 - x0, y1 - y0).size  # where the drawing lands on the page
    # Find the lines at a working size where they are about 6 px thick: thick
    # AI outlines take long to thin, and a small thermal page needs more
    # detail than it has pixels for a smooth path.
    fitted = fit(ImageOps.grayscale(art), page_size[0] * 2, page_size[1] * 2)
    black = (np.array(fitted) < 140).astype(np.uint8)
    shrink = min(1.0, 3.0 / max(approx_half_width(black), 0.5))
    if shrink < 1:
        black = (cv2.resize(black * 255, None, fx=shrink, fy=shrink, interpolation=cv2.INTER_AREA) > 100).astype(
            np.uint8
        )
    work = black.shape[1] / page_size[0]  # working pixels per page pixel
    # An AI picture that is already dashed: join the dashes into one line first.
    black = cv2.morphologyEx(black, cv2.MORPH_CLOSE, ellipse_kernel(fmt.mm(1.0) * work))

    count, labels, stats, _ = cv2.connectedComponentsWithStats(black, connectivity=8)
    dist = cv2.distanceTransform(black, cv2.DIST_L2, 3)
    skeleton = thin(black)
    half = stroke_half_width(black.astype(bool), skeleton)
    diag = math.hypot(*black.shape)
    solid = np.zeros_like(black, dtype=bool)
    for i in range(1, count):
        x, y, w, h, area = stats[i]
        size = math.hypot(w, h)
        part = labels[y : y + h, x : x + w] == i
        thick = float(dist[y : y + h, x : x + w][part].max())
        filled = area / max(1, w * h)
        if size < 0.06 * diag or (size < 0.16 * diag and thick > 2.2 * half and filled > 0.35):
            solid[y : y + h, x : x + w] |= part

    # The parts are separate, so the solid ones can simply be cut out of the centre lines.
    lines = paths((skeleton > 0) & ~solid, min_length=fmt.mm(0.8) * work)
    left = x0 + ((x1 - x0) - page_size[0]) / 2
    top = y0 + ((y1 - y0) - page_size[1]) / 2
    if solid.any():
        small = cv2.resize(solid.astype(np.uint8) * 255, page_size, interpolation=cv2.INTER_AREA) > 100
        paste_black(page, small, (round(left), round(top)))
    draw_dashes(
        ImageDraw.Draw(page),
        lines,
        dash=fmt.mm(2.4),
        gap=fmt.mm(1.4),
        width=max(2, round(fmt.mm(0.5))),
        scale=1 / work,
        offset=(left, top),
    )


# ---------- Dotted tracing letters ----------


@dataclass
class DottedRow:
    text: str
    lines: list
    scale: float
    width: float
    height: float
    letter_height: float


TRACKING = 0.3  # extra space between letters, as a share of the letter height


def dotted_row(text: str, max_width: float, max_height: float, fmt: PageFormat) -> DottedRow:
    """The centre lines of text in capitals, as big as fits, with wide letter spacing."""
    text = text.upper()
    probe = ImageDraw.Draw(Image.new("L", (1, 1)))

    def measure(size: int) -> tuple[float, float]:
        f = font(size)
        cap = probe.textbbox((0, 0), "H", font=f)
        cap_h = cap[3] - cap[1]
        width = sum(f.getlength(c) for c in text) + TRACKING * cap_h * (len(text) - 1)
        return width, cap_h

    size = 400
    width, cap_h = measure(size)
    size = max(8, int(size * min(max_width / width, max_height / cap_h)))
    width, cap_h = measure(size)
    while size > 8 and (width > max_width or cap_h > max_height):
        size -= 1
        width, cap_h = measure(size)

    # Find the centre lines at one working size (letters 140 px tall), whatever
    # the page size, then scale the points to the page.
    work = 140 / max(1, cap_h)
    f = font(round(size * work))
    cap = probe.textbbox((0, 0), "H", font=f)
    work_cap = cap[3] - cap[1]
    pad = round(0.4 * work_cap)  # room for Ñ's tilde and the slash
    canvas = Image.new("L", (int(width * work) + 2 * pad, work_cap + 2 * pad), 0)
    draw = ImageDraw.Draw(canvas)
    x = pad
    for c in text:
        draw.text((x, pad - cap[1]), c, font=f, fill=255)
        x += f.getlength(c) + TRACKING * work_cap
    glyphs = np.array(canvas) > 127
    skeleton = thin(glyphs)
    half = stroke_half_width(glyphs, skeleton)
    lines = [(pts - pad, closed) for pts, closed in paths(skeleton, min_length=work_cap * 0.12, trim=half * 0.9)]
    return DottedRow(text=text, lines=lines, scale=cap_h / work_cap, width=width, height=cap_h, letter_height=cap_h)


def dot_style(row: DottedRow, fmt: PageFormat) -> tuple[float, float]:
    """(spacing, radius) of the dots. Never smaller than about 0.6 mm dots
    every 1.3 mm, or a thermal printer blurs them together or drops them."""
    return max(fmt.mm(1.3), row.letter_height * 0.1), max(fmt.mm(0.3), row.letter_height * 0.022)


def draw_dotted_row(page: Image.Image, row: DottedRow, box: tuple[float, float, float, float], fmt: PageFormat):
    """Dots along the letters, centred in box."""
    x0, y0, x1, y1 = box
    left = x0 + ((x1 - x0) - row.width) / 2
    top = y0 + ((y1 - y0) - row.height) / 2
    spacing, radius = dot_style(row, fmt)
    draw_dots(ImageDraw.Draw(page), row.lines, spacing=spacing, radius=radius, scale=row.scale, offset=(left, top))


# Letters smaller than this are hard for small hands to trace: a long label
# is then broken after the slash ("BUTTERFLY /" then "PARU-PARO").
MIN_LETTER_MM = {False: 6.0, True: 5.0}
LINE_PITCH = 1.5  # line to line, in letter heights


def label_lines(text: str, max_width: float, max_height: float, fmt: PageFormat) -> list[DottedRow]:
    """The label as one dotted line, or two when one line would be too small."""
    one = dotted_row(text, max_width, max_height, fmt)
    if one.letter_height >= fmt.mm(MIN_LETTER_MM[fmt.thermal]) or " / " not in text:
        return [one]
    first, second = text.split(" / ", 1)
    parts = [f"{first} /", second]
    # Both lines get the same letter size, set by the line that has to shrink most.
    height = min(dotted_row(p, max_width, max_height, fmt).letter_height for p in parts)
    if height <= one.letter_height:
        return [one]
    return [dotted_row(p, max_width, height, fmt) for p in parts]


def lines_height(lines: list[DottedRow]) -> float:
    return lines[0].height * (1 + LINE_PITCH * (len(lines) - 1))


def draw_label(page: Image.Image, lines: list[DottedRow], box: tuple[float, float, float, float], fmt: PageFormat):
    """The label lines stacked and centred in box."""
    x0, y0, x1, y1 = box
    top = y0 + ((y1 - y0) - lines_height(lines)) / 2
    for i, row in enumerate(lines):
        y = top + i * row.height * LINE_PITCH
        draw_dotted_row(page, row, (x0, y, x1, y + row.height), fmt)


# ---------- Pages ----------


def wrap(draw: ImageDraw.ImageDraw, text: str, f, width: int) -> list[str]:
    lines: list[str] = []
    for word in text.split():
        if lines and text_width(draw, f"{lines[-1]} {word}", f) <= width:
            lines[-1] += f" {word}"
        else:
            lines.append(word)
    return lines


ROWS = 4


def trace_word_page(fmt: PageFormat, text: str) -> Image.Image:
    """4 equal rows of the dotted label, filling the sheet."""
    if fmt.thermal:
        # A 48 mm roll is too narrow for "CAT / PUSA" at a size a child can
        # trace, so the rows run along the paper: the page is landscape (as
        # the child holds it) and the printer prints it sideways.
        height = fmt.width
        margin = round(height * 0.05)
        row_h = (height - 2 * margin) / ROWS
        row = dotted_row(text, fmt.mm(190), row_h * 0.62, fmt)
        width = max(height, round(row.width + 2 * margin))
        page = Image.new("L", (width, height), 255)
        for i in range(ROWS):
            top = margin + i * row_h
            draw_label(page, [row], (margin, top, width - margin, top + row_h), fmt)
        return page

    page = Image.new("L", (fmt.width, fmt.height), 255)
    margin = round(fmt.width * 0.05)
    row_h = (fmt.height - 2 * margin) / ROWS
    lines = label_lines(text, fmt.width - 2 * margin, row_h * 0.62, fmt)
    if len(lines) > 1:  # two lines must fit in one row too
        height = min(lines[0].letter_height, row_h * 0.8 / (1 + LINE_PITCH))
        lines = [dotted_row(r.text, fmt.width - 2 * margin, height, fmt) for r in lines]
    for i in range(ROWS):
        top = margin + i * row_h
        draw_label(page, lines, (margin, top, fmt.width - margin, top + row_h), fmt)
    return page


def trace_image_page(fmt: PageFormat, text: str, picture: Image.Image | None) -> Image.Image:
    """The dashed picture on top, one dotted label row below."""
    margin = round(fmt.width * 0.06)
    inner = fmt.width - 2 * margin
    if fmt.thermal:
        pic_h = inner  # a square picture, then as much paper as the label needs
        lines = label_lines(text, inner, fmt.mm(7), fmt) if text else []
        label_h = lines_height(lines) + fmt.mm(4) if lines else 0
        height = max(fmt.height, round(margin + pic_h + label_h + margin))
    else:
        height = fmt.height
        pic_h = round(height * 0.68) - margin
        label_h = height - pic_h - 2 * margin
        lines = label_lines(text, inner, label_h * 0.55, fmt) if text else []
        if len(lines) > 1:
            size = min(lines[0].letter_height, label_h * 0.75 / (1 + LINE_PITCH))
            lines = [dotted_row(r.text, inner, size, fmt) for r in lines]
    page = Image.new("L", (fmt.width, height), 255)
    if picture:
        dashed_picture(page, picture, (margin, margin, fmt.width - margin, margin + pic_h), fmt)
    if lines:
        draw_label(page, lines, (margin, margin + pic_h, fmt.width - margin, height - margin), fmt)
    return page


def heavy_word(page: Image.Image, word: str, box: tuple[int, int, int, int]) -> int:
    """The word in heavy, solid black capitals, centred at the bottom of box.
    Returns the height it took."""
    x0, y0, x1, y1 = box
    draw = ImageDraw.Draw(page)
    text = word.upper()
    size = y1 - y0
    while True:
        f = font(size)
        stroke = max(1, round(size * 0.05))
        gap = stroke * 2 + round(size * 0.03)  # the thick strokes must not join the letters
        widths = [text_width(draw, c, f, stroke) if c != " " else f.getlength(" ") for c in text]
        total = sum(widths) + gap * (len(text) - 1)
        if total <= x1 - x0 or size <= 10:
            break
        size -= 2
    _, top, _, low = draw.textbbox((0, 0), "H", font=f, stroke_width=stroke)
    x = x0 + ((x1 - x0) - total) / 2
    y = y1 - (low - top) - top
    for c, w in zip(text, widths, strict=True):
        left = draw.textbbox((0, 0), c, font=f, stroke_width=stroke)[0] if c != " " else 0
        draw.text((x - left, y), c, font=f, fill=0, stroke_width=stroke, stroke_fill=0)
        x += w + gap
    return low - top


def coloring_page(fmt: PageFormat, word: str, picture: Image.Image | None, lang: str) -> Image.Image:
    """A short instruction, the big coloring picture, then the word."""
    page = Image.new("L", (fmt.width, fmt.height), 255)
    draw = ImageDraw.Draw(page)
    margin = round(fmt.width * 0.05)
    inner = fmt.width - 2 * margin

    small = font(round(max(fmt.mm(2.2), 11)))
    y = margin
    for line in wrap(draw, tr(lang, INSTRUCTION), small, inner)[:3]:
        draw.text(((fmt.width - text_width(draw, line, small)) // 2, y), line, font=small, fill=0)
        y += round(small.size * 1.25)
    y += round(fmt.mm(1.5))

    bottom = fmt.height - margin
    if word:
        used = heavy_word(page, word, (margin, bottom - round(fmt.height * 0.075), fmt.width - margin, bottom))
        bottom -= used + round(fmt.mm(3))
    if picture:
        coloring_picture(page, picture, (margin, y, fmt.width - margin, bottom), fmt)
    return page


def test_page(fmt: PageFormat, lang: str) -> Image.Image:
    page = Image.new("L", (fmt.width, fmt.height), 255)
    draw = ImageDraw.Draw(page)
    margin = round(fmt.width * 0.06)
    inner = fmt.width - 2 * margin
    y = margin
    for text, share in ((tr(lang, "Test page"), 0.08), (tr(lang, "The printer is working!"), 0.045)):
        size = round(fmt.width * share * 1.5)
        while size > 8 and text_width(draw, text, font(size)) > inner:
            size -= 2
        draw.text(((fmt.width - text_width(draw, text, font(size))) // 2, y), text, font=font(size), fill=0)
        y += round(size * 1.6)
    # Gray steps: on a thermal roll these show the dithering.
    step = inner // 4
    for i, shade in enumerate((0, 64, 128, 192)):
        draw.rectangle((margin + i * step + 4, y, margin + (i + 1) * step - 4, y + step - 8), fill=shade)
    y += step + round(fmt.mm(3))
    row = dotted_row("ABC", inner, fmt.height * 0.1, fmt)
    draw_dotted_row(page, row, (margin, y, fmt.width - margin, y + fmt.height * 0.14), fmt)
    y += round(fmt.height * 0.16)
    circle = Image.new("L", (400, 400), 255)
    ImageDraw.Draw(circle).ellipse((40, 40, 360, 360), outline=0, width=24)
    dashed_picture(page, circle.convert("RGB"), (margin, y, fmt.width - margin, fmt.height - margin), fmt)
    return page


def render_page(req: PageRequest, image_bytes: bytes | None, fmt: PageFormat = INKJET) -> Image.Image:
    """The finished page, as the child holds it: mode "L" for the inkjet,
    mode "1" (dithered) for a thermal roll. A thermal page wider than the
    roll is landscape; the thermal driver prints it sideways."""
    lang = req.language if req.language in ("en", "fil") else "en"
    if req.kind == "test":
        page = test_page(fmt, lang)
        return thermal_ready(page, photo=True) if fmt.thermal else page

    picture = None
    if image_bytes:
        picture = ImageOps.exif_transpose(Image.open(io.BytesIO(image_bytes))).convert("RGB")

    kind, en, fil = page_content(req)
    if kind == "trace_word":
        page = trace_word_page(fmt, bilingual(en, fil))
    elif kind == "trace_image":
        page = trace_image_page(fmt, bilingual(en, fil), picture)
    else:
        page = coloring_page(fmt, fil if lang == "fil" and fil else en, picture, lang)
    return thermal_ready(page) if fmt.thermal else page


def to_png(page: Image.Image, fmt: PageFormat = INKJET) -> bytes:
    out = io.BytesIO()
    page.save(out, "PNG", dpi=(fmt.dpi, fmt.dpi))
    return out.getvalue()


def font_in_use() -> str:
    """For /health: which font the pages use."""
    path = getattr(font(20), "path", None)
    return os.path.basename(path) if path else "built-in"
