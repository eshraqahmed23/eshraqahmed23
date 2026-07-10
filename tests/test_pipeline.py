from property_report_agent.pipeline import extraction_to_rows
from property_report_agent.powerbi import DATASET_TABLES
from property_report_agent.schemas import (
    FinancialLineItem,
    MaintenanceItem,
    PropertyReportExtraction,
    PropertySummary,
    UnitRecord,
)


def sample_extraction() -> PropertyReportExtraction:
    return PropertyReportExtraction(
        property=PropertySummary(
            property_name="Maple Court",
            report_period="2026-06",
            city="Springfield",
            state="IL",
            total_units=12,
            occupied_units=11,
            occupancy_rate=0.917,
            total_income=14530.0,
            total_expenses=6512.0,
            net_operating_income=8018.0,
        ),
        units=[
            UnitRecord(unit_number="101", status="occupied", actual_rent=1200.0),
            UnitRecord(unit_number="103", status="vacant", market_rent=1050.0),
        ],
        financials=[
            FinancialLineItem(
                category="income", subcategory="rental_income", name="Rental income", amount=14170.0
            ),
            FinancialLineItem(
                category="expense", subcategory="maintenance", name="Repairs", amount=1840.0
            ),
        ],
        maintenance=[
            MaintenanceItem(description="Water heater replacement", status="completed", cost=1150.0)
        ],
        highlights=["Unit 304 gave notice"],
    )


def test_extraction_to_rows_counts():
    rows = extraction_to_rows(sample_extraction(), source_file="june.txt")
    assert len(rows["Properties"]) == 1
    assert len(rows["Units"]) == 2
    assert len(rows["Financials"]) == 2
    assert len(rows["Maintenance"]) == 1
    assert len(rows["Highlights"]) == 1


def test_every_row_carries_property_key():
    rows = extraction_to_rows(sample_extraction(), source_file="june.txt")
    for table_rows in rows.values():
        for row in table_rows:
            assert row["property_name"] == "Maple Court"
            assert row["report_period"] == "2026-06"


def test_period_date_derived_from_period():
    rows = extraction_to_rows(sample_extraction(), source_file="june.txt")
    assert rows["Properties"][0]["period_date"] == "2026-06-01T00:00:00Z"


def test_row_fields_match_powerbi_schema():
    """Row dict keys must exactly match the push-dataset column names."""
    rows = extraction_to_rows(sample_extraction(), source_file="june.txt")
    schema = {t["name"]: {c["name"] for c in t["columns"]} for t in DATASET_TABLES}
    assert set(rows) == set(schema)
    for table, table_rows in rows.items():
        for row in table_rows:
            assert set(row) <= schema[table], f"unknown columns in {table}"
