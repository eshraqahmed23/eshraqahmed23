"""Pydantic models describing the normalized property-report data model.

These models serve two purposes:
1. They are the structured-output schema Claude is constrained to when
   extracting data from a raw report.
2. They map 1:1 onto the Power BI push-dataset tables (see powerbi.py).
"""

from __future__ import annotations

from typing import List, Optional

from pydantic import BaseModel, Field


class PropertySummary(BaseModel):
    """Top-level facts about the property and the reporting period."""

    property_name: str = Field(description="Name of the property, e.g. 'Maple Court Apartments'")
    address: Optional[str] = Field(default=None, description="Street address if stated")
    city: Optional[str] = None
    state: Optional[str] = None
    report_period: str = Field(
        description="Reporting period in YYYY-MM format (e.g. '2026-06'). "
        "If the report covers a quarter or year, use the last month of the period."
    )
    total_units: Optional[int] = Field(default=None, description="Total unit count")
    occupied_units: Optional[int] = Field(default=None, description="Occupied unit count")
    occupancy_rate: Optional[float] = Field(
        default=None, description="Occupancy as a fraction between 0 and 1 (e.g. 0.94)"
    )
    total_income: Optional[float] = Field(
        default=None, description="Total income for the period in the report's currency"
    )
    total_expenses: Optional[float] = Field(default=None, description="Total operating expenses")
    net_operating_income: Optional[float] = Field(
        default=None,
        description="NOI for the period. If not stated, compute total_income - total_expenses "
        "when both are available; otherwise leave null.",
    )


class UnitRecord(BaseModel):
    """One row of the rent roll."""

    unit_number: str = Field(description="Unit identifier as written in the report")
    bedrooms: Optional[int] = None
    bathrooms: Optional[float] = None
    square_feet: Optional[int] = None
    status: str = Field(
        description="One of: 'occupied', 'vacant', 'notice' (occupied but tenant gave notice)"
    )
    tenant_name: Optional[str] = Field(default=None, description="Tenant name if listed")
    market_rent: Optional[float] = Field(default=None, description="Asking/market rent")
    actual_rent: Optional[float] = Field(default=None, description="Rent actually charged on the lease")
    balance_due: Optional[float] = Field(
        default=None, description="Outstanding tenant balance / delinquency amount"
    )
    lease_start: Optional[str] = Field(default=None, description="Lease start date, YYYY-MM-DD")
    lease_end: Optional[str] = Field(default=None, description="Lease end date, YYYY-MM-DD")


class FinancialLineItem(BaseModel):
    """One income or expense line from the financial statement."""

    category: str = Field(description="Either 'income' or 'expense'")
    subcategory: str = Field(
        description="Normalized grouping, e.g. 'rental_income', 'other_income', 'maintenance', "
        "'utilities', 'insurance', 'taxes', 'management_fees', 'payroll', 'marketing', 'other'"
    )
    name: str = Field(description="Line-item label as written in the report")
    amount: float = Field(description="Amount for the period; expenses as positive numbers")
    budget_amount: Optional[float] = Field(
        default=None, description="Budgeted amount for the same line, if the report shows budget"
    )


class MaintenanceItem(BaseModel):
    """A maintenance/work-order entry."""

    description: str
    unit_number: Optional[str] = None
    status: str = Field(description="One of: 'open', 'in_progress', 'completed'")
    priority: Optional[str] = Field(default=None, description="e.g. 'emergency', 'high', 'routine'")
    cost: Optional[float] = None
    reported_date: Optional[str] = Field(default=None, description="YYYY-MM-DD if stated")


class PropertyReportExtraction(BaseModel):
    """Everything the agent extracts from a single property report."""

    property: PropertySummary
    units: List[UnitRecord] = Field(
        default_factory=list, description="Rent-roll rows; empty if the report has no unit detail"
    )
    financials: List[FinancialLineItem] = Field(
        default_factory=list, description="Income and expense lines; empty if not present"
    )
    maintenance: List[MaintenanceItem] = Field(
        default_factory=list, description="Work orders / maintenance items; empty if not present"
    )
    highlights: List[str] = Field(
        default_factory=list,
        description="Up to 5 short, notable facts a portfolio manager should see "
        "(e.g. 'Delinquency doubled vs prior month').",
    )
