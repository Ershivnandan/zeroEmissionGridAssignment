# Deployment Guide

Deploy the app as **three parts**:

```
Frontend (Vercel)  →  Backend API (Render)  →  PostGIS Database (Render)
```

The frontend goes on **Vercel**, and the backend + PostGIS database both go on
**Render** (via the included `render.yaml` blueprint).

Prerequisite: push this repo to GitHub first (Vercel & Render deploy from a Git repo).
A **MapTiler API key** (free) is needed for the map basemap — https://cloud.maptiler.com.

---

## Part 1 — Backend + Database on Render

The repo includes `render.yaml`, which defines a PostGIS database **and** the API
web service together.

1. Go to **https://dashboard.render.com** → **New** → **Blueprint**.
2. Connect your GitHub repo. Render reads `render.yaml` and shows two resources:
   - `buildable-db` (PostgreSQL, free) — PostGIS is available on Render Postgres.
   - `buildable-api` (Docker web service, free) — built from `backend/Dockerfile`.
3. Click **Apply**. Render provisions the DB, wires `DATABASE_URL` into the API
   automatically, and builds the backend.
4. When the API is live you'll get a URL like `https://buildable-api.xxxx.onrender.com`.
   Test it: open `https://<that-url>/api/v1/health` → should return `{"status":"ok"}`.

> Note: Render's free web service **sleeps after ~15 min idle**; the first request
> after sleeping is slow (cold start). Fine for a demo.

### Seed the cloud database (one-time)

The DB starts empty. Load data into it from your local machine using Render's
**External Database URL** (Render dashboard → `buildable-db` → "External Connection"):

```bash
cd backend
source .venv/bin/activate

# generate data (real Houston/USFWS, or synthetic)
DATA_DIR=../data python scripts/fetch_real_data.py
#   or: DATA_DIR=../data python scripts/make_sample_data.py

# load into the CLOUD db (paste Render's External Database URL)
DATA_DIR=../data \
DATABASE_URL="postgresql://buildable:...@...render.com/buildable" \
python scripts/load_data.py
```

`load_data.py` applies the schema (which enables PostGIS) and loads the layers.

---

## Part 2 — Frontend on Vercel

1. Go to **https://vercel.com** → **Add New** → **Project** → import your GitHub repo.
2. **Root Directory**: set to **`frontend`** (important — the Next.js app is in a subfolder).
3. Framework preset: **Next.js** (auto-detected). Build/Output: leave defaults.
4. Add **Environment Variables**:

   | Name | Value |
   |------|-------|
   | `NEXT_PUBLIC_API_BASE` | `https://<your-render-api>.onrender.com/api/v1` |
   | `NEXT_PUBLIC_MAPTILER_KEY` | your MapTiler key |
   | `NEXT_PUBLIC_MAP_TILE_URL` | `https://api.maptiler.com/tiles/satellite-v2/{z}/{x}/{y}.jpg` |

5. **Deploy**. You'll get a URL like `https://your-app.vercel.app`.

---

## Part 3 — Connect them (CORS)

The backend only allows requests from origins listed in `CORS_ORIGINS`. After the
Vercel URL exists:

1. Render dashboard → `buildable-api` → **Environment** → set:
   ```
   CORS_ORIGINS = https://your-app.vercel.app
   ```
   (comma-separate if you have multiple, e.g. preview + prod URLs)
2. Render redeploys automatically. Done — open the Vercel URL and the map + analysis
   should work end-to-end.

---

## Checklist

- [ ] Repo pushed to GitHub
- [ ] Render Blueprint applied → API `/api/v1/health` returns ok
- [ ] Cloud DB seeded via `load_data.py` with External URL
- [ ] Vercel project: root = `frontend`, env vars set
- [ ] `CORS_ORIGINS` on Render set to the Vercel URL
- [ ] Open Vercel URL → pick/draw a parcel → overlays render
