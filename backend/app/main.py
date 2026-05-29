import logging

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.exc import SQLAlchemyError

from app.config import settings
from app.routers import agents, ai, analytics, auth, conversations, dashboard, goals, health, reminders, tasks
from app.routers import settings as settings_router

logger = logging.getLogger(__name__)

# Known placeholder values that must not be used in production.
_WEAK_JWT_SECRETS = {
    "dev-secret-change-in-production",
    "your-secret-here",
    "replace-this-with-a-strong-secret",
    "",
}

app = FastAPI(
    title=settings.app_name,
    version=settings.version,
    description="HELIOS — AI Life Operating System API",
    docs_url="/docs",
    redoc_url="/redoc",
)

# Parse comma-separated CORS_ORIGINS from config (e.g. "https://a.com,https://b.com")
_cors_origins = [o.strip() for o in settings.cors_origins.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    # Credentials=False: auth is via Bearer token in the Authorization header, not
    # cookies. allow_origins=["*"] + allow_credentials=True is rejected by browsers
    # per the CORS spec, so this pair would be a misconfiguration anyway.
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

app.include_router(
    reminders.router,
    prefix=f"/api/{settings.api_version}/reminders",
    tags=["reminders"],
)

app.include_router(
    settings_router.router,
    prefix=f"/api/{settings.api_version}/settings",
    tags=["settings"],
)


@app.on_event("startup")
async def startup_checks() -> None:
    if settings.jwt_secret_key in _WEAK_JWT_SECRETS or len(settings.jwt_secret_key) < 16:
        logger.warning(
            "JWT_SECRET_KEY is a weak placeholder value and must not be used in production. "
            "Generate a strong secret: python3 -c \"import secrets; print(secrets.token_hex(32))\""
        )


@app.get("/", tags=["root"])
def root() -> dict:
    return {
        "service": settings.app_name,
        "version": settings.version,
        "docs": "/docs",
    }
