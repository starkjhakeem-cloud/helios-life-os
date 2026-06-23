from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

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

    # AI provider: "mock" (default), "openai", or "anthropic"
    ai_provider: str = "mock"
    # Required only when ai_provider=openai — never hardcode this value
    openai_api_key: str | None = None
    # Model used when ai_provider=openai. gpt-4o-mini is cheap and fast.
    openai_model: str = "gpt-4o-mini"
    # Required only when ai_provider=anthropic — never hardcode this value
    anthropic_api_key: str | None = None
    # Model used when ai_provider=anthropic.
    anthropic_model: str = "claude-sonnet-4-6"

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
    # Deep-link URI registered in Google Cloud Console for the mobile app.
    google_redirect_uri: str = "helios://oauth/callback/google"

    # ── Token encryption ──────────────────────────────────────────────────────
    # Fernet symmetric key used to encrypt/decrypt OAuth tokens at rest.
    # Generate: python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
    # Leave unset in development — mock connect does not store real tokens.
    # REQUIRED before any real OAuth tokens are written to the database.
    token_encryption_key: str | None = None


settings = Settings()
