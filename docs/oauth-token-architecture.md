# OAuth and Secure Token Architecture

**Status:** OAuth skeleton active. Token exchange wired. Google Calendar and Gmail provider adapter layers added (stub mode).
**Added in:** V2.14 (architecture), V2.15 (skeleton flow), V2.18 (Calendar adapter), V2.19 (Gmail adapter)
**Applies to:** Google Calendar, Gmail (Outlook planned separately)

---

## Overview

HELIOS V2.14 completes the infrastructure layer required to support real Google OAuth 2.0 without yet enabling the live flow. All DB columns, encryption services, config placeholders, and provider metadata are in place. Flipping to real OAuth requires only credential provisioning and wiring the authorization code exchange — no schema changes.

---

## Current State

| Layer | Status |
|-------|--------|
| `user_integrations` schema | ✅ Token columns added (migration 012) |
| Token encryption service | ✅ Fernet-based, production-ready |
| Config env vars | ✅ Placeholders defined |
| Mock connect / disconnect | ✅ Fully functional |
| Sync simulation | ✅ Writes real calendar/email records |
| `GET /integrations/google/connect-url` | ✅ Generates real URL (or placeholder) |
| `GET /integrations/google/callback` | ✅ Calls exchange service; returns stub result |
| `POST /integrations/google/exchange` | ✅ Full storage: encrypt + upsert both Google rows |
| Token exchange service (`google_oauth.py`) | ✅ Full HTTP structure; `_STUB_EXCHANGE=True` |
| Token encryption service (`token_encryption.py`) | ✅ Fernet encrypt/decrypt + `validate_key()` |
| Startup key validation | ✅ Valid/invalid/absent logged at startup |
| Frontend CONNECT GOOGLE button | ✅ Calls storage pipeline; refreshes cards on success |
| Google Calendar provider adapter (`google_calendar_adapter.py`) | ✅ Added in V2.18 — `_STUB=True` |
| Gmail provider adapter (`gmail_adapter.py`) | ✅ Added in V2.19 — `_STUB=True` |
| State token persistence (CSRF) | ⏳ Not yet implemented |
| Deep-link intercept in mobile app | ⏳ Not yet implemented |
| Real Google Calendar API calls via adapter | ⏳ Pending — flip `_STUB=False` |
| Real Gmail API calls via adapter | ⏳ Pending — flip `_STUB=False` |

---

## Planned Google OAuth Authorization Code Flow

When real OAuth is enabled, the flow will work as follows:

### 1. Authorization Request (frontend → Google)

The mobile app opens a browser/webview to the Google authorization URL:

```
https://accounts.google.com/o/oauth2/v2/auth
  ?client_id=GOOGLE_CLIENT_ID
  &redirect_uri=helios://oauth/callback/google
  &response_type=code
  &scope=https://www.googleapis.com/auth/calendar.readonly
         https://www.googleapis.com/auth/calendar.events
         https://www.googleapis.com/auth/gmail.readonly
  &access_type=offline
  &prompt=consent
```

`access_type=offline` is required to receive a refresh token on first consent.
`prompt=consent` forces the consent screen on re-authorization so the refresh token is always returned.

### 2. Callback (Google → mobile app)

Google redirects to `helios://oauth/callback/google?code=AUTH_CODE&state=...`.
Expo Router handles the deep link. The app extracts `code` and sends it to the backend.

### 3. Token Exchange (backend → Google)

```
POST https://oauth2.googleapis.com/token
  client_id=GOOGLE_CLIENT_ID
  client_secret=GOOGLE_CLIENT_SECRET
  code=AUTH_CODE
  redirect_uri=helios://oauth/callback/google
  grant_type=authorization_code
```

Google responds with:
```json
{
  "access_token": "ya29.ACCESS_TOKEN",
  "refresh_token": "1//REFRESH_TOKEN",
  "expires_in": 3600,
  "token_type": "Bearer",
  "scope": "..."
}
```

### 4. Secure Token Storage

