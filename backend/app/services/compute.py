import json
from app.db.pool import get_conn
from app.core.config import get_settings
from app.core.constraints import load_catalog, ConstraintDef
from app.api.schemas import (
    ComputeRequest,
    ComputeResponse,
    ConstraintBreakdown,
)
from app.services import repository
from app.services.repository import _to_hex

SQM_PER_ACRE = 4046.8564224


def _resolve_constraints(req: ComputeRequest) -> list[tuple[ConstraintDef, float]]:
    catalog = load_catalog()
    overrides = {o.key: o for o in req.overrides}
    resolved: list[tuple[ConstraintDef, float]] = []
    for c in catalog.constraints:
        ov = overrides.get(c.key)
        enabled = c.enabled if ov is None or ov.enabled is None else ov.enabled
        if not enabled:
            continue
        setback = c.default_setback_m if ov is None or ov.setback_m is None else ov.setback_m
        resolved.append((c, setback))
    return resolved


def _area_acres(conn, wkb_hex: str | None) -> float:
    if wkb_hex is None:
        return 0.0
    work = get_settings().working_srid
    row = conn.execute(
        f"SELECT ST_Area(ST_GeomFromWKB(decode(%s, 'hex'), {work}))",
        (wkb_hex,),
    ).fetchone()
    return (row[0] or 0.0) / SQM_PER_ACRE


def _to_display_feature(conn, wkb_hex: str | None, props: dict) -> dict:
    work = get_settings().working_srid
    disp = get_settings().display_srid
    if wkb_hex is None:
        return {"type": "Feature", "properties": props, "geometry": None}
    row = conn.execute(
        f"""SELECT ST_AsGeoJSON(ST_Transform(
                ST_GeomFromWKB(decode(%s, 'hex'), {work}), {disp}))""",
        (wkb_hex,),
    ).fetchone()
    return {"type": "Feature", "properties": props, "geometry": json.loads(row[0])}


def _union_hex(conn, hexes: list[str]) -> str | None:
    hexes = [h for h in hexes if h]
    if not hexes:
        return None
    work = get_settings().working_srid
    geoms = [f"ST_GeomFromWKB(decode('{h}', 'hex'), {work})" for h in hexes]
    collect = "ST_Collect(ARRAY[" + ",".join(geoms) + "])"
    row = conn.execute(f"SELECT ST_AsBinary(ST_UnaryUnion({collect}))").fetchone()
    return _to_hex(row[0]) if row else None


def _difference_hex(conn, base_hex: str, subtract_hex: str | None) -> str:
    if subtract_hex is None:
        return base_hex
    work = get_settings().working_srid
    row = conn.execute(
        f"""SELECT ST_AsBinary(ST_Difference(
                ST_GeomFromWKB(decode(%s, 'hex'), {work}),
                ST_GeomFromWKB(decode(%s, 'hex'), {work})))""",
        (base_hex, subtract_hex),
    ).fetchone()
    return _to_hex(row[0])


def _intersection_hex(conn, a_hex: str, b_hex: str) -> str | None:
    work = get_settings().working_srid
    row = conn.execute(
        f"""SELECT ST_AsBinary(ST_Intersection(
                ST_GeomFromWKB(decode(%s, 'hex'), {work}),
                ST_GeomFromWKB(decode(%s, 'hex'), {work})))""",
        (a_hex, b_hex),
    ).fetchone()
    return _to_hex(row[0]) if row else None


def compute_buildable(req: ComputeRequest) -> ComputeResponse:
    settings = get_settings()

    if req.parcel_geometry is not None:
        parcel_hex = repository.geojson_to_work_wkb(req.parcel_geometry)
    elif req.parcel_id is not None:
        parcel_hex = repository.get_parcel_geom_work(req.parcel_id)
        if parcel_hex is None:
            raise ValueError(f"parcel not found: {req.parcel_id}")
    else:
        raise ValueError("either parcel_id or parcel_geometry is required")

    constraints = _resolve_constraints(req)

    with get_conn() as conn:
        parcel_acres = _area_acres(conn, parcel_hex)
        if parcel_acres * SQM_PER_ACRE > settings.max_query_area_m2:
            raise ValueError("parcel exceeds maximum supported area")

        breakdown: list[ConstraintBreakdown] = []
        constraint_hexes: list[str] = []
        for cdef, setback in constraints:
            removed_hex = repository.constraint_geom_within_parcel(
                cdef.table, parcel_hex, setback
            )
            removed_acres = _area_acres(conn, removed_hex)
            if removed_hex:
                constraint_hexes.append(removed_hex)
            breakdown.append(
                ConstraintBreakdown(
                    key=cdef.key,
                    label=cdef.label,
                    setback_m=setback,
                    removed_acres=round(removed_acres, 4),
                    source=cdef.source.strip(),
                )
            )

        constraints_union = _union_hex(conn, constraint_hexes)

        carve_hexes = [
            repository.geojson_to_work_wkb(c.geometry) for c in req.carve_outs
        ]
        carve_union = _union_hex(conn, carve_hexes)
        carve_within = (
            _intersection_hex(conn, carve_union, parcel_hex) if carve_union else None
        )
        manual_carved_acres = _area_acres(conn, carve_within)

        excluded_hex = _union_hex(
            conn, [h for h in [constraints_union, carve_within] if h]
        )
        buildable_hex = _difference_hex(conn, parcel_hex, excluded_hex)

        restore_hexes = [
            repository.geojson_to_work_wkb(r.geometry) for r in req.restores
        ]
        restore_union = _union_hex(conn, restore_hexes)
        restore_within = (
            _intersection_hex(conn, restore_union, parcel_hex) if restore_union else None
        )
        manual_restored_acres = 0.0
        if restore_within:
            new_buildable = _union_hex(conn, [buildable_hex, restore_within])
            before = _area_acres(conn, buildable_hex)
            buildable_hex = new_buildable or buildable_hex
            after = _area_acres(conn, buildable_hex)
            manual_restored_acres = max(after - before, 0.0)

        buildable_acres = _area_acres(conn, buildable_hex)
        excluded_acres = max(parcel_acres - buildable_acres, 0.0)

        parcel_feature = _to_display_feature(conn, parcel_hex, {"kind": "parcel"})
        buildable_feature = _to_display_feature(
            conn, buildable_hex, {"kind": "buildable"}
        )
        excluded_geom = _difference_hex(conn, parcel_hex, buildable_hex)
        excluded_feature = _to_display_feature(
            conn, excluded_geom, {"kind": "excluded"}
        )

    return ComputeResponse(
        parcel_id=req.parcel_id,
        parcel_acres=round(parcel_acres, 4),
        buildable_acres=round(buildable_acres, 4),
        excluded_acres=round(excluded_acres, 4),
        manual_carved_acres=round(manual_carved_acres, 4),
        manual_restored_acres=round(manual_restored_acres, 4),
        breakdown=breakdown,
        parcel_geojson=parcel_feature,
        buildable_geojson=buildable_feature,
        excluded_geojson=excluded_feature,
    )
