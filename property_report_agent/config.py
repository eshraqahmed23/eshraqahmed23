"""Environment-based configuration and factory helpers."""

from __future__ import annotations

import os

from .agent import ReportExtractionAgent
from .pipeline import ReportPipeline
from .powerbi import DEFAULT_DATASET_NAME, PowerBIClient

POWERBI_ENV_VARS = (
    "AZURE_TENANT_ID",
    "AZURE_CLIENT_ID",
    "AZURE_CLIENT_SECRET",
    "POWERBI_WORKSPACE_ID",
)


def powerbi_from_env() -> PowerBIClient | None:
    """Build a PowerBIClient from env vars; None if not configured."""
    values = {name: os.environ.get(name) for name in POWERBI_ENV_VARS}
    if not all(values.values()):
        return None
    return PowerBIClient(
        tenant_id=values["AZURE_TENANT_ID"],
        client_id=values["AZURE_CLIENT_ID"],
        client_secret=values["AZURE_CLIENT_SECRET"],
        workspace_id=values["POWERBI_WORKSPACE_ID"],
        dataset_name=os.environ.get("POWERBI_DATASET_NAME", DEFAULT_DATASET_NAME),
    )


def pipeline_from_env() -> ReportPipeline:
    """Build the full pipeline. ANTHROPIC_API_KEY must be set for extraction."""
    return ReportPipeline(agent=ReportExtractionAgent(), powerbi=powerbi_from_env())
