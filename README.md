# WindScope

WindScope evaluates UK national wind generation forecasts against actual generation for January 2026 using Elexon BMRS data.
Frontend: https://windscope-bvty.vercel.app
Backend: https://windscope-1.onrender.com

## Stack
- React + Vite frontend
- Python + FastAPI backend
- Elexon BMRS API (`FUELHH` actual generation and `WINDFOR` forecasts)
- Dockerfiles and Docker Compose for containerized local execution

## Project structure
- `frontend/src/App.jsx` — dashboard, date filters, charts, metrics and CSV export
- `frontend/src/styles.css` — responsive dashboard styling
- `frontend/src/main.jsx` — React entry point
- `frontend/package.json` — frontend dependencies and scripts
- `frontend/Dockerfile` — multi-stage production frontend image
- `frontend/nginx.conf` — static asset serving and SPA fallback
- `backend/main.py` — FastAPI endpoints, Elexon retrieval, joining and evaluation metrics
- `backend/requirements.txt` — Python dependencies
- `backend/Dockerfile` — backend container
- `backend/Procfile` — Heroku process declaration
- `docker-compose.yml` — local multi-container run

## Run locally without Docker

### Backend
```bash
cd backend
python -m venv .venv
# Windows: .venv\\Scripts\\activate
# macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

### Frontend (second terminal)
```bash
cd frontend
npm install
npm run dev
```
Open the URL printed by Vite, usually `http://localhost:5173`.

The frontend uses `VITE_API_BASE_URL`; it defaults to `http://localhost:8000`.

## Run with Docker
From the repository root:
```bash
docker compose up --build
```
Open `http://localhost:5173`. The backend health check is `http://localhost:8000/health`.

## API
- `GET /health`
- `GET /api/dashboard?start=2026-01-01&end=2026-01-02&mode=elexon`
- `GET /api/dashboard?start=2026-01-01&end=2026-01-02&mode=demo`

`end` is exclusive. The app restricts the analysis period to January 2026. Demo mode is synthetic and must not be presented as Elexon observations.

## Forecast decision-time assumption
The challenge brief does not specify an exact purchasing decision timestamp. The implementation uses 12:00 UTC on the previous day by default and selects the latest available `publishTime` at or before that cutoff for each target hour. This is explicitly an assumption, not a requirement supplied by the brief. The raw WINDFOR response must contain publication vintages for this selection to be valid; if Elexon returns only one current/latest record per target, historical cutoff evaluation cannot be established from that response alone.

## Deployment
### Frontend on Vercel
1. Import the public GitHub repository.
2. Set **Root Directory** to `frontend`.
3. Framework preset: Vite.
4. Add environment variable `VITE_API_BASE_URL` set to the deployed backend base URL (no trailing slash).
5. Deploy.

### Backend on Heroku
1. Create a Heroku app and deploy the `backend` directory as the app root (or deploy from the repository with the backend build context configured).
2. Use the included `backend/Dockerfile` for container deployment, or the `backend/Procfile` for a Python buildpack.
3. Set config var `FRONTEND_ORIGIN` to the exact deployed Vercel origin, e.g. `https://your-app.vercel.app`.
4. Verify `/health`, then verify `/api/dashboard?start=2026-01-01&end=2026-01-02&mode=elexon`.
5. Update the Vercel `VITE_API_BASE_URL` if the backend URL changes, then redeploy the frontend.

## AI assistance
AI tools were used to assist with code review, debugging, and documentation. All application logic and deployment settings should be reviewed and tested before submission.

## Submission checklist
- [ ] Public GitHub repository URL
- [ ] Deployed frontend URL
- [ ] Deployed backend `/health` URL
- [ ] Unlisted YouTube video (customer pitch and technical walkthrough, each no more than 5 minutes)
- [ ] Test all URLs in an incognito/private browser
- [ ] Submit the form only after the video and deployment links work
