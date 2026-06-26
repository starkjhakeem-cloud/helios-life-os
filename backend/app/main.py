import logging
import time
import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from sqlalchemy.exc import SQLAlchemyError
from starlette.middleware.base import BaseHTTPMiddleware

from app.config import settings
from app.core.limiter import limiter
from app.logging_config import configure_logging
from app.routers import agents, ai, analytics, auth, autonomy, background_jobs, calendar, conversations, daily_snapshots, dashboard, email, goals, health, history, integrations, memory, notifications, profile, reminders, tasks
from app.routers import assistant_context, relationships, semantic_memory
from app.routers import settings as settings_router
from app.services.token_encryption import validate_key as validate_encryption_key

configure_logging(settings)
logger = logging.getLogger(__name__)

X_REQUEST_ID_HEADER = "X-Request-ID"


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        request_id = request.headers.get(X_REQUEST_ID_HEADER) or str(uuid.uuid4())
        request.state.request_id = request_id
        start = time.monotonic()

        response = await call_next(request)

        duration_ms = int((time.monotonic() - start) * 1000)
        response.headers[X_REQUEST_ID_HEADER] = request_id
        logger.info(
            "%s %s%s %s %sms",
            request.method,
            request.url.path,
            f"?{request.url.query}" if request.url.query else "",
            response.status_code,
            duration_ms,
            extra={"request_id": request_id},
        )
        return response

# Known placeholder values that must not be used in production.
_WEAK_JWT_SECRETS = {
    "dev-secret-change-in-production",
    "your-secret-here",
    "replace-this-with-a-strong-secret",
    "",
}

async def startup_checks() -> None:
    logger.info(
        "Starting %s version %s in %s mode.",
        settings.app_name,
        settings.version,
        settings.environment,
        extra={"request_id": "-"},
    )
    if settings.jwt_secret_key in _WEAK_JWT_SECRETS or len(settings.jwt_secret_key) < 16:
        logger.warning(
            "JWT_SECRET_KEY is a weak placeholder value and must not be used in production. "
            "Generate a strong secret: python3 -c \"import secrets; print(secrets.token_hex(32))\"",
            extra={"request_id": "-"},
        )
    if not settings.token_encryption_key:
        logger.info(
            "TOKEN_ENCRYPTION_KEY is not set — mock integrations work without it; "
            "required before storing real OAuth tokens. "
            "Generate: python3 -c \"from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())\"",
            extra={"request_id": "-"},
        )
    else:
        key_error = validate_encryption_key()
        if key_error:
            logger.warning(
                "TOKEN_ENCRYPTION_KEY is present but invalid — %s. "
                "OAuth token storage will fail until this is corrected. "
                "Generate a valid key: python3 -c \"from cryptography.fernet import Fernet; "
                "print(Fernet.generate_key().decode())\"",
                key_error,
                extra={"request_id": "-"},
            )
        else:
            logger.info(
                "TOKEN_ENCRYPTION_KEY is configured and valid — token storage active.",
                extra={"request_id": "-"},
            )


async def shutdown_event() -> None:
    logger.info(
        "Shutting down %s.",
        settings.app_name,
        extra={"request_id": "-"},
    )


@asynccontextmanager
async def lifespan(app: FastAPI):
    await startup_checks()
    yield
    await shutdown_event()


app = FastAPI(
    title=settings.app_name,
    version=settings.version,
    description="HELIOS — AI Life Operating System API",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

# Rate limiter — 429 responses use slowapi's built-in handler.
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

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

app.add_middleware(RequestLoggingMiddleware)


@app.exception_handler(SQLAlchemyError)
async def sqlalchemy_error_handler(request: Request, exc: SQLAlchemyError) -> JSONResponse:
    request_id = getattr(request.state, "request_id", "-")
    logger.error(
        "Database error on %s %s: %s",
        request.method,
        request.url.path,
        exc,
        extra={"request_id": request_id},
    )
    return JSONResponse(
        status_code=503,
        content={"detail": "Database unavailable. Please try again."},
        headers={X_REQUEST_ID_HEADER: request_id},
    )


@app.exception_handler(Exception)
async def generic_error_handler(request: Request, exc: Exception) -> JSONResponse:
    request_id = getattr(request.state, "request_id", "-")
    logger.exception(
        "Unhandled error on %s %s",
        request.method,
        request.url.path,
        extra={"request_id": request_id},
    )
    if settings.debug:
        raise exc
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error."},
        headers={X_REQUEST_ID_HEADER: request_id},
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

app.include_router(
    profile.router,
    prefix=f"/api/{settings.api_version}/profile",
    tags=["profile"],
)

app.include_router(
    memory.router,
    prefix=f"/api/{settings.api_version}/ai/memory",
    tags=["ai-memory"],
)

app.include_router(
    calendar.router,
    prefix=f"/api/{settings.api_version}/calendar/events",
    tags=["calendar"],
)

app.include_router(
    daily_snapshots.router,
    prefix=f"/api/{settings.api_version}/calendar/daily-snapshots",
    tags=["daily-snapshots"],
)

app.include_router(
    history.router,
    prefix=f"/api/{settings.api_version}/history",
    tags=["history"],
)

app.include_router(
    email.router,
    prefix=f"/api/{settings.api_version}/email/messages",
    tags=["email"],
)

app.include_router(
    email.router,
    prefix=f"/api/{settings.api_version}/email",
    tags=["email"],
)

app.include_router(
    integrations.router,
    prefix=f"/api/{settings.api_version}/integrations",
    tags=["integrations"],
)

app.include_router(
    autonomy.router,
    prefix=f"/api/{settings.api_version}/autonomy",
    tags=["autonomy"],
)

app.include_router(
    notifications.router,
    prefix=f"/api/{settings.api_version}/notifications",
    tags=["notifications"],
)

app.include_router(
    background_jobs.router,
    prefix=f"/api/{settings.api_version}",
    tags=["background-jobs"],
)

app.include_router(
    assistant_context.router,
    prefix=f"/api/{settings.api_version}/assistant/context",
    tags=["assistant-context"],
)

app.include_router(
    relationships.router,
    prefix=f"/api/{settings.api_version}/relationships",
    tags=["relationships"],
)

app.include_router(
    semantic_memory.router,
    prefix=f"/api/{settings.api_version}/semantic-memory",
    tags=["semantic-memory"],
)


@app.get("/", tags=["root"])
def root() -> dict:
    return {
        "service": settings.app_name,
        "version": settings.version,
        "docs": "/docs",
    }
