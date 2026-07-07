from fastapi import APIRouter, HTTPException

from app.api.schemas import ComputeRequest, ComputeResponse
from app.services.compute import compute_buildable

router = APIRouter()


@router.post("/compute", response_model=ComputeResponse)
def post_compute(req: ComputeRequest) -> ComputeResponse:
    try:
        return compute_buildable(req)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
