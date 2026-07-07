import json
import os
import sys
from pathlib import Path

import psycopg

DATA_DIR = Path(os.environ.get("DATA_DIR", "../data"))
DATABASE_URL = os.environ.get(
    "DATABASE_URL", "postgresql://buildable:buildable@localhost:5432/buildable"
)

LAYERS = {
    "parcels": {"file": "parcels.geojson", "geom": "MultiPolygon", "id_field": "parcel_id"},
    "wetlands": {"file": "wetlands.geojson", "geom": "MultiPolygon", "id_field": None},
    "floodplain": {"file": "floodplain.geojson", "geom": "MultiPolygon", "id_field": None},
    "transmission": {"file": "transmission.geojson", "geom": "MultiLineString", "id_field": None},
    "buildings": {"file": "buildings.geojson", "geom": "MultiPolygon", "id_field": None},
}


def multi_cast(geom_type: str) -> str:
    return "ST_Multi" if geom_type.startswith("Multi") else ""


def load_layer(conn, table: str, spec: dict) -> int:
    path = DATA_DIR / spec["file"]
    if not path.exists():
        print(f"  skip {table}: {path} not found")
        return 0

    with path.open() as fh:
        fc = json.load(fh)
    features = fc.get("features", [])

    conn.execute(f"TRUNCATE {table} RESTART IDENTITY")

    inserted = 0
    id_field = spec["id_field"]
    for i, feat in enumerate(features):
        geom = feat.get("geometry")
        if geom is None:
            continue
        geom_json = json.dumps(geom)
        if id_field:
            props = feat.get("properties") or {}
            pid = str(props.get(id_field) or props.get("PARCEL_ID") or props.get("id") or f"P{i}")
            conn.execute(
                f"""INSERT INTO {table} (parcel_id, geom)
                    VALUES (%s, ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON(%s), 4326)))
                    ON CONFLICT (parcel_id) DO NOTHING""",
                (pid, geom_json),
            )
        else:
            conn.execute(
                f"""INSERT INTO {table} (geom)
                    VALUES (ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON(%s), 4326)))""",
                (geom_json,),
            )
        inserted += 1
    return inserted


def main() -> int:
    schema_path = Path(__file__).resolve().parent.parent / "db" / "schema.sql"
    with psycopg.connect(DATABASE_URL, autocommit=True) as conn:
        print("applying schema...")
        conn.execute(schema_path.read_text())
        for table, spec in LAYERS.items():
            n = load_layer(conn, table, spec)
            print(f"  loaded {n} features into {table}")
        for table in LAYERS:
            conn.execute(f"ANALYZE {table}")
    print("done")
    return 0


if __name__ == "__main__":
    sys.exit(main())
