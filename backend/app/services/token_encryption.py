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


def _get_fernet():
    from cryptography.fernet import Fernet

    key = settings.token_encryption_key
    if not key:
        raise RuntimeError(
            "TOKEN_ENCRYPTION_KEY is not configured. "
            "Generate one: python3 -c \"from cryptography.fernet import Fernet; "
            "print(Fernet.generate_key().decode())\""
        )
    try:
        return Fernet(key.encode() if isinstance(key, str) else key)
    except Exception as exc:
        raise RuntimeError(
            f"TOKEN_ENCRYPTION_KEY is invalid ({exc}). "
            "Generate a valid key: python3 -c \"from cryptography.fernet import Fernet; "
            "print(Fernet.generate_key().decode())\""
        ) from exc


def encrypt_token(plaintext: str) -> str:
    """Encrypt a plaintext token.  Returns a URL-safe base64 ciphertext string."""
    return _get_fernet().encrypt(plaintext.encode()).decode()


def decrypt_token(ciphertext: str) -> str:
    """
    Decrypt a ciphertext string produced by `encrypt_token`.

    Raises:
        RuntimeError: if TOKEN_ENCRYPTION_KEY is missing or invalid.
        cryptography.fernet.InvalidToken: if the ciphertext is corrupt or
            was encrypted with a different key.
    """
    return _get_fernet().decrypt(ciphertext.encode()).decode()


def is_encryption_configured() -> bool:
    """Return True when TOKEN_ENCRYPTION_KEY is present and non-empty."""
    return bool(settings.token_encryption_key)
