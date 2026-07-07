import json
import os
import subprocess
import sys
import urllib.parse
from pathlib import Path

DATA_DIR = Path(os.environ.get("DATA_DIR", "../data"))

BBOX = os.environ.get("BBOX", "-95.40,29.72,-95.35,29.77")

PARCELS_URL = (
    "https://services.arcgis.com/su8ic9KbA7PYVxPS/arcgis/rest/services/"
    "Harris_County_Parcels/FeatureServer/1/query"
)
WETLANDS_URL = (
    "https://fwspublicservices.wim.usgs.gov/wetlandsmapservice/rest/services/"
    "Wetlands/MapServer/0/query"
)
FEMA_URL = (
    "https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/28/query"
)


def arcgis_geojson(base: str, out_fields: str, record_count: int, timeout: int) -> dict:
    params = {
        "where": "1=1",
        "geometry": BBOX,
        "geometryType": "esriGeometryEnvelope",
        "inSR": "4326",
        "spatialRel": "esriSpatialRelIntersects",
        "outFields": out_fields,
        "returnGeometry": "true",
        "outSR": "4326",
        "resultRecordCount": str(record_count),
        "f": "geojson",
    }
    url = base + "?" + urllib.parse.urlencode(params)
    out = subprocess.run(
        ["curl", "-s", "-m", str(timeout), "-H", "User-Agent: buildable-fetch/1.0", url],
        capture_output=True,
        text=True,
    )
    if out.returncode != 0 or not out.stdout:
        raise RuntimeError(f"curl failed ({out.returncode})")
    return json.loads(out.stdout)


def write(name: str, fc: dict) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    (DATA_DIR / name).write_text(json.dumps(fc))


def normalize_parcels(fc: dict) -> dict:
    feats = []
    for i, f in enumerate(fc.get("features", [])):
        if not f.get("geometry"):
            continue
        props = f.get("properties") or {}
        pid = (
            props.get("HCAD_NUM")
            or props.get("acct_num")
            or props.get("LOWPARCELID")
            or f"P{i}"
        )
        f["properties"] = {"parcel_id": str(pid).strip()}
        feats.append(f)
    return {"type": "FeatureCollection", "features": feats}


def main() -> int:
    print(f"bbox = {BBOX}")

    print("fetching parcels (Harris County, TX)...")
    parcels = arcgis_geojson(PARCELS_URL, "HCAD_NUM,acct_num,LOWPARCELID", 150, 90)
    parcels = normalize_parcels(parcels)
    write("parcels.geojson", parcels)
    print(f"  parcels: {len(parcels['features'])}")

    print("fetching wetlands (USFWS NWI)...")
    wet = arcgis_geojson(WETLANDS_URL, "*", 300, 90)
    write("wetlands.geojson", {"type": "FeatureCollection", "features": wet.get("features", [])})
    print(f"  wetlands: {len(wet.get('features', []))}")

    print("fetching floodplain (FEMA NFHL) [best effort]...")
    try:
        flood = arcgis_geojson(FEMA_URL, "FLD_ZONE", 200, 60)
        feats = flood.get("features", [])
        write("floodplain.geojson", {"type": "FeatureCollection", "features": feats})
        print(f"  floodplain: {len(feats)}")
    except Exception as exc:
        print(f"  floodplain skipped: {exc}")
        write("floodplain.geojson", {"type": "FeatureCollection", "features": []})

    for name in ("transmission.geojson", "buildings.geojson"):
        if not (DATA_DIR / name).exists():
            write(name, {"type": "FeatureCollection", "features": []})

    print("done")
    return 0


if __name__ == "__main__":
    sys.exit(main())
