# Property Report → Power BI Agent

An AI agent for property managers: send it a property report (PDF, Excel, CSV, or plain text) and it extracts the data with Claude and pushes it into a **Power BI push dataset**, ready to visualize as a dashboard. Reports from any property-management software work — the agent reads them like a human analyst would, so no per-vendor parsers are needed.

```
                ┌──────────────────────────────────────────────────────┐
report file ───▶│ 1. Ingestion      pdf → document block               │
 (pdf/xlsx/     │                   xlsx/csv/txt → text                │
  csv/txt)      │ 2. Extraction     Claude (structured outputs) →      │
                │                   Property / Units / Financials /    │
                │                   Maintenance / Highlights           │
                │ 3. Load           Power BI REST API → push dataset   │
                └──────────────────────────────────────────────────────┘
                                        │
                                        ▼
                        Power BI report & dashboard visuals
```

## What gets extracted

Each report becomes rows in five Power BI tables, keyed by `property_name` + `report_period` so multiple properties and months accumulate into one portfolio dataset:

| Table | Contents |
|---|---|
| `Properties` | One row per report: occupancy, total income/expenses, NOI, period date |
| `Units` | Rent roll: unit, status (occupied/vacant/notice), rents, balances, lease dates |
| `Financials` | Income & expense line items with normalized subcategories and budget amounts |
| `Maintenance` | Work orders with status, priority, and cost |
| `Highlights` | Short AI-surfaced facts (delinquency spikes, expiring leases, variances) |

## Setup

### 1. Install

```bash
pip install -r requirements.txt
cp .env.example .env   # then fill it in
```

### 2. Claude API

Set `ANTHROPIC_API_KEY` (from [platform.claude.com](https://platform.claude.com)).

### 3. Azure AD + Power BI (for the push step)

1. **Register an Azure AD app** (Azure Portal → App registrations → New). Note the tenant ID and client ID; create a client secret.
2. **Allow service principals in Power BI**: Power BI Admin Portal → Tenant settings → Developer settings → *Allow service principals to use Power BI APIs* → enable for a security group containing your app.
3. **Create a Power BI workspace** (new/V2 workspace) and add the service principal as a **Member** or **Admin**. Copy the workspace ID from its URL.
4. Fill `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`, `POWERBI_WORKSPACE_ID` in `.env`.

The dataset itself is created automatically on first push.

## Usage

### CLI

```bash
# Preview the extraction without touching Power BI
python -m property_report_agent.cli samples/monthly_report_maple_court.txt --dry-run

# Extract and push
python -m property_report_agent.cli reports/june_2026.pdf

# Re-process a batch from scratch (clears all dataset tables first)
python -m property_report_agent.cli reports/*.pdf --replace
```

### Web upload page (for property managers)

```bash
uvicorn property_report_agent.api:app --host 0.0.0.0 --port 8000
```

Open **http://localhost:8000/** — property managers drag-and-drop (or pick) a report file, optionally tick *Preview only*, and see the extraction summary, AI highlights, and per-table row counts right in the browser.

The same endpoint works programmatically:

```bash
curl -F "file=@reports/june_2026.pdf" http://localhost:8000/reports
# preview only:
curl -F "file=@reports/june_2026.pdf" "http://localhost:8000/reports?dry_run=true"
```

The JSON response includes the extraction, per-table row counts, and the AI highlights.

## Building the dashboard in Power BI

After the first push, open your workspace in the Power BI service — the **Property Reports** dataset is there. Click **Create report** on it. Because it's a push dataset, new rows appear in visuals automatically; dashboard tiles pinned from the report update in near-real time. A layout that works well:

**Portfolio overview page**
- Cards: `SUM(Properties[net_operating_income])`, `AVERAGE(Properties[occupancy_rate])`, `SUM(Properties[total_income])`, `SUM(Properties[total_expenses])`
- Line chart: NOI and income by `Properties[period_date]` (one line per `property_name`)
- Bar chart: occupancy_rate by property for the latest period
- Table: `Highlights` filtered to the latest period

**Financials page**
- Clustered bar: `Financials[amount]` vs `Financials[budget_amount]` by `subcategory`
- Matrix: property × subcategory with amount
- Slicers on `report_period` and `property_name`

**Operations page**
- Donut: `Units[status]` (occupied / vacant / notice)
- Table: units with `balance_due > 0` (delinquency)
- Table: `Maintenance` with status/priority/cost; card for `SUM(Maintenance[cost])`

Pin the key visuals to a dashboard for the at-a-glance view.

### Push-dataset notes

- Power BI push datasets append rows; re-submitting the same report duplicates its rows. Use `--replace` to clear and re-push, or de-duplicate in visuals by latest `source_file`.
- The dataset is created with `basicFIFO` retention (oldest rows drop after the cap), suitable for rolling operational dashboards. Remove `defaultRetentionPolicy=basicFIFO` in `powerbi.py` for `none` (keep everything, up to push-dataset limits).
- Limits: 10,000 rows/request (handled by chunking), 75 columns/table, ~1M rows/table under `none` retention.

## Tests

```bash
pytest
```

Tests cover ingestion and the extraction→Power BI row mapping; no network or credentials needed.

## Extending

- **Email intake**: wire a mailbox webhook (e.g. SendGrid inbound parse, Graph API) to POST attachments to `/reports`.
- **More formats**: add an extension handler in `ingestion.py` (e.g. `.docx` via `python-docx`).
- **Different schema**: edit `schemas.py` and the matching table columns in `powerbi.py` — `tests/test_pipeline.py::test_row_fields_match_powerbi_schema` keeps them in sync. Note: adding columns to an *existing* push dataset requires the Update Table API or deleting the dataset so it's recreated.
