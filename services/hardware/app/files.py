"""Files a teacher sends to the kiosk printer (Print to Kiosk): PNG, JPG and PDF.

Each PDF page prints as its own page. Pages are laid out for the printer in
use: fitted to a 4x6 page for the inkjet (colors kept), or scaled to the
thermal roll's width, then contrast + Floyd-Steinberg dithering.
"""

from __future__ import annotations

import io
import threading

import numpy as np
import pypdfium2 as pdfium
from PIL import Image, ImageOps

from .layout import PageFormat
from .thermal import thermal_ready

MAX_FILE_BYTES = 12 * 1024 * 1024  # the Teacher App allows 10 MB
MAX_PAGES = 50
# PDFium is not thread-safe; previews and the print worker take turns.
_pdf_lock = threading.Lock()


class FileError(ValueError):
    """A file that cannot be printed; the message is shown to the teacher."""


def detect(data: bytes) -> str:
    """'png', 'jpg' or 'pdf', from the file's first bytes (not its name)."""
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "png"
    if data.startswith(b"\xff\xd8\xff"):
        return "jpg"
    if b"%PDF-" in data[:1024]:
        return "pdf"
    raise FileError("Only PNG, JPG and PDF files can be printed.")


def page_count(data: bytes, kind: str) -> int:
    if kind != "pdf":
        load(data, kind, 0, 400)  # opens it, so a broken picture is caught now
        return 1
    with _pdf_lock:
        try:
            pdf = pdfium.PdfDocument(data)
        except pdfium.PdfiumError as err:
            raise FileError("This PDF can't be opened. It may be damaged or have a password.") from err
        try:
            count = len(pdf)
        finally:
            pdf.close()
    if count < 1:
        raise FileError("This PDF has no pages.")
    return count


def load(data: bytes, kind: str, index: int, long_side: int) -> Image.Image:
    """Page index (0-based) as an RGB picture on white, about long_side px on its long side."""
    if kind == "pdf":
        with _pdf_lock:
            pdf = pdfium.PdfDocument(data)
            try:
                if not 0 <= index < len(pdf):
                    raise FileError("That page is not in the PDF.")
                page = pdf[index]
                w, h = page.get_size()
                bitmap = page.render(scale=long_side / max(w, h, 1), fill_color=(255, 255, 255, 255))
                return bitmap.to_pil().convert("RGB")
            except pdfium.PdfiumError as err:
                raise FileError("This PDF page can't be read.") from err
            finally:
                pdf.close()
    try:
        img = Image.open(io.BytesIO(data))
        img = ImageOps.exif_transpose(img)
        img.load()
    except (OSError, Image.DecompressionBombError) as err:
        raise FileError("This picture can't be opened. It may be damaged or too large.") from err
    if img.mode in ("RGBA", "LA", "P"):
        img = img.convert("RGBA")
        white = Image.new("RGBA", img.size, "white")
        img = Image.alpha_composite(white, img)
    img = img.convert("RGB")
    img.thumbnail((long_side, long_side), Image.LANCZOS)
    return img


def looks_like_line_art(img: Image.Image) -> bool:
    """Text and drawings (few in-between grays) are not dithered like photos."""
    gray = np.array(ImageOps.grayscale(img))
    return float(((gray > 70) & (gray < 190)).mean()) < 0.08


def file_page(data: bytes, kind: str, index: int, fmt: PageFormat) -> Image.Image:
    """One page of the file, as it will print."""
    if fmt.thermal:
        img = load(data, kind, index, fmt.width * 3)
        # A landscape page prints sideways, so it can use the roll's length.
        if img.width > img.height * 1.15:
            img = img.rotate(90, expand=True)
        return thermal_ready(img, fmt.width, photo=not looks_like_line_art(img))
    img = load(data, kind, index, fmt.height)
    if (img.width > img.height) != (fmt.width > fmt.height):
        img = img.rotate(90, expand=True)
    page = Image.new("RGB", (fmt.width, fmt.height), "white")
    margin = round(fmt.width * 0.03)
    img.thumbnail((fmt.width - 2 * margin, fmt.height - 2 * margin), Image.LANCZOS)
    page.paste(img, ((fmt.width - img.width) // 2, (fmt.height - img.height) // 2))
    return page


def parse_pages(spec: str | None, count: int) -> list[int]:
    """'all' or '' = every page; '1-3, 5' = those pages. 1-based in, 0-based out."""
    spec = (spec or "").strip().lower()
    pages: list[int] = list(range(count)) if spec in ("", "all") else []
    for part in [] if pages else spec.replace(" ", "").split(","):
        if not part:
            continue
        try:
            if "-" in part:
                a, b = (int(x) for x in part.split("-", 1))
            else:
                a = b = int(part)
        except ValueError as err:
            raise FileError(f"'{part}' is not a page number or a range like 2-4.") from err
        if a < 1 or b > count or a > b:
            raise FileError(f"Pages {part} are not in this file (it has {count}).")
        pages.extend(i for i in range(a - 1, b) if i not in pages)
    if not pages:
        raise FileError("Choose at least one page.")
    if len(pages) > MAX_PAGES:
        raise FileError(f"At most {MAX_PAGES} pages can be printed at once.")
    return pages
