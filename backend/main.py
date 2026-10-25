from datetime import date, datetime, time, timedelta, timezone
from typing import Any
import math
import httpx
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="WindScope API", version="1.0.0")

# Allow common Vite development ports on localhost.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5174",
        "http://localhost:5175",
        "http://127.0.0.1:5175",
    ],
    allow_origin_regex=r"^http://(localhost|127\.0\.0\.1):517[0-9]$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

BASE = "https://data.elexon.co.uk/bmrs/api/v1"
UTC = timezone.utc


def parse_dt(value: Any) -> datetime | None:
    if not value:
        return None
    try:
        dt = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=UTC)
        return dt.astimezone(UTC)
    except (ValueError, TypeError):
        return None


def num(value: Any) -> float | None:
    try:
        return None if value is None or value == "" else float(value)
    except (ValueError, TypeError):
        return None


def records(payload: Any) -> list[dict]:
    if isinstance(payload, list):
        return [row for row in payload if isinstance(row, dict)]
    if isinstance(payload, dict):
        data = payload.get("data")
        if isinstance(data, list):
            return [row for row in data if isinstance(row, dict)]
    raise ValueError(f"Unexpected Elexon response shape: {type(payload).__name__}")


def stamp(dt: datetime) -> str:
    return dt.astimezone(UTC).isoformat(timespec="seconds").replace("+00:00", "Z")


def metrics(rows: list[dict]) -> dict:
    valid = [
        row for row in rows
        if row.get("actualMW") is not None and row.get("forecastMW") is not None
    ]
    if not valid:
        return {
            "intervals": 0, "maeMW": None, "rmseMW": None,
            "meanErrorMW": None, "mapePercent": None,
        }
    errors = [row["forecastMW"] - row["actualMW"] for row in valid]
    percentage_errors = [
        abs(error) / abs(row["actualMW"]) * 100
        for error, row in zip(errors, valid)
        if row["actualMW"] != 0
    ]
    return {
        "intervals": len(valid),
        "maeMW": round(sum(abs(error) for error in errors) / len(errors), 2),
        "rmseMW": round(math.sqrt(sum(error * error for error in errors) / len(errors)), 2),
        "meanErrorMW": round(sum(errors) / len(errors), 2),
        "mapePercent": round(sum(percentage_errors) / len(percentage_errors), 2)
        if percentage_errors else None,
    }


