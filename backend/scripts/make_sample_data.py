import json
import math
import os
from pathlib import Path

DATA_DIR = Path(os.environ.get("DATA_DIR", "../data"))

ORIGIN_LNG = -97.75
ORIGIN_LAT = 30.30
M_PER_DEG_LAT = 111_320.0


def m_per_deg_lng(lat: float) -> float:
    return 111_320.0 * math.cos(math.radians(lat))


def offset(lng: float, lat: float, dx_m: float, dy_m: float) -> tuple[float, float]:
    return (lng + dx_m / m_per_deg_lng(lat), lat + dy_m / M_PER_DEG_LAT)


def rect(lng: float, lat: float, w_m: float, h_m: float) -> list:
    p0 = offset(lng, lat, 0, 0)
    p1 = offset(lng, lat, w_m, 0)
    p2 = offset(lng, lat, w_m, h_m)
    p3 = offset(lng, lat, 0, h_m)
    return [[list(p0), list(p1), list(p2), list(p3), list(p0)]]


def poly_from_points(pts: list) -> list:
    ring = [list(p) for p in pts]
    ring.append(list(pts[0]))
    return [ring]


def polygon_feature(coords: list, props: dict) -> dict:
    return {"type": "Feature", "properties": props, "geometry": {"type": "Polygon", "coordinates": coords}}


def line_feature(coords: list, props: dict) -> dict:
    return {"type": "Feature", "properties": props, "geometry": {"type": "LineString", "coordinates": coords}}


def fc(features: list) -> dict:
    return {"type": "FeatureCollection", "features": features}


def pseudo(seed: int) -> float:
    x = math.sin(seed * 12.9898) * 43758.5453
    return x - math.floor(x)


def build():
    cols, rows = 6, 5
    cell_w, cell_h = 460.0, 400.0

    parcels = []
    for r in range(rows):
        for c in range(cols):
            seed = r * cols + c
            jx = (pseudo(seed) - 0.5) * 60
            jy = (pseudo(seed + 100) - 0.5) * 60
            w = 300 + pseudo(seed + 200) * 140
            h = 260 + pseudo(seed + 300) * 120
            bx = c * cell_w + jx + 30
            by = r * cell_h + jy + 30
            base = offset(ORIGIN_LNG, ORIGIN_LAT, bx, by)
            if pseudo(seed + 400) > 0.6:
                cut = 0.45 + pseudo(seed + 500) * 0.25
                pts = [
                    offset(base[0], base[1], 0, 0),
                    offset(base[0], base[1], w, 0),
                    offset(base[0], base[1], w, h * cut),
                    offset(base[0], base[1], w * cut, h * cut),
                    offset(base[0], base[1], w * cut, h),
                    offset(base[0], base[1], 0, h),
                ]
                coords = poly_from_points(pts)
            else:
                coords = rect(base[0], base[1], w, h)
            pid = f"TX-{r:02d}{c:02d}"
            parcels.append(polygon_feature(coords, {"parcel_id": pid}))

    wetlands = []
    for wx, wy, ww, wh, kind in [
        (200, 150, 380, 300, "PEM"),
        (1550, 900, 520, 420, "PFO"),
        (2500, 300, 300, 500, "PEM"),
        (700, 1500, 640, 380, "PSS"),
        (2200, 1700, 420, 360, "PFO"),
    ]:
        o = offset(ORIGIN_LNG, ORIGIN_LAT, wx, wy)
        wetlands.append(polygon_feature(rect(o[0], o[1], ww, wh), {"type": kind}))

    floodplain = []
    for fx, fy, fw, fh in [(950, -60, 1000, 760), (300, 900, 520, 700)]:
        o = offset(ORIGIN_LNG, ORIGIN_LAT, fx, fy)
        floodplain.append(polygon_feature(rect(o[0], o[1], fw, fh), {"zone": "AE"}))

    transmission = []
    start = offset(ORIGIN_LNG, ORIGIN_LAT, -60, 650)
    pts = [start]
    cur = start
    for i in range(8):
        cur = offset(cur[0], cur[1], 380, 80 if i % 2 == 0 else -30)
        pts.append(cur)
    transmission.append(line_feature([list(p) for p in pts], {"voltage": "138kV"}))

    diag = offset(ORIGIN_LNG, ORIGIN_LAT, 400, 100)
    dpts = [diag]
    cur = diag
    for _ in range(6):
        cur = offset(cur[0], cur[1], 300, 300)
        dpts.append(cur)
    transmission.append(line_feature([list(p) for p in dpts], {"voltage": "69kV"}))

    buildings = []
    for seed in range(24):
        r = seed % rows
        c = (seed * 7) % cols
        bx = c * cell_w + 80 + pseudo(seed + 900) * 200
        by = r * cell_h + 70 + pseudo(seed + 950) * 180
        o = offset(ORIGIN_LNG, ORIGIN_LAT, bx, by)
        bw = 25 + pseudo(seed + 990) * 40
        bh = 20 + pseudo(seed + 999) * 35
        buildings.append(polygon_feature(rect(o[0], o[1], bw, bh), {"use": "structure"}))

    DATA_DIR.mkdir(parents=True, exist_ok=True)
    (DATA_DIR / "parcels.geojson").write_text(json.dumps(fc(parcels)))
    (DATA_DIR / "wetlands.geojson").write_text(json.dumps(fc(wetlands)))
    (DATA_DIR / "floodplain.geojson").write_text(json.dumps(fc(floodplain)))
    (DATA_DIR / "transmission.geojson").write_text(json.dumps(fc(transmission)))
    (DATA_DIR / "buildings.geojson").write_text(json.dumps(fc(buildings)))
    print(f"wrote sample data to {DATA_DIR.resolve()}")
    print(f"  parcels={len(parcels)} wetlands={len(wetlands)} floodplain={len(floodplain)} "
          f"transmission={len(transmission)} buildings={len(buildings)}")


if __name__ == "__main__":
    build()
