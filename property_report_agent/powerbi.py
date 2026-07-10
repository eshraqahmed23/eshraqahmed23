"""Power BI REST API client.

Authenticates as an Azure AD service principal (client-credentials flow) and
manages a *push dataset* in a Power BI workspace: the dataset's tables receive
rows from each processed report, and users build reports/dashboards on top of
it in the Power BI service. Pushed rows appear on connected visuals without a
scheduled refresh.

Requires (see README for the Azure/Power BI setup):
  AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET, POWERBI_WORKSPACE_ID
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List

import requests

logger = logging.getLogger(__name__)

API_BASE = "https://api.powerbi.com/v1.0/myorg"
SCOPE = ["https://analysis.windows.net/powerbi/api/.default"]

DEFAULT_DATASET_NAME = "Property Reports"

# Push-dataset schema. Column names double as the field names produced by
# pipeline.extraction_to_rows(), so keep the two in sync.
DATASET_TABLES: List[Dict[str, Any]] = [
    {
        "name": "Properties",
        "columns": [
            {"name": "property_name", "dataType": "string"},
            {"name": "report_period", "dataType": "string"},
            {"name": "period_date", "dataType": "DateTime"},
            {"name": "address", "dataType": "string"},
            {"name": "city", "dataType": "string"},
            {"name": "state", "dataType": "string"},
            {"name": "total_units", "dataType": "Int64"},
            {"name": "occupied_units", "dataType": "Int64"},
            {"name": "occupancy_rate", "dataType": "Double"},
            {"name": "total_income", "dataType": "Double"},
            {"name": "total_expenses", "dataType": "Double"},
            {"name": "net_operating_income", "dataType": "Double"},
            {"name": "source_file", "dataType": "string"},
        ],
    },
    {
        "name": "Units",
        "columns": [
            {"name": "property_name", "dataType": "string"},
            {"name": "report_period", "dataType": "string"},
            {"name": "unit_number", "dataType": "string"},
            {"name": "bedrooms", "dataType": "Int64"},
            {"name": "bathrooms", "dataType": "Double"},
            {"name": "square_feet", "dataType": "Int64"},
            {"name": "status", "dataType": "string"},
            {"name": "tenant_name", "dataType": "string"},
            {"name": "market_rent", "dataType": "Double"},
            {"name": "actual_rent", "dataType": "Double"},
            {"name": "balance_due", "dataType": "Double"},
            {"name": "lease_start", "dataType": "string"},
            {"name": "lease_end", "dataType": "string"},
        ],
    },
    {
        "name": "Financials",
        "columns": [
            {"name": "property_name", "dataType": "string"},
            {"name": "report_period", "dataType": "string"},
            {"name": "category", "dataType": "string"},
            {"name": "subcategory", "dataType": "string"},
            {"name": "name", "dataType": "string"},
            {"name": "amount", "dataType": "Double"},
            {"name": "budget_amount", "dataType": "Double"},
        ],
    },
    {
        "name": "Maintenance",
        "columns": [
            {"name": "property_name", "dataType": "string"},
            {"name": "report_period", "dataType": "string"},
            {"name": "unit_number", "dataType": "string"},
            {"name": "description", "dataType": "string"},
            {"name": "status", "dataType": "string"},
            {"name": "priority", "dataType": "string"},
            {"name": "cost", "dataType": "Double"},
            {"name": "reported_date", "dataType": "string"},
        ],
    },
    {
        "name": "Highlights",
        "columns": [
            {"name": "property_name", "dataType": "string"},
            {"name": "report_period", "dataType": "string"},
            {"name": "highlight", "dataType": "string"},
        ],
    },
]

# Power BI caps push requests at 10,000 rows per call.
MAX_ROWS_PER_REQUEST = 10_000


class PowerBIError(RuntimeError):
    pass


class PowerBIClient:
    def __init__(
        self,
        tenant_id: str,
        client_id: str,
        client_secret: str,
        workspace_id: str,
        dataset_name: str = DEFAULT_DATASET_NAME,
    ):
        self.tenant_id = tenant_id
        self.client_id = client_id
        self.client_secret = client_secret
        self.workspace_id = workspace_id
        self.dataset_name = dataset_name
        self._dataset_id: str | None = None

    # -- auth ---------------------------------------------------------------

    def _access_token(self) -> str:
        import msal

        app = msal.ConfidentialClientApplication(
            self.client_id,
            authority=f"https://login.microsoftonline.com/{self.tenant_id}",
            client_credential=self.client_secret,
        )
        # acquire_for_client keeps a token cache internally, but the app object
        # is rebuilt per call; token churn is negligible for this workload.
        result = app.acquire_token_for_client(scopes=SCOPE)
        if "access_token" not in result:
            raise PowerBIError(
                f"Azure AD auth failed: {result.get('error')}: {result.get('error_description')}"
            )
        return result["access_token"]

    def _request(self, method: str, path: str, **kwargs) -> requests.Response:
        headers = {"Authorization": f"Bearer {self._access_token()}"}
        resp = requests.request(method, f"{API_BASE}{path}", headers=headers, timeout=60, **kwargs)
        if resp.status_code >= 400:
            raise PowerBIError(f"Power BI API {method} {path} -> {resp.status_code}: {resp.text}")
        return resp

    # -- dataset lifecycle ----------------------------------------------------

    def ensure_dataset(self) -> str:
        """Return the push dataset's id, creating the dataset if needed."""
        if self._dataset_id:
            return self._dataset_id

        resp = self._request("GET", f"/groups/{self.workspace_id}/datasets")
        for ds in resp.json().get("value", []):
            if ds.get("name") == self.dataset_name:
                self._dataset_id = ds["id"]
                return self._dataset_id

        logger.info("Creating push dataset '%s'", self.dataset_name)
        resp = self._request(
            "POST",
            f"/groups/{self.workspace_id}/datasets?defaultRetentionPolicy=basicFIFO",
            json={
                "name": self.dataset_name,
                "defaultMode": "Push",
                "tables": DATASET_TABLES,
            },
        )
        self._dataset_id = resp.json()["id"]
        return self._dataset_id

    def push_rows(self, table_rows: Dict[str, List[dict]]) -> None:
        """Append rows to each table. Keys must match DATASET_TABLES names."""
        dataset_id = self.ensure_dataset()
        for table, rows in table_rows.items():
            for start in range(0, len(rows), MAX_ROWS_PER_REQUEST):
                chunk = rows[start : start + MAX_ROWS_PER_REQUEST]
                self._request(
                    "POST",
                    f"/groups/{self.workspace_id}/datasets/{dataset_id}/tables/{table}/rows",
                    json={"rows": chunk},
                )
            logger.info("Pushed %d rows to %s", len(rows), table)

    def clear_table(self, table: str) -> None:
        """Delete all rows from one table (push datasets support full clears only)."""
        dataset_id = self.ensure_dataset()
        self._request(
            "DELETE",
            f"/groups/{self.workspace_id}/datasets/{dataset_id}/tables/{table}/rows",
        )

    def clear_all_tables(self) -> None:
        for table in (t["name"] for t in DATASET_TABLES):
            self.clear_table(table)
