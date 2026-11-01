"""WishPix hardware service (FastAPI).

Runs next to the web app on the Raspberry Pi and owns the printer. The web
app sends each finished picture here; this service lays out the page and
prints it through CUPS (or saves it, in mock mode). It listens on
127.0.0.1 only; set HARDWARE_TOKEN to also require a shared secret.
"""

from __future__ import annotations

import json
import logging
import secrets
from contextlib import asynccontextmanager
from datetime import datetime
from typing import Annotated

from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from .config import get_settings
from .layout import PageRequest, font_in_use
from .service import PrintService

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")

MAX_IMAGE_BYTES = 15 * 1024 * 1024


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.service = PrintService(get_settings())
    yield


app = FastAPI(title="WishPix hardware service", version="1.0.0", lifespan=lifespan)


def service() -> PrintService:
    return app.state.service


def check_token(authorization: Annotated[str | None, Header()] = None):
    token = get_settings().hardware_token
    if token and not (authorization and secrets.compare_digest(authorization, f"Bearer {token}")):
        raise HTTPException(status_code=401, detail="Wrong or missing hardware token.")


Auth = Depends(check_token)
Service = Annotated[PrintService, Depends(service)]


@app.get("/health")
def health(svc: Service):
    return {"ok": True, "mode": svc.driver.mode, "printer": svc.driver.name, "font": font_in_use()}


@app.get("/printer", dependencies=[Auth])
def printer_status(svc: Service):
    return svc.status()


class JobMeta(BaseModel):
    requestId: int | None = None
    kind: str = Field(default="child", pattern="^(child|reprint|test)$")
    activityType: str | None = None
    theme: str | None = None
    sheet: dict | None = None
    label: str | None = None
    caption: str | None = None
    colorful: bool = False
    language: str = "en"
    date: datetime | None = None


@app.post("/jobs", dependencies=[Auth])
async def create_job(svc: Service, meta: Annotated[str, Form()], image: Annotated[UploadFile | None, File()] = None):
    try:
        m = JobMeta.model_validate(json.loads(meta))
    except ValueError as err:
        raise HTTPException(status_code=422, detail=f"Bad job details: {err}") from err
    data = await image.read(MAX_IMAGE_BYTES + 1) if image else None
    if data is not None and len(data) > MAX_IMAGE_BYTES:
        raise HTTPException(status_code=413, detail="The picture is too large.")
    if m.kind != "test" and not data:
        raise HTTPException(status_code=422, detail="A picture is needed.")
    page = PageRequest(
        kind=m.kind,
        activity_type=m.activityType,
        theme=m.theme,
        sheet=m.sheet,
        label=m.label,
        caption=m.caption,
        colorful=m.colorful,
        language=m.language,
        date=(m.date.astimezone() if m.date else datetime.now()),
    )
    job = svc.submit(page, data, m.requestId)
    return {"jobId": job.id}


@app.get("/jobs/{job_id}", dependencies=[Auth])
def job_status(job_id: str, svc: Service):
    job = svc.jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Unknown job.")
    return {"status": job.status, "problem": job.problem}


@app.get("/jobs/{job_id}/page", dependencies=[Auth])
def job_page(job_id: str, svc: Service):
    job = svc.jobs.get(job_id)
    if not job or not job.page_file or not job.page_file.exists():
        raise HTTPException(status_code=404, detail="No page for this job.")
    return FileResponse(job.page_file, media_type="image/png")


class Refill(BaseModel):
    sheets: int | None = Field(default=None, ge=1, le=500)


@app.post("/printer/paper", dependencies=[Auth])
def refill_paper(svc: Service, body: Refill | None = None):
    svc.refill_paper(body.sheets if body else None)
    return svc.status()


@app.post("/printer/ink", dependencies=[Auth])
def replace_ink(svc: Service):
    svc.replace_ink()
    return svc.status()


@app.post("/printer/clear", dependencies=[Auth])
def clear_fault(svc: Service):
    svc.clear()
    return svc.status()


class Simulate(BaseModel):
    problem: str


@app.post("/printer/simulate", dependencies=[Auth])
def simulate(body: Simulate, svc: Service):
    if svc.driver.mode != "mock":
        raise HTTPException(status_code=409, detail="Practice problems only work with the simulated printer.")
    if body.problem not in svc.SIMULATIONS:
        raise HTTPException(status_code=422, detail="Unknown problem.")
    svc.simulate(body.problem)
    return svc.status()
