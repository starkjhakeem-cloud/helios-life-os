import logging
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.jwt import create_access_token, create_refresh_token, decode_refresh_token
from app.core.limiter import limiter
from app.core.security import hash_password, verify_password
from app.db.session import get_db
from app.dependencies.auth import get_current_user
from app.models.user import User
from app.schemas.auth import AuthResponse, LoginRequest, RefreshRequest, SignupRequest, UserOut

logger = logging.getLogger(__name__)
router = APIRouter()


def _auth_response(user: User, message: str) -> AuthResponse:
    """Build an AuthResponse that includes both access and refresh tokens."""
    logger.info(
        "auth.token_issued user_id=%s server_utc=%s",
        user.id, datetime.now(timezone.utc).isoformat(),
    )
    return AuthResponse(
        user=UserOut(id=user.id, name=user.name, email=user.email, created_at=user.created_at),
        access_token=create_access_token(user.id),
        refresh_token=create_refresh_token(user.id),
        message=message,
    )


@router.post("/signup", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit("5/minute")
def signup(request: Request, payload: SignupRequest, db: Session = Depends(get_db)) -> AuthResponse:
    existing = db.execute(select(User).where(User.email == payload.email)).scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered.")

    user = User(
        id=str(uuid.uuid4()),
        name=payload.name,
        email=payload.email,
        hashed_password=hash_password(payload.password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    logger.info("signup: new account created for %s", payload.email)
    return _auth_response(user, "Account created successfully.")


@router.post("/login", response_model=AuthResponse)
@limiter.limit("10/minute")
def login(request: Request, payload: LoginRequest, db: Session = Depends(get_db)) -> AuthResponse:
    server_utc = datetime.now(timezone.utc).isoformat()
    logger.info("auth.login.attempt email=%s server_utc=%s", payload.email, server_utc)
    user = db.execute(select(User).where(User.email == payload.email)).scalar_one_or_none()
    if not user or not verify_password(payload.password, user.hashed_password):
        reason = "user_not_found" if not user else "wrong_password"
        logger.warning("auth.login.failed reason=%s server_utc=%s", reason, server_utc)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password.",
        )
    logger.info("auth.login.success user_id=%s server_utc=%s", user.id, server_utc)
    return _auth_response(user, "Login successful.")


@router.post("/refresh", response_model=AuthResponse)
@limiter.limit("20/minute")
def refresh_tokens(
    request: Request,
    payload: RefreshRequest,
    db: Session = Depends(get_db),
) -> AuthResponse:
    """
    Exchange a valid refresh token for a new access token + refresh token pair.

    Tokens are rotated on every call so the client always holds the latest pair.
    The old refresh token remains technically valid until its expiry — true
    server-side invalidation requires a token allowlist table which is out of
    scope for this iteration.
    """
    server_utc = datetime.now(timezone.utc).isoformat()
    logger.info("auth.refresh.attempt server_utc=%s", server_utc)
    user_id = decode_refresh_token(payload.refresh_token)
    if not user_id:
        logger.warning("auth.refresh.failed reason=invalid_or_expired_token server_utc=%s", server_utc)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Your session has expired. Please sign in again.",
        )

    user = db.execute(select(User).where(User.id == user_id)).scalar_one_or_none()
    if not user:
        logger.warning(
            "auth.refresh.failed reason=user_not_found user_id=%s server_utc=%s",
            user_id, server_utc,
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Your session has expired. Please sign in again.",
        )

    logger.info("auth.refresh.success user_id=%s server_utc=%s", user_id, server_utc)
    return _auth_response(user, "Token refreshed.")


@router.get("/me", response_model=UserOut)
def me(current_user: User = Depends(get_current_user)) -> UserOut:
    return UserOut(
        id=current_user.id,
        name=current_user.name,
        email=current_user.email,
        created_at=current_user.created_at,
    )


@router.delete("/account", status_code=status.HTTP_204_NO_CONTENT)
def delete_account(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> None:
    """Permanently delete the authenticated user's account and all associated data."""
    logger.info("delete_account: deleting user %s", current_user.id)
    db.delete(current_user)
    db.commit()
