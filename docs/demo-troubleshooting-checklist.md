# HELIOS — Demo Troubleshooting Checklist

**Phase:** 52

Quick reference for fixing issues before or during a demo session. Each entry lists the symptom, root cause, and exact fix. All fixes are reversible; none modify application code.

---

## Docker / Backend Issues

### Backend returns HTTP 503 on signup or first authenticated request

**Symptom:** Signup returns `503 Service Unavailable`. `GET /health` returns 200.

**Root cause:** The `postgres_data` Docker volume survived a previous `docker compose down` (run without `-v`). The volume contains the Alembic version stamp (`006`) but none of the actual tables. Alembic sees the version matches head, skips all migrations, and the backend starts. The first real DB query fails with `UndefinedTableError`, which the SQLAlchemy exception handler converts to a 503.

**Fix — surgical (no data loss, containers stay running):**
```bash
docker compose exec db psql -U helios -d helios -c "DELETE FROM alembic_version;"
docker compose exec api alembic upgrade head
```

Verify:
```bash
docker compose exec db psql -U helios -d helios -c "\dt"
# Should show: alembic_version, users, goals, tasks, conversations,
#              conversation_messages, reminders, user_preferences
```

**Fix — full reset (destroys all data, cleanest state):**
```bash
cd backend
docker compose down -v
docker compose up
```

---

### Port 8000 already in use

**Symptom:** `docker compose up` fails with `address already in use` or `bind: address already in use`.

**Cause:** A previous backend process or another application is using port 8000.

**Fix:**
```bash
# Find what is using port 8000
lsof -ti :8000

# Kill it (replace <PID> with the number from the output above)
kill -9 <PID>

# Then start the backend
docker compose up
```

---

### Docker containers start but API immediately exits

**Symptom:** `docker compose up` shows the API container starting and then stopping. `docker compose ps` shows `api` as `Exited`.

**Fix — check logs:**
```bash
docker compose logs api
```

Common causes:
- Python import error: run `docker compose up --build` to rebuild the image
- Missing environment variable: confirm `backend/.env` exists with at least `JWT_SECRET_KEY`, `DATABASE_URL`, `SECRET_KEY`
- Alembic migration error on a corrupt database: run the full reset (`docker compose down -v && docker compose up`)

---

### `/health` returns 200 but `/api/v1/auth/signup` returns 500

**Symptom:** Health endpoint passes, but signup or any data endpoint returns 500.

**Cause:** An unhandled exception in application code, usually a missing column or schema mismatch that is not covered by the Alembic version stamp issue above.

**Fix:**
```bash
# Read the specific error from the API logs
docker compose logs api --tail=50

# If it is a database schema error, run the full reset
docker compose down -v && docker compose up
```

---

### Swagger UI at /docs shows "Failed to fetch"

**Symptom:** The browser loads the Swagger UI at `http://localhost:8000/docs` but every "Try it out / Execute" call shows a network error.

**Cause:** The browser is making requests to `localhost:8000` but the backend is not running, or CORS is blocking the request from `http://127.0.0.1:8000/docs`.

**Fix:**
1. Confirm `docker compose up` is running and shows `Application startup complete.`
2. Try `http://localhost:8000/docs` rather than `http://127.0.0.1:8000/docs` (the CORS allowed origins include `localhost`)
3. Use `curl` instead of the browser form for a quick verification:

```bash
curl -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"alex@helios.demo","password":"your_password"}'
```

---

## Mobile / Expo Issues

### Red error overlay in the simulator

**Symptom:** A red screen with a stack trace appears in the simulator. The app is not navigable.

**Immediate fix:**
1. Press `r` in the Metro terminal to reload the app
2. If the error persists: `npx expo start --clear` (clears the Metro cache)
3. If the error is a network error (`TypeError: Network request failed`): confirm the backend is running and reachable at `http://localhost:8000`

**Never record with a red error overlay visible.**

---

### App shows blank white screen on launch

**Symptom:** The simulator displays a blank white screen and never renders any UI.

**Cause:** Metro bundler is still building the JavaScript bundle.

**Fix:** Wait up to 60 seconds on a cold start. If it does not resolve:
```bash
# In the Metro terminal, press r to reload
# Or restart Metro entirely:
npx expo start --ios --clear
```

---

### "Network request failed" on every API call

**Symptom:** The app loads but all API calls fail with a network error. The login screen shows an error message.

