from datetime import date as date_type
import httpx
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession
from app.models import Fund, NavHistory


MFAPI_BASE = "https://api.mfapi.in/mf"


async def fetch_and_store_nav(fund_id: int, amfi_code: str, db: AsyncSession) -> bool:
    url = f"{MFAPI_BASE}/{amfi_code}"
    async with httpx.AsyncClient(timeout=15.0) as client:
        response = await client.get(url)
        response.raise_for_status()
        data = response.json()

    nav_entries = data.get("data", [])
    if not nav_entries:
        return False

    inserted = 0
    for entry in nav_entries:
        try:
            nav_date = date_type.fromisoformat(
                entry["date"] if "-" in entry["date"]
                else _parse_dd_mm_yyyy(entry["date"])
            )
            nav_val = float(entry["nav"])
        except (KeyError, ValueError):
            continue

        stmt = text(
            """
            INSERT INTO nav_history (fund_id, date, nav_value)
            VALUES (:fund_id, :date, :nav_value)
            ON CONFLICT (fund_id, date) DO UPDATE SET nav_value = EXCLUDED.nav_value
            """
        )
        await db.execute(stmt, {"fund_id": fund_id, "date": nav_date, "nav_value": nav_val})
        inserted += 1

    await db.flush()
    return inserted > 0


def _parse_dd_mm_yyyy(s: str) -> str:
    parts = s.split("-")
    if len(parts) == 3 and len(parts[0]) == 2:
        return f"{parts[2]}-{parts[1]}-{parts[0]}"
    return s


async def sync_all_funds(db: AsyncSession) -> dict:
    result = await db.execute(select(Fund).where(Fund.is_active == True))
    funds = result.scalars().all()

    success, failed = 0, 0
    for fund in funds:
        try:
            await fetch_and_store_nav(fund.id, fund.amfi_code, db)
            success += 1
        except Exception:
            failed += 1

    return {"synced": success, "failed": failed, "total": len(funds)}
