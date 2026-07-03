# HELIOS — Deployment Readiness Report

**Phase:** 54 | **Date:** 2026-06-10 | **Status:** Staging-ready / Demo-ready

This report assesses HELIOS against the criteria required to deploy to a staging or production-equivalent environment. It is an honest assessment — items that are not yet complete are listed as such.

---

## Architecture Summary

HELIOS is a three-tier system:

```
iOS Mobile App (React Native / Expo SDK 55)
    │  HTTPS (HTTP in local dev)
    │  Authorization: Bearer <JWT>
    ▼
FastAPI Backend (Python 3.12 / Docker)
    │  SQLAlchemy 2.0 / psycopg2
    ▼
PostgreSQL 16 (managed service in production / Docker volume in dev)
```

**Backend** is a stateless FastAPI container. It can be horizontally scaled — all session state lives in JWTs and the database, not in-process memory.

**Database** is the only stateful component. It must run as a managed service in production; it must not share a container with the API.

**Mobile app** communicates with the backend over HTTPS. The backend URL is baked into the bundle at EAS Build time via `EXPO_PUBLIC_API_URL`. No runtime configuration is needed on the device.

---

## Infrastructure Summary

| Component | Local Development | Staging / Production |
|---|---|---|
| Backend runtime | Docker Compose (`--reload`) | Docker container (Dockerfile, no `--reload`) |
| Database | PostgreSQL 16 in Docker (`postgres_data` volume) | Managed PostgreSQL (Render, Railway, Supabase, Neon) |
| TLS / HTTPS | Not required (localhost only) | TLS-terminating proxy or platform-managed certificate |
| API URL (mobile) | `EXPO_PUBLIC_API_URL` | `EXPO_PUBLIC_API_URL` (injected at EAS Build time) |
| Migrations | Auto-applied on container start (`alembic upgrade head`) | Auto-applied on container start (same Dockerfile) |
| AI provider | `mock` (no external calls) | `mock` or `openai` (set `AI_PROVIDER` + `OPENAI_API_KEY`) |

---

## Deployment Prerequisites

All of the following must be in place before a production deployment is attempted.

### Infrastructure
- [ ] Managed PostgreSQL 16 instance provisioned (Render, Railway, Supabase, or Neon)
- [ ] PostgreSQL connection string obtained: `postgresql://USER:PASSWORD@HOST:5432/DBNAME?sslmode=require`
- [ ] Backend hosting platform chosen (Render, Railway, or Fly.io)
- [ ] Docker registry or repository accessible to the hosting platform (or GitHub-connected deployment)
- [ ] TLS certificate provisioned (automatic on Render/Railway/Fly.io via their platform)

### Secrets
- [ ] `JWT_SECRET_KEY` generated: `python3 -c "import secrets; print(secrets.token_hex(32))"`
- [ ] `JWT_SECRET_KEY` stored in the hosting platform's secret/environment manager — never in the repository
- [ ] `DATABASE_URL` stored in the hosting platform's secret/environment manager
- [ ] `OPENAI_API_KEY` stored in secret manager (only if `AI_PROVIDER=openai`)

### Mobile
- [ ] Deployed backend URL confirmed (HTTPS) and returning `200` on `/api/v1/health`
- [ ] `EXPO_PUBLIC_API_URL` set in `eas.json` (production profile) to the live backend URL
- [ ] Expo account created and `eas build:configure` run from `mobile/`
- [ ] Bundle identifier in `mobile/app.json` updated from `com.helios.app` to a unique registered App ID

---

## Required Environment Variables

### Backend (complete reference)

| Variable | Required | Production value | Local default |
|---|---|---|---|
| `DATABASE_URL` | **Yes** | `postgresql://USER:PASS@HOST:5432/DB?sslmode=require` | `postgresql://helios:helios@db:5432/helios` |
| `JWT_SECRET_KEY` | **Yes** | `secrets.token_hex(32)` output — strong, unique, secret | `dev-secret-change-in-production` (triggers startup warning) |
| `JWT_ALGORITHM` | No | `HS256` | `HS256` |
| `JWT_ACCESS_TOKEN_EXPIRE_MINUTES` | No | `60` | `60` |
| `DEBUG` | No | `false` | `false` |
| `ENVIRONMENT` | No | `production` | `development` |
| `CORS_ORIGINS` | No | `*` (mobile-only API; restrict if adding web frontend) | `*` |
| `AI_PROVIDER` | No | `mock` or `openai` | `mock` |
| `OPENAI_API_KEY` | Conditional | From secret manager | Not set |
| `OPENAI_MODEL` | No | `gpt-4o-mini` | `gpt-4o-mini` |
| `APP_NAME` | No | `HELIOS` | `HELIOS` |
| `API_VERSION` | No | `v1` | `v1` |

