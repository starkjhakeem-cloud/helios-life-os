# HELIOS V2 — Real Integration Readiness Audit Report

**Audit version:** V2.20  
**Date:** 2026-06-12  
**Scope:** Google Calendar and Gmail integration architecture — readiness before enabling real OAuth and real API calls  
**Auditor:** V2.20 automated audit pass  

---

## Audit Checklist Results

| # | Check | Result | Notes |
|---|-------|--------|-------|
| 1 | Integration models clean | ✅ PASS | No extraneous columns; token fields nullable and correctly typed |
| 2 | Token fields absent from API responses | ✅ PASS | `IntegrationOut` never includes `access_token_encrypted` or `refresh_token_encrypted` |
| 3 | `TOKEN_ENCRYPTION_KEY` handling safe | ✅ PASS | `validate_key()` never raises; `_get_fernet()` raises `TokenEncryptionError`, not raw exceptions |
| 4 | Google OAuth env vars documented | ✅ PASS | `.env.example` has all four vars with comments; all are commented-out by default |
| 5 | Mock connect/disconnect/sync works | ✅ PASS | Entire mock pipeline functional and independent of real credentials |
| 6 | Google Calendar adapter isolated | ✅ PASS | `_STUB=True`; `httpx` deferred; token access only reached when `_STUB=False` |
| 7 | Gmail adapter isolated | ✅ PASS | Same pattern; `_token` internal param never exposed to callers |
| 8 | No real Google/Gmail API calls | ✅ PASS | `_STUB_EXCHANGE=True` in `google_oauth.py`; `_STUB=True` in both adapters |
| 9 | No secrets committed to git | ✅ PASS | `backend/.env` is gitignored and NOT tracked; confirmed with `git ls-files` |
| 10 | Docs explain stubbed vs real | ✅ PASS | `oauth-token-architecture.md` has per-layer status tables for V2.14–V2.19 |

---

## What Was Fixed in V2.20

### `backend/app/services/google_oauth.py` — misleading `stub` field comment

**Before:**
```python
stub: bool = False         # True means placeholder data — never store these
```

**After:**
```python
stub: bool = False         # True → placeholder tokens from _STUB_EXCHANGE mode; real tokens overwrite on OAuth activation
```

**Why:** V2.17 intentionally stores stub tokens (encrypted) to validate the end-to-end encryption + DB-write pipeline. The previous comment "never store these" contradicted that design. The corrected comment accurately reflects that stub tokens are stored as pipeline validation artifacts and that real tokens will overwrite them when real OAuth is activated.

---

## What Is Ready

### Database layer
- `user_integrations` table has all required columns: `access_token_encrypted`, `refresh_token_encrypted`, `token_expires_at`, `scopes`, `status`, `connected_at`, `last_sync_at`
- Migration 012 (`012_integration_token_fields.py`) adds token columns cleanly with `ALTER TABLE`
- `UniqueConstraint("user_id", "provider")` prevents duplicate integration rows per user

### Token security
- `app/services/token_encryption.py` — Fernet AES-128-CBC, production-quality
- `encrypt_token()` and `decrypt_token()` never log values; callers are required to treat returns as secrets
- `TokenEncryptionError` wraps all key-misconfiguration cases; callers surface only `type(exc).__name__` in logs
- `validate_key()` validates key format at startup without raising — safe for health checks
- `TOKEN_ENCRYPTION_KEY` is `str | None`; absence causes a startup log at INFO (not crash); presence with invalid format logs WARNING

### OAuth flow skeleton
- `GET /integrations/google/connect-url` — generates real authorization URL when credentials configured; placeholder URL otherwise
- `GET /integrations/google/callback` — calls exchange service; returns `CallbackResponse`
- `POST /integrations/google/exchange` — full pipeline: validates config → exchanges code → encrypts both tokens → upserts `google_calendar` and `gmail` rows atomically; rolls back on any failure
- `_STUB_EXCHANGE=True` in `google_oauth.py` validates credentials and returns clearly-labelled placeholder tokens, allowing the storage pipeline to be tested without real Google credentials

### Mock integration layer
- `POST /integrations/mock-connect` — creates or re-activates integration row with pre-populated OAuth scopes
- `DELETE /integrations/{id}` — hard-deletes row; frontend resets optimistically to disconnected
- `POST /integrations/{id}/sync` — runs `sync_simulator.run_mock_sync`, writes stable upsert records into `calendar_events` / `email_messages`
- `GET /integrations/sync/status` — returns most-recent sync job per connected provider

