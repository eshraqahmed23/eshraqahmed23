"""Command-line entry point.

Examples:
    # Extract only (no Power BI credentials needed), print the result
    python -m property_report_agent.cli samples/monthly_report_maple_court.txt --dry-run

    # Extract and push to Power BI
    python -m property_report_agent.cli reports/june.pdf

    # Wipe the dataset tables before pushing (e.g. after re-processing a batch)
    python -m property_report_agent.cli reports/*.pdf --replace
"""

from __future__ import annotations

import argparse
import json
import logging
import sys

from .config import pipeline_from_env


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="property-report-agent",
        description="Extract property reports with Claude and push them to Power BI.",
    )
    parser.add_argument("reports", nargs="+", help="Report file(s): pdf, xlsx, xls, csv, txt, md")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Extract and print JSON without pushing to Power BI",
    )
    parser.add_argument(
        "--replace",
        action="store_true",
        help="Clear all dataset tables before pushing (push datasets only support full clears)",
    )
    args = parser.parse_args(argv)

    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    pipeline = pipeline_from_env()

    if args.replace and not args.dry_run:
        if pipeline.powerbi is None:
            print("--replace requires Power BI configuration", file=sys.stderr)
            return 2
        pipeline.powerbi.clear_all_tables()

    exit_code = 0
    for path in args.reports:
        try:
            with open(path, "rb") as f:
                result = pipeline.process(f.read(), filename=path, push=not args.dry_run)
        except Exception as exc:  # keep going on multi-file batches
            print(f"FAILED {path}: {exc}", file=sys.stderr)
            exit_code = 1
            continue
        print(json.dumps(result, indent=2, default=str))
    return exit_code


if __name__ == "__main__":
    raise SystemExit(main())
