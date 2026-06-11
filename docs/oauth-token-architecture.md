# OAuth and Secure Token Architecture

**Status:** OAuth skeleton active. Authorization URL generation working. Token exchange not yet implemented.
**Added in:** V2.14 (architecture), V2.15 (skeleton flow)
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
| `GET /integrations/google/callback` | ✅ Skeleton — accepts code, no exchange yet |
| Frontend CONNECT GOOGLE button | ✅ Calls endpoint, shows URL in alert |
| State token persistence (CSRF) | ⏳ Not yet implemented |
| Real token exchange | ⏳ Not yet implemented (V2.16) |
| Deep-link intercept + exchange | ⏳ Not yet implemented (V2.16) |

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

- **No real token exchange** — `GET /integrations/google/callback` accepts the authorization code but does not exchange it for tokens yet.
- **No state persistence** — The `state` CSRF token returned by `connect-url` is generated but not stored. The callback does not verify it. A production implementation must store state (e.g., Redis TTL or DB row) and reject callbacks with mismatched state.
- **No real token storage** — `access_token_encrypted` and `refresh_token_encrypted` are always `NULL`. Token storage will be wired in V2.16.
- **No real browser flow** — The frontend CONNECT GOOGLE button calls `connect-url` and shows the URL in an alert. Real OAuth requires `expo-auth-session` or `expo-web-browser` to open the authorization URL and intercept the deep link callback.
- **No token refresh** — Sync simulation uses deterministic fake records; it does not call any Google API.
- **Outlook OAuth** — Microsoft OAuth (MSAL) is a separate flow and is not in the current roadmap. The architecture supports it via the same encrypted columns.
- **No PKCE** — For a fully public mobile app, PKCE (`code_challenge` + `code_verifier`) should be added before the `helios://` deep-link callback is considered safe against code-interception attacks.

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
