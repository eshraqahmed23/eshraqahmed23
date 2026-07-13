"""HTTP intake for property managers.

Run with:
    uvicorn property_report_agent.api:app --reload

Open http://localhost:8000/ for the upload page: property managers drop a
report file in the browser and the agent extracts it and pushes the data into
the Power BI dataset. The same endpoint is available programmatically as
POST /reports (pass ?dry_run=true to preview the extraction without pushing).
"""

from __future__ import annotations

import logging
from functools import lru_cache
from pathlib import Path

from fastapi import FastAPI, File, HTTPException, Query, UploadFile
from fastapi.responses import HTMLResponse

from .config import pipeline_from_env
from .ingestion import UnsupportedReportError
from .pipeline import ReportPipeline

UPLOAD_PAGE = Path(__file__).parent / "static" / "index.html"

logging.basicConfig(level=logging.INFO)

app = FastAPI(
    title="Property Report → Power BI Agent",
    description="Send property-management reports; get Power BI dashboard data.",
)


@lru_cache(maxsize=1)
def get_pipeline() -> ReportPipeline:
    return pipeline_from_env()


@app.get("/", response_class=HTMLResponse, include_in_schema=False)
def upload_page() -> str:
    """Browser upload page for property managers."""
    return UPLOAD_PAGE.read_text(encoding="utf-8")


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "powerbi_configured": get_pipeline().powerbi is not None}


@app.post("/reports")
async def submit_report(
    file: UploadFile = File(...),
    dry_run: bool = Query(False, description="Extract only; skip the Power BI push"),
) -> dict:
    data = await file.read()
    try:
        return get_pipeline().process(data, filename=file.filename, push=not dry_run)
    except UnsupportedReportError as exc:
        raise HTTPException(status_code=415, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
