"""Turn an uploaded report file into content the extraction agent can read.

Supported formats:
- PDF        -> passed to Claude as a native document block (base64)
- XLSX/XLS   -> every sheet rendered to CSV text via pandas
- CSV        -> raw text
- TXT/MD     -> raw text
"""

from __future__ import annotations

import base64
import io
from dataclasses import dataclass
from pathlib import Path

TEXT_EXTENSIONS = {".csv", ".txt", ".md"}
EXCEL_EXTENSIONS = {".xlsx", ".xls"}
SUPPORTED_EXTENSIONS = TEXT_EXTENSIONS | EXCEL_EXTENSIONS | {".pdf"}

# Guardrail so a runaway export doesn't blow past the context window.
MAX_TEXT_CHARS = 400_000


class UnsupportedReportError(ValueError):
    """Raised when the file type can't be ingested."""


@dataclass
class ReportContent:
    """Normalized report content ready to send to the agent."""

    filename: str
    kind: str  # "text" or "pdf"
    text: str | None = None
    pdf_base64: str | None = None


def load_report(data: bytes, filename: str) -> ReportContent:
    """Convert raw file bytes into ReportContent."""
    suffix = Path(filename).suffix.lower()
    if suffix not in SUPPORTED_EXTENSIONS:
        raise UnsupportedReportError(
            f"Unsupported report type '{suffix}'. Supported: {sorted(SUPPORTED_EXTENSIONS)}"
        )

    if suffix == ".pdf":
        return ReportContent(
            filename=filename,
            kind="pdf",
            pdf_base64=base64.standard_b64encode(data).decode("ascii"),
        )

    if suffix in EXCEL_EXTENSIONS:
        text = _excel_to_text(data)
    else:
        text = data.decode("utf-8", errors="replace")

    if len(text) > MAX_TEXT_CHARS:
        raise UnsupportedReportError(
            f"Report text is too large ({len(text)} chars > {MAX_TEXT_CHARS}). "
            "Split the report or export a smaller period."
        )

    return ReportContent(filename=filename, kind="text", text=text)


def load_report_file(path: str | Path) -> ReportContent:
    """Convenience wrapper for a file on disk."""
    path = Path(path)
    return load_report(path.read_bytes(), path.name)


def _excel_to_text(data: bytes) -> str:
    import pandas as pd

    sheets = pd.read_excel(io.BytesIO(data), sheet_name=None)
    parts = []
    for name, df in sheets.items():
        parts.append(f"## Sheet: {name}\n{df.to_csv(index=False)}")
    return "\n\n".join(parts)
