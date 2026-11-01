import numpy as np
import pytest
from PIL import Image

from app.layout import PAGE_H, PAGE_W, PageRequest, line_art, render_page

SHEETS = [
    {"kind": "letter", "letter": "C", "word": "cat"},
    {"kind": "number", "count": 3, "word": "cat"},
    {"kind": "shape", "shape": "star", "word": "cat"},
    {"kind": "prewriting", "path": "loops", "word": "cat"},
    {"kind": "word", "word": "pusa"},
]


def ink_ratio(img: Image.Image) -> float:
    return float((np.array(img.convert("L")) < 128).mean())


@pytest.mark.parametrize("sheet", SHEETS, ids=[s["kind"] for s in SHEETS])
def test_trace_sheets_render(sheet, picture):
    page = render_page(PageRequest(activity_type="trace_learn", theme="Animals", sheet=sheet), picture)
    assert page.size == (PAGE_W, PAGE_H)
    # Some ink, but mostly white paper.
    assert 0.002 < ink_ratio(page) < 0.25


@pytest.mark.parametrize("activity", ["color_create", "free_play"])
def test_picture_pages_render(activity, picture):
    page = render_page(
        PageRequest(
            activity_type=activity,
            theme="Animals",
            label="Happy cat",
            caption="a happy cat",
            colorful=activity == "free_play",
        ),
        picture,
    )
    assert page.size == (PAGE_W, PAGE_H)
    assert ink_ratio(page) > 0.002


def test_filipino_page_and_test_page():
    page = render_page(PageRequest(kind="test", language="fil"), None)
    assert page.size == (PAGE_W, PAGE_H)


def test_line_art_removes_gray_fill():
    img = Image.new("RGB", (200, 200), (150, 150, 150))
    out = np.array(line_art(img).convert("L"))
    # A flat gray picture becomes white paper, not a black block.
    assert (out < 128).mean() < 0.35
