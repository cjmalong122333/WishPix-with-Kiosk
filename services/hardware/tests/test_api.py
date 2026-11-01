import json
import time


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
    assert status == {"status": "done", "problem": None}
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
    assert wait(client, submit(client, picture)) == {"status": "failed", "problem": "jam"}
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