The backend calls `encrypt_token(access_token)` and `encrypt_token(refresh_token)` from `app.services.token_encryption`, then stores the ciphertext in `user_integrations`:

```sql
UPDATE user_integrations SET
  access_token_encrypted  = '<fernet-ciphertext>',
  refresh_token_encrypted = '<fernet-ciphertext>',
  token_expires_at        = NOW() + INTERVAL '3600 seconds',
  status                  = 'connected',
  connected_at            = NOW()
WHERE user_id = $1 AND provider = 'google_calendar';
```

**Tokens are never serialised into API responses.** `IntegrationOut` exposes only `token_expires_at` (a non-sensitive timestamp).

### 5. Token Refresh

Before each sync, the backend checks `token_expires_at`. If the access token has expired (or expires within 5 minutes), it calls:

```
POST https://oauth2.googleapis.com/token
  client_id=GOOGLE_CLIENT_ID
  client_secret=GOOGLE_CLIENT_SECRET
  refresh_token=<decrypted_refresh_token>
  grant_type=refresh_token
```

The new access token and updated expiry are written back using the same encryption path.

---

## Encrypted Token Storage

Tokens are encrypted using **Fernet** symmetric encryption from the Python `cryptography` library.

**Fernet characteristics:**
- AES-128-CBC with PKCS7 padding
- HMAC-SHA256 authentication (tamper detection)
- Timestamp embedded in ciphertext (enables optional expiry checks)
- Base64 URL-safe output — safe to store in a `TEXT` column

**Service location:** `backend/app/services/token_encryption.py`

```python
from app.services.token_encryption import encrypt_token, decrypt_token, is_encryption_configured

encrypted = encrypt_token("ya29.access-token")   # -> "gAAAAAB..."
original  = decrypt_token("gAAAAAB...")           # -> "ya29.access-token"
```

**If `TOKEN_ENCRYPTION_KEY` is not set**, `encrypt_token` raises `RuntimeError`. This prevents accidentally writing plaintext tokens. Mock connect flows never call the encryption service and are unaffected.

---

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `GOOGLE_CLIENT_ID` | When real OAuth active | `None` | OAuth 2.0 client ID from Google Cloud Console |
| `GOOGLE_CLIENT_SECRET` | When real OAuth active | `None` | OAuth 2.0 client secret — never commit |
| `GOOGLE_REDIRECT_URI` | When real OAuth active | `helios://oauth/callback/google` | Deep-link URI registered in Google Cloud Console |
| `TOKEN_ENCRYPTION_KEY` | When storing real tokens | `None` | Fernet key (URL-safe base64, 32 bytes) |

**Generate a Fernet key:**
```bash
python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

**Obtain Google credentials:**
1. Go to [Google Cloud Console → APIs & Credentials](https://console.cloud.google.com/apis/credentials)
2. Create an OAuth 2.0 Client ID (Application type: iOS or Android)
3. Register `helios://oauth/callback/google` as an authorized redirect URI
4. Enable "Google Calendar API" and "Gmail API" in your project

---

## Key Rotation

If `TOKEN_ENCRYPTION_KEY` must be rotated (e.g., suspected compromise):

1. Generate a new Fernet key.
2. Run a migration script that:
   - Decrypts every `access_token_encrypted` / `refresh_token_encrypted` row with the **old** key.
   - Re-encrypts with the **new** key.
   - Writes the new ciphertext atomically.
3. Replace `TOKEN_ENCRYPTION_KEY` in the environment.
4. Restart all backend instances.

**Do not discard the old key until step 2 is confirmed complete.** Users whose tokens can't be re-encrypted will need to re-authorise.

---

## Current Limitations

