"""AI agent that turns property-management reports into Power BI dashboards.

Property managers send a report (PDF, Excel, CSV, or plain text); Claude
extracts a normalized data model from it, and the pipeline pushes the data
into a Power BI push dataset that dashboards are built on.
"""

__version__ = "0.1.0"
