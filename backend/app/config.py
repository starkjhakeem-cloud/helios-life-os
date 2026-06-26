from pathlib import Path

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


BACKEND_DIR = Path(__file__).resolve().parents[1]
ENV_FILE = BACKEND_DIR / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=ENV_FILE, extra="ignore")

    app_name: str = "HELIOS"
    api_version: str = "v1"
    version: str = "0.1.0"
    debug: bool = False
    environment: str = "development"
    log_level: str | None = None
    host: str = "0.0.0.0"
    port: int = 8000
    database_url: str = "postgresql://helios:helios@localhost:5432/helios"
    jwt_secret_key: str = "dev-secret-change-in-production"
    jwt_algorithm: str = "HS256"
    jwt_access_token_expire_minutes: int = 60
    jwt_refresh_token_expire_days: int = 30

    # AI provider: "openai" for production, "mock" only for tests/local demos.
    ai_provider: str = "openai"
    ai_provider_fallback_order: str = "mock,openai,anthropic"
    ai_provider_timeout_seconds: int = 30
    ai_provider_max_retries: int = 2
    # Required only when ai_provider=openai — never hardcode this value
    openai_api_key: str | None = None
    # Model used when ai_provider=openai.
    openai_model: str = "gpt-5.5"
    # Embedding model for semantic memory (Phase 3 RAG)
    openai_embedding_model: str = "text-embedding-3-small"
    # Required only when ai_provider=anthropic — never hardcode this value.
    anthropic_api_key: str | None = None
    # Model used when ai_provider=anthropic.
    anthropic_model: str = "claude-3-5-sonnet-latest"

    # CORS — comma-separated list of allowed origins.
    # Default "*" is acceptable for a native mobile API (no browser same-origin
    # policy applies). Restrict this when adding a web frontend.
    # Example: CORS_ORIGINS=https://app.helios.io,https://www.helios.io
    cors_origins: str = "*"

    # ── Google OAuth credentials ───────────────────────────────────────────────
    # Obtain from https://console.cloud.google.com/apis/credentials
    # Leave unset in development — mock connect works without these.
    # Required when the real Google OAuth flow is implemented.
    google_client_id: str | None = None
    google_client_secret: str | None = None
    # OAuth callback URI registered in Google Cloud Console.
    google_redirect_uri: str = "http://localhost:8000/api/v1/integrations/google/callback"
    # Native app deep link used after Google OAuth completes.
    google_oauth_app_redirect_uri: str = "helios://oauth/google"
    google_scopes: str = (
        "https://www.googleapis.com/auth/calendar.readonly "
        "https://www.googleapis.com/auth/gmail.readonly "
        "https://www.googleapis.com/auth/userinfo.email"
    )

    # ── Token encryption ──────────────────────────────────────────────────────
    # Fernet symmetric key used to encrypt/decrypt OAuth tokens at rest.
    # Generate: python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
    # Leave unset in development — mock connect does not store real tokens.
    # REQUIRED before any real OAuth tokens are written to the database.
    token_encryption_key: str | None = None

    @field_validator("debug", mode="before")
    @classmethod
    def normalize_debug(cls, value: object) -> object:
        if isinstance(value, str) and value.strip().lower() in {"release", "production", "prod"}:
            return False
        return value


settings = Settings()
