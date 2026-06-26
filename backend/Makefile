.PHONY: help up migrate test test-local logs

help:
	@echo "HELIOS backend development commands"
	@echo "  make up          Build and start backend + Postgres"
	@echo "  make migrate     Run Alembic migrations in the API container"
	@echo "  make test        Run the full backend pytest suite in Docker"
	@echo "  make test-local  Run pytest in the local Python 3.12 virtualenv"
	@echo "  make logs        Tail backend API logs"

up:
	docker compose up -d --build

migrate:
	docker compose exec api alembic upgrade head

test:
	docker compose up -d --build
	docker compose exec \
		-e DATABASE_URL=sqlite:////app/tests/test_helios.db \
		-e AI_PROVIDER=mock \
		api python -m pytest

test-local:
	.venv/bin/python -m pytest

logs:
	docker compose logs -f api
