import base64

import pytest

from property_report_agent.ingestion import (
    UnsupportedReportError,
    load_report,
    load_report_file,
)


def test_load_text_report():
    content = load_report(b"Monthly report for Elm Street", "june.txt")
    assert content.kind == "text"
    assert content.text == "Monthly report for Elm Street"


def test_load_csv_report():
    content = load_report(b"unit,rent\n101,1200\n", "rentroll.csv")
    assert content.kind == "text"
    assert "101,1200" in content.text


def test_load_pdf_report():
    fake_pdf = b"%PDF-1.4 fake"
    content = load_report(fake_pdf, "report.PDF")
    assert content.kind == "pdf"
    assert base64.standard_b64decode(content.pdf_base64) == fake_pdf


def test_load_excel_report(tmp_path):
    import pandas as pd

    path = tmp_path / "rentroll.xlsx"
    pd.DataFrame({"unit": ["101", "102"], "rent": [1200, 1250]}).to_excel(path, index=False)
    content = load_report_file(path)
    assert content.kind == "text"
    assert "Sheet:" in content.text
    assert "101" in content.text


def test_unsupported_extension():
    with pytest.raises(UnsupportedReportError):
        load_report(b"...", "report.docx")


def test_oversized_text_rejected():
    with pytest.raises(UnsupportedReportError):
        load_report(b"x" * 500_000, "huge.txt")
