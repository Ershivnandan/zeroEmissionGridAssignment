from typing import Any
from pydantic import BaseModel, Field


GeoJSONGeometry = dict[str, Any]
GeoJSONFeature = dict[str, Any]


class ConstraintOverride(BaseModel):
    key: str
    enabled: bool | None = None
    setback_m: float | None = Field(default=None, ge=0)


class EditPolygon(BaseModel):
    geometry: GeoJSONGeometry


class ComputeRequest(BaseModel):
    parcel_id: str | None = None
    parcel_geometry: GeoJSONGeometry | None = None
    overrides: list[ConstraintOverride] = Field(default_factory=list)
    carve_outs: list[EditPolygon] = Field(default_factory=list)
    restores: list[EditPolygon] = Field(default_factory=list)


class ConstraintBreakdown(BaseModel):
    key: str
    label: str
    setback_m: float
    removed_acres: float
    source: str


class ComputeResponse(BaseModel):
    parcel_id: str | None
    parcel_acres: float
    buildable_acres: float
    excluded_acres: float
    manual_carved_acres: float
    manual_restored_acres: float
    breakdown: list[ConstraintBreakdown]
    parcel_geojson: GeoJSONFeature
    buildable_geojson: GeoJSONFeature
    excluded_geojson: GeoJSONFeature


class ConstraintInfo(BaseModel):
    key: str
    label: str
    default_setback_m: float
    enabled: bool
    source: str


class ParcelSummary(BaseModel):
    parcel_id: str
    acres: float
    centroid: list[float]
