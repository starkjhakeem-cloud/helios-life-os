"""
Profile router — manages personal information and the custom user handle.

Endpoints:
  GET   /profile               → fetch (or create) the user's profile
  PATCH /profile               → update personal information fields
  GET   /profile/user-id/check → validate and check availability of a handle
  PATCH /profile/user-id       → set or change the handle (max 1 change after initial set)

Change-once policy
──────────────────
  • Setting custom_user_id from null is the "initial setup" step — free, no slot consumed.
  • Replacing an existing handle consumes the one allowed post-setup change slot.
  • After that slot is consumed (user_id_changed=True) the handle is locked.

Structured logging
──────────────────
  Every failure logs the real exception at ERROR level before returning an HTTP response,
  so "Database unavailable" in server logs is never a silent mystery.
"""

import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError, OperationalError, ProgrammingError, SQLAlchemyError
from sqlalchemy.orm import Session

from app.core.security import hash_password, verify_password
from app.db.session import get_db
from app.dependencies.auth import get_current_user
from app.models.user import User
from app.models.user_profile import UserProfile
from app.schemas.profile import (
    ChangeEmailRequest,
    ChangePasswordRequest,
    ProfileOut,
    ProfileUpdate,
    UserIdCheckResponse,
    UserIdUpdate,
    _BLOCKED_USER_IDS,
    _USER_ID_RE,
)

logger = logging.getLogger(__name__)
router = APIRouter()
DISPLAY_NAME_MAX_POST_SETUP_CHANGES = 2


# ── Helpers ───────────────────────────────────────────────────────────────────

def _get_or_create(db: Session, user_id: str) -> UserProfile:
    """Return the user's profile row, creating it on first access."""
    profile = db.execute(
        select(UserProfile).where(UserProfile.user_id == user_id)
    ).scalar_one_or_none()
    if profile is None:
        profile = UserProfile(
            user_id=user_id,
            updated_at=datetime.now(timezone.utc),
        )
        db.add(profile)
        db.commit()
        db.refresh(profile)
    return profile


def _can_change(profile: UserProfile) -> bool:
    """True when the user may still set or change their handle."""
    # No handle yet → initial setup is always allowed.
    if profile.custom_user_id is None:
        return True
    # Handle exists but change slot not yet consumed.
    return not profile.user_id_changed


def _display_name_changes_remaining(profile: UserProfile) -> int:
    return max(
        DISPLAY_NAME_MAX_POST_SETUP_CHANGES - profile.display_name_change_count,
        0,
    )


def _normalize_optional_text(value: str | None) -> str | None:
    if value is None:
        return None
    normalized = value.strip()
    return normalized or None


def _apply_display_name_update(profile: UserProfile, value: str | None) -> None:
    new_value = _normalize_optional_text(value)
    old_value = _normalize_optional_text(profile.display_name)
    if new_value == old_value:
        profile.display_name = new_value
        return

    is_post_setup_change = old_value is not None
    if is_post_setup_change and profile.display_name_change_count >= DISPLAY_NAME_MAX_POST_SETUP_CHANGES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                "Display Name can only be changed twice after initial account setup."
            ),
        )

    now = datetime.now(timezone.utc)
    if is_post_setup_change:
        profile.display_name_change_count += 1
        profile.display_name_changed_at = now
    profile.display_name = new_value


def _to_out(p: UserProfile) -> ProfileOut:
    return ProfileOut(
        user_id=p.user_id,
        custom_user_id=p.custom_user_id,
        user_id_changed=p.user_id_changed,
        user_id_changed_at=(
            p.user_id_changed_at.isoformat() if p.user_id_changed_at else None
        ),
        can_change_user_id=_can_change(p),
        first_name=p.first_name,
        last_name=p.last_name,
        display_name=p.display_name,
        display_name_change_count=p.display_name_change_count,
        display_name_changes_remaining=_display_name_changes_remaining(p),
        can_change_display_name=_display_name_changes_remaining(p) > 0,
        display_name_changed_at=(
            p.display_name_changed_at.isoformat() if p.display_name_changed_at else None
        ),
        phone_number=p.phone_number,
        date_of_birth=p.date_of_birth,
        address_line_1=p.address_line_1,
        address_line_2=p.address_line_2,
        city=p.city,
        state=p.state,
        postal_code=p.postal_code,
        country=p.country,
        timezone=p.timezone,
        updated_at=p.updated_at.isoformat(),
    )


# ── GET /profile ──────────────────────────────────────────────────────────────