### Mobile (Expo build-time variables)

| Variable | Required | Description |
|---|---|---|
| `EXPO_PUBLIC_API_URL` | Yes | Full backend URL, e.g. `http://localhost:8000` for simulator, `http://192.168.1.110:8000` for LAN testing, or `https://api.helios.io` for deployed environments |

`EXPO_PUBLIC_API_URL` is required in development and production. HELIOS does not infer the backend URL automatically.

---

## Database Requirements

| Requirement | Value | Status |
|---|---|---|
| Engine | PostgreSQL 16 | ✅ |
| Schema versioning | Alembic — 6 migrations (001 → 006) | ✅ |
| Tables | 7: `users`, `goals`, `tasks`, `conversations`, `conversation_messages`, `reminders`, `user_preferences` | ✅ |
| Migrations auto-applied | `alembic upgrade head` in Dockerfile CMD | ✅ |
| SSL required | `?sslmode=require` in managed service connection string | Required in production |
| Minimum storage | < 1 MB schema; data scales with user count | ✅ |
| Connection pooling | Handled by managed service provider | Provider-dependent |
| Backups | Automated backups on all managed services (Render, Railway, Supabase, Neon) | Provider-dependent |

**Migration command (manual run if needed):**
```bash
# From the backend container or locally with DATABASE_URL set
alembic upgrade head

# Verify current revision
alembic current

# View migration history
alembic history --verbose
```

---

## Security Checklist

### Authentication
- [x] Passwords hashed with bcrypt (random salt, work factor 12)
- [x] JWT HS256 with explicit algorithm allowlist — prevents algorithm-confusion attacks
- [x] JWT `"type": "access"` claim — prevents token type confusion
- [x] Login returns identical 401 for wrong email and wrong password (timing-safe via bcrypt compare)
- [x] Startup warning logged if `JWT_SECRET_KEY` is a known weak placeholder
- [x] Rate limiting on auth endpoints: signup 5/min, login 10/min (slowapi)
- [ ] Refresh tokens — **not implemented** (users re-login after token expiry)
- [ ] Email verification — **not implemented** (any email format accepted)

### Authorization
- [x] Every protected route uses `Depends(get_current_user)`
- [x] Every database query filtered by `WHERE user_id = current_user.id`
- [x] FK ownership validated: `linked_goal_id`, `task_id`, `goal_id` checked against `current_user.id` before write
- [x] Account deletion cascades to all user data (goals, tasks, conversations, reminders, preferences)

### Transport
- [x] HTTPS enforced by iOS ATS in production builds (`__DEV__ === false`)
- [x] No credentials transmitted in HTTP in production (Bearer token in `Authorization` header)
- [ ] HTTPS in local development — not applicable (localhost only)

### Secrets
- [x] `backend/.env` excluded from version control via `.gitignore`
- [x] No real secrets in git history (early `.env` commit contained only placeholder `your-secret-here`)
- [x] `OPENAI_API_KEY` is commented out in `.env.example` — not a committed default
- [ ] Git history purge of `.env` file — not performed (placeholder values only; no real secret ever committed). Run `git filter-repo --path backend/.env --invert-paths` before any public repository release.

### Input Validation
- [x] All enum fields (`status`, `priority`, `theme_preference`) use `Pydantic Literal` types — rejected at API boundary with 422
- [x] String fields have `min_length` and `max_length` constraints
- [x] Email normalised (strip + lowercase) before storage and lookup
- [x] `allow_credentials=False` on CORS — auth is header-based, not cookie-based

---

## Monitoring Checklist

HELIOS includes basic observability. The items below are implemented and the items marked as future work are not.

### Implemented
- [x] `RequestLoggingMiddleware` — logs method, path, status code, duration (ms), and `X-Request-ID` for every request
- [x] `GET /api/v1/health` — returns `{"status":"ok"}`, suitable as a health probe for load balancers and container orchestrators
- [x] `GET /api/v1/version` — returns service name, version, and API version
- [x] `GET /api/v1/health/diagnostics` — returns database connectivity status (authenticated)
- [x] Structured Python logging via `logging_config.py` — writes JSON-compatible log lines
- [x] `X-Request-ID` header on all responses — enables request tracing in logs