### Provider adapters
- `app/services/google_calendar_adapter.py` — `GoogleCalendarAdapter` with `list_events`, `create_event`, `update_event`, `delete_event`; `_STUB=True`
- `app/services/gmail_adapter.py` — `GmailAdapter` with `list_messages`, `get_message`, `mark_as_read`, `archive_message`, `search_messages`; `_STUB=True`
- Both adapters: token retrieval path fully wired (`_get_access_token` → DB query → `decrypt_token`) but only reached when `_STUB=False`
- Both adapters: `httpx` imported only inside real paths (never loaded in stub mode)
- Both adapters: expose a module-level singleton for clean import

### API response safety
- `IntegrationOut` schema: only `id`, `provider`, `status`, `connected_at`, `last_sync_at`, `token_expires_at`, `scopes` — no token fields
- `_to_out()` in `integrations.py` router explicitly maps only safe fields — no `**row.__dict__` pattern that could accidentally include token columns
- `ExchangeCodeResponse` returns `success`, `provider`, `stub`, `tokens_stored`, `note` — no token values

### Frontend
- Integrations screen: CONNECT GOOGLE (primary) + MOCK (secondary) for Google providers; MOCK CONNECT only for Outlook
- Unconfigured path: shows setup instructions, does not attempt exchange
- Configured path: calls `/google/exchange` with stub code; refreshes both Google cards on `tokens_stored: true`
- Mock connect/disconnect/sync all functional and tested
- No token values in any component state or rendered output
- `useIntegrationStore.disconnect` clears `token_expires_at` optimistically — prevents stale token-expiry warnings after disconnect

### Secret hygiene
- `backend/.env` is not tracked (`git ls-files` confirms)
- `backend/.gitignore` covers `.env` explicitly
- Root `.gitignore` covers `.env`, `.env.local`, `.env.*.local`
- `.env.example` uses commented-out placeholders for all secret vars — committed as documentation only
- No Google credentials, Fernet keys, or OpenAI keys appear in any tracked file

---

## What Is Still Missing Before Real OAuth

The following items must be completed before `_STUB_EXCHANGE = False` and `_STUB = False` can be safely enabled.

### 1. Real Google credentials
**Blocking:** yes  
**File(s):** `backend/.env`

```
GOOGLE_CLIENT_ID=<from Google Cloud Console>
GOOGLE_CLIENT_SECRET=<from Google Cloud Console>
GOOGLE_REDIRECT_URI=helios://oauth/callback/google
TOKEN_ENCRYPTION_KEY=<Fernet key>
```

Generate the Fernet key:
```bash
python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

Google Cloud Console setup:
1. Create an OAuth 2.0 Client ID (Application type: iOS or Android)
2. Add `helios://oauth/callback/google` as an authorized redirect URI
3. Enable "Google Calendar API" and "Gmail API" in the project

### 2. State token persistence (CSRF protection)
**Blocking:** yes — without this, the OAuth flow is vulnerable to CSRF  
**File(s):** `backend/app/routers/integrations.py`

The `state` value generated in `GET /google/connect-url` is not persisted. Before redirecting the user to Google, the state must be stored server-side (e.g., Redis with a short TTL or a DB table with expiry). The callback / exchange endpoint must reject requests where `state` does not match.

```python
# What needs to happen:
# 1. On connect-url: store state → {user_id, expires_at} in Redis/DB
# 2. On exchange: verify state exists and has not expired; delete after use
```

### 3. Mobile deep-link intercept
**Blocking:** yes — without this, the authorization code never reaches the backend  
**File(s):** `mobile/src/app/(tabs)/integrations.tsx`

The current `handleGoogleConnect` calls the exchange endpoint with a hard-coded stub code `"stub_pipeline_v2_17"`. A real OAuth flow requires:

```typescript
// What needs to happen:
import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";

// 1. Open the authorization URL in a browser session
const result = await WebBrowser.openAuthSessionAsync(connectUrlData.url, "helios://");

// 2. Parse the returned deep-link for `code` and `state`
// 3. Call integrationService.exchangeCode({ code, state })
```

Required package: `expo-web-browser` (already in the Expo SDK).

### 4. Token refresh before sync
**Blocking:** yes for reliable sync — without this, syncs fail after the access token expires (1 hour)  
**File(s):** `backend/app/services/google_calendar_adapter.py`, `backend/app/services/gmail_adapter.py`, and the sync trigger router