@router.get("", response_model=ProfileOut)
def get_profile(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ProfileOut:
    try:
        return _to_out(_get_or_create(db, current_user.id))
    except (OperationalError, ProgrammingError) as exc:
        logger.error(
            "get_profile: database error for user %s — %s: %s",
            current_user.id, type(exc).__name__, exc,
        )
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Unable to reach HELIOS services. Please try again.",
        )
    except SQLAlchemyError as exc:
        logger.error(
            "get_profile: unexpected database error for user %s — %s: %s",
            current_user.id, type(exc).__name__, exc,
        )
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Unable to reach HELIOS services. Please try again.",
        )


# ── PATCH /profile ────────────────────────────────────────────────────────────

@router.patch("", response_model=ProfileOut)
def update_profile(
    payload: ProfileUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ProfileOut:
    try:
        profile = _get_or_create(db, current_user.id)
        for field, val in payload.model_dump(exclude_unset=True).items():
            if field == "display_name":
                _apply_display_name_update(profile, val)
            elif isinstance(val, str):
                setattr(profile, field, _normalize_optional_text(val))
            else:
                setattr(profile, field, val)
        profile.updated_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(profile)
        return _to_out(profile)
    except HTTPException:
        db.rollback()
        raise
    except (OperationalError, ProgrammingError) as exc:
        db.rollback()
        logger.error(
            "update_profile: database error for user %s — %s: %s",
            current_user.id, type(exc).__name__, exc,
        )
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Unable to reach HELIOS services. Please try again.",
        )
    except SQLAlchemyError as exc:
        db.rollback()
        logger.error(
            "update_profile: unexpected database error for user %s — %s: %s",
            current_user.id, type(exc).__name__, exc,
        )
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Unable to reach HELIOS services. Please try again.",
        )


# ── GET /profile/user-id/check ────────────────────────────────────────────────

@router.get("/user-id/check", response_model=UserIdCheckResponse)
def check_user_id(
    value: str = Query(..., min_length=1, max_length=30),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> UserIdCheckResponse:
    """
    Validate format and check uniqueness of a prospective User ID.
    All validation errors are returned as 200 with available=False so the
    frontend can display the specific reason without treating it as a crash.
    The only non-200 response is 503 when the database itself is unreachable.
    """
    candidate = value.strip().lower()

    # ── Format checks — no database required ─────────────────────────────────
    if len(candidate) < 3:
        return UserIdCheckResponse(
            value=candidate,
            available=False,
            reason="too_short",
            message="Username must be at least 3 characters.",
        )
    if len(candidate) > 24:
        return UserIdCheckResponse(
            value=candidate,
            available=False,
            reason="too_long",
            message="Username must be 24 characters or fewer.",
        )
    if not _USER_ID_RE.match(candidate):
        return UserIdCheckResponse(
            value=candidate,
            available=False,
            reason="invalid_format",
            message=(
                "Username may only contain lowercase letters (a–z), "
                "numbers (0–9), underscores (_), and periods (.)."
            ),
        )
    if candidate in _BLOCKED_USER_IDS:
        return UserIdCheckResponse(
            value=candidate,
            available=False,
            reason="reserved",
            message="This username is reserved and cannot be used.",
        )

    # ── Uniqueness check — requires database ──────────────────────────────────
    try:
        taken_by = db.execute(
            select(UserProfile.user_id).where(
                UserProfile.custom_user_id == candidate,
                UserProfile.user_id != current_user.id,
            )
        ).scalar_one_or_none()
    except (OperationalError, ProgrammingError) as exc:
        logger.error(
            "check_user_id: database error checking '%s' for user %s — %s: %s",
            candidate, current_user.id, type(exc).__name__, exc,
        )
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=(
                "Unable to reach HELIOS services. "
                "Check your connection and try again."
            ),
        )
    except SQLAlchemyError as exc:
        logger.error(
            "check_user_id: unexpected database error checking '%s' for user %s — %s: %s",
            candidate, current_user.id, type(exc).__name__, exc,
        )
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Unable to reach HELIOS services. Please try again.",
        )

    if taken_by:
        return UserIdCheckResponse(
            value=candidate,
            available=False,
            reason="taken",
            message="This username is already taken.",
        )

    return UserIdCheckResponse(
        value=candidate,
        available=True,
        reason="available",
        message="Username is available.",
    )


# ── PATCH /profile/user-id ────────────────────────────────────────────────────