**Cause:** The app's `API_BASE_URL` is set to `http://localhost:8000`, which is correct for the iOS Simulator (the simulator shares the host machine's network). If this fails, the backend is not running.

**Fix:**
```bash
# Confirm backend is up
curl http://localhost:8000/api/v1/health

# If it is not running:
cd backend && docker compose up
```

If you are testing on a physical device (not the simulator), `localhost` will not resolve. Use the machine's local IP address instead:
```bash
# Find machine IP
ipconfig getifaddr en0

# Set EXPO_PUBLIC_API_URL in mobile/.env to http://<machine-ip>:8000
# Then restart Metro: npx expo start --ios --clear
```

---

### Metro bundler fails to start with "EADDRINUSE :8081"

**Symptom:** `npx expo start` exits with `Error: listen EADDRINUSE: address already in use :::8081`.

**Fix:**
```bash
lsof -ti :8081 | xargs kill -9
npx expo start --ios --clear
```

---

### Simulator not found or Expo opens in browser instead of simulator

**Symptom:** Running `npx expo start --ios` opens a browser tab instead of launching the simulator.

**Fix:**
1. Open Xcode at least once to install iOS Simulator runtimes
2. Open Simulator app manually: `open -a Simulator`
3. Wait for a device to boot, then press `i` in the Metro terminal to open the app in the simulator

---

### Expo app is stuck on splash screen

**Symptom:** The HELIOS splash screen shows but the app never loads past it.

**Cause:** The hydration guard in `_layout.tsx` is waiting for AsyncStorage to return. This usually resolves in under 2 seconds.

**Fix:** Wait 5 seconds. If it persists:
```bash
# Clear Expo cache and restart
npx expo start --ios --clear
```

If the issue is a stale auth token that is not clearing: sign out via Profile first, then restart.

---

## Auth / Session Issues

### Login succeeds but redirects back to login immediately

**Symptom:** Tapping ACCESS SYSTEM shows the loading spinner, then returns to the login screen.

**Cause:** The server accepted the login (200 OK) but the token revalidation call (`GET /auth/me`) failed, causing `revalidate()` to clear the session.

**Fix:**
1. Check the backend logs: `docker compose logs api --tail=20`
2. If the DB tables are missing: run the 503 fix (see Docker section above)
3. If the token is valid but `/auth/me` is timing out: check that the backend is responsive with `curl http://localhost:8000/api/v1/health`

---

### Rate limit error (429) during demo

**Symptom:** Signup or login returns a 429 error. This can happen if the demo account credentials are retyped many times during setup.

**Cause:** Signup is limited to 5 requests per minute; login to 10 per minute per IP.

**Fix:** Wait 60 seconds, then try again. The rate limit window resets automatically.

---

### Demo account already exists — signup returns 400

**Symptom:** Attempting to sign up with `alex@helios.demo` returns `{"detail":"Email already registered"}`.

**Cause:** The account was created in a previous session and the database was not reset.

**Fix:** Log in with the existing account instead of signing up. If you need to demonstrate the signup flow, use a different email address for the demo (e.g., `alex2@helios.demo`).

---

## Recording Setup Issues

### QuickTime recording shows the full desktop instead of just the simulator

**Fix:** In QuickTime → New Screen Recording, click the dropdown arrow next to the record button and select the specific display area or window. Click-drag to select only the simulator window, or use the "Selected Portion" option.

---

### Audio is not being captured

**Fix:** In QuickTime → New Screen Recording, confirm the microphone input is selected in the dropdown (not "None"). Check System Preferences → Sound → Input to confirm the correct mic is active and the input level is responding to voice.

---

### Recording lags or drops frames

**Cause:** Recording the full Retina display at 2x is CPU-intensive.

**Fix:**
1. Set the simulator to 50% scale (Window → Scale → 50% in the Simulator menu) — this halves the pixel count
2. Close other applications before recording
3. Use QuickTime → Export As → 1080p rather than 4K if the source is too large

---

## Pre-Recording Final Check (30 seconds)

Run these four commands in sequence. All must succeed before recording starts.

```bash
# 1. Backend health
curl -s http://localhost:8000/api/v1/health | grep '"status":"ok"'

# 2. Login test (replace password with actual demo password)
curl -s -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"alex@helios.demo","password":"<demo_password>"}' \
  | grep '"access_token"'

# 3. Simulator is running
xcrun simctl list devices | grep -E "Booted"

# 4. HELIOS app is in foreground
# (verify visually in the simulator — the Home screen should be visible)
```

If all four pass, the environment is ready for recording.
