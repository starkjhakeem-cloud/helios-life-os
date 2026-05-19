from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.routers import agents, ai, auth, dashboard, goals, health

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

app.include_router(
    ai.router,
    prefix=f"/api/{settings.api_version}/ai",
    tags=["ai"],
)

app.include_router(
    agents.router,
    prefix=f"/api/{settings.api_version}/agents",
    tags=["agents"],
)

app.include_router(
    goals.router,
    prefix=f"/api/{settings.api_version}/goals",
    tags=["goals"],
)


@app.get("/", tags=["root"])
def root() -> dict:
    return {
        "service": settings.app_name,
        "version": settings.version,
        "docs": "/docs",
    }
