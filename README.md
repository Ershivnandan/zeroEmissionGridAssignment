# Buildable Land Analysis

Given a parcel and a set of constraint layers (wetlands, floodplain, transmission
easements, existing buildings), this app computes the **buildable area** — the parcel
minus everything you legally or physically can't build on — shows it on an interactive
map, and lets you adjust the result by hand (carve out / add back) with the totals and
per-constraint breakdown updating live.

## Stack

- **Backend**: Python + FastAPI. All geometry (buffer / union / difference / area) runs
  in **PostGIS** in a projected CRS.
- **Database**: PostgreSQL + PostGIS, with GIST spatial indexes on every layer.
- **Frontend**: Next.js (App Router) + MapLibre GL + Mapbox GL Draw.

## Prerequisites

- PostgreSQL with the **PostGIS** extension available.
- Python 3.11+ and Node 18+ (verified on Python 3.14 / Node 26).
- Optional: Docker + Docker Compose (an alternative to a local Postgres — see below).

## Quick start (local Postgres)

The backend defaults to a local database at
`postgresql://shiv:123456@localhost:5432/shiv_db`. Override with the `DATABASE_URL`
environment variable (see `backend/.env.example`).

```bash
# 1. Backend deps
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

# 2. Generate a sample dataset and load it (also applies the schema + indexes)
DATA_DIR=../data python scripts/make_sample_data.py
DATA_DIR=../data python scripts/load_data.py

# 3. Run the API
uvicorn app.main:app --port 8000
# -> http://localhost:8000/api/v1/health

# 4. Frontend (new terminal)
cd ../frontend
npm install
NEXT_PUBLIC_API_BASE=http://localhost:8000/api/v1 npm run dev
# -> http://localhost:3000
```

## Quick start (Docker)

`docker-compose.yml` brings up PostGIS, the API, and the frontend. It uses its own
`buildable` database, so after the stack is up, load data into it:

```bash
docker compose up --build -d
# load sample data into the compose DB
cd backend
DATA_DIR=../data python scripts/make_sample_data.py
DATABASE_URL=postgresql://buildable:buildable@localhost:5432/buildable python scripts/load_data.py
# frontend: http://localhost:3000  ·  api: http://localhost:8000/api/v1
```

## Using real data

The loader reads GeoJSON from `data/` by layer name — drop real files in and re-run
`load_data.py`:

| File                     | Layer        | Source                                                    |
| ------------------------ | ------------ | --------------------------------------------------------- |
| `parcels.geojson`        | parcels      | TNRIS — https://data.tnris.org (pick a manageable county) |
| `wetlands.geojson`       | wetlands     | USFWS National Wetlands Inventory                         |
| `floodplain.geojson`     | floodplain   | FEMA National Flood Hazard Layer (Zone A/AE)              |
| `transmission.geojson`   | transmission | Utility / HIFLD transmission lines (LineString)           |
| `buildings.geojson`      | buildings    | Microsoft / OSM building footprints                       |

Parcel features need a `parcel_id` (or `PARCEL_ID`/`id`) property. All layers are stored
as EPSG:4326.

## Configuring setbacks

Setbacks live in `backend/app/core/constraints.yaml` — one entry per constraint with a
`default_setback_m` and a cited `source`. Change a value and re-run (no code edit).
Per-request overrides are also supported: the map's sidebar sends `overrides` on every
compute, so you can toggle a layer or change a buffer from the UI and re-run live.

## API

- `GET  /api/v1/health` — liveness.
- `GET  /api/v1/constraints` — constraint catalog with defaults + sources.
- `GET  /api/v1/parcels?limit=N` — parcel list with acreage and centroid.
- `POST /api/v1/compute` — body: `parcel_id` (or inline `parcel_geometry`), `overrides`,
  `carve_outs`, `restores`. Returns buildable/excluded acreage, per-constraint breakdown,
  and GeoJSON for the parcel / buildable / excluded geometries.

See `APPROACH.md` for design decisions, tradeoffs, and where it breaks.
