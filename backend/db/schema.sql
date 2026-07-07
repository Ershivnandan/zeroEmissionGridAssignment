CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE IF NOT EXISTS parcels (
    id BIGSERIAL PRIMARY KEY,
    parcel_id TEXT UNIQUE NOT NULL,
    geom geometry(MultiPolygon, 4326) NOT NULL
);

CREATE TABLE IF NOT EXISTS wetlands (
    id BIGSERIAL PRIMARY KEY,
    geom geometry(MultiPolygon, 4326) NOT NULL
);

CREATE TABLE IF NOT EXISTS floodplain (
    id BIGSERIAL PRIMARY KEY,
    geom geometry(MultiPolygon, 4326) NOT NULL
);

CREATE TABLE IF NOT EXISTS transmission (
    id BIGSERIAL PRIMARY KEY,
    geom geometry(MultiLineString, 4326) NOT NULL
);

CREATE TABLE IF NOT EXISTS buildings (
    id BIGSERIAL PRIMARY KEY,
    geom geometry(MultiPolygon, 4326) NOT NULL
);

CREATE INDEX IF NOT EXISTS parcels_geom_idx ON parcels USING GIST (geom);
CREATE INDEX IF NOT EXISTS wetlands_geom_idx ON wetlands USING GIST (geom);
CREATE INDEX IF NOT EXISTS floodplain_geom_idx ON floodplain USING GIST (geom);
CREATE INDEX IF NOT EXISTS transmission_geom_idx ON transmission USING GIST (geom);
CREATE INDEX IF NOT EXISTS buildings_geom_idx ON buildings USING GIST (geom);
