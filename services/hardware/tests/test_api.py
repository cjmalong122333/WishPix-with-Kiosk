import io
import json
import time

from fastapi.testclient import TestClient
from PIL import Image

from app import main


def submit(client, picture, **meta):
    meta = {"requestId": 1, "kind": "child", "activityType": "color_create", "theme": "Animals", **meta}
    res = client.post("/jobs", data={"meta": json.dumps(meta)}, files={"image": ("p.png", picture, "image/png")})
    assert res.status_code == 200, res.text
    return res.json()["jobId"]


def wait(client, job_id, timeout=10):
    end = time.time() + timeout
    while time.time() < end:
        status = client.get(f"/jobs/{job_id}").json()
        if status["status"] in ("done", "failed"):
            return status
        time.sleep(0.1)
    raise AssertionError("job did not finish")


def test_health(client):
    body = client.get("/health").json()
    assert body["ok"] and body["mode"] == "mock"


def test_print_uses_one_sheet(client, picture):
    assert client.get("/printer").json()["paper"] == 5
    status = wait(client, submit(client, picture))
    assert status == {"status": "done", "problem": None, "done": 1, "total": 1}
    printer = client.get("/printer").json()
    assert printer["paper"] == 4
    assert printer["ink"] == 99


def test_the_page_is_kept(client, picture):
    job_id = submit(client, picture)
    wait(client, job_id)
    res = client.get(f"/jobs/{job_id}/page")
    assert res.status_code == 200 and res.headers["content-type"] == "image/png"


def test_jam_fails_and_clear_fixes(client, picture):
    client.post("/printer/simulate", json={"problem": "jam"})
    assert client.get("/printer").json()["problem"] == "jam"
    assert wait(client, submit(client, picture))["problem"] == "jam"
    client.post("/printer/clear")
    assert client.get("/printer").json()["problem"] is None
    assert wait(client, submit(client, picture))["status"] == "done"


def test_empty_tray(client, picture):
    for _ in range(5):
        wait(client, submit(client, picture))
    assert client.get("/printer").json()["problem"] == "no_paper"
    assert wait(client, submit(client, picture))["problem"] == "no_paper"
    client.post("/printer/paper")
    assert client.get("/printer").json()["paper"] == 5


def test_picture_required_except_test_page(client, picture):
    res = client.post("/jobs", data={"meta": json.dumps({"kind": "child"})})
    assert res.status_code == 422
    res = client.post("/jobs", data={"meta": json.dumps({"kind": "test"})})
    assert res.status_code == 200


def test_token(client, settings, picture):
    settings.hardware_token = "secret"
    assert client.get("/printer").status_code == 401
    assert client.get("/printer", headers={"Authorization": "Bearer secret"}).status_code == 200


def test_trace_word_needs_no_picture(client):
    meta = {"kind": "child", "activityType": "trace_learn", "sheet": {"kind": "trace_word", "en": "cat", "fil": "pusa"}}
    res = client.post("/jobs", data={"meta": json.dumps(meta)})
    assert res.status_code == 200
    assert wait(client, res.json()["jobId"])["status"] == "done"


def test_render_is_the_printed_page(client, picture):
    meta = {"kind": "child", "activityType": "color_create", "sheet": {"kind": "coloring", "en": "cat", "fil": "pusa"}}
    res = client.post("/render", data={"meta": json.dumps(meta)}, files={"image": ("p.png", picture, "image/png")})
    assert res.status_code == 200 and res.headers["content-type"] == "image/png"
    assert Image.open(io.BytesIO(res.content)).size == (1200, 1800)
    # Rendering does not print.
    assert client.get("/printer").json()["paper"] == 5


def pdf(pages: int) -> bytes:
    sheets = [Image.new("RGB", (300, 400), "white") for _ in range(pages)]
    out = io.BytesIO()
    sheets[0].save(out, "PDF", save_all=True, append_images=sheets[1:])
    return out.getvalue()


def test_teacher_file_pages_and_copies(client):
    files = {"file": ("worksheet.pdf", pdf(3), "application/pdf")}
    assert client.post("/files/inspect", files=files).json() == {"type": "pdf", "pages": 3}
    preview = client.post("/files/preview", files=files, data={"page": "2"})
    assert preview.status_code == 200 and preview.headers["content-type"] == "image/png"

    res = client.post("/files/jobs", files=files, data={"pages": "1-2", "copies": "2"})
    assert res.status_code == 200 and res.json()["total"] == 4
    status = wait(client, res.json()["jobId"], timeout=20)
    assert status["status"] == "done" and status["done"] == 4
    assert client.get("/printer").json()["paper"] == 1  # 5 sheets - 4


def test_teacher_file_problems(client):
    bad = client.post("/files/inspect", files={"file": ("notes.txt", b"hello", "text/plain")})
    assert bad.status_code == 422 and "PNG, JPG and PDF" in bad.json()["detail"]
    pages = client.post("/files/jobs", files={"file": ("w.pdf", pdf(2), "application/pdf")}, data={"pages": "5"})
    assert pages.status_code == 422
    copies = client.post("/files/jobs", files={"file": ("w.pdf", pdf(1), "application/pdf")}, data={"copies": "11"})
    assert copies.status_code == 422


def test_thermal_format_has_no_ink(settings, picture):
    settings.page_format = "58mm"
    with TestClient(main.app) as c:
        printer = c.get("/printer").json()
        assert printer["format"] == "58mm" and printer["ink"] is None and not printer["lowInk"]
        c.post("/printer/simulate", json={"problem": "no_ink"})
        assert c.get("/printer").json()["problem"] is None  # no ink to run out of
        meta = {"kind": "child", "activityType": "trace_learn", "sheet": {"kind": "trace_image", "en": "cat"}}
        res = c.post("/render", data={"meta": json.dumps(meta)}, files={"image": ("p.png", picture, "image/png")})
        assert Image.open(io.BytesIO(res.content)).width == 384
