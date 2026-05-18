from datetime import datetime, timezone

from fastapi import APIRouter

from app.config import settings

router = APIRouter()


@router.get("/health")
def health_check() -> dict:
    return {
        "status": "ok",
        "service": settings.app_name,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@router.get("/version")
def get_version() -> dict:
    return {
        "version": settings.version,
        "api_version": settings.api_version,
        "service": settings.app_name,
    }