- **`_STUB_EXCHANGE = True`** — `exchange_authorization_code()` validates credentials but returns placeholder tokens instead of calling Google. The storage pipeline is fully wired — stub tokens are encrypted and stored. Flip to `False` to activate real exchange (all credentials must be configured first).
- **Stub tokens in DB** — When `_STUB_EXCHANGE=True` and all credentials are configured, `POST /google/exchange` stores clearly-labelled placeholder strings (`stub_access_token__not_real__do_not_store`) in encrypted form. These are functional for pipeline testing but do not grant access to any Google API. Real OAuth will overwrite them.
- **No state persistence (CSRF)** — The `state` CSRF token is generated per `connect-url` call but not stored. Neither the callback nor the exchange endpoint verify it yet. A production implementation must persist state (e.g., Redis with a short TTL) before the redirect and reject mismatched state on return.
- **No deep-link intercept** — The mobile app CONNECT GOOGLE button calls `exchangeCode` directly with a stub code. A real OAuth flow requires `expo-auth-session` or `expo-web-browser` to open the authorization URL and intercept the `helios://oauth/callback/google` redirect.
- **No token refresh** — Sync simulation uses deterministic fake records and does not call any Google API. Token refresh logic is not yet implemented.
- **Outlook OAuth** — Microsoft OAuth (MSAL) is a separate flow not in the current roadmap. The architecture supports it via the same encrypted columns and a future provider-specific exchange handler.
- **No PKCE** — For a mobile OAuth public client, PKCE (`code_challenge` + `code_verifier`) should be added before the `helios://` deep-link callback is considered safe against authorization code interception attacks.

---

## Files Changed in V2.14

| File | Change |
|------|--------|
| `backend/app/models/integration.py` | Added `access_token_encrypted`, `refresh_token_encrypted`, `token_expires_at` columns |
| `backend/alembic/versions/012_integration_token_fields.py` | Migration: ALTER TABLE to add the three columns |
| `backend/app/services/token_encryption.py` | **NEW** — Fernet encryption/decryption service |
| `backend/app/config.py` | Added `google_client_id`, `google_client_secret`, `google_redirect_uri`, `token_encryption_key` settings |
| `backend/.env.example` | Documented Google OAuth and TOKEN_ENCRYPTION_KEY variables |
| `backend/requirements.txt` | Added `cryptography==43.0.1` |
| `backend/app/main.py` | Startup log when TOKEN_ENCRYPTION_KEY is unset |
| `backend/app/schemas/integration.py` | Added `token_expires_at` to `IntegrationOut` |
| `backend/app/routers/integrations.py` | Updated `_to_out` and `_stub` to include `token_expires_at` |
| `mobile/src/services/integrationService.ts` | Added `token_expires_at` to `Integration` type |
| `mobile/src/store/useIntegrationStore.ts` | Clears `token_expires_at` on optimistic disconnect |
| `mobile/src/app/(tabs)/integrations.tsx` | OAUTH READY badge and updated note for Google providers |

## Files Changed in V2.15

| File | Change |
|------|--------|
| `backend/app/schemas/integration.py` | Added `ConnectUrlResponse`, `CallbackResponse` schemas |
| `backend/app/routers/integrations.py` | Added `GET /google/connect-url` and `GET /google/callback` skeleton routes |
| `mobile/src/config/api.ts` | Added `googleConnectUrl` endpoint constant |
| `mobile/src/services/integrationService.ts` | Added `ConnectUrlResponse` type and `getConnectUrl` service method |
| `mobile/src/store/index.ts` | Exported `ConnectUrlResponse` type |
| `mobile/src/app/(tabs)/integrations.tsx` | CONNECT GOOGLE button (+ MOCK secondary) for Google providers; skeleton alert on press |
| `docs/oauth-token-architecture.md` | Updated status table and limitations for V2.15 skeleton |

## Files Changed in V2.16