### Not Implemented (future phases)
- [ ] Centralised log aggregation (Datadog, Grafana Loki, AWS CloudWatch) — Phase 52 candidate
- [ ] Error tracking (Sentry) — Phase 52 candidate
- [ ] Uptime monitoring (Better Uptime, Freshping) — Phase 52 candidate
- [ ] APM / performance tracing (New Relic, Datadog) — Phase 55 candidate
- [ ] Alerting on error rate or latency thresholds — requires APM/log aggregation first
- [ ] Database query performance monitoring — Phase 55 candidate

### Health probe configuration

For container orchestrators and platform health checks, use:

```
GET /api/v1/health
Expected status: 200
Expected body: {"status":"ok","service":"helios-api",...}
```

This endpoint does not require authentication and does not query the database, so it remains healthy even if the database is temporarily unavailable. Use `/api/v1/health/diagnostics` for a database connectivity check.

---

## Backup and Recovery Considerations

### Database backups

HELIOS does not implement custom backup tooling. All backup capability relies on the managed PostgreSQL provider.

| Provider | Backup retention | Point-in-time recovery |
|---|---|---|
| Render PostgreSQL | Daily, 7-day retention (free tier) | Not on free tier |
| Railway | Daily snapshots | Not on free tier |
| Supabase | Daily, 7-day retention (free tier) | Not on free tier |
| Neon | Automatic — 7-day history (free tier) | Available on paid tier |

**Recommendation:** For a demo or staging environment, any managed provider's free tier is sufficient. For a production environment with user data, choose a provider with point-in-time recovery.

### Local development database

The local Docker volume (`postgres_data`) is not backed up. It is ephemeral and should be treated as disposable. To wipe it:

```bash
cd backend
docker compose down -v   # destroys postgres_data volume
docker compose up        # recreates from scratch with all migrations
```

### Disaster recovery procedure

There is no defined disaster recovery runbook beyond:
1. Provision a new managed PostgreSQL instance
2. Restore from the provider's most recent backup (if available)
3. Update `DATABASE_URL` in the hosting platform environment
4. Redeploy the backend container — migrations run automatically on startup
5. Rebuild the mobile binary if the backend URL changed

---

## Known Limitations

These are honest limitations that affect production readiness. None block a demo or staging deployment.

| Limitation | Impact | Path to resolution |
|---|---|---|
| No refresh tokens | Users re-login after 60 minutes | Phase 51 — implement 7-day refresh token flow |
| No email verification | Any email format accepted at signup | Add SendGrid or Resend SMTP verification |
| JWT stored in AsyncStorage | Not in iOS Keychain | Migrate to `expo-secure-store` post-v1 |
| No remote push notifications | Reminders fire only on-device | Phase 52 — FCM/APNs infrastructure |
| No CI/CD pipeline | Tests run manually | GitHub Actions workflow — ~30 min to add |
| No error tracking | Exceptions logged to console only | Phase 52 — Sentry integration |
| No log aggregation | Logs not queryable after container restart | Phase 52 — Datadog/Loki integration |
| Bundle ID placeholder | `com.helios.app` — not App Store-ready | Change in `mobile/app.json` before EAS build |
| No App Store submission | Not in App Store or TestFlight | Follow `docs/ios-release.md` checklist |
| FastAPI `@app.on_event()` deprecation | Non-breaking deprecation warnings in test output | Phase 50 — migrate to lifespan handlers |
| No production deployment completed | Not live at any public URL | Follow `docs/deployment.md` for Render/Railway/Fly.io |

---

## Final Assessment

| Criterion | Status |
|---|---|
| Backend Dockerfile is production-ready | ✅ |
| Migrations run automatically on container start | ✅ |
| All environment variables documented and templated | ✅ |
| No secrets committed to version control | ✅ |
| Security audit completed (Phase 37) — all findings resolved | ✅ |
| 12/12 tests passing (8 backend, 4 mobile) | ✅ |
| Health probe endpoint present and unauthenticated | ✅ |
| Request logging on every request | ✅ |
| Deployment guide written for Render, Railway, Fly.io | ✅ |
| Mobile EAS build profiles configured | ✅ |
| Backend ready for staging deployment | ✅ |
| Backend ready for production (public users, real data) | ⚠️ Partial — missing refresh tokens, email verification, error tracking |
| App Store submission ready | ❌ — bundle ID placeholder, no privacy policy, no screenshots |
| Production deployment live | ❌ — not deployed; local/demo only |
