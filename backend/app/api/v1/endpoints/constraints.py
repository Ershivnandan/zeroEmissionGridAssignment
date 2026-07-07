from fastapi import APIRouter

from app.api.schemas import ConstraintInfo
from app.core.constraints import load_catalog

router = APIRouter()


@router.get("/constraints", response_model=list[ConstraintInfo])
def get_constraints() -> list[ConstraintInfo]:
    catalog = load_catalog()
    return [
        ConstraintInfo(
            key=c.key,
            label=c.label,
            default_setback_m=c.default_setback_m,
            enabled=c.enabled,
            source=c.source.strip(),
        )
        for c in catalog.constraints
    ]
