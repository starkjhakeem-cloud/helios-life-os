import logging

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.exc import SQLAlchemyError

from app.config import settings
from app.routers import agents, ai, analytics, auth, conversations, dashboard, goals, health, tasks

logger = logging.getLogger(__name__)

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
    # Credentials=False: we authenticate via Bearer token in the Authorization header,
    # not via cookies. allow_origins=["*"] + allow_credentials=True is also rejected by
    # browsers per the CORS spec, so this pair was always a misconfiguration.
    allow_credentials=False,
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)


@app.exception_handler(SQLAlchemyError)
async def sqlalchemy_error_handler(request: Request, exc: SQLAlchemyError) -> JSONResponse:
    logger.error("Database error on %s %s: %s", request.method, request.url.path, exc)
    return JSONResponse(
        status_code=503,
        content={"detail": "Database unavailable. Please try again."},
    )


@app.exception_handler(Exception)
async def generic_error_handler(request: Request, exc: Exception) -> JSONResponse:
    logger.exception("Unhandled error on %s %s", request.method, request.url.path)
    if settings.debug:
        raise exc
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error."},
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
    conversations.router,
    prefix=f"/api/{settings.api_version}/ai/conversations",
    tags=["conversations"],
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

app.include_router(
    tasks.router,
    prefix=f"/api/{settings.api_version}/tasks",
    tags=["tasks"],
)

app.include_router(
    analytics.router,
    prefix=f"/api/{settings.api_version}/analytics",
    tags=["analytics"],
)


@app.get("/", tags=["root"])
def root() -> dict:
    return {
        "service": settings.app_name,
        "version": settings.version,
        "docs": "/docs",
    }
