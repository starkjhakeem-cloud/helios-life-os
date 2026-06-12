"""
Fernet-based symmetric encryption for OAuth token storage.

Tokens are encrypted before writing to `access_token_encrypted` /
`refresh_token_encrypted` columns, and decrypted on read.  The key is a
URL-safe base64-encoded 32-byte value loaded from TOKEN_ENCRYPTION_KEY.

Generate a production key:
    python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"

IMPORTANT: If the key is lost, all stored tokens become unrecoverable —
users will need to re-authorise.  Rotate the key by re-encrypting all rows
before discarding the old key.

This module is *not* called by any mock-connect flow — it is pure
infrastructure for when real OAuth tokens are stored.
"""

from __future__ import annotations

from app.config import settings


class TokenEncryptionError(Exception):
    """
    Raised when token encryption or decryption fails due to key misconfiguration
    or an invalid ciphertext.

    Callers MUST NOT include str(exc) in API responses — the message may contain
    key metadata.  Return a generic "Token storage failed." message instead and
    log only the exception type (not the detail).
    """


def validate_key() -> str | None:
    """
    Validate TOKEN_ENCRYPTION_KEY format without performing any encryption.

    Returns:
        None  — key is absent (caller checks `is_encryption_configured()` separately)
                OR key is present and structurally valid.
        str   — key is present but invalid; the returned string is a safe
                description suitable for logging (contains no key material).

    Never raises — safe to call at startup or in health checks.
    """
    key = settings.token_encryption_key
    if not key:
        return None  # absent; handled separately via is_encryption_configured()
    try:
        from cryptography.fernet import Fernet
        Fernet(key.encode() if isinstance(key, str) else key)
        return None  # valid
    except Exception as exc:
        return f"TOKEN_ENCRYPTION_KEY has an invalid format ({type(exc).__name__})"


def _get_fernet():
    """Return a ready-to-use Fernet instance or raise TokenEncryptionError."""
    from cryptography.fernet import Fernet

    key = settings.token_encryption_key
    if not key:
        raise TokenEncryptionError(
            "TOKEN_ENCRYPTION_KEY is not configured. "
            "Generate one: python3 -c \"from cryptography.fernet import Fernet; "
            "print(Fernet.generate_key().decode())\""
        )
    try:
        return Fernet(key.encode() if isinstance(key, str) else key)
    except Exception as exc:
        raise TokenEncryptionError(
            "TOKEN_ENCRYPTION_KEY has an invalid format — "
            "generate a valid key: python3 -c \"from cryptography.fernet import Fernet; "
            "print(Fernet.generate_key().decode())\""
        ) from exc


def encrypt_token(plaintext: str) -> str:
    """
    Encrypt a plaintext token string.  Returns a URL-safe base64 ciphertext.

    Raises TokenEncryptionError if TOKEN_ENCRYPTION_KEY is absent or invalid.

    NEVER log the plaintext or ciphertext values — treat both as secrets.
    """
    return _get_fernet().encrypt(plaintext.encode()).decode()


def decrypt_token(ciphertext: str) -> str:
    """
    Decrypt a ciphertext string produced by `encrypt_token`.

    Raises:
        TokenEncryptionError: if TOKEN_ENCRYPTION_KEY is missing or invalid.
        cryptography.fernet.InvalidToken: if the ciphertext is corrupt or was
            encrypted with a different key.

    NEVER log the returned plaintext — treat it as a secret.
    """
    return _get_fernet().decrypt(ciphertext.encode()).decode()


def is_encryption_configured() -> bool:
    """Return True when TOKEN_ENCRYPTION_KEY is present and non-empty."""
    return bool(settings.token_encryption_key)
