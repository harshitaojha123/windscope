from datetime import date, datetime, time, timedelta, timezone
from typing import Any
import math

import httpx
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="WindScope API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5174",
        "http://localhost:5175",
        "http://127.0.0.1:5175",
        "http://localhost:5176",
        "http://127.0.0.1:5176",
    ],
    allow_origin_regex=r"^http://(localhost|127\.0\.0\.1):517[0-9]$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

BASE = "https://data.elexon.co.uk/bmrs/api/v1"
UTC = timezone.utc


def parse_dt(value: Any):
    if not value:
        return None
    try:
        dt = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=UTC)
        return dt.astimezone(UTC)
    except (ValueError, TypeError):
        return None


def num(value: Any):
    try:
        return None if value is None or value == "" else float(value)
    except (ValueError, TypeError):
        return None


def records(payload: Any) -> list[dict]:
    if isinstance(payload, list):
        return [x for x in payload if isinstance(x, dict)]
    if isinstance(payload, dict) and isinstance(payload.get("data"), list):
        return [x for x in payload["data"] if isinstance(x, dict)]
    raise ValueError(
        f"Unexpected Elexon response shape: {type(payload).__name__}"
    )


def stamp(dt: datetime) -> str:
    return dt.astimezone(UTC).isoformat(timespec="seconds").replace(
        "+00:00", "Z"
    )


def add_error_fields(row: dict) -> dict:
    actual = row.get("actualMW")
    forecast = row.get("forecastMW")
    error = forecast - actual if actual is not None and forecast is not None else None
    row["errorMW"] = round(error, 2) if error is not None else None
    row["absoluteErrorMW"] = round(abs(error), 2) if error is not None else None
    return row


def metrics(rows: list[dict]) -> dict:
    valid = [
        r for r in rows
        if r.get("actualMW") is not None and r.get("forecastMW") is not None
    ]
    if not valid:
        return {
            "intervals": 0,
            "maeMW": None,
            "rmseMW": None,
            "meanErrorMW": None,
            "mapePercent": None,
        }

    errors = [r["forecastMW"] - r["actualMW"] for r in valid]
    pct = [
        abs(e) / abs(r["actualMW"]) * 100
        for e, r in zip(errors, valid)
        if r["actualMW"] != 0
    ]
    return {
        "intervals": len(valid),
        "maeMW": round(sum(abs(e) for e in errors) / len(errors), 2),
        "rmseMW": round(math.sqrt(sum(e * e for e in errors) / len(errors)), 2),
        "meanErrorMW": round(sum(errors) / len(errors), 2),
        "mapePercent": round(sum(pct) / len(pct), 2) if pct else None,
    }


def daily_summary(rows: list[dict]) -> list[dict]:
    groups = {}
    for r in rows:
        if r.get("actualMW") is None or r.get("forecastMW") is None:
            continue
        target = parse_dt(r.get("startTime"))
        if target is None:
            continue
        day = target.date().isoformat()
        error = r["forecastMW"] - r["actualMW"]
        groups.setdefault(day, {"errors": [], "absolute": []})
        groups[day]["errors"].append(error)
        groups[day]["absolute"].append(abs(error))

    return [
        {
            "date": day,
            "intervals": len(v["errors"]),
            "maeMW": round(sum(v["absolute"]) / len(v["absolute"]), 2),
            "meanErrorMW": round(sum(v["errors"]) / len(v["errors"]), 2),
        }
        for day, v in sorted(groups.items())
    ]


