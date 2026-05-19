from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.routers import auth, dashboard, health

app = FastAPI(
    title=settings.app_name,
    version=settings.version,
    description="HELIOS — AI Life Operating System API",
    docs_url="/docs",
    redoc_url="/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(
    health.router,
    prefix=f"/api/{settings.api_version}",
    tags=["system"],
)

app.include_router(
    auth.router,
    prefix=f"/api/{settings.api_version}/auth",
    tags=["auth"],
)

app.include_router(
    dashboard.router,
    prefix=f"/api/{settings.api_version}/dashboard",
    tags=["dashboard"],
)


@app.get("/", tags=["root"])
def root() -> dict:
    return {
        "service": settings.app_name,
        "version": settings.version,
        "docs": "/docs",
    }
