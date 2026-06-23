from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.db.session import get_db

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
        "helios_version": "HELIOS 2.6",
        "service": settings.app_name,
    }


@router.get("/health/diagnostics")
def diagnostics(db: Session = Depends(get_db)) -> dict:
    db.execute(select(1))
    return {
        "status": "ok",
        "service": settings.app_name,
        "version": settings.version,
        "api_version": settings.api_version,
        "environment": settings.environment,
        "database": {"status": "ok"},
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
