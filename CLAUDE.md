# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A full-stack **Buildable Land Analysis** app: given a parcel and constraint layers (wetlands, FEMA
floodplain, transmission easements, building footprints), it computes buildable area = parcel minus
buffered constraints, shows it on a map, and lets a user carve out / add back area with live totals.

- **Backend**: `backend/` — Python + FastAPI. Geometry runs in PostGIS.
- **Frontend**: `frontend/` — Next.js (App Router) + MapLibre GL + Mapbox GL Draw.
- **DB**: PostgreSQL + PostGIS. Local default is `postgresql://shiv:123456@localhost:5432/shiv_db`.

Read `README.md` for run instructions and `APPROACH.md` for design rationale.

## Commands

```bash
# Backend (from backend/)
python3 -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt
DATA_DIR=../data python scripts/make_sample_data.py     # generate synthetic sample
DATA_DIR=../data python scripts/load_data.py            # apply schema + load data/*.geojson
uvicorn app.main:app --port 8000

# Frontend (from frontend/)
npm install
NEXT_PUBLIC_API_BASE=http://localhost:8000/api/v1 npm run dev   # dev
npm run build                                                # prod build / typecheck

# Whole stack via Docker (uses its own `buildable` DB, not shiv_db)
docker compose up --build -d
```

There is no unit-test suite; verification is done by driving the running API (see the end-to-end
checks in APPROACH.md). `DATABASE_URL` overrides the DB target.

## Architecture — the parts that matter

- **CRS is the correctness crux.** Source data is EPSG:4326 (degrees). ALL buffer/area/set-ops run
  after `ST_Transform` into a projected metric CRS (`WORKING_SRID`, default 32614 = UTM 14N). Doing
  setback math in degrees is silently wrong. Results transform back to 4326 for the map. See
  `backend/app/core/config.py`.

- **Geometry runs in PostGIS, not Python.** `backend/app/services/repository.py` and `compute.py`
  build SQL that buffers/unions/differences geometry in-database, buffering only constraint features
  that intersect the parcel bbox (GIST-indexed). Geometries move between steps as hex-encoded WKB.
  `_to_hex()` in `repository.py` normalizes psycopg3 `bytes`/`memoryview` — reuse it for any new
  `ST_AsBinary` result (psycopg3 returns `bytes`, not psycopg2's `memoryview`).

- **Compute flow** (`compute.py::compute_buildable`): resolve enabled constraints + setbacks (defaults
  overridden per-request) → buffer+clip each to parcel → union → subtract from parcel → apply
  carve-outs (∩ parcel, subtract) and restores (∩ parcel, add back) → measure areas. `excluded_acres`
  is `parcel − buildable` (true complement), while breakdown `removed_acres` is per-layer (may overlap).

- **Setbacks are config-driven.** `backend/app/core/constraints.yaml` holds one entry per constraint
  (`default_setback_m` + cited `source`). The frontend sends `overrides` on every compute so the UI
  can toggle layers / change buffers without a code change.

- **Frontend data flow.** `frontend/src/app/page.tsx` holds all state and debounces (250 ms) a POST to
  `/api/compute`, then feeds the returned GeoJSON to `MapView.tsx`. Drawn polygons are tagged
  `carve`/`restore` via the active tool and posted back. API client + types: `frontend/src/lib/api.ts`.

## Conventions

- **No code comments** — the codebase is deliberately comment-free; keep it that way when editing.
- Constraint tables (`parcels`, `wetlands`, `floodplain`, `transmission`, `buildings`) are defined in
  `backend/db/schema.sql` with GIST indexes; `transmission` is `MultiLineString`, the rest polygons.
  Adding a constraint = new table + `schema.sql` index + `constraints.yaml` entry + loader `LAYERS` entry.