Before each adapter call:
```python
# Pseudocode for what needs to be added:
if row.token_expires_at and row.token_expires_at < datetime.now(utc) + timedelta(minutes=5):
    new_tokens = refresh_access_token(row.refresh_token_encrypted, db)
    row.access_token_encrypted = encrypt_token(new_tokens.access_token)
    row.token_expires_at = datetime.now(utc) + timedelta(seconds=new_tokens.expires_in)
    db.commit()
```

The refresh endpoint is:
```
POST https://oauth2.googleapis.com/token
  client_id=GOOGLE_CLIENT_ID
  client_secret=GOOGLE_CLIENT_SECRET
  refresh_token=<decrypted_refresh_token>
  grant_type=refresh_token
```

### 5. PKCE for mobile OAuth
**Blocking:** recommended before production — the `helios://` deep-link redirect URI in a mobile OAuth flow without PKCE is vulnerable to authorization code interception  
**File(s):** `mobile/src/app/(tabs)/integrations.tsx`, `backend/app/routers/integrations.py`

```typescript
// Mobile: generate and send code_challenge
const codeVerifier = generateSecureRandom(64);
const codeChallenge = base64url(sha256(codeVerifier));

// Include in connect-url params:
// code_challenge=<codeChallenge>&code_challenge_method=S256

// Exchange: include code_verifier in the token request body
```

### 6. Adapter activation
**Blocking:** only after items 1–4 above  
**File(s):** `backend/app/services/google_calendar_adapter.py`, `backend/app/services/gmail_adapter.py`, `backend/app/services/google_oauth.py`

Once all of the above are done, flip three flags:
```python
# google_oauth.py
_STUB_EXCHANGE: bool = False

# google_calendar_adapter.py
_STUB: bool = False

# gmail_adapter.py
_STUB: bool = False
```

### 7. Wire adapters into sync trigger (future)
**Blocking:** not for OAuth activation, but required for real data  
**File(s):** `backend/app/routers/integrations.py` (`trigger_sync` handler)

Currently `trigger_sync` always calls `sync_simulator.run_mock_sync`. Once adapters are activated, real syncs should delegate here:
```python
# Pseudocode
if integration.provider == "google_calendar" and not _STUB:
    events = google_calendar_adapter.list_events(user_id, db)
    # upsert events into calendar_events table
elif integration.provider == "gmail" and not _STUB:
    messages = gmail_adapter.list_messages(user_id, db)
    # upsert messages into email_messages table
```

---

## Architecture Decision Log

### Why stub tokens ARE stored (V2.17 design intent)
When `_STUB_EXCHANGE=True` and all credentials are configured, `POST /google/exchange` encrypts and stores the placeholder strings (`stub_access_token__not_real__do_not_store`) in `access_token_encrypted`. This is intentional: it validates the entire encryption + DB-write pipeline without requiring real Google credentials. The stored ciphertext is harmless — it decrypts to a placeholder string that would fail any real API call. Real OAuth will overwrite these rows.

### Why the adapters use `user_id + db` signatures even in stub mode
The adapter method signatures accept `user_id: str` and `db: Session` so that no signature change is required when `_STUB=False` is flipped. Callers written today work identically in both modes. Stub mode simply ignores these parameters.

### Why `httpx` is a deferred import in adapters
`httpx` is only imported inside the real code paths (`if not _STUB`). This means the adapters can be imported in any context — including tests and environments where `httpx` is not installed — without errors. The deferred import also makes the stub code path faster.

### Why `google_calendar` and `gmail` share one OAuth token set
Google issues a single access/refresh token pair that covers all requested scopes. HELIOS requests Calendar and Gmail scopes together in one authorization. Both provider rows (`google_calendar`, `gmail`) are therefore written with the same encrypted tokens in `POST /google/exchange`. Each adapter independently queries its own row by `provider` name.

---

## Files Changed in V2.20

| File | Change | Why |
|------|--------|-----|
| `backend/app/services/google_oauth.py` | Fixed `GoogleTokens.stub` field comment | Previous "never store these" contradicted V2.17's intentional stub-token storage for pipeline validation |
| `docs/v2-real-integration-readiness-report.md` | **NEW** — this file | Comprehensive pre-real-OAuth audit: pass/fail per check, what is ready, what is missing |
