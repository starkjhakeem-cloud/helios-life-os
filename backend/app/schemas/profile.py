import re

from pydantic import BaseModel, Field, field_validator

_USER_ID_RE = re.compile(r"^[a-z0-9_.]{3,24}$")

_BLOCKED_USER_IDS = {
    "admin", "helios", "root", "system", "null", "undefined",
    "test", "user", "api", "support", "superuser", "moderator",
    "official", "staff", "info", "help", "me", "about", "login",
    "signup", "register", "account", "settings", "profile",
}


class ProfileOut(BaseModel):
    user_id: str
    custom_user_id: str | None

    # False  → change slot available (either initial set or change not yet used)
    # True   → locked, one post-setup change has been consumed
    user_id_changed: bool
    user_id_changed_at: str | None

    # Convenience flag derived from the two fields above:
    #   True  when custom_user_id is None (initial set still pending)
    #     or  when custom_user_id is set but user_id_changed is False (change available)
    #   False when custom_user_id is set AND user_id_changed is True (locked)
    can_change_user_id: bool

    first_name: str | None
    last_name: str | None
    display_name: str | None
    phone_number: str | None
    date_of_birth: str | None
    address_line_1: str | None
    address_line_2: str | None
    city: str | None
    state: str | None
    postal_code: str | None
    country: str | None
    timezone: str | None
    updated_at: str

    model_config = {"from_attributes": True}


class ProfileUpdate(BaseModel):
    first_name: str | None = Field(default=None, max_length=100)
    last_name: str | None = Field(default=None, max_length=100)
    display_name: str | None = Field(default=None, max_length=200)
    phone_number: str | None = Field(default=None, max_length=30)
    date_of_birth: str | None = Field(default=None, max_length=10)
    address_line_1: str | None = Field(default=None, max_length=200)
    address_line_2: str | None = Field(default=None, max_length=200)
    city: str | None = Field(default=None, max_length=100)
    state: str | None = Field(default=None, max_length=100)
    postal_code: str | None = Field(default=None, max_length=20)
    country: str | None = Field(default=None, max_length=100)
    timezone: str | None = Field(default=None, max_length=60)


class UserIdUpdate(BaseModel):
    value: str = Field(..., min_length=1, max_length=30)

    @field_validator("value")
    @classmethod
    def validate_user_id(cls, v: str) -> str:
        v = v.strip().lower()
        if len(v) < 3:
            raise ValueError("User ID must be at least 3 characters.")
        if len(v) > 24:
            raise ValueError("User ID must be 24 characters or fewer.")
        if not _USER_ID_RE.match(v):
            raise ValueError(
                "User ID may only contain lowercase letters, numbers, "
                "underscores, and periods."
            )
        if v in _BLOCKED_USER_IDS:
            raise ValueError("This User ID is reserved and cannot be used.")
        return v


class UserIdCheckResponse(BaseModel):
    value: str
    available: bool
    # One of: "available" | "taken" | "invalid_format" | "too_short" |
    #         "too_long" | "reserved" | "db_error"
    reason: str
    message: str
