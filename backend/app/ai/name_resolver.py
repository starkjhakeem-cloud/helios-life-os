from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.user import User


def resolve_ai_name(user: User, db: Session) -> str:
    """
    Returns the name HELIOS uses when addressing this user in any AI response.

    Priority: assistant_name_preference → preferred_name → display_name → first_name → user.name
    'custom' is reserved for a future phase.
    """
    from app.models.user_preferences import UserPreferences
    from app.models.user_profile import UserProfile

    prefs = db.execute(
        select(UserPreferences).where(UserPreferences.user_id == user.id)
    ).scalar_one_or_none()

    profile = db.execute(
        select(UserProfile).where(UserProfile.user_id == user.id)
    ).scalar_one_or_none()

    preference = getattr(prefs, "assistant_name_preference", None) or "display_name"

    if preference == "preferred_name" and prefs and prefs.preferred_name:
        return prefs.preferred_name
    if preference == "first_name" and profile and profile.first_name:
        return profile.first_name

    # Default: display_name, then fall through the full chain
    if profile and profile.display_name:
        return profile.display_name
    if prefs and prefs.preferred_name:
        return prefs.preferred_name
    if profile and profile.first_name:
        return profile.first_name
    return user.name
