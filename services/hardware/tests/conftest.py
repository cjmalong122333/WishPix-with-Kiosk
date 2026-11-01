import io

import pytest
from fastapi.testclient import TestClient
from PIL import Image, ImageDraw

from app import main
from app.config import Settings, get_settings


@pytest.fixture
def picture() -> bytes:
    """A small fake 'AI picture': a black cat-ish outline on white."""
    img = Image.new("RGB", (512, 512), "white")
    d = ImageDraw.Draw(img)
    d.ellipse((120, 160, 392, 432), outline="black", width=10)
    d.polygon([(150, 200), (190, 90), (230, 180)], outline="black", width=10)
    d.polygon([(282, 180), (322, 90), (362, 200)], outline="black", width=10)
    out = io.BytesIO()
    img.save(out, "PNG")
    return out.getvalue()


@pytest.fixture
def settings(tmp_path, monkeypatch) -> Settings:
    s = Settings(_env_file=None, state_dir=tmp_path, paper_capacity=5, mock_page_seconds=0.2, problem_grace_seconds=1)
    monkeypatch.setattr(main, "get_settings", lambda: s)
    get_settings.cache_clear()
    return s


@pytest.fixture
def client(settings):
    with TestClient(main.app) as c:
        yield c
