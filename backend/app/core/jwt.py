import logging
from datetime import datetime, timedelta, timezone

import jwt
from jwt.exceptions import ExpiredSignatureError, InvalidTokenError

from app.config import settings

logger = logging.getLogger(__name__)


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def create_access_token(user_id: str) -> str:
    now = datetime.now(timezone.utc)
    expire = now + timedelta(minutes=settings.jwt_access_token_expire_minutes)
    payload = {"sub": user_id, "exp": expire, "type": "access"}
    token = jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)
    logger.info(
        "jwt.create_access_token user_id=%s issued_at=%s expires_at=%s ttl_minutes=%d",
        user_id, now.isoformat(), expire.isoformat(), settings.jwt_access_token_expire_minutes,
    )
    return token


def create_refresh_token(user_id: str) -> str:
    """Issue a long-lived refresh token (30 days).

    Refresh tokens are signed JWTs with type='refresh'.  They are used only at
    POST /auth/refresh and must never be accepted as access tokens.
    """
    now = datetime.now(timezone.utc)
    expire = now + timedelta(days=settings.jwt_refresh_token_expire_days)
    payload = {"sub": user_id, "exp": expire, "type": "refresh"}
    token = jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)
    logger.info(
        "jwt.create_refresh_token user_id=%s issued_at=%s expires_at=%s ttl_days=%d",
        user_id, now.isoformat(), expire.isoformat(), settings.jwt_refresh_token_expire_days,
    )
    return token


def decode_access_token(token: str) -> str | None:
    """Validate an access token and return user_id (sub), or None if invalid/expired."""
    server_utc = _utc_now_iso()
    try:
        payload = jwt.decode(
            token,
            settings.jwt_secret_key,
            algorithms=[settings.jwt_algorithm],
        )
        if payload.get("type") != "access":
            logger.warning(
                "jwt.decode_access_token: wrong type '%s' server_utc=%s",
                payload.get("type"), server_utc,
            )
            return None
        user_id = payload.get("sub")
        exp = payload.get("exp")
        exp_iso = datetime.fromtimestamp(exp, tz=timezone.utc).isoformat() if exp else "N/A"
        logger.debug(
            "jwt.decode_access_token: valid user_id=%s exp=%s server_utc=%s",
            user_id, exp_iso, server_utc,
        )
        return user_id if isinstance(user_id, str) else None
    except ExpiredSignatureError:
        # Decode without verification to log the actual expiry vs. server time.
        try:
            unverified = jwt.decode(token, options={"verify_signature": False})
            raw_exp = unverified.get("exp")
            exp_iso = (
                datetime.fromtimestamp(raw_exp, tz=timezone.utc).isoformat()
                if raw_exp else "N/A"
            )
            user_id = unverified.get("sub", "unknown")
        except Exception:
            exp_iso, user_id = "N/A", "unknown"
        logger.warning(
            "jwt.decode_access_token: EXPIRED user_id=%s token_exp=%s server_utc=%s",
            user_id, exp_iso, server_utc,
        )
        return None
    except InvalidTokenError as exc:
        logger.warning(
            "jwt.decode_access_token: invalid token error_type=%s server_utc=%s",
            type(exc).__name__,
            server_utc,
        )
        return None


def decode_refresh_token(token: str) -> str | None:
    """Validate a refresh token and return user_id (sub), or None if invalid/expired."""
    server_utc = _utc_now_iso()
    try:
        payload = jwt.decode(
            token,
            settings.jwt_secret_key,
            algorithms=[settings.jwt_algorithm],
        )
        if payload.get("type") != "refresh":
            logger.warning(
                "jwt.decode_refresh_token: wrong type '%s' server_utc=%s",
                payload.get("type"), server_utc,
            )
            return None
        user_id = payload.get("sub")
        exp = payload.get("exp")
        exp_iso = datetime.fromtimestamp(exp, tz=timezone.utc).isoformat() if exp else "N/A"
        logger.debug(
            "jwt.decode_refresh_token: valid user_id=%s exp=%s server_utc=%s",
            user_id, exp_iso, server_utc,
        )
        return user_id if isinstance(user_id, str) else None
    except ExpiredSignatureError:
        try:
            unverified = jwt.decode(token, options={"verify_signature": False})
            raw_exp = unverified.get("exp")
            exp_iso = (
                datetime.fromtimestamp(raw_exp, tz=timezone.utc).isoformat()
                if raw_exp else "N/A"
            )
            user_id = unverified.get("sub", "unknown")
        except Exception:
            exp_iso, user_id = "N/A", "unknown"
        logger.warning(
            "jwt.decode_refresh_token: EXPIRED user_id=%s token_exp=%s server_utc=%s",
            user_id, exp_iso, server_utc,
        )
        return None
    except InvalidTokenError as exc:
        logger.warning(
            "jwt.decode_refresh_token: invalid token error_type=%s server_utc=%s",
            type(exc).__name__,
            server_utc,
        )
        return None
