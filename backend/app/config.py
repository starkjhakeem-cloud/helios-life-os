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

    # AI provider: "mock" (default) or "openai"
    ai_provider: str = "mock"
    # Required only when ai_provider=openai — never hardcode this value
    openai_api_key: str | None = None
    # Model used when ai_provider=openai. gpt-4o-mini is cheap and fast.
    openai_model: str = "gpt-4o-mini"

    # CORS — comma-separated list of allowed origins.
    # Default "*" is acceptable for a native mobile API (no browser same-origin
    # policy applies). Restrict this when adding a web frontend.
    # Example: CORS_ORIGINS=https://app.helios.io,https://www.helios.io
    cors_origins: str = "*"


settings = Settings()
