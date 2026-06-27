# HELIOS — Release Checklist

**Phase:** 54

A gate-by-gate checklist for each release type. Work through each section top to bottom. All items in a section must pass before proceeding to the next section.

---

## Checklist Scope Reference

| Checklist | Use when |
|---|---|
| [Pre-Release Checks](#pre-release-checks) | Before any release — run first every time |
| [Backend Checks](#backend-checks) | Every backend deployment or update |
| [Frontend (Mobile) Checks](#frontend-mobile-checks) | Every new EAS build or mobile release |
| [Database Checks](#database-checks) | Any migration, schema change, or database provider change |
| [Documentation Checks](#documentation-checks) | Before tagging a version or packaging the portfolio |
| [Final Sign-Off Checklist](#final-sign-off-checklist) | Last step — complete only after all above sections pass |

---

## Pre-Release Checks

Run these before touching any environment. They confirm the codebase is in a releasable state.

### Source control
- [ ] `git status` is clean — no uncommitted changes
- [ ] Branch is up to date with `origin/main`: `git pull origin main`
- [ ] No merge conflicts in any changed files
- [ ] All intended changes are committed to main

### Tests
- [ ] Backend tests pass (8/8):
  ```bash
  cd backend
  docker compose run --rm --no-deps \
    -e DATABASE_URL="sqlite:////tmp/test_helios.db" \
    api sh -c "pip install -r requirements.txt -r requirements-test.txt -q && python -m pytest -v"
  ```
- [ ] Mobile tests pass (4/4):
  ```bash
  cd mobile && npm test -- --runInBand
  ```
- [ ] TypeScript compiles with zero errors:
  ```bash
  cd mobile && npx tsc --noEmit
  ```

### Security
- [ ] `backend/.env` is NOT tracked by git: `git ls-files backend/.env` returns nothing
- [ ] `mobile/.env` is NOT tracked by git: `git ls-files mobile/.env` returns nothing
- [ ] `git log --oneline --all -- backend/.env` shows only the early placeholder commit (not a real secret)
- [ ] No `OPENAI_API_KEY` value appears in any committed file: `git grep OPENAI_API_KEY` returns only `.env.example` comments

---

## Backend Checks

### Configuration
- [ ] `backend/.env.example` has an entry for every variable read by `app/config.py`
- [ ] `DEBUG=false` is the default in `.env.example`
- [ ] `JWT_SECRET_KEY` default in `.env.example` is a visible placeholder (not an empty string and not a real key)
- [ ] `OPENAI_API_KEY` is commented out in `.env.example`

### Dependencies
- [ ] `requirements.txt` is up to date: `pip-compile requirements.in` or manually verified
- [ ] All dependencies are pinned to exact versions (no `>=` wildcards in production dependencies)
- [ ] `requirements-test.txt` lists test-only dependencies separately

### Docker
- [ ] `docker compose up --build` completes without errors
- [ ] Both `db` and `api` containers show as healthy: `docker compose ps`
- [ ] API logs show `Application startup complete.` without any `ERROR` lines
- [ ] If `JWT_SECRET_KEY` is the placeholder, a `WARNING` appears in startup logs (confirms the check is active)

### Migrations
- [ ] `alembic current` matches the highest migration in `backend/alembic/versions/`: `006`
- [ ] `alembic history --verbose` lists all 6 migrations without gaps
- [ ] `docker compose exec db psql -U helios -d helios -c "\dt"` lists all 8 expected tables
- [ ] Running `alembic upgrade head` on a fresh database produces no errors (test with `docker compose down -v && docker compose up`)

### API endpoints
- [ ] `GET /api/v1/health` → `200 {"status":"ok"}`
- [ ] `GET /api/v1/version` → `200` with version info
- [ ] `GET /api/v1/goals` without Authorization header → `401 {"detail":"Not authenticated."}`
- [ ] `POST /api/v1/auth/signup` with valid body → `201` with user and access_token
- [ ] `POST /api/v1/auth/login` with valid credentials → `200` with access_token
- [ ] Authenticated `GET /api/v1/goals` → `200` with goals array
- [ ] Swagger UI at http://localhost:8000/docs loads without errors

### Rate limiting
- [ ] `POST /api/v1/auth/signup` returns `429` after 5 rapid requests from the same IP
- [ ] After 60 seconds, the next signup attempt succeeds again

### Error handling
- [ ] `POST /api/v1/tasks` with `"priority": "INVALID"` → `422` with field-level error message
- [ ] `GET /api/v1/goals/non-existent-id` → `404` (not `500`)
- [ ] `POST /api/v1/auth/login` with wrong password → `401` (same response as unknown email)

---

## Frontend (Mobile) Checks

### Code
- [ ] `npx tsc --noEmit` passes with zero errors
- [ ] No `console.error` calls in application code (only in `errorReporter.ts` which logs conditionally)
- [ ] API URL resolution respects `EXPO_PUBLIC_API_URL`; only simulator/emulator fallbacks remain in `mobile/src/config/api.ts`
- [ ] `mobile/.env.example` is committed and `mobile/.env` is not

### Navigation and auth
- [ ] App launches and shows the login screen when no token is stored
- [ ] Signup creates an account and navigates to the Home tab
- [ ] Login with valid credentials navigates to the Home tab
- [ ] Login with invalid credentials shows an error message (does not crash)
- [ ] Closing and reopening the app restores the authenticated session (token persists in AsyncStorage)
- [ ] Signing out navigates to the login screen and clears all stores
- [ ] Account deletion navigates to the login screen

### Feature screens
- [ ] **Home:** AI briefing card loads; metric tiles load; no loading spinner stuck indefinitely
- [ ] **Goals:** List loads; create new goal works; cycle status works; delete works; pull-to-refresh works
- [ ] **Tasks:** List loads; create new task with goal link works; status cycling works; delete works; pull-to-refresh works
- [ ] **Analytics:** Summary loads; all metrics display; pull-to-refresh works
- [ ] **Agents:** Agent list loads; AI Planner generates a plan
- [ ] **Assistant:** Send a message and receive a response; follow-up chip sends a message; conversation persists after navigating away and back
- [ ] **Profile — Reminders:** Reminders load; create reminder works; toggle works; delete works
- [ ] **Profile — Preferences:** Theme picker updates without crash; planning horizon picker updates; isSaving indicator appears briefly

### Mobile build
- [ ] `mobile/app.json` `version` field reflects the intended release version
- [ ] `mobile/app.json` `bundleIdentifier` is NOT `com.helios.app` before any App Store submission (placeholder is acceptable for simulator-only builds)
- [ ] `mobile/eas.json` exists and has `development`, `preview`, and `production` profiles
- [ ] `EXPO_PUBLIC_API_URL` in the target EAS build profile points to the correct backend URL for that environment

---

## Database Checks

### Schema integrity
- [ ] `alembic current` output matches the expected head revision: `006`
- [ ] All 8 tables present: `alembic_version`, `users`, `goals`, `tasks`, `conversations`, `conversation_messages`, `reminders`, `user_preferences`
- [ ] FK constraints intact — verify with:
  ```bash
  docker compose exec db psql -U helios -d helios -c "
  SELECT tc.constraint_name, tc.table_name, kcu.column_name,
         ccu.table_name AS foreign_table_name
  FROM information_schema.table_constraints AS tc
  JOIN information_schema.key_column_usage AS kcu
    ON tc.constraint_name = kcu.constraint_name
  JOIN information_schema.constraint_column_usage AS ccu
    ON ccu.constraint_name = tc.constraint_name
  WHERE tc.constraint_type = 'FOREIGN KEY'
  ORDER BY tc.table_name;"
  ```
- [ ] `users.email` has a UNIQUE constraint:
  ```bash
  docker compose exec db psql -U helios -d helios -c "
  SELECT indexname FROM pg_indexes
  WHERE tablename = 'users' AND indexname LIKE '%email%';"
  ```

### Data integrity
- [ ] Creating two users with the same email returns `400` (unique constraint enforced)
- [ ] Deleting a user cascades: the user's goals, tasks, conversations, reminders, and preferences are all deleted
- [ ] Deleting a goal sets `linked_goal_id` to NULL on linked tasks (SET NULL, not CASCADE)

### Production database (if deploying to a managed service)
- [ ] Connection string uses `?sslmode=require`
- [ ] Managed service is in a region close to the backend service (latency)
- [ ] Automated backups are enabled on the managed service
- [ ] Database credentials are stored in the platform secret manager — not in the repository

---

## Documentation Checks

### Accuracy
- [ ] README API reference table matches the actual endpoints in `backend/app/routers/`
- [ ] README environment variable table matches `backend/.env.example`
- [ ] `docs/LIMITATIONS_AND_ROADMAP.md` accurately reflects the current implementation (no stale "not implemented" claims for features that have been added)
- [ ] `docs/deployment.md` steps are accurate for the current Dockerfile and Docker Compose configuration
- [ ] `docs/ios-release.md` steps are accurate for the current `eas.json` and `app.json`

### Completeness
- [ ] All new environment variables added since the last release appear in `.env.example` with comments
- [ ] Any new API endpoints are documented in the README endpoint table
- [ ] `docs/v1-launch-report.md` testing status is current (test counts match actual passing tests)

### Secrets audit
- [ ] Secret-key prefix searches return no OpenAI API key values in the repository
- [ ] `git grep -r "postgresql://" | grep -v ".example"` returns no lines with real credentials
- [ ] `git grep -r "secrets.token_hex"` appears only in documentation (not hardcoded as a value)

---

## Final Sign-Off Checklist

Complete this only after all sections above have been verified. This is the gate for tagging a release or packaging the portfolio.

### Functional verification
- [ ] Full end-to-end flow tested manually: signup → create goal → create task → view analytics → generate AI plan → set reminder → sign out → sign back in
- [ ] No red error overlays in the iOS Simulator during the above flow
- [ ] Backend logs show no `ERROR` level entries during the above flow

### Quality
- [ ] All 12 tests passing: 8 backend + 4 mobile
- [ ] TypeScript zero errors
- [ ] No known regressions introduced by changes since the last release

### Repository state
- [ ] `git status` is clean
- [ ] `git log --oneline -5` shows the intended commits for this release
- [ ] Version numbers are consistent:
  - `mobile/app.json` `version` field
  - `backend/.env.example` `VERSION` field
  - `docs/v1-launch-report.md` version statement

### Honest assessment — do not mark complete unless true
- [ ] Every feature listed as "Working" in `docs/final-feature-matrix.md` has been manually verified in this release
- [ ] Known limitations in `docs/LIMITATIONS_AND_ROADMAP.md` are still accurate
- [ ] The deployment readiness status in `docs/deployment-readiness-report.md` is current

### Release tagging (optional)

Once all items above are checked:

```bash
# Tag the release
git tag -a v1.0.0 -m "HELIOS V1.0.0 — V1 Release Candidate"

# Push tag to remote
git push origin v1.0.0
```

---

## Current Release Status

| Check | Status |
|---|---|
| Backend tests (8/8) | ✅ Passing |
| Mobile tests (4/4) | ✅ Passing |
| TypeScript compilation | ✅ Zero errors |
| No secrets committed | ✅ Verified |
| All documented features working | ✅ Phase 51 audit confirmed |
| Production deployment live | ❌ Not deployed — local/demo only |
| App Store submission | ❌ Not submitted — bundle ID placeholder, no privacy policy |
| Refresh tokens | ❌ Not implemented — 60-minute token expiry |
| CI/CD pipeline | ❌ Not implemented — tests run manually |
