"""Global formatting safeguards for user-owned display names."""

import re
from typing import Any


_APPENDED_PUNCTUATION = r"[ \t]*[.!?,:;—–-]+"


def preserve_display_name(text: str, display_name: str) -> str:
    """
    Remove punctuation concatenated after an exact stored display name.

    Punctuation that is already part of ``display_name`` is preserved because
    the replacement always writes the original stored value back verbatim.
    """
    if not text or not display_name:
        return text
    pattern = re.compile(re.escape(display_name) + _APPENDED_PUNCTUATION)
    return pattern.sub(display_name, text)


def enforce_name_formatting(value: Any, display_name: str) -> Any:
    """Recursively apply the display-name invariant to structured AI output."""
    if isinstance(value, str):
        return preserve_display_name(value, display_name)
    if isinstance(value, list):
        return [enforce_name_formatting(item, display_name) for item in value]
    if isinstance(value, dict):
        return {
            key: enforce_name_formatting(item, display_name)
            for key, item in value.items()
        }
    return value
