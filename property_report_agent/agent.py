"""Claude-powered extraction agent.

Takes normalized report content and returns a validated
PropertyReportExtraction via the Messages API structured-output parse helper.
"""

from __future__ import annotations

import anthropic

from .ingestion import ReportContent
from .schemas import PropertyReportExtraction

DEFAULT_MODEL = "claude-opus-4-8"

SYSTEM_PROMPT = """\
You are a data-extraction agent for a property-management analytics pipeline.
You receive one property report (monthly owner report, rent roll, operating
statement, or similar) and must extract its contents into the provided schema.

Rules:
- Extract only what the report states. Never invent units, tenants, or amounts.
  Leave optional fields null when the report doesn't provide them.
- Normalize money to plain numbers (no currency symbols, no thousands
  separators). Report expenses as positive numbers.
- Normalize dates to YYYY-MM-DD and the report period to YYYY-MM.
- Map every financial line to the closest subcategory from the schema
  description; use 'other' only when nothing fits.
- Unit status must be exactly 'occupied', 'vacant', or 'notice'.
- occupancy_rate is a fraction (0.94, not 94).
- If totals are missing but derivable from listed lines (e.g. NOI from income
  and expenses), compute them; otherwise leave them null.
- highlights: up to 5 short facts a portfolio owner would want surfaced
  (delinquency spikes, expiring leases, large expense variances, emergencies).
"""


class ReportExtractionAgent:
    def __init__(self, client: anthropic.Anthropic | None = None, model: str = DEFAULT_MODEL):
        self.client = client or anthropic.Anthropic()
        self.model = model

    def extract(self, report: ReportContent) -> PropertyReportExtraction:
        """Extract structured data from one report."""
        if report.kind == "pdf":
            content = [
                {
                    "type": "document",
                    "source": {
                        "type": "base64",
                        "media_type": "application/pdf",
                        "data": report.pdf_base64,
                    },
                },
                {"type": "text", "text": self._instruction(report)},
            ]
        else:
            content = [
                {
                    "type": "text",
                    "text": f"{self._instruction(report)}\n\n<report>\n{report.text}\n</report>",
                }
            ]

        response = self.client.messages.parse(
            model=self.model,
            max_tokens=32_000,
            thinking={"type": "adaptive"},
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": content}],
            output_format=PropertyReportExtraction,
        )

        extraction = response.parsed_output
        if extraction is None:
            raise RuntimeError(
                f"Extraction failed (stop_reason={response.stop_reason}); "
                "the model did not return a parseable result."
            )
        return extraction

    @staticmethod
    def _instruction(report: ReportContent) -> str:
        return (
            f"Extract the property report data from the file '{report.filename}' "
            "into the required schema."
        )
