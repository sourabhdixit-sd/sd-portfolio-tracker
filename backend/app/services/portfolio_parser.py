"""
Parse Axis Securities PDF/Excel holding statements.
Returns grouped mutual fund data ready for import preview.
"""

import re
from io import BytesIO
from typing import Any


ISIN_PATTERN = re.compile(r"(INF\w{9}|INE\w{9})")
DATE_PATTERN = re.compile(r"Date\s+(\d{2}-\w{3}-\d{4})")

MONTH_MAP = {
    "Jan": "01", "Feb": "02", "Mar": "03", "Apr": "04",
    "May": "05", "Jun": "06", "Jul": "07", "Aug": "08",
    "Sep": "09", "Oct": "10", "Nov": "11", "Dec": "12",
}


def _parse_report_date(text: str) -> str | None:
    """Extract and convert report date like '08-Mar-2026' → '2026-03-08'."""
    match = DATE_PATTERN.search(text)
    if not match:
        return None
    raw = match.group(1)  # e.g. "08-Mar-2026"
    parts = raw.split("-")
    if len(parts) != 3:
        return None
    day, mon, year = parts
    month_num = MONTH_MAP.get(mon)
    if not month_num:
        return None
    return f"{year}-{month_num}-{day}"


def _parse_holding_lines(full_text: str) -> dict:
    """
    Parse all holding rows from extracted PDF/Excel text.
    Returns grouped dict: { isin: { fund_name, isin, transactions: [...] } }
    """
    funds: dict[str, Any] = {}

    for line in full_text.splitlines():
        line = line.strip()
        if not line:
            continue

        # Try to find ISIN in the line — it anchors our parse
        isin_match = ISIN_PATTERN.search(line)
        if not isin_match:
            continue

        isin = isin_match.group(1)
        isin_start = isin_match.start()
        isin_end = isin_match.end()

        fund_name = line[:isin_start].strip()
        remainder = line[isin_end:].strip()

        # remainder should be: {open_qty} {market_price} {market_value} {investment_amount} {avg_cost} {unrealized_pnl} {AssetType}
        tokens = remainder.split()
        if len(tokens) < 7:
            continue

        asset_type = tokens[-1]
        if asset_type != "MutualFund":
            continue

        numeric_tokens = tokens[:7]
        try:
            open_qty = float(numeric_tokens[0].replace(",", ""))
            market_price = float(numeric_tokens[1].replace(",", ""))
            market_value = float(numeric_tokens[2].replace(",", ""))
            investment_amount = float(numeric_tokens[3].replace(",", ""))
            avg_cost = float(numeric_tokens[4].replace(",", ""))
            # unrealized_pnl = tokens[5] — not used
        except ValueError:
            continue

        if not fund_name:
            continue

        transaction = {
            "units": open_qty,
            "avg_cost": avg_cost,
            "investment_amount": investment_amount,
            "market_price": market_price,
        }

        if isin not in funds:
            funds[isin] = {
                "fund_name": fund_name,
                "isin": isin,
                "transactions": [],
            }
        funds[isin]["transactions"].append(transaction)

    return funds


def parse_pdf(file_bytes: bytes) -> dict:
    """
    Parse an Axis Securities PDF holding statement.
    Returns: { "report_date": "2026-03-08", "funds": { isin: {...} } }
    """
    try:
        import pdfplumber
    except ImportError as e:
        raise RuntimeError("pdfplumber is not installed") from e

    full_text_parts = []
    with pdfplumber.open(BytesIO(file_bytes)) as pdf:
        for page in pdf.pages:
            text = page.extract_text()
            if text:
                full_text_parts.append(text)

    full_text = "\n".join(full_text_parts)
    report_date = _parse_report_date(full_text)
    funds = _parse_holding_lines(full_text)

    return {"report_date": report_date, "funds": funds}


def parse_excel(file_bytes: bytes) -> dict:
    """
    Parse an Axis Securities Excel holding statement.
    Returns: { "report_date": None, "funds": { isin: {...} } }
    """
    try:
        import openpyxl
    except ImportError as e:
        raise RuntimeError("openpyxl is not installed") from e

    wb = openpyxl.load_workbook(BytesIO(file_bytes), data_only=True)
    ws = wb.active

    rows = list(ws.iter_rows(values_only=True))

    # Find header row
    header_row_idx = None
    col_map: dict[str, int] = {}
    for i, row in enumerate(rows):
        cells = [str(c).strip() if c is not None else "" for c in row]
        if "ISIN" in cells or "Stock Name" in cells:
            header_row_idx = i
            for j, cell in enumerate(cells):
                col_map[cell] = j
            break

    if header_row_idx is None:
        return {"report_date": None, "funds": {}}

    # Try to find report date in rows above the header
    report_date = None
    header_text = "\n".join(
        " ".join(str(c) if c is not None else "" for c in row)
        for row in rows[:header_row_idx]
    )
    report_date = _parse_report_date(header_text)

    # Column indices
    def col(name: str) -> int | None:
        return col_map.get(name)

    name_col = col("Stock Name") or col("Fund Name") or col("Scheme Name")
    isin_col = col("ISIN")
    qty_col = col("Open Qty") or col("Quantity")
    price_col = col("Market Price")
    mval_col = col("Market Value")
    inv_col = col("Investment Amount")
    avgcost_col = col("Avg Cost") or col("Avg. Cost")
    asset_col = col("Asset Type")

    if isin_col is None:
        return {"report_date": report_date, "funds": {}}

    funds: dict[str, Any] = {}

    for row in rows[header_row_idx + 1:]:
        if all(c is None for c in row):
            continue

        def get(idx):
            if idx is None or idx >= len(row):
                return None
            return row[idx]

        asset_type = str(get(asset_col) or "").strip()
        if asset_type != "MutualFund":
            continue

        isin = str(get(isin_col) or "").strip()
        if not ISIN_PATTERN.match(isin):
            continue

        fund_name = str(get(name_col) or "").strip()

        try:
            open_qty = float(str(get(qty_col) or "0").replace(",", ""))
            market_price = float(str(get(price_col) or "0").replace(",", ""))
            investment_amount = float(str(get(inv_col) or "0").replace(",", ""))
            avg_cost = float(str(get(avgcost_col) or "0").replace(",", ""))
        except (ValueError, TypeError):
            continue

        transaction = {
            "units": open_qty,
            "avg_cost": avg_cost,
            "investment_amount": investment_amount,
            "market_price": market_price,
        }

        if isin not in funds:
            funds[isin] = {
                "fund_name": fund_name,
                "isin": isin,
                "transactions": [],
            }
        funds[isin]["transactions"].append(transaction)

    return {"report_date": report_date, "funds": funds}
