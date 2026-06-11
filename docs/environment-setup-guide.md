# HELIOS — Environment Setup Guide

**Phase:** 54

Step-by-step setup instructions for every environment: local development, staging, and production. Each section is self-contained and can be followed independently.

---

## Quick Reference — Which Setup Do You Need?

| Goal | Section |
|---|---|
| Run HELIOS locally for development or demo | [Local Development](#local-development) |
| Deploy to a cloud host for the first time | [Staging Environment](#staging-environment) |
| Deploy for a production audience | [Production Environment](#production-environment) |
| Just need the variable list | [Environment Variables Reference](#environment-variables-reference) |

---

## Prerequisites (All Environments)

### For local development

| Tool | Version | Install |
|---|---|---|
| Docker Desktop | Latest stable | [docker.com/products/docker-desktop](https://www.docker.com/products/docker-desktop) |
| Node.js | 20+ | [nodejs.org](https://nodejs.org) |
| Xcode (iOS Simulator) | 16+ | Mac App Store |
| Git | Any | Pre-installed on macOS |

### For staging and production (additional)

| Tool | Version | Install |
|---|---|---|
| EAS CLI | Latest | `npm install -g eas-cli` |
| Expo account | Free | [expo.dev](https://expo.dev) |
| Hosting platform account | — | Render, Railway, or Fly.io |

---

## Local Development

This is the standard setup for running HELIOS on your own machine. All services run in Docker.

### 1. Clone the repository

```bash
git clone <repo-url>
cd helios-life-os
```

### 2. Configure the backend environment

```bash
cd backend
cp .env.example .env
```

Open `backend/.env` and set a development JWT secret. The placeholder value (`dev-secret-change-in-production`) will trigger a startup warning but the server will still start. For local use it is fine to use any non-empty value:

```bash
# Option A — use any local value for development
JWT_SECRET_KEY=local-dev-only-not-for-production

# Option B — generate a proper key (recommended even for local)
JWT_SECRET_KEY=$(python3 -c "import secrets; print(secrets.token_hex(32))")
```

Leave all other variables in `.env` at their defaults for local development. The `DATABASE_URL` is overridden by Docker Compose to use the internal `db` service hostname.

**Full local `.env` contents (safe placeholder — fill in real values before any non-local use):**

```ini
APP_NAME=HELIOS
API_VERSION=v1
VERSION=0.1.0
DEBUG=false
ENVIRONMENT=development
HOST=0.0.0.0
PORT=8000

# Overridden by docker-compose.yml; leave as-is for local Docker
DATABASE_URL=postgresql://helios:helios@db:5432/helios

# Replace with a real value — never leave this as the placeholder in any deployment
JWT_SECRET_KEY=<your-local-dev-secret>
JWT_ALGORITHM=HS256
JWT_ACCESS_TOKEN_EXPIRE_MINUTES=60

CORS_ORIGINS=*

# AI provider: "mock" requires no external calls; "openai" requires OPENAI_API_KEY
AI_PROVIDER=mock
# OPENAI_API_KEY=sk-...
# OPENAI_MODEL=gpt-4o-mini
```

### 3. Start the backend

```bash
cd backend
docker compose up --build
```

Docker Compose starts two services:
- `db` — PostgreSQL 16 on `localhost:5432`
- `api` — FastAPI on `localhost:8000` (with `--reload` for live code changes)

The API service waits for the database health check before starting, then runs `alembic upgrade head` automatically. All 6 migrations apply on the first run.

**Expected log output (in order):**
```
db    | database system is ready to accept connections
api   | INFO  [alembic.runtime.migration] Running upgrade  -> 001, ...
api   | INFO  [alembic.runtime.migration] Running upgrade 001 -> 002, ...
...   (migrations 003–006)
api   | INFO     Application startup complete.
```

**Verify:**
```bash
curl http://localhost:8000/api/v1/health
# {"status":"ok","service":"helios-api","timestamp":"..."}
```

Interactive API docs: http://localhost:8000/docs

### 4. Configure the mobile environment

```bash
cd mobile
npm install
```

No `.env` file is required for local development — the app connects to `http://localhost:8000` automatically when `__DEV__ === true`.

If you need to override the API URL in development (for example, testing against a staging backend):

```bash
cd mobile
cp .env.example .env
# Edit .env:
# EXPO_PUBLIC_API_URL=https://your-staging-api.example.com
```

### 5. Start the mobile app

```bash
cd mobile
npx expo start --ios --clear
```

The `--clear` flag clears the Metro bundler cache. It is recommended on first run and after any dependency changes.

Press `i` in the Metro terminal to open the app in the iOS Simulator (Xcode must be installed).

**Testing on a physical device:** The device must be on the same Wi-Fi network as your Mac. Find your machine's local IP (`ipconfig getifaddr en0`) and update the `BASE_URL` fallback in `mobile/src/config/api.ts`, or set `EXPO_PUBLIC_API_URL` in `mobile/.env` to `http://<machine-ip>:8000`.

### 6. Verify the full stack

1. The iOS Simulator shows the HELIOS login screen
2. Create a new account via SIGN UP
3. The app navigates to the Home screen with live data
4. `curl http://localhost:8000/api/v1/health` returns `{"status":"ok"}`

### 7. Stop the backend

```bash
cd backend
docker compose down        # stops containers, preserves database volume
docker compose down -v     # stops containers AND deletes database (clean slate)
```

---

## Staging Environment

A staging environment mirrors production but uses test data and does not serve real users. Deploy here first to confirm the production path works before any public release.

### Backend — Render (example)

1. **Create the PostgreSQL database first.** On Render: New → PostgreSQL. Copy the internal connection string.

2. **Create the web service.** On Render: New → Web Service → connect GitHub repo. Set the root directory to `backend/`.

3. **Set environment variables** in the Render dashboard (Settings → Environment):

   | Variable | Staging value |
   |---|---|
   | `DATABASE_URL` | Internal PostgreSQL URL from step 1 |
   | `JWT_SECRET_KEY` | Generate: `python3 -c "import secrets; print(secrets.token_hex(32))"` |
   | `DEBUG` | `false` |
   | `ENVIRONMENT` | `staging` |
   | `CORS_ORIGINS` | `*` |
   | `AI_PROVIDER` | `mock` |

4. **Deploy.** Render builds the Docker image and starts the container. Migrations run automatically.

5. **Verify:**
   ```bash
   curl https://your-staging-service.onrender.com/api/v1/health
   ```

### Mobile — staging build

Set the staging API URL in `eas.json`:

```json
{
  "build": {
    "preview": {
      "distribution": "internal",
      "env": {
        "EXPO_PUBLIC_API_URL": "https://your-staging-service.onrender.com"
      }
    }
  }
}
```

Build:
```bash
cd mobile
eas build --platform ios --profile preview
```

---

## Production Environment

Production uses a strong `JWT_SECRET_KEY`, a managed PostgreSQL instance with SSL, `DEBUG=false`, and the real backend URL baked into the EAS production build.

### Backend

All steps are the same as staging with these differences:

| Variable | Production value |
|---|---|
| `DATABASE_URL` | `postgresql://USER:PASS@HOST:5432/DB?sslmode=require` |
| `JWT_SECRET_KEY` | Fresh cryptographically strong value — not reused from staging |
| `DEBUG` | `false` (mandatory) |
| `ENVIRONMENT` | `production` |
| `CORS_ORIGINS` | `*` for mobile-only API; restrict if adding a web frontend |
| `AI_PROVIDER` | `openai` (if using real GPT) or `mock` |
| `OPENAI_API_KEY` | From secret manager (only if `AI_PROVIDER=openai`) |

**Critical:** Set each secret in your hosting platform's secret manager, not in the repository or a committed `.env` file. Never reuse `JWT_SECRET_KEY` between environments.

### Database — SSL requirement

All managed PostgreSQL providers require SSL. Append `?sslmode=require` to the connection string:

```
postgresql://USER:PASSWORD@HOST:5432/DBNAME?sslmode=require
```

psycopg2 and SQLAlchemy pass this through correctly. No code changes are needed.

### Mobile production build

1. Update `EXPO_PUBLIC_API_URL` in `eas.json` (production profile) to the live backend HTTPS URL.

2. Update `bundleIdentifier` in `mobile/app.json` from `com.helios.app` to your registered App ID.

3. Build:
   ```bash
   cd mobile
   eas build --platform ios --profile production
   ```

4. The built `.ipa` can be submitted to TestFlight or the App Store via `eas submit --platform ios`.

---

## Environment Variables Reference

### Backend — complete variable list

| Variable | Required | Default | Description |
|---|---|---|---|
| `DATABASE_URL` | **Yes** | `postgresql://helios:helios@db:5432/helios` | PostgreSQL connection string. Append `?sslmode=require` for managed services. |
| `JWT_SECRET_KEY` | **Yes** | `dev-secret-change-in-production` | HS256 signing key. Must be random and secret. Startup warning if placeholder detected. |
| `JWT_ALGORITHM` | No | `HS256` | JWT signing algorithm. |
| `JWT_ACCESS_TOKEN_EXPIRE_MINUTES` | No | `60` | Token lifetime in minutes. |
| `DEBUG` | No | `false` | Re-raises unhandled exceptions. Never `true` in production. |
| `ENVIRONMENT` | No | `development` | Environment label. Used in startup logs. |
| `HOST` | No | `0.0.0.0` | Uvicorn bind address. |
| `PORT` | No | `8000` | Uvicorn port. |
| `CORS_ORIGINS` | No | `*` | Comma-separated allowed origins. `*` is safe for mobile-only APIs. |
| `AI_PROVIDER` | No | `mock` | `mock` for deterministic responses; `openai` for real GPT. |
| `OPENAI_API_KEY` | Conditional | Not set | Required only when `AI_PROVIDER=openai`. |
| `OPENAI_MODEL` | No | `gpt-4o-mini` | OpenAI model name. Only used when `AI_PROVIDER=openai`. |
| `APP_NAME` | No | `HELIOS` | Application name in logs and API docs title. |
| `API_VERSION` | No | `v1` | API version prefix (`/api/v1`). |
| `VERSION` | No | `0.1.0` | Application version number. |

### Mobile — build-time variables

| Variable | Required | Description |
|---|---|---|
| `EXPO_PUBLIC_API_URL` | Yes (non-dev builds) | Full HTTPS URL of the backend API. Baked into the bundle by EAS at build time. In `__DEV__` builds, ignored — app connects to `http://localhost:8000`. |

### Variable injection by environment

| Variable | Local Dev | Staging | Production |
|---|---|---|---|
| `DATABASE_URL` | Docker Compose override (`db:5432`) | Platform environment | Platform secret manager |
| `JWT_SECRET_KEY` | `.env` file (local, not committed) | Platform environment | Platform secret manager |
| `DEBUG` | `.env` file | Platform environment | Platform environment (`false`) |
| `OPENAI_API_KEY` | `.env` file (optional) | Platform environment | Platform secret manager |
| `EXPO_PUBLIC_API_URL` | Not set (`localhost:8000` used) | `eas.json` preview profile | `eas.json` production profile |

---

## Docker Startup Reference

### Development (docker-compose.yml)
```bash
cd backend
docker compose up --build     # Build image and start all services
docker compose up             # Start with existing image (faster)
docker compose up -d          # Start in background (detached)
docker compose logs -f api    # Tail API logs
docker compose down           # Stop and remove containers (keep volume)
docker compose down -v        # Stop and remove containers AND volume (clean slate)
```

### Container inspection
```bash
docker compose ps                          # Service status
docker compose exec api alembic current   # Current migration revision
docker compose exec api alembic history   # Full migration history
docker compose exec db psql -U helios -d helios -c "\dt"  # List tables
```

### Production image test (verify the Dockerfile CMD locally)
```bash
cd backend
docker build -t helios-api:test .
docker run --rm \
  -e DATABASE_URL="postgresql://helios:helios@host.docker.internal:5432/helios" \
  -e JWT_SECRET_KEY="$(python3 -c "import secrets; print(secrets.token_hex(32))")" \
  -p 8000:8000 \
  helios-api:test
```

---

## Mobile Startup Reference

```bash
cd mobile

# Install dependencies
npm install

# Start with iOS Simulator
npx expo start --ios

# Start with Metro cache cleared (use after npm install or dependency changes)
npx expo start --ios --clear

# Run tests
npm test -- --runInBand

# TypeScript type check
npx tsc --noEmit

# EAS cloud builds (requires eas login and eas build:configure)
eas build --platform ios --profile development
eas build --platform ios --profile preview
eas build --platform ios --profile production

# Submit to App Store Connect / TestFlight
eas submit --platform ios --profile production
```

---

## Secrets Checklist

Before any non-local deployment, verify all of the following.

| Secret | Where to set | Never do this |
|---|---|---|
| `JWT_SECRET_KEY` | Platform secret manager | Commit to git; use a placeholder in production |
| `DATABASE_URL` | Platform secret manager | Hardcode in source; use `localhost` in production |
| `OPENAI_API_KEY` | Platform secret manager | Commit to git; log to console |
| `EXPO_PUBLIC_API_URL` | `eas.json` (not in repo) | Hardcode `localhost` in a production build |

The `backend/.env` file is in `.gitignore` and must never be committed. The committed template is `backend/.env.example` — it contains only placeholder values and comments.
