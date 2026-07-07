from fastapi import APIRouter

from app.api.v1.endpoints import compute, constraints, health, parcels

api_router = APIRouter()

api_router.include_router(health.router, tags=["health"])
api_router.include_router(constraints.router, tags=["constraints"])
api_router.include_router(parcels.router, tags=["parcels"])
api_router.include_router(compute.router, tags=["compute"])
