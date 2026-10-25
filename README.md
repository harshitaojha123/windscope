# WindScope — Wind Forecast Intelligence Dashboard

WindScope is a full-stack dashboard prototype for the REint Full Stack SWE Challenge v4. It helps UK energy procurement teams compare wind generation forecasts with actual generation and evaluate forecast errors before day-ahead procurement decisions.

## Features

- React and Vite frontend with a responsive dashboard.
- Python and FastAPI backend.
- Live data integration with the Elexon BMRS API.
- Actual wind generation and forecast comparison.
- KPI cards for mean absolute error (MAE), root mean square error (RMSE), signed mean error, and matched intervals.
- Forecast-versus-actual charts and an interval-level data table.
- CSV export for analysis results.
- Demo mode for testing the interface without live API requests.
- Docker Compose configuration for running the application.

## Technology Stack

| Component | Technologies |
|---|---|
| Frontend | React, Vite, Recharts |
| Backend | Python, FastAPI, HTTPX |
| Data source | Elexon BMRS API |
| Deployment support | Docker, Docker Compose |

## Data Sources

WindScope uses the public Elexon BMRS API.

- **Actual generation:** FUELHH dataset, filtered to `fuelType=WIND`.
- **Wind generation forecasts:** Elexon wind forecast endpoint.

The backend uses the following endpoints:

- Actual generation: `https://data.elexon.co.uk/bmrs/api/v1/datasets/FUELHH`
- Wind forecast: `https://data.elexon.co.uk/bmrs/api/v1/forecast/generation/wind/earliest/stream`

The analysis period is configurable through the dashboard. The backend treats the selected end date as exclusive. Elexon's actual-generation query has a maximum seven-day date range per request.

## Forecast Evaluation Methodology

Forecast accuracy is evaluated by comparing forecast generation with actual wind generation over the selected period.

The dashboard reports:

- **MAE:** Average absolute forecast error.
- **RMSE:** Square root of the average squared forecast error.
- **Mean signed error:** Forecast minus actual generation.
- **MAPE:** Mean absolute percentage error, excluding intervals with zero actual generation.
- **Matched intervals:** Number of intervals with both forecast and actual values.

The current implementation uses the earliest published wind forecast returned by the API and applies an assumed decision cutoff of 12:00 UTC on the previous day. Hourly forecast values are applied to both half-hourly actual intervals.

**Important limitation:** The earliest published forecast is not necessarily the forecast available at the buyer's actual decision time. The cutoff and interval-alignment assumptions must be validated against the challenge requirements before interpreting the metrics as definitive day-ahead procurement accuracy. The dashboard is a prototype and is not intended for live trading.

## Prerequisites

For local development:

- Python 3.12 or compatible version.
- Node.js and npm.
- Internet access for live Elexon API requests.

For containerized execution:

- Docker Desktop with Docker Compose.

## Run Locally

### 1. Start the backend

From the project root:

```bash
cd backend
python -m venv .venv
```

Activate the virtual environment.

Windows PowerShell:

```powershell
.\.venv\Scripts\Activate.ps1
```

Windows Command Prompt:

```cmd
.venv\Scripts\activate.bat
```

macOS/Linux:

```bash
source .venv/bin/activate
```

Install dependencies and start FastAPI:

```bash
pip install -r requirements.txt
python -m uvicorn main:app --reload --port 8000
```

The API health endpoint is available at:

`http://localhost:8000/health`

Interactive API documentation:

`http://localhost:8000/docs`

### 2. Start the frontend

Open a second terminal from the project root:

```bash
cd frontend
npm install
npm run dev
```

Open the local URL printed by Vite, usually:

`http://localhost:5173`

If the default port is occupied, Vite may select another port. The backend CORS configuration allows localhost development ports in the 5170–5179 range.

### 3. Select the data source

Use the dashboard's data-source selector to choose Demo data or Elexon API mode. Select a date range and click **Apply filters** to refresh the results.

## Run with Docker

From the project root:

```bash
docker compose up --build
```

The Compose configuration exposes the frontend on port 5173 and the backend on port 8000.

- Frontend: `http://localhost:5173`
- Backend health: `http://localhost:8000/health`
- API documentation: `http://localhost:8000/docs`

To stop the services:

```bash
docker compose down
```

## Project Structure

```text
wind-forecast-dashboard-mvp/
├── backend/
│   ├── main.py
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/
│   ├── src/
│   ├── package.json
│   └── Dockerfile
├── docker-compose.yml
└── README.md
```

## Known Limitations

- Live data retrieval depends on Elexon API availability and response validation.
- Actual-generation requests are limited to seven settlement dates per request.
- Forecast publication cutoff and hourly-to-half-hourly alignment require validation against the exact evaluation methodology.
- Historical forecast selection can affect reported accuracy metrics.
- The application is an evaluation prototype and must not be used as a live procurement or trading system without further validation.

## AI Assistance

AI tools were used to assist with project scaffolding, implementation, debugging, and documentation. The application and its data-processing assumptions should be reviewed and tested before production use.
