"""
Look up AMFI scheme codes from mfapi.in by fund name.
"""

import re
import httpx


MFAPI_SEARCH_URL = "https://api.mfapi.in/mf/search"


def clean_fund_name(name: str) -> str:
    """Remove common suffixes to improve search match quality."""
    # Remove suffixes like (G), (Growth), - Regular, - Direct, Fund, etc.
    name = re.sub(r"\s*\(G\)\s*$", "", name, flags=re.IGNORECASE)
    name = re.sub(r"\s*\(Growth\)\s*$", "", name, flags=re.IGNORECASE)
    name = re.sub(r"\s*-\s*Regular\s*$", "", name, flags=re.IGNORECASE)
    name = re.sub(r"\s*-\s*Direct\s*$", "", name, flags=re.IGNORECASE)
    name = re.sub(r"\s+Fund\s*$", "", name, flags=re.IGNORECASE)
    return name.strip()


def lookup_amfi_by_name(fund_name: str) -> dict | None:
    """
    Search mfapi.in for a fund by name and return the first result.
    Returns { "amfi_code": str, "matched_name": str } or None.
    """
    cleaned = clean_fund_name(fund_name)
    try:
        response = httpx.get(
            MFAPI_SEARCH_URL,
            params={"q": cleaned},
            timeout=10.0,
        )
        response.raise_for_status()
        results = response.json()
        if not results:
            return None
        first = results[0]
        return {
            "amfi_code": str(first["schemeCode"]),
            "matched_name": first["schemeName"],
        }
    except Exception:
        return None


def lookup_all_funds(fund_groups: dict) -> list:
    """
    Takes the grouped fund dict from the parser and looks up AMFI codes.

    Args:
        fund_groups: { isin: { fund_name, isin, transactions: [...] } }

    Returns:
        list of dicts with keys:
            fund_name, isin, amfi_code, matched_name, needs_manual_amfi,
            transactions, total_units, total_invested
    """
    results = []

    for isin, group in fund_groups.items():
        fund_name = group["fund_name"]
        transactions = group["transactions"]

        total_units = sum(t["units"] for t in transactions)
        total_invested = sum(t["investment_amount"] for t in transactions)

        lookup = lookup_amfi_by_name(fund_name)
        amfi_code = lookup["amfi_code"] if lookup else None
        matched_name = lookup["matched_name"] if lookup else None

        results.append({
            "fund_name": fund_name,
            "isin": isin,
            "amfi_code": amfi_code,
            "matched_name": matched_name,
            "needs_manual_amfi": amfi_code is None,
            "transactions": transactions,
            "total_units": total_units,
            "total_invested": total_invested,
        })

    return results
