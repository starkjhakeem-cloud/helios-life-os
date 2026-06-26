FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt requirements-test.txt ./
RUN pip install --no-cache-dir -r requirements.txt -r requirements-test.txt

# Copy application code
COPY alembic.ini .
COPY alembic/ alembic/
COPY ./app ./app

EXPOSE 8000

# Production command: run migrations then start the server without live-reload.
# docker-compose.yml overrides this with --reload for local development.
CMD ["sh", "-c", "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port 8000"]