| File | Change |
|------|--------|
| `backend/app/services/google_oauth.py` | **NEW** — token exchange service with `_STUB_EXCHANGE` flag, `OAuthNotConfiguredError`, `GoogleTokens` dataclass, full real-exchange HTTP path (deferred behind flag) |
| `backend/app/schemas/integration.py` | Added `ExchangeCodeRequest`, `ExchangeCodeResponse` |
| `backend/app/routers/integrations.py` | Added `POST /google/exchange` (JWT-auth); updated `GET /google/callback` to call exchange service; imported new service and schemas |
| `backend/requirements.txt` | Added `httpx==0.27.2` (HTTP client for real exchange path) |
| `mobile/src/config/api.ts` | Added `googleExchange` endpoint constant |
| `mobile/src/services/integrationService.ts` | Added `ExchangeCodeRequest`, `ExchangeCodeResponse` types; added `exchangeCode` service method |
| `mobile/src/store/index.ts` | Exported `ExchangeCodeRequest`, `ExchangeCodeResponse` |
| `mobile/src/app/(tabs)/integrations.tsx` | Differentiated alerts: unconfigured → setup instructions; configured → stub-active notice; updated static oauth note |
| `docs/oauth-token-architecture.md` | Updated current state table, limitations, and added V2.16 file list |

## Files Changed in V2.17

| File | Change |
|------|--------|
| `backend/app/services/token_encryption.py` | Added `TokenEncryptionError`, `validate_key()` — safe startup validation without raising; updated `_get_fernet()` to raise `TokenEncryptionError` |
| `backend/app/routers/integrations.py` | Added `logging`, `timedelta`, `encrypt_token`, `TokenEncryptionError`; implemented full token storage in `POST /google/exchange` — encrypt + upsert both Google provider rows, never log token values |
| `backend/app/main.py` | Imports `validate_key`; startup check now logs `info` (not set), `warning` (invalid key), or `info` (configured and valid) |
| `mobile/src/app/(tabs)/integrations.tsx` | `handleGoogleConnect` now calls `exchangeCode` when configured; refreshes integration list if `tokens_stored: true`; shows pipeline status in alert |
| `docs/oauth-token-architecture.md` | Updated current-state table, limitations; added V2.17 file list |

---

## V2.18 — Google Calendar Provider Adapter

### What Was Added

A new adapter service (`backend/app/services/google_calendar_adapter.py`) sits between HELIOS business logic and the Google Calendar REST API. It defines the full interface for calendar operations — `list_events`, `create_event`, `update_event`, `delete_event` — but executes stub behaviour only. No real Google API calls are made.

### Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│  Calendar router  (app/routers/calendar.py)                         │
│  Manages HELIOS-local calendar_events table — unchanged             │
└───────────────────────────────┬─────────────────────────────────────┘
                                │ future: adapter bridges local ↔ Google
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│  GoogleCalendarAdapter  (app/services/google_calendar_adapter.py)   │
│  _STUB = True  →  returns fixture data, no network call             │
│  _STUB = False →  decrypts token → httpx → Google Calendar API      │
└───────────────────────────────┬─────────────────────────────────────┘
                                │ (real path only)
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│  token_encryption.decrypt_token()                                   │
│  Reads access_token_encrypted from user_integrations row            │
└─────────────────────────────────────────────────────────────────────┘
```

### What Is Stubbed vs. What Is Real

| Behaviour | Status |
|-----------|--------|
| `list_events` method signature and call pattern | ✅ Real (stub returns 3 fixture events) |
| `create_event` method signature and call pattern | ✅ Real (stub echoes input with deterministic ID) |
| `update_event` method signature and call pattern | ✅ Real (stub patches fixture in memory) |
| `delete_event` method signature and call pattern | ✅ Real (stub returns `True`, no network call) |
| Token retrieval path (`_get_access_token`) | ✅ Real — DB look-up + `decrypt_token` call wired (not reached in stub mode) |
| HTTP calls to `googleapis.com/calendar/v3` | ⏳ Stubbed — flip `_STUB = False` to activate |
| Token refresh before expired access token | ⏳ Not yet implemented |

### Stub flag

```python
# backend/app/services/google_calendar_adapter.py
_STUB: bool = True   # ← set to False when real credentials are configured
```

When `_STUB = True`:
- No DB read for tokens.
- No HTTP request to Google.
- Each method logs at `INFO` level indicating stub mode.
- Returns deterministic fixture data (`_STUB_EVENTS` list for reads).

When `_STUB = False` (not yet enabled):
- `_get_access_token(user_id, db)` queries `user_integrations` for the connected Google Calendar row and calls `token_encryption.decrypt_token()`.
- The decrypted value is used only in the `Authorization: Bearer` header and never logged or returned.
- Real HTTP calls go to `https://www.googleapis.com/calendar/v3/calendars/primary/events`.

