import json
from app.db.pool import get_conn
from app.core.config import get_settings


def _work_srid() -> int:
    return get_settings().working_srid


def _display_srid() -> int:
    return get_settings().display_srid


def _to_hex(value) -> str | None:
    if value is None:
        return None
    if isinstance(value, memoryview):
        value = value.tobytes()
    return value.hex()


def list_parcels(limit: int = 500) -> list[dict]:
    work = _work_srid()
    disp = _display_srid()
    sql = f"""
        SELECT parcel_id,
               ST_Area(ST_Transform(geom, {work})) / 4046.8564224 AS acres,
               ST_X(ST_Centroid(ST_Transform(geom, {disp}))) AS lng,
               ST_Y(ST_Centroid(ST_Transform(geom, {disp}))) AS lat
        FROM parcels
        ORDER BY acres DESC
        LIMIT %s
    """
    with get_conn() as conn:
        rows = conn.execute(sql, (limit,)).fetchall()
    return [{"parcel_id": r[0], "acres": r[1], "centroid": [r[2], r[3]]} for r in rows]


def get_parcel_geom_work(parcel_id: str) -> str | None:
    work = _work_srid()
    sql = f"SELECT ST_AsBinary(ST_Transform(geom, {work})) FROM parcels WHERE parcel_id = %s"
    with get_conn() as conn:
        row = conn.execute(sql, (parcel_id,)).fetchone()
    return _to_hex(row[0]) if row else None


def geojson_to_work_wkb(geometry: dict) -> str:
    work = _work_srid()
    disp = _display_srid()
    sql = f"SELECT ST_AsBinary(ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON(%s), {disp}), {work}))"
    with get_conn() as conn:
        row = conn.execute(sql, (json.dumps(geometry),)).fetchone()
    return _to_hex(row[0])


def constraint_geom_within_parcel(table: str, parcel_wkb_hex: str, setback_m: float) -> str | None:
    work = _work_srid()
    sql = f"""
        WITH parcel AS (
            SELECT ST_GeomFromWKB(decode(%s, 'hex'), {work}) AS g
        ),
        buffered AS (
            SELECT ST_Buffer(ST_Transform(c.geom, {work}), %s) AS g
            FROM {table} c, parcel p
            WHERE ST_Intersects(ST_Transform(c.geom, {work}), p.g)
        )
        SELECT ST_AsBinary(
            ST_Intersection(
                ST_UnaryUnion(ST_Collect(b.g)),
                (SELECT g FROM parcel)
            )
        )
        FROM buffered b
    """
    with get_conn() as conn:
        row = conn.execute(sql, (parcel_wkb_hex, setback_m)).fetchone()
    if not row or row[0] is None:
        return None
    return _to_hex(row[0])
