"""End-to-end pipeline: report file -> Claude extraction -> Power BI rows."""

from __future__ import annotations

import logging
from typing import Dict, List

from .agent import ReportExtractionAgent
from .ingestion import ReportContent, load_report
from .powerbi import PowerBIClient
from .schemas import PropertyReportExtraction

logger = logging.getLogger(__name__)


def extraction_to_rows(
    extraction: PropertyReportExtraction, source_file: str
) -> Dict[str, List[dict]]:
    """Flatten an extraction into rows keyed by Power BI table name.

    Field names must match the column names in powerbi.DATASET_TABLES.
    """
    p = extraction.property
    key = {"property_name": p.property_name, "report_period": p.report_period}

    properties = [
        {
            **key,
            # First day of the period as a real date column so Power BI can
            # build time-series visuals without DAX gymnastics.
            "period_date": f"{p.report_period}-01T00:00:00Z",
            "address": p.address,
            "city": p.city,
            "state": p.state,
            "total_units": p.total_units,
            "occupied_units": p.occupied_units,
            "occupancy_rate": p.occupancy_rate,
            "total_income": p.total_income,
            "total_expenses": p.total_expenses,
            "net_operating_income": p.net_operating_income,
            "source_file": source_file,
        }
    ]

    units = [
        {
            **key,
            "unit_number": u.unit_number,
            "bedrooms": u.bedrooms,
            "bathrooms": u.bathrooms,
            "square_feet": u.square_feet,
            "status": u.status,
            "tenant_name": u.tenant_name,
            "market_rent": u.market_rent,
            "actual_rent": u.actual_rent,
            "balance_due": u.balance_due,
            "lease_start": u.lease_start,
            "lease_end": u.lease_end,
        }
        for u in extraction.units
    ]

    financials = [
        {
            **key,
            "category": f.category,
            "subcategory": f.subcategory,
            "name": f.name,
            "amount": f.amount,
            "budget_amount": f.budget_amount,
        }
        for f in extraction.financials
    ]

    maintenance = [
        {
            **key,
            "unit_number": m.unit_number,
            "description": m.description,
            "status": m.status,
            "priority": m.priority,
            "cost": m.cost,
            "reported_date": m.reported_date,
        }
        for m in extraction.maintenance
    ]

    highlights = [{**key, "highlight": h} for h in extraction.highlights]

    return {
        "Properties": properties,
        "Units": units,
        "Financials": financials,
        "Maintenance": maintenance,
        "Highlights": highlights,
    }


class ReportPipeline:
    """Processes reports and pushes the results to Power BI."""

    def __init__(self, agent: ReportExtractionAgent, powerbi: PowerBIClient | None):
        self.agent = agent
        self.powerbi = powerbi

    def process(self, data: bytes, filename: str, push: bool = True) -> dict:
        report: ReportContent = load_report(data, filename)
        logger.info("Extracting data from %s (%s)", filename, report.kind)
        extraction = self.agent.extract(report)

        rows = extraction_to_rows(extraction, source_file=filename)
        pushed = False
        if push:
            if self.powerbi is None:
                raise RuntimeError(
                    "Power BI is not configured. Set the AZURE_*/POWERBI_* environment "
                    "variables, or run with push disabled (--dry-run)."
                )
            self.powerbi.push_rows(rows)
            pushed = True

        return {
            "filename": filename,
            "property_name": extraction.property.property_name,
            "report_period": extraction.property.report_period,
            "row_counts": {table: len(r) for table, r in rows.items()},
            "highlights": extraction.highlights,
            "pushed_to_powerbi": pushed,
            "extraction": extraction.model_dump(),
        }