### Usage pattern (future)

```python
from app.services.google_calendar_adapter import (
    google_calendar_adapter,
    GoogleCalendarEventCreate,
)

events = google_calendar_adapter.list_events(user_id=current_user.id, db=db)

new_event = google_calendar_adapter.create_event(
    user_id=current_user.id,
    db=db,
    event=GoogleCalendarEventCreate(
        summary="Team Sync",
        start="2026-06-16T10:00:00Z",
        end="2026-06-16T10:30:00Z",
    ),
)
```

### Security invariants

- Raw token values are **never** logged (only `type(exc).__name__` on decryption failure).
- Raw token values are **never** returned from any adapter method.
- `_get_access_token` is a private helper; callers receive domain objects, not credentials.
- Stub tokens stored by `_STUB_EXCHANGE=True` (V2.17) are never passed to this adapter — the adapter operates on real encrypted rows only, and in stub mode it skips token access entirely.

### What remains for real sync

1. Set `_STUB = False` in `google_calendar_adapter.py`.
2. Set `_STUB_EXCHANGE = False` in `google_oauth.py` so real tokens are stored.
3. Provision `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `TOKEN_ENCRYPTION_KEY` in `.env`.
4. Implement token refresh: before each adapter call check `token_expires_at`; if within 5 minutes of expiry, call the Google token refresh endpoint and re-encrypt the new access token.
5. Wire the adapter into the sync router or a background task so triggered syncs call the real API instead of `sync_simulator.run_mock_sync`.

## Files Changed in V2.18

| File | Change |
|------|--------|
| `backend/app/services/google_calendar_adapter.py` | **NEW** — `GoogleCalendarAdapter` class with `list_events`, `create_event`, `update_event`, `delete_event`; `_STUB=True`; `_get_access_token` helper; singleton `google_calendar_adapter` |
| `docs/oauth-token-architecture.md` | Updated status table; added V2.18 architecture section |

---

## V2.19 — Gmail Provider Adapter

### What Was Added

A new adapter service (`backend/app/services/gmail_adapter.py`) sits between HELIOS business logic and the Gmail REST API. It defines the full interface for reading and modifying messages — `list_messages`, `get_message`, `mark_as_read`, `archive_message`, `search_messages` — but executes stub behaviour only. No real Gmail API calls are made. Email sending is explicitly out of scope.

### Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│  Email router  (app/routers/email.py)                               │
│  Manages HELIOS-local email_messages table — unchanged              │
└───────────────────────────────┬─────────────────────────────────────┘
                                │ future: adapter bridges local ↔ Gmail
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│  GmailAdapter  (app/services/gmail_adapter.py)                      │
│  _STUB = True  →  returns fixture data, no network call             │
│  _STUB = False →  decrypts token → httpx → Gmail API               │
└───────────────────────────────┬─────────────────────────────────────┘
                                │ (real path only)
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│  token_encryption.decrypt_token()                                   │
│  Reads access_token_encrypted from user_integrations row            │
│  provider = "gmail"                                                 │
└─────────────────────────────────────────────────────────────────────┘
```

### What Is Stubbed vs. What Is Real

| Behaviour | Status |
|-----------|--------|
| `list_messages` method signature and call pattern | ✅ Real (stub returns up to 5 fixture messages, filtered by label) |
| `get_message` method signature and call pattern | ✅ Real (stub looks up fixture by ID; returns `None` if not found) |
| `mark_as_read` method signature and call pattern | ✅ Real (stub returns `GmailModifyResult` with UNREAD removed) |
| `archive_message` method signature and call pattern | ✅ Real (stub returns `GmailModifyResult` with INBOX removed) |
| `search_messages` method signature and call pattern | ✅ Real (stub does substring match on sender/subject/snippet) |
| Token retrieval path (`_get_access_token`) | ✅ Real — queries `gmail` provider row + `decrypt_token` (not reached in stub mode) |
| HTTP calls to `gmail.googleapis.com` | ⏳ Stubbed — flip `_STUB = False` to activate |
| Per-message metadata batch fetch in `list_messages` | ⏳ Stubbed — real path fetches IDs then calls `get_message` per item |
| Email sending | Out of scope — not implemented |
| Token refresh before expired access token | ⏳ Not yet implemented |