@router.patch("/user-id", response_model=ProfileOut)
def update_user_id(
    payload: UserIdUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ProfileOut:
    """
    Set or change the user's custom handle.

    Initial set (custom_user_id is null → value)  → free, no slot consumed.
    Post-setup change (non-null → new value)       → consumes the one slot;
                                                     subsequent calls are rejected.
    """
    try:
        profile = _get_or_create(db, current_user.id)

        is_change = profile.custom_user_id is not None
        if profile.custom_user_id == payload.value:
            return _to_out(profile)

        # Lock check: slot already consumed on a previous change.
        if is_change and profile.user_id_changed:
            logger.info(
                "update_user_id: user %s attempted to change locked User ID",
                current_user.id,
            )
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    "Your User ID has already been changed once. "
                    "It can only be changed one time after initial setup."
                ),
            )

        # Uniqueness check.
        taken_by = db.execute(
            select(UserProfile.user_id).where(
                UserProfile.custom_user_id == payload.value,
                UserProfile.user_id != current_user.id,
            )
        ).scalar_one_or_none()
        if taken_by:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="This username is already taken. Please choose a different one.",
            )

        # Apply the update.
        now = datetime.now(timezone.utc)
        if is_change:
            # Consuming the post-setup change slot.
            profile.user_id_changed = True
            profile.user_id_changed_at = now
            logger.info(
                "update_user_id: user %s changed handle '%s' → '%s'",
                current_user.id, profile.custom_user_id, payload.value,
            )
        else:
            logger.info(
                "update_user_id: user %s set initial handle '%s'",
                current_user.id, payload.value,
            )

        profile.custom_user_id = payload.value
        profile.updated_at = now
        db.commit()
        db.refresh(profile)
        return _to_out(profile)

    except HTTPException:
        raise  # pass through intentional HTTP errors unchanged
    except IntegrityError as exc:
        db.rollback()
        logger.error(
            "update_user_id: integrity error for user %s value '%s' — %s",
            current_user.id, payload.value, exc,
        )
        # Most likely cause: race condition — another request took the same handle.
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This username is already taken. Please choose a different one.",
        )
    except (OperationalError, ProgrammingError) as exc:
        db.rollback()
        logger.error(
            "update_user_id: database error for user %s — %s: %s",
            current_user.id, type(exc).__name__, exc,
        )
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Unable to reach HELIOS services. Please try again.",
        )
    except SQLAlchemyError as exc:
        db.rollback()
        logger.error(
            "update_user_id: unexpected database error for user %s — %s: %s",
            current_user.id, type(exc).__name__, exc,
        )
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Unable to reach HELIOS services. Please try again.",
        )


# ── POST /profile/change-email ────────────────────────────────────────────────

@router.post("/change-email", status_code=status.HTTP_204_NO_CONTENT)
def change_email(
    payload: ChangeEmailRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> None:
    """
    Update the authenticated user's email address.

    Requires the current password for identity verification.
    Rejects if the new email matches the current address.
    Rejects if the new email is already registered to another account.
    """
    if not verify_password(payload.current_password, current_user.hashed_password):
        logger.warning(
            "change_email: incorrect password attempt for user %s",
            current_user.id,
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Current password is incorrect.",
        )

    if payload.new_email == current_user.email.lower():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="New email must be different from your current address.",
        )

    taken = db.execute(
        select(User.id).where(
            User.email == payload.new_email,
            User.id != current_user.id,
        )
    ).scalar_one_or_none()
    if taken:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="That email address is already associated with another account.",
        )

    try:
        current_user.email = payload.new_email
        db.commit()
        logger.info("change_email: email updated for user %s", current_user.id)
    except (OperationalError, ProgrammingError) as exc:
        db.rollback()
        logger.error(
            "change_email: database error for user %s — %s: %s",
            current_user.id, type(exc).__name__, exc,
        )
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Unable to update email right now. Please try again.",
        )
    except SQLAlchemyError as exc:
        db.rollback()
        logger.error(
            "change_email: unexpected error for user %s — %s: %s",
            current_user.id, type(exc).__name__, exc,
        )
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Unable to update email right now. Please try again.",
        )


# ── POST /profile/change-password ────────────────────────────────────────────

@router.post("/change-password", status_code=status.HTTP_204_NO_CONTENT)
def change_password(
    payload: ChangePasswordRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> None:
    """
    Securely update the authenticated user's password.

    Verifies the current password, rejects reuse of the same password,
    then stores the new bcrypt hash.  Never logs or returns password material.
    """
    if not verify_password(payload.current_password, current_user.hashed_password):
        logger.warning(
            "change_password: incorrect current password attempt for user %s",
            current_user.id,
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Current password is incorrect.",
        )

    if verify_password(payload.new_password, current_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="New password must be different from your current password.",
        )

    try:
        current_user.hashed_password = hash_password(payload.new_password)
        db.commit()
        logger.info("change_password: password updated successfully for user %s", current_user.id)
    except (OperationalError, ProgrammingError) as exc:
        db.rollback()
        logger.error(
            "change_password: database error for user %s — %s: %s",
            current_user.id, type(exc).__name__, exc,
        )
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Unable to update password right now. Please try again.",
        )
    except SQLAlchemyError as exc:
        db.rollback()
        logger.error(
            "change_password: unexpected error for user %s — %s: %s",
            current_user.id, type(exc).__name__, exc,
        )
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Unable to update password right now. Please try again.",
        )
