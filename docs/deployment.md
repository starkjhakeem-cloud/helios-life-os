# HELIOS — Deployment Guide

This document covers everything needed to move HELIOS from local Docker development to a production-hosted environment. No deployment is required to follow this guide — it is a readiness reference.

---

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Pre-Deployment Checklist](#pre-deployment-checklist)
- [Environment Variables](#environment-variables)
- [Backend Hosting Options](#backend-hosting-options)
- [Database Hosting Options](#database-hosting-options)
- [Mobile Build (Expo / EAS)](#mobile-build-expo--eas)
- [Production Docker Image](#production-docker-image)
- [HTTPS and Certificates](#https-and-certificates)
- [CORS Configuration](#cors-configuration)
- [Post-Deployment Verification](#post-deployment-verification)

---

## Architecture Overview

```
iOS / Android App (EAS Build)
        │  HTTPS
        │  Authorization: Bearer <JWT>
        ▼
FastAPI Backend (Docker container)
        │  SQLAlchemy / psycopg2
        ▼
PostgreSQL (managed service)
```

The backend is a stateless FastAPI container — it can be deployed to any platform that runs Docker. The database should be a managed PostgreSQL service to get automatic backups, connection pooling, and high availability.

---

## Pre-Deployment Checklist

### Secrets

- [ ] `JWT_SECRET_KEY` — generate a cryptographically strong value:
  ```bash
  python3 -c "import secrets; print(secrets.token_hex(32))"
  ```
  Store it in your hosting platform's secret/environment manager. Never commit it.

- [ ] `DATABASE_URL` — set to the managed PostgreSQL connection string, not `localhost`.

- [ ] `OPENAI_API_KEY` — only needed if `AI_PROVIDER=openai`. Add to secret manager, not to the image or repository.

### Security

- [ ] `DEBUG=false` in all non-local environments.
- [ ] `CORS_ORIGINS` — restrict to your actual origins once you have a web frontend. For a mobile-only API, `*` is acceptable.
- [ ] `JWT_ACCESS_TOKEN_EXPIRE_MINUTES` — consider increasing to `10080` (7 days) if users complain about being logged out, or implementing refresh tokens.

### Infrastructure

- [ ] PostgreSQL managed instance provisioned (see [Database Hosting Options](#database-hosting-options)).
- [ ] Backend service deployed and accessible over HTTPS.
- [ ] Backend URL confirmed before building the Expo production binary.

---

## Environment Variables

All backend config is loaded from environment variables (or `.env` at the project root in local dev). Copy `backend/.env.example` to `backend/.env` to get started locally.

| Variable | Required | Production value | Description |
|---|---|---|---|
| `DATABASE_URL` | Yes | managed PostgreSQL URL | `postgresql://user:pass@host:5432/dbname` |
| `JWT_SECRET_KEY` | Yes | `secrets.token_hex(32)` | HS256 signing key — must be random and secret |
| `JWT_ALGORITHM` | No | `HS256` | Signing algorithm |
| `JWT_ACCESS_TOKEN_EXPIRE_MINUTES` | No | `60` | Token lifetime in minutes |
| `DEBUG` | No | `false` | Never `true` in production |
| `CORS_ORIGINS` | No | `*` or specific origins | Comma-separated: `https://app.helios.io` |
| `AI_PROVIDER` | No | `mock` or `openai` | Provider selection |
| `OPENAI_API_KEY` | Conditional | from secret manager | Required when `AI_PROVIDER=openai` |
| `OPENAI_MODEL` | No | `gpt-4o-mini` | Model to use with OpenAI provider |

### Mobile environment variables

The Expo app uses `EXPO_PUBLIC_*` variables baked into the bundle at build time.

| Variable | Required | Description |
|---|---|---|
| `EXPO_PUBLIC_API_URL` | Yes (prod builds) | Full HTTPS URL of the backend API, e.g. `https://api.helios.io` |

Set this in your EAS build profile (`eas.json`) or CI environment — not in the source repository.

---

## Backend Hosting Options

All options below support Docker deployments. The backend is a single container with a PostgreSQL dependency.

### Render

1. Create a new **Web Service** → **Deploy from Docker**.
2. Set build context to `backend/`.
3. Set environment variables in the Render dashboard (Settings → Environment).
4. The free tier supports one web service + one PostgreSQL instance.

```
Service type:  Web Service
Region:        Choose closest to users
Instance type: Starter (free) or Standard
Build command: (automatic — uses Dockerfile)
Start command: (automatic — uses Dockerfile CMD)
```

Render automatically provisions TLS. Set `DATABASE_URL` to the Render PostgreSQL internal URL.

### Railway

1. Create a new project → **Deploy from GitHub Repo**.
2. Select the `backend/` directory as the root.
3. Railway auto-detects the Dockerfile.
4. Add a PostgreSQL plugin to the same project.
5. Railway injects `DATABASE_URL` automatically from the plugin.

```bash
# Deploy via Railway CLI
railway login
railway init
railway up
```

### Fly.io

1. Install `flyctl`: `brew install flyctl`
2. From `backend/`, run `fly launch` — Fly detects the Dockerfile.
3. Create a managed Postgres cluster: `fly postgres create`
4. Attach: `fly postgres attach --app <app-name> <postgres-app-name>`
5. Fly injects `DATABASE_URL` as a secret automatically.

```bash
cd backend
fly launch --name helios-api --region ord
fly secrets set JWT_SECRET_KEY=$(python3 -c "import secrets; print(secrets.token_hex(32))")
fly deploy
```

## Backend Deployment Steps

1. Provision a managed PostgreSQL service with a strong username and password.
2. Configure platform secrets for `DATABASE_URL`, `JWT_SECRET_KEY`, and `ENVIRONMENT=production`.
3. Set `DEBUG=false` and `CORS_ORIGINS` explicitly for your production client origins.
4. Deploy the backend container using your chosen host.
5. Verify connectivity with `/api/v1/health` and `/api/v1/version`.
6. Set `EXPO_PUBLIC_API_URL` in the mobile build environment before producing a release binary.

## Database Deployment Steps

1. Choose a managed Postgres provider: Supabase, Neon, Railway PostgreSQL, or Render PostgreSQL.
2. Create the database and capture the connection string.
3. Ensure the URI includes `?sslmode=require` for secure connections.
4. Set `DATABASE_URL` to that URI in your backend host environment.
5. Confirm the backend can connect before building the mobile app.

### Production PostgreSQL guidance

- **Supabase**: good free tier and easy Postgres connection strings.
- **Neon**: serverless Postgres with branching support.
- **Railway PostgreSQL**: simplest when the backend is deployed on Railway.
- **Render PostgreSQL**: a good match when the backend uses Render.

Use a managed database rather than running Postgres in the backend container for production.

---

## Database Hosting Options

Use a managed PostgreSQL service — never run a stateful database in the same container as the API in production.

| Service | Free Tier | Notes |
|---|---|---|
| **Supabase** | 500 MB, 2 projects | Generous free tier; direct Postgres connection string available |
| **Neon** | 512 MB, branching | Serverless Postgres; excellent for dev/staging |
| **Railway** | 1 GB included | Simplest if backend is also on Railway |
| **Render** | 90-day free trial | Good if backend is on Render |
| **PlanetScale** | MySQL only | Not compatible — HELIOS requires PostgreSQL |

### Connection string format

```
postgresql://USER:PASSWORD@HOST:PORT/DBNAME?sslmode=require
```

> Always add `?sslmode=require` for managed services. Supabase and Neon require SSL by default.

---

## Mobile Build (Expo / EAS)

HELIOS uses Expo, so production mobile builds go through **EAS Build**.

### One-time setup

```bash
npm install -g eas-cli
eas login
eas build:configure   # creates eas.json
```

### Configure the production API URL

In `eas.json`, set the environment variable for the production profile:

```json
{
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal"
    },
    "production": {
      "env": {
        "EXPO_PUBLIC_API_URL": "https://your-api.your-domain.com"
      }
    }
  }
}
```

### Build for iOS

```bash
eas build --platform ios --profile production
```

This produces an `.ipa` ready for App Store Connect or ad-hoc distribution. The `EXPO_PUBLIC_API_URL` is baked into the bundle at build time — no runtime configuration needed.

### Local production build check

To verify the production URL is picked up before submitting an EAS build:

```bash
EXPO_PUBLIC_API_URL=https://your-api.com npx expo export
```

---

## Production Docker Image

The `Dockerfile` is production-ready. The CMD runs Alembic migrations then starts Uvicorn without live-reload:

```dockerfile
CMD ["sh", "-c", "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port 8000"]
```

The `docker-compose.yml` in `backend/` overrides this with `--reload` for local development only. A production deployment uses the Dockerfile CMD directly.

### Scaling workers

For higher traffic, pass `--workers N` (one worker per CPU core is a common rule of thumb):

```bash
uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 4
```

> Note: `--reload` and `--workers` cannot be used together. Never use `--reload` in production.

### Health check

The `/api/v1/health` endpoint returns 200 and is suitable as a health probe:

```
GET /api/v1/health
→ {"status": "ok", "service": "HELIOS", "timestamp": "..."}
```

---

## HTTPS and Certificates

- **Render, Railway, Fly.io** — TLS is provisioned automatically for your app domain.
- **Self-hosted** — run the backend behind nginx or Caddy as a reverse proxy. Example Caddy config:

```
api.helios.io {
    reverse_proxy localhost:8000
}
```

Caddy handles Let's Encrypt certificate issuance and renewal automatically.

The mobile app always connects over HTTPS in production (`__DEV__ === false`). HTTP connections to non-localhost hosts will be rejected by iOS ATS (App Transport Security) unless an exception is added to `app.json` — do not add such exceptions for production.

---

## CORS Configuration

CORS is a browser security policy — it does **not** affect native iOS/Android apps. The current `CORS_ORIGINS=*` is safe for a mobile-only API.

When adding a web frontend (Next.js, etc.), restrict CORS to your actual domain:

```bash
# In your hosting platform's environment settings:
CORS_ORIGINS=https://app.helios.io,https://www.helios.io
```

The backend parses `CORS_ORIGINS` as a comma-separated list, so multiple origins are supported.

---

## Post-Deployment Verification

After deploying the backend, run these checks before building the mobile binary:

```bash
# 1. Health check
curl https://your-api.your-domain.com/api/v1/health

# 2. Confirm migrations ran (should see "ok" status)
curl https://your-api.your-domain.com/api/v1/version

# 3. Confirm auth endpoint is protected
curl https://your-api.your-domain.com/api/v1/goals
# → {"detail": "Not authenticated."}

# 4. Register a test user and confirm end-to-end auth
curl -X POST https://your-api.your-domain.com/api/v1/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"name":"Test","email":"test@example.com","password":"strongpassword"}'
# → {"user": {...}, "access_token": "..."}
```

Once these pass, set `EXPO_PUBLIC_API_URL` to your backend URL and run the EAS production build.

---

## Rollback and Troubleshooting

### Rollback
If a deployment causes issues, roll back to the last known-good release in your hosting platform.
- Render: redeploy the previous service revision.
- Railway: use `railway deploy` with the previous commit or revert the release.
- Fly.io: run `fly deploy --rollback` or deploy an earlier image.

### Troubleshooting checklist
- `DEBUG=false` is required in production; if errors are opaque, temporarily enable debug only in a staging environment.
- `DATABASE_URL` must use a managed PostgreSQL host, not `localhost`.
- `JWT_SECRET_KEY` must be non-empty and strong; weak placeholders trigger a startup warning.
- If OpenAI responses fail, verify `AI_PROVIDER=openai` and `OPENAI_API_KEY` are both set.
- If CORS errors appear in a browser client, confirm `CORS_ORIGINS` includes the exact request origin.
- Use `/api/v1/health` and `/api/v1/version` as the first verification endpoints after each deployment.
