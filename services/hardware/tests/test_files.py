import io

import numpy as np
import pytest
from PIL import Image, ImageDraw

from app.files import FileError, detect, file_page, page_count, parse_pages
from app.layout import FORMATS
from app.thermal import raster, thermal_ready


def png_bytes(color="white", size=(300, 200)) -> bytes:
    img = Image.new("RGB", size, color)
    ImageDraw.Draw(img).rectangle((20, 20, 120, 120), fill="black")
    out = io.BytesIO()
    img.save(out, "PNG")
    return out.getvalue()


def pdf_bytes(pages: int = 3) -> bytes:
    sheets = [Image.new("RGB", (595, 842), "white") for _ in range(pages)]
    for i, sheet in enumerate(sheets):
        ImageDraw.Draw(sheet).text((100, 100), f"Page {i + 1}", fill="black")
        ImageDraw.Draw(sheet).ellipse((150, 300, 450, 600), fill=(90, 90, 90))
    out = io.BytesIO()
    sheets[0].save(out, "PDF", save_all=True, append_images=sheets[1:])
    return out.getvalue()


def test_detect_by_content_not_name():
    assert detect(png_bytes()) == "png"
    jpg = io.BytesIO()
    Image.new("RGB", (10, 10)).save(jpg, "JPEG")
    assert detect(jpg.getvalue()) == "jpg"
    assert detect(pdf_bytes(1)) == "pdf"
    with pytest.raises(FileError):
        detect(b"GIF89a....")


def test_pdf_pages():
    data = pdf_bytes(3)
    assert page_count(data, "pdf") == 3
    with pytest.raises(FileError):
        page_count(b"%PDF-1.4 not really a pdf", "pdf")


def test_page_ranges():
    assert parse_pages("all", 4) == [0, 1, 2, 3]
    assert parse_pages("", 2) == [0, 1]
    assert parse_pages("1-2, 4", 5) == [0, 1, 3]
    assert parse_pages("3,3", 5) == [2]
    for bad in ("0", "6", "3-1", "x", "1-9"):
        with pytest.raises(FileError):
            parse_pages(bad, 5)


def test_thermal_file_pages_are_dithered_to_the_roll_width():
    page = file_page(pdf_bytes(2), "pdf", 1, FORMATS["58mm"])
    assert page.mode == "1" and page.width == 384
    # The gray circle became a pattern of black and white dots.
    assert set(np.unique(np.array(page.convert("L"))).tolist()) <= {0, 255}


def test_inkjet_file_pages_fill_a_4x6_page():
    page = file_page(png_bytes(size=(600, 300)), "png", 0, FORMATS["4x6"])
    assert page.size == (1200, 1800)


def test_thermal_ready_keeps_lines_solid():
    img = Image.new("L", (384, 100), 255)
    ImageDraw.Draw(img).line((10, 50, 370, 50), fill=0, width=4)
    before = np.array(img) < 128
    after = np.array(thermal_ready(img).convert("L")) < 128
    assert np.array_equal(before, after)


def test_escpos_raster():
    img = Image.new("1", (384, 10), 1)
    ImageDraw.Draw(img).rectangle((0, 0, 7, 9), fill=0)  # first byte of every row is black
    data = raster(img, cut=False)
    assert data.startswith(b"\x1b@\x1dv0\x00")
    width_bytes, rows = data[6] | data[7] << 8, data[8] | data[9] << 8
    assert (width_bytes, rows) == (48, 10)
    first_row = data[10 : 10 + 48]
    assert first_row[0] == 0xFF and not any(first_row[1:])
