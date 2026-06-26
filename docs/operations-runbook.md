# HELIOS — Operations Runbook

**Phase:** 54

Procedures for operating and maintaining a running HELIOS deployment. Each section is a self-contained procedure — follow the steps in order.

---

## Runbook Index

- [Backend Restart Procedure](#backend-restart-procedure)
- [Database Restart Procedure](#database-restart-procedure)
- [Mobile Restart Procedure](#mobile-restart-procedure)
- [Common Failures and Fixes](#common-failures-and-fixes)
  - [Backend returns 503 on first authenticated request](#backend-returns-503-on-first-authenticated-request)
  - [Backend fails to start — port conflict](#backend-fails-to-start--port-conflict)
  - [Database container crashes immediately](#database-container-crashes-immediately)
  - [Alembic migration fails on startup](#alembic-migration-fails-on-startup)
  - [API container exits with non-zero code](#api-container-exits-with-non-zero-code)
  - [CORS errors in browser client](#cors-errors-in-browser-client)
  - [OpenAI requests fail with 401 or 429](#openai-requests-fail-with-401-or-429)
- [Auth Troubleshooting](#auth-troubleshooting)
  - [Signup returns 400 — email already registered](#signup-returns-400--email-already-registered)
  - [Login returns 401](#login-returns-401)
  - [Token expires during demo — 401 on authenticated endpoints](#token-expires-during-demo--401-on-authenticated-endpoints)
  - [Rate limit hit on signup or login (429)](#rate-limit-hit-on-signup-or-login-429)
  - [JWT startup warning in logs](#jwt-startup-warning-in-logs)
- [Database Troubleshooting](#database-troubleshooting)
  - [Tables missing — UndefinedTable errors](#tables-missing--undefinedtable-errors)
  - [Migration stuck or incomplete](#migration-stuck-or-incomplete)
  - [Stale alembic_version stamp](#stale-alembic_version-stamp)
  - [Database volume corrupted or full](#database-volume-corrupted-or-full)
  - [Cannot connect to managed PostgreSQL](#cannot-connect-to-managed-postgresql)
- [API Troubleshooting](#api-troubleshooting)
  - [Endpoint returns 422 Unprocessable Entity](#endpoint-returns-422-unprocessable-entity)
  - [Endpoint returns 404 on a resource that should exist](#endpoint-returns-404-on-a-resource-that-should-exist)
  - [All requests timeout (mobile or curl)](#all-requests-timeout-mobile-or-curl)
  - [Health endpoint returns 200 but data endpoints fail](#health-endpoint-returns-200-but-data-endpoints-fail)

---

## Backend Restart Procedure

### Local development (Docker Compose)

**Graceful restart (preserves database):**
```bash
cd backend
docker compose restart api
```

**Full restart (stops all services, preserves database volume):**
```bash
cd backend
docker compose down
docker compose up
```

**Full reset (destroys database — use only when starting fresh):**
```bash
cd backend
docker compose down -v
docker compose up --build
```

**Verify restart succeeded:**
```bash
curl http://localhost:8000/api/v1/health
# Expected: {"status":"ok","service":"helios-api","timestamp":"..."}
```

Check logs for clean startup:
```bash
docker compose logs api --tail=30
# Expected last lines:
# INFO  Application startup complete.
```

### Cloud deployment (Render / Railway / Fly.io)

**Render:** Navigate to the web service → Manual Deploy → Deploy latest commit, or trigger a redeploy from the Render dashboard.

**Railway:** `railway redeploy` (CLI) or push a new commit to trigger automatic deployment.

**Fly.io:** `fly deploy` from the `backend/` directory.

In all cases, the Dockerfile CMD runs `alembic upgrade head` automatically before Uvicorn starts. Migrations are applied on every deploy.

---

## Database Restart Procedure

### Local development

The database container is managed by Docker Compose and will restart automatically (`restart: unless-stopped`).

**Restart only the database service:**
```bash
cd backend
docker compose restart db
# Wait 5–10 seconds for PostgreSQL to be ready
docker compose logs db --tail=20
# Expected: "database system is ready to accept connections"
```

**If the API loses its database connection after a database restart, restart the API too:**
```bash
docker compose restart api
```

**Inspect database state:**
```bash
# List tables
docker compose exec db psql -U helios -d helios -c "\dt"

# Check current migration revision
docker compose exec api alembic current

# Count rows per table
docker compose exec db psql -U helios -d helios -c "
SELECT relname, n_live_tup
FROM pg_stat_user_tables
ORDER BY n_live_tup DESC;"
```

### Cloud deployment

Managed PostgreSQL services handle restarts automatically. If a managed database is unavailable:
1. Check the provider's status page for outages
2. Verify `DATABASE_URL` is correct and the connection string includes `?sslmode=require`
3. Confirm the backend service's IP/hostname is in the database's allowed connections list (if using allowlists)
4. Test connectivity from the backend container:
   ```bash
   # Fly.io example
   fly ssh console -a helios-api
   python3 -c "import psycopg2; psycopg2.connect('$DATABASE_URL'); print('OK')"
   ```

---

## Mobile Restart Procedure

### iOS Simulator (development)

**Restart Metro bundler:**
```bash
# In the terminal running Metro, press r
# Or kill the process and restart:
cd mobile
npx expo start --ios --clear
```

**Full simulator reset (if app is in a bad state):**
1. Simulator menu → Device → Erase All Content and Settings
2. Then: `npx expo start --ios --clear`

**Hard-close and reopen the app (without resetting):**
- In the simulator, press Home button twice to see the app switcher, swipe up on HELIOS to close, then tap the app icon to reopen
- This clears the JavaScript runtime but preserves AsyncStorage

### EAS cloud build issues

If a production or preview EAS build fails:
1. Check the build log at expo.dev/builds
2. Common causes:
   - `EXPO_PUBLIC_API_URL` not set in `eas.json` for the profile being built
   - Bundle identifier in `app.json` does not match the provisioning profile
   - Apple credentials expired — run `eas credentials` to refresh
3. Fix the cause and resubmit: `eas build --platform ios --profile <profile>`

---

## Common Failures and Fixes

### Backend returns 503 on first authenticated request

**Symptom:** `GET /health` returns 200. Signup or any authenticated endpoint returns 503.

**Root cause:** The `postgres_data` Docker volume survived a previous `docker compose down` (without `-v`). The volume contains only the `alembic_version` table with revision `006`. On startup, `alembic upgrade head` sees current == head and runs nothing. FastAPI starts. The first real query hits `UndefinedTable` — the global `SQLAlchemyError` handler converts this to a 503.

**Surgical fix (no data loss, containers stay running):**
```bash
docker compose exec db psql -U helios -d helios -c "DELETE FROM alembic_version;"
docker compose exec api alembic upgrade head
```

Verify:
```bash
docker compose exec db psql -U helios -d helios -c "\dt"
# Should list: alembic_version, users, goals, tasks, conversations,
#              conversation_messages, reminders, user_preferences
```

**Full reset fix (destroys all data):**
```bash
cd backend
docker compose down -v
docker compose up
```

---

### Backend fails to start — port conflict

**Symptom:** `docker compose up` fails with `address already in use` on port 8000 or 5432.

**Fix:**
```bash
# Find the process using the port
lsof -ti :8000   # or :5432

# Kill it
kill -9 <PID>

# Retry
docker compose up
```

If port 5432 is in use by a local PostgreSQL installation, either stop it (`brew services stop postgresql`) or change the exposed port in `docker-compose.yml` (e.g., `"5433:5432"`).

---

### Database container crashes immediately

**Symptom:** `docker compose up` starts but the `db` container exits within seconds.

**Fix — check logs:**
```bash
docker compose logs db
```

Common causes:
- **Data directory corruption:** `docker compose down -v && docker compose up`
- **Port conflict:** stop any local PostgreSQL instance, then retry
- **Insufficient disk space:** free disk space (Docker volumes need space to initialise)

---

### Alembic migration fails on startup

**Symptom:** API container logs show `alembic.util.exc.CommandError` or similar, then the container exits.

**Diagnose:**
```bash
docker compose logs api | grep -A 10 "alembic"
```

Common causes:
- `DATABASE_URL` points to a non-existent database or wrong host
- Database is not yet ready (healthcheck timing issue) — Docker Compose waits for `pg_isready` but alembic runs immediately after
- Conflicting migration state (multiple heads)

**Fix:**
```bash
# Verify database connectivity
docker compose exec api python3 -c "
from app.db.session import engine
with engine.connect() as conn:
    conn.execute(__import__('sqlalchemy').text('SELECT 1'))
print('Connected OK')
"

# If connected, check alembic state
docker compose exec api alembic current
docker compose exec api alembic heads

# If there are multiple heads, contact the developer — do not run alembic merge manually
```

---

### API container exits with non-zero code

**Symptom:** `docker compose ps` shows `api` as `Exited (1)` or similar.

**Diagnose:**
```bash
docker compose logs api --tail=50
```

Common causes:
- Python import error (dependency not installed) — run `docker compose up --build`
- Missing required environment variable — confirm `backend/.env` exists and contains `JWT_SECRET_KEY` and `DATABASE_URL`
- Syntax error in application code (if running from a working-tree bind mount)

---

### CORS errors in browser client

**Symptom:** A web browser making requests to the HELIOS API receives CORS errors.

**Fix:** CORS is a browser-only policy and does not affect the iOS app. For browser clients, set `CORS_ORIGINS` to the exact origin of the web frontend:

```bash
CORS_ORIGINS=https://your-web-app.example.com
```

Multiple origins:
```bash
CORS_ORIGINS=https://app.helios.io,https://www.helios.io
```

Restart the backend after changing the environment variable.

---

### OpenAI requests fail with 401 or 429

**Symptom:** AI endpoints return errors when `AI_PROVIDER=openai`.

**401 — Invalid API key:**
- Verify `OPENAI_API_KEY` is set in the environment (not commented out)
- Confirm the key uses the expected OpenAI secret-key prefix
- Regenerate the key at platform.openai.com if needed

**429 — Rate limit:**
- The OpenAI provider in HELIOS handles `RateLimitError` and returns a structured error response
- Wait for the rate limit window to reset (usually 60 seconds for RPM limits)
- Consider switching to `AI_PROVIDER=mock` for demos where real AI is not required

---

## Auth Troubleshooting

### Signup returns 400 — email already registered

**Cause:** An account with that email already exists.

**Options:**
1. Use a different email address for the new account
2. Log in with the existing account
3. Delete the existing account via `DELETE /api/v1/auth/account` (requires a valid token for that account)
4. If this is a demo/dev environment and you want a clean slate: `docker compose down -v && docker compose up`

---

### Login returns 401

**Cause:** Email not found or password incorrect. The API returns the same 401 for both cases (timing-safe).

**Diagnosis path:**
1. Confirm the account was created successfully (signup returned 201)
2. Confirm the email exactly matches (email is normalised to lowercase — `USER@DOMAIN.COM` and `user@domain.com` are the same)
3. Confirm the password is correct — there is no "forgot password" flow in V1

If the database was wiped (`docker compose down -v`), all accounts are deleted. Create a new account.

---

### Token expires during demo — 401 on authenticated endpoints

**Cause:** Access tokens expire after 60 minutes (configurable via `JWT_ACCESS_TOKEN_EXPIRE_MINUTES`). After expiry, every authenticated request returns 401.

**Immediate fix (development/demo):**
```bash
# In backend/.env, extend token lifetime for the demo session
JWT_ACCESS_TOKEN_EXPIRE_MINUTES=480   # 8 hours
```

Restart the API:
```bash
docker compose restart api
```

Log out and log in again in the mobile app to receive a new token with the extended lifetime.

**Permanent fix:** Implement refresh tokens (Phase 51). Until then, extend the expiry for demo sessions.

---

### Rate limit hit on signup or login (429)

**Cause:** More than 5 signup requests or 10 login requests were made from the same IP within 60 seconds.

**Fix:** Wait 60 seconds. The sliding window resets automatically.

If this happens frequently in a development environment (e.g., automated test runs), the rate limit is applied only to `/auth/signup` and `/auth/login`. Backend tests use SQLite and bypass the rate limiter by default (tests do not start the ASGI application with slowapi middleware enabled in the test harness).

---

### JWT startup warning in logs

**Symptom:** Startup logs show: `JWT_SECRET_KEY is a weak placeholder value and must not be used in production.`

**This is a warning, not an error.** The server starts and functions normally.

**Fix for local development:** Safe to ignore if running locally with `ENVIRONMENT=development`.

**Fix for any non-local environment:** Set a strong `JWT_SECRET_KEY` before deploying:
```bash
python3 -c "import secrets; print(secrets.token_hex(32))"
```

Store the output in your hosting platform's secret manager.

---

## Database Troubleshooting

### Tables missing — UndefinedTable errors

See [Backend returns 503 on first authenticated request](#backend-returns-503-on-first-authenticated-request) above. The root cause and surgical fix are described there.

**Quick check — are the tables present?**
```bash
docker compose exec db psql -U helios -d helios -c "\dt"
```

Expected output (8 rows):
```
              List of relations
 Schema |         Name          | Type  |  Owner
--------+-----------------------+-------+--------
 public | alembic_version       | table | helios
 public | conversation_messages | table | helios
 public | conversations         | table | helios
 public | goals                 | table | helios
 public | reminders             | table | helios
 public | tasks                 | table | helios
 public | user_preferences      | table | helios
 public | users                 | table | helios
```

If fewer than 8 rows, run:
```bash
docker compose exec api alembic upgrade head
```

---

### Migration stuck or incomplete

**Symptom:** `alembic upgrade head` hangs or reports an error mid-migration.

**Diagnose:**
```bash
docker compose exec api alembic current
docker compose exec api alembic history --verbose
```

**Fix — reset and rerun:**
```bash
# Nuclear option: wipe and recreate (loses all data)
docker compose down -v
docker compose up
```

**Fix — manual recovery (preserves data):**
```bash
# Connect to the database
docker compose exec db psql -U helios -d helios

# Check the current revision
SELECT * FROM alembic_version;

# Delete the stamp if incorrect
DELETE FROM alembic_version;

# Re-run migrations from the API container
docker compose exec api alembic upgrade head
```

---

### Stale alembic_version stamp

**Symptom:** `alembic current` reports the latest revision but the tables do not exist.

**Root cause:** The `postgres_data` volume was shared across a database wipe. The `alembic_version` table persists because it was in the `postgres_data` volume, but the application tables were dropped separately or the volume was partially corrupted.

**Fix:**
```bash
docker compose exec db psql -U helios -d helios -c "DELETE FROM alembic_version;"
docker compose exec api alembic upgrade head
```

---

### Database volume corrupted or full

**Symptom:** PostgreSQL logs show `could not write to file` or `no space left on device`.

**Fix — free disk space:**
1. Remove unused Docker images: `docker image prune -a`
2. Remove stopped containers: `docker container prune`
3. Remove unused volumes (not the `postgres_data` volume): `docker volume prune`

**Fix — rebuild from scratch (loses all data):**
```bash
cd backend
docker compose down -v
docker system prune -f
docker compose up --build
```

---

### Cannot connect to managed PostgreSQL

**Symptom:** API logs show `could not connect to server` or `SSL connection has been closed unexpectedly`.

**Checklist:**
- [ ] `DATABASE_URL` is correct (copy-paste from the provider dashboard, do not retype)
- [ ] `?sslmode=require` is appended to the connection string
- [ ] The backend service is on an allowed IP or the database allows all IPs (check provider firewall/allowlist settings)
- [ ] The database is in the same region as the backend service (required on some providers for internal networking)
- [ ] The database instance is running (check provider dashboard)

**Test connectivity from the container:**
```bash
# Fly.io
fly ssh console -a helios-api
python3 -c "
import os, psycopg2
conn = psycopg2.connect(os.environ['DATABASE_URL'])
print('Connection OK')
conn.close()
"
```

---

## API Troubleshooting

### Endpoint returns 422 Unprocessable Entity

**Cause:** The request body failed Pydantic validation.

**The response body contains the exact validation error:**
```json
{
  "detail": [
    {
      "type": "literal_error",
      "loc": ["body", "priority"],
      "msg": "Input should be 'low', 'medium', 'high' or 'critical'",
      "input": "MEDIUM"
    }
  ]
}
```

**Fix:** Correct the request body. Common causes:
- Enum value in wrong case (values are lowercase: `low`, `medium`, `high`, `critical`, `todo`, `in_progress`, `done`)
- Missing required field
- String too short or too long for a field with `min_length`/`max_length` constraints

---

### Endpoint returns 404 on a resource that should exist

**Cause:** Either the resource does not exist or it belongs to a different user.

HELIOS returns `404` (not `403`) when a user requests a resource belonging to another user. This is intentional — it does not reveal whether a resource exists at all.

**Fix:** Confirm the resource ID belongs to the currently authenticated user.

---

### All requests timeout (mobile or curl)

**Symptom:** Every request to the backend times out. The mobile app shows a network error. `curl` hangs.

**Fix — check backend is running:**
```bash
docker compose ps         # Is the api container running?
curl http://localhost:8000/api/v1/health   # Does it respond at all?
```

**Fix — check port binding:**
```bash
lsof -i :8000   # Should show the Docker proxy listening
```

**Fix — physical device on different network:**
If using the app on a physical device, the device must be on the same Wi-Fi network as the Mac running Docker. `localhost` on the device does not resolve to the Mac's IP. Update `EXPO_PUBLIC_API_URL` or the `BASE_URL` fallback in `mobile/src/config/api.ts` to the Mac's local IP address.

---

### Health endpoint returns 200 but data endpoints fail

This is the telltale sign of the stale Alembic version stamp issue. See [Tables missing — UndefinedTable errors](#tables-missing--undefinedtable-errors) above.

The health endpoint (`GET /api/v1/health`) does not query any application tables. It always returns 200 if the FastAPI process is running. Data endpoints (`/goals`, `/tasks`, `/auth/signup`, etc.) query the database and fail if the tables are missing.

---

## Quick Diagnostics Script

Run this from the `backend/` directory to get an instant snapshot of the local environment health:

```bash
echo "=== Docker Services ===" && docker compose ps

echo "=== API Health ===" && curl -s http://localhost:8000/api/v1/health | python3 -m json.tool 2>/dev/null || echo "NOT RESPONDING"

echo "=== Migration State ===" && docker compose exec api alembic current 2>/dev/null || echo "Cannot reach API container"

echo "=== Table Count ===" && docker compose exec db psql -U helios -d helios -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';" 2>/dev/null || echo "Cannot reach DB container"

echo "=== Recent API Logs ===" && docker compose logs api --tail=10
```