def demo_rows(start: date, end: date, cutoff_hour_utc: int) -> list[dict]:
    rows = []
    cursor = datetime.combine(start, time.min, tzinfo=UTC)
    end_dt = datetime.combine(end, time.min, tzinfo=UTC)
    i = 0
    while cursor < end_dt:
        actual = 9000 + 2600 * math.sin(i / 5.8) + 900 * math.cos(i / 2.9)
        forecast = actual + 350 * math.sin(i / 3.2) + 180 * math.cos(i / 6)
        rows.append({
            "startTime": cursor.isoformat(),
            "publishTime": (cursor - timedelta(hours=12)).isoformat(),
            "actualMW": round(max(0, actual), 1),
            "forecastMW": round(max(0, forecast), 1),
            "source": "DEMO",
        })
        cursor += timedelta(minutes=30)
        i += 1
    return rows


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/api/dashboard")
async def dashboard(
    start: date = Query(default=date(2026, 1, 1)),
    end: date = Query(default=date(2026, 1, 2)),
    mode: str = Query(default="demo", pattern="^(demo|elexon)$"),
    cutoff_hour_utc: int = Query(default=12, ge=0, le=23),
):
    if end <= start:
        raise HTTPException(400, "'end' must be after 'start'; end is exclusive.")

    if mode == "demo":
        rows = demo_rows(start, end, cutoff_hour_utc)
        return {
            "mode": "demo",
            "notice": "DEMO DATA ONLY: synthetic values, not Elexon observations.",
            "period": {"start": str(start), "endExclusive": str(end)},
            "decisionCutoff": f"{cutoff_hour_utc:02d}:00 UTC previous day (assumption)",
            "metrics": metrics(rows),
            "rows": rows,
        }

    start_dt = datetime.combine(start, time.min, tzinfo=UTC)
    end_dt = datetime.combine(end, time.min, tzinfo=UTC)
    actual_to = end - timedelta(days=1)  # FUELHH settlementDateTo is inclusive.

    try:
        async with httpx.AsyncClient(timeout=60, follow_redirects=True) as client:
            actual_response = await client.get(
                f"{BASE}/datasets/FUELHH",
                params={"settlementDateFrom": str(start), "settlementDateTo": str(actual_to)},
            )
            actual_response.raise_for_status()

            # Earliest forecast endpoint returns the earliest published forecast for each target hour.
            forecast_response = await client.get(
                f"{BASE}/forecast/generation/wind/earliest/stream",
                params={"from": stamp(start_dt), "to": stamp(end_dt)},
            )
            forecast_response.raise_for_status()

            actual_payload = actual_response.json()
            forecast_payload = forecast_response.json()
    except httpx.HTTPStatusError as exc:
        raise HTTPException(
            502, f"Elexon returned HTTP {exc.response.status_code}: {exc.response.text[:300]}"
        ) from exc
    except (httpx.HTTPError, ValueError) as exc:
        raise HTTPException(502, f"Elexon request/response parsing failed: {exc}") from exc

    try:
        actual_rows = records(actual_payload)
        forecast_rows = records(forecast_payload)
    except ValueError as exc:
        raise HTTPException(502, str(exc)) from exc

    actuals: dict[datetime, float] = {}
    for row in actual_rows:
        if str(row.get("fuelType", "")).upper() != "WIND":
            continue
        target = parse_dt(row.get("startTime"))
        value = num(row.get("generation", row.get("quantity")))
        if target is not None and value is not None and start_dt <= target < end_dt:
            actuals[target] = value

    # Select one eligible forecast per target hour, respecting the assumed cutoff.
    forecasts_by_hour: dict[datetime, dict] = {}
    for row in forecast_rows:
        target = parse_dt(row.get("startTime"))
        published = parse_dt(row.get("publishTime"))
        value = num(row.get("generation", row.get("quantity")))
        if target is None or published is None or value is None:
            continue
        if not start_dt <= target < end_dt:
            continue
        cutoff = datetime.combine(
            target.date() - timedelta(days=1),
            time(hour=cutoff_hour_utc),
            tzinfo=UTC,
        )
        if published > cutoff:
            continue
        hour_target = target.replace(minute=0, second=0, microsecond=0)
        existing = forecasts_by_hour.get(hour_target)
        if existing is None or published > existing["published"]:
            forecasts_by_hour[hour_target] = {"published": published, "value": value}

    # Apply each hourly forecast to the two half-hourly actual intervals in that hour.
    rows = []
    for target in sorted(actuals):
        hour_target = target.replace(minute=0, second=0, microsecond=0)
        forecast = forecasts_by_hour.get(hour_target)
        actual = actuals[target]
        rows.append({
            "startTime": target.isoformat(),
            "publishTime": forecast["published"].isoformat() if forecast else None,
            "actualMW": round(actual, 2),
            "forecastMW": round(forecast["value"], 2) if forecast else None,
            "source": "ELEXON",
        })

    matched = [
        row for row in rows
        if row["actualMW"] is not None and row["forecastMW"] is not None
    ]
    return {
        "mode": "elexon",
        "notice": (
            "Live Elexon API. Forecast source is earliest published wind forecast; "
            f"cutoff assumes {cutoff_hour_utc:02d}:00 UTC on the previous day. "
            "Hourly forecasts are applied to both half-hourly actual intervals. "
            "Confirm cutoff and interval conventions against the assignment requirements."
        ),
        "period": {"start": str(start), "endExclusive": str(end)},
        "decisionCutoff": f"{cutoff_hour_utc:02d}:00 UTC previous day (assumption)",
        "metrics": metrics(matched),
        "rows": rows,
        "recordCounts": {
            "actualRecords": len(actuals),
            "forecastRecords": len(forecast_rows),
            "selectedForecastHours": len(forecasts_by_hour),
            "matchedIntervals": len(matched),
        },
    }
