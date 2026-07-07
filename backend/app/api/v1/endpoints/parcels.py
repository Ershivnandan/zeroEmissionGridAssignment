from fastapi import APIRouter

from app.api.schemas import ParcelSummary
from app.services import repository

router = APIRouter()


@router.get("/parcels", response_model=list[ParcelSummary])
def get_parcels(limit: int = 500) -> list[ParcelSummary]:
    rows = repository.list_parcels(limit=limit)
    return [
        ParcelSummary(
            parcel_id=r["parcel_id"],
            acres=round(r["acres"], 4),
            centroid=r["centroid"],
        )
        for r in rows
    ]