### Stub flag

```python
# backend/app/services/gmail_adapter.py
_STUB: bool = True   # ← set to False when real credentials are configured
```

When `_STUB = True`:
- No DB read for tokens.
- No HTTP request to Gmail.
- Each method logs at `INFO` level indicating stub mode.
- `list_messages` / `search_messages` return from `_STUB_MESSAGES` (5 fixture messages).
- `get_message` finds by ID; returns `None` for unknown IDs.
- `mark_as_read` / `archive_message` return a `GmailModifyResult` reflecting the label change without touching Gmail.

When `_STUB = False` (not yet enabled):
- `_get_access_token(user_id, db)` queries `user_integrations` for the connected `gmail` row and calls `token_encryption.decrypt_token()`.
- The decrypted value is used only in `Authorization: Bearer` headers and never logged or returned.
- `list_messages` calls `GET /gmail/v1/users/me/messages` then fetches metadata per message ID.
- `search_messages` passes the `query` string as Gmail's `q=` parameter.
- `mark_as_read` / `archive_message` call `POST /messages/{id}/modify` with `removeLabelIds`.

### Gmail API note — two-step list

The Gmail API returns only `{id, threadId}` pairs from the list endpoint. A real `list_messages` call therefore issues one list request and then one `GET /messages/{id}?format=metadata` per item. The stub returns fully-populated `GmailMessage` objects directly, bypassing this two-step pattern. When `_STUB=False` the adapter handles the batch via the `_token` internal parameter to avoid re-decrypting on each iteration.

### Usage pattern (future)

```python
from app.services.gmail_adapter import gmail_adapter

# List inbox
messages = gmail_adapter.list_messages(
    user_id=current_user.id,
    db=db,
    label_ids=["INBOX", "UNREAD"],
)

# Mark as read
result = gmail_adapter.mark_as_read(
    user_id=current_user.id,
    db=db,
    message_id="stub_gmail_msg_001",
)

# Search
hits = gmail_adapter.search_messages(
    user_id=current_user.id,
    db=db,
    query="is:unread from:alex",
)
```

### Security invariants

- Raw token values are **never** logged (only `type(exc).__name__` on decryption failure).
- Raw token values are **never** returned from any adapter method.
- `_get_access_token` is a private helper; callers receive domain objects, not credentials.
- The `_token` parameter on `get_message` is prefixed with `_` to signal it is internal only — it passes an already-decrypted token between `list_messages` / `search_messages` and `get_message` to avoid repeated DB reads. It is not part of the public API.
- Stub tokens stored by `_STUB_EXCHANGE=True` (V2.17) are never passed to this adapter — in stub mode token access is skipped entirely.

### What remains for real sync

1. Set `_STUB = False` in `gmail_adapter.py`.
2. Set `_STUB_EXCHANGE = False` in `google_oauth.py` so real tokens are stored.
3. Provision `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `TOKEN_ENCRYPTION_KEY` in `.env`.
4. Implement token refresh: before each adapter call check `token_expires_at`; if within 5 minutes of expiry, call the Google token refresh endpoint and re-encrypt.
5. Wire the adapter into the sync router or a background task so triggered syncs call the real API instead of `sync_simulator.run_mock_sync`.

## Files Changed in V2.19

| File | Change |
|------|--------|
| `backend/app/services/gmail_adapter.py` | **NEW** — `GmailAdapter` class with `list_messages`, `get_message`, `mark_as_read`, `archive_message`, `search_messages`; `_STUB=True`; `_get_access_token` helper; singleton `gmail_adapter` |
| `docs/oauth-token-architecture.md` | Updated header, status table; added V2.19 architecture section |