def demo_rows(start: date, end: date) -> list[dict]:
    rows = []
    cursor = datetime.combine(start, time.min, tzinfo=UTC)
    end_dt = datetime.combine(end, time.min, tzinfo=UTC)
    i = 0
    while cursor < end_dt:
        actual = 9000 + 2600 * math.sin(i / 5.8) + 900 * math.cos(i / 2.9)
        forecast = actual + 350 * math.sin(i / 3.2) + 180 * math.cos(i / 6)
        rows.append(add_error_fields({
            "startTime": cursor.isoformat(),
            "publishTime": (cursor - timedelta(hours=12)).isoformat(),
            "actualMW": round(max(0, actual), 1),
            "forecastMW": round(max(0, forecast), 1),
            "source": "DEMO",
        }))
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
    if start < date(2026, 1, 1) or end > date(2026, 2, 1):
        raise HTTPException(
            400,
            "This challenge is limited to January 2026. "
            "Use dates from 2026-01-01 through 2026-02-01 (exclusive end).",
        )

    if mode == "demo":
        rows = demo_rows(start, end)
        return {
            "mode": "demo",
            "notice": "DEMO DATA ONLY: synthetic values, not Elexon observations.",
            "period": {"start": str(start), "endExclusive": str(end)},
            "decisionCutoff": f"{cutoff_hour_utc:02d}:00 UTC previous day (assumption)",
            "metrics": metrics(rows),
            "dailyPerformance": daily_summary(rows),
            "rows": rows,
        }

    start_dt = datetime.combine(start, time.min, tzinfo=UTC)
    end_dt = datetime.combine(end, time.min, tzinfo=UTC)
    actual_to = end - timedelta(days=1)

    actuals: dict[datetime, float] = {}
    forecast_rows: list[dict] = []

    try:
        async with httpx.AsyncClient(timeout=60, follow_redirects=True) as client:
            actual_response = await client.get(
                f"{BASE}/datasets/FUELHH/stream",
                params={
                    "settlementDateFrom": str(start),
                    "settlementDateTo": str(actual_to),
                },
            )
            actual_response.raise_for_status()
            actual_rows = records(actual_response.json())

            for row in actual_rows:
                if str(row.get("fuelType", "")).upper() != "WIND":
                    continue
                target = parse_dt(row.get("startTime"))
                value = num(row.get("generation"))
                if target is not None and value is not None and start_dt <= target < end_dt:
                    actuals[target] = value

            # Historical forecast retrieval: one query per target date.
            current_day = start
            while current_day < end:
                cutoff = datetime.combine(
                    current_day - timedelta(days=1),
                    time(hour=cutoff_hour_utc),
                    tzinfo=UTC,
                )
                response = await client.get(
                    f"{BASE}/forecast/generation/wind/history",
                    params={"publishTime": stamp(cutoff)},
                )
                response.raise_for_status()
                forecast_rows.extend(records(response.json()))
                current_day += timedelta(days=1)

    except httpx.HTTPStatusError as exc:
        raise HTTPException(
            502,
            f"Elexon returned HTTP {exc.response.status_code}: "
            f"{exc.response.text[:300]}",
        ) from exc
    except (httpx.HTTPError, ValueError) as exc:
        raise HTTPException(502, f"Elexon request failed: {exc}") from exc

    # Select the latest available publication at or before the cutoff
    # for each target hour. The API may return the preceding publication
    # (for example, 11:30 when the requested cutoff is 12:00).
    forecasts_by_hour: dict[datetime, dict] = {}

    for row in forecast_rows:
        target = parse_dt(row.get("startTime"))
        published = parse_dt(row.get("publishTime"))
        value = num(row.get("generation"))

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
            forecasts_by_hour[hour_target] = {
                "published": published,
                "value": value,
            }

    rows = []
    for target in sorted(actuals):
        hour_target = target.replace(minute=0, second=0, microsecond=0)
        forecast = forecasts_by_hour.get(hour_target)
        rows.append(add_error_fields({
            "startTime": target.isoformat(),
            "publishTime": forecast["published"].isoformat() if forecast else None,
            "actualMW": round(actuals[target], 2),
            "forecastMW": round(forecast["value"], 2) if forecast else None,
            "source": "ELEXON",
        }))

    matched = [
        r for r in rows
        if r["actualMW"] is not None and r["forecastMW"] is not None
    ]

    return {
        "mode": "elexon",
        "notice": (
            "Elexon FUELHH actuals and historical WINDFOR forecasts. "
            f"Decision cutoff: {cutoff_hour_utc:02d}:00 UTC on the previous day "
            "(assumption). Hourly forecast values are applied to both "
            "half-hourly actual intervals. Review coverage before interpreting metrics."
        ),
        "period": {"start": str(start), "endExclusive": str(end)},
        "decisionCutoff": f"{cutoff_hour_utc:02d}:00 UTC previous day (assumption)",
        "metrics": metrics(matched),
        "dailyPerformance": daily_summary(matched),
        "rows": rows,
        "recordCounts": {
            "actualRecords": len(actuals),
            "forecastRecords": len(forecast_rows),
            "selectedForecastHours": len(forecasts_by_hour),
            "matchedIntervals": len(matched),
        },
    }