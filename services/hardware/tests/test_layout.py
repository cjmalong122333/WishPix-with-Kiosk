import numpy as np
import pytest
from PIL import Image

from app.layout import FORMATS, PageRequest, bilingual, dotted_row, line_art, page_content, render_page

INKJET, THERMAL = FORMATS["4x6"], FORMATS["58mm"]
PAGES = {
    "trace_word": {"kind": "trace_word", "en": "cat", "fil": "pusa"},
    "trace_image": {"kind": "trace_image", "en": "cat", "fil": "pusa"},
    "coloring": {"kind": "coloring", "en": "cat", "fil": "pusa"},
}


def ink_ratio(img: Image.Image) -> float:
    return float((np.array(img.convert("L")) < 128).mean())


def colors(img: Image.Image) -> set[int]:
    return set(np.unique(np.array(img.convert("L"))).tolist())


@pytest.mark.parametrize("kind", PAGES)
def test_inkjet_pages_are_black_on_white(kind, picture):
    activity = "color_create" if kind == "coloring" else "trace_learn"
    page = render_page(PageRequest(activity_type=activity, sheet=PAGES[kind]), picture, INKJET)
    assert page.size == (INKJET.width, INKJET.height)
    assert 0.002 < ink_ratio(page) < 0.3
    # Black and white only: anything in between is just the soft edge of a line.
    gray = np.array(page)
    assert ((gray > 60) & (gray < 200)).mean() < 0.01


@pytest.mark.parametrize("kind", PAGES)
def test_thermal_pages_fit_the_roll(kind, picture):
    activity = "color_create" if kind == "coloring" else "trace_learn"
    page = render_page(PageRequest(activity_type=activity, sheet=PAGES[kind]), picture, THERMAL)
    assert page.mode == "1"
    assert colors(page) <= {0, 255}
    # Portrait pages are the roll's width; Trace Word runs along the roll (printed sideways).
    assert THERMAL.width in page.size
    assert 0.002 < ink_ratio(page) < 0.3


def test_trace_word_has_no_picture_and_four_rows(picture):
    with_pic = render_page(PageRequest(activity_type="trace_learn", sheet=PAGES["trace_word"]), picture, INKJET)
    without = render_page(PageRequest(activity_type="trace_learn", sheet=PAGES["trace_word"]), None, INKJET)
    assert np.array_equal(np.array(with_pic), np.array(without))
    # Four bands of dots, with paper between them.
    rows_with_ink = (np.array(without) < 128).any(axis=1)
    bands = np.count_nonzero(np.diff(rows_with_ink.astype(int)) == 1) + int(rows_with_ink[0])
    assert bands == 4


def test_old_pages_still_print(picture):
    # Before November 2026: letter/number sheets, Color & Create without words, Free Play.
    old = [
        PageRequest(activity_type="trace_learn", sheet={"kind": "letter", "letter": "C", "word": "cat"}),
        PageRequest(activity_type="color_create", label="Happy cat"),
        PageRequest(activity_type="free_play", label="A dragon"),
    ]
    for req in old:
        assert ink_ratio(render_page(req, picture, INKJET)) > 0.002
    assert page_content(old[0]) == ("trace_image", "cat", "")
    assert page_content(old[2])[0] == "coloring"


def test_bilingual_label():
    assert bilingual("cat", "pusa") == "CAT / PUSA"
    assert bilingual("cat", "cat") == "CAT"
    assert bilingual("cat", "") == "CAT"
    assert bilingual("", "pusa") == "PUSA"


def test_dotted_letters_follow_the_strokes():
    row = dotted_row("A", 400, 200, INKJET)
    # An A is two legs and a bar: a few lines, not one outline around the letter.
    assert 2 <= len(row.lines) <= 5


def test_filipino_test_page():
    for fmt in (INKJET, THERMAL):
        assert render_page(PageRequest(kind="test", language="fil"), None, fmt).width == fmt.width


def test_line_art_removes_gray_fill():
    img = Image.new("RGB", (200, 200), (150, 150, 150))
    out = np.array(line_art(img).convert("L"))
    # A flat gray picture becomes white paper, not a black block.
    assert (out < 128).mean() < 0.35
