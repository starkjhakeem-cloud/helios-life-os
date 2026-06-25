import os
from pathlib import Path

os.environ.setdefault("DATABASE_URL", f"sqlite:///{Path(__file__).resolve().parent / 'test_helios.db'}")
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key")
os.environ.setdefault("AI_PROVIDER", "mock")

import pytest
from fastapi.testclient import TestClient

import app.models.conversation
import app.models.daily_snapshot
import app.models.goal
import app.models.reminder
import app.models.task
import app.models.user
import app.models.user_preferences
from app.db.base import Base
from app.db.session import SessionLocal, engine
from app.main import app

_IS_SQLITE = str(engine.url).startswith("sqlite")


@pytest.fixture(scope="session", autouse=True)
def initialize_database():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    yield
    # Teardown: only fully clean up for SQLite (the disposable test file).
    # When running against Postgres the schema is managed by Alembic migrations;
    # dropping tables here would leave the database unusable until migrations are
    # re-applied, which silently breaks the running API server.
    if _IS_SQLITE:
        Base.metadata.drop_all(bind=engine)
        db_path = Path(__file__).resolve().parent / "test_helios.db"
        if db_path.exists():
            db_path.unlink()


@pytest.fixture(autouse=True)
def clean_database():
    with engine.begin() as conn:
        for table in reversed(Base.metadata.sorted_tables):
            conn.execute(table.delete())
    yield
    with engine.begin() as conn:
        for table in reversed(Base.metadata.sorted_tables):
            conn.execute(table.delete())


@pytest.fixture(scope="session")
def client() -> TestClient:
    with TestClient(app) as client_instance:
        yield client_instance


@pytest.fixture
def db():
    session = SessionLocal()
    try:
        yield session
    finally:
        session.rollback()
        session.close()
