import asyncio
from datetime import date as date_type
import httpx
from sqlalchemy import select, text, func
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import AsyncSessionLocal
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
            nav_date = date_type.fromisoformat(_parse_dd_mm_yyyy(entry["date"]))
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


async def _fetch_fund_isolated(fund_id: int, amfi_code: str, semaphore: asyncio.Semaphore) -> bool:
    async with semaphore:
        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(func.max(NavHistory.date)).where(NavHistory.fund_id == fund_id)
            )
            max_stored_date = result.scalar()

        url = f"{MFAPI_BASE}/{amfi_code}"
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.get(url)
            response.raise_for_status()
            data = response.json()

        nav_entries = data.get("data", [])
        if not nav_entries:
            return False

        new_entries = []
        for entry in nav_entries:
            try:
                nav_date = date_type.fromisoformat(_parse_dd_mm_yyyy(entry["date"]))
                nav_val = float(entry["nav"])
            except (KeyError, ValueError):
                continue
            if max_stored_date is None or nav_date > max_stored_date:
                new_entries.append((nav_date, nav_val))

        if not new_entries:
            return True  # already up-to-date

        async with AsyncSessionLocal() as db:
            for nav_date, nav_val in new_entries:
                stmt = text(
                    """
                    INSERT INTO nav_history (fund_id, date, nav_value)
                    VALUES (:fund_id, :date, :nav_value)
                    ON CONFLICT (fund_id, date) DO UPDATE SET nav_value = EXCLUDED.nav_value
                    """
                )
                await db.execute(stmt, {"fund_id": fund_id, "date": nav_date, "nav_value": nav_val})
            await db.commit()

        return True


async def sync_all_funds() -> dict:
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(Fund).where(Fund.is_active == True))
        funds = result.scalars().all()
        fund_list = [(f.id, f.amfi_code) for f in funds]

    semaphore = asyncio.Semaphore(5)

    async def _sync_one(fund_id: int, amfi_code: str) -> bool:
        try:
            return await _fetch_fund_isolated(fund_id, amfi_code, semaphore)
        except Exception as e:
            print(f"[sync] Fund {amfi_code} failed: {e}")
            return False

    results = await asyncio.gather(*[_sync_one(fid, code) for fid, code in fund_list])
    success = sum(1 for r in results if r)
    failed = sum(1 for r in results if not r)
    return {"synced": success, "failed": failed, "total": len(fund_list)}
