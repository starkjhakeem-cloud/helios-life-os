# Google OAuth Implementation Checklist

**Status:** Pre-implementation checklist  
**Added in:** V2.21  
**Prerequisite reading:** `docs/oauth-token-architecture.md`, `docs/v2-real-integration-readiness-report.md`  
**Goal:** Enable real Google Calendar (read/write) and Gmail (read-only) OAuth in HELIOS without redesigning the app.

All infrastructure exists. Three flags need to flip:
- `_STUB_EXCHANGE = False` in `backend/app/services/google_oauth.py`
- `_STUB = False` in `backend/app/services/google_calendar_adapter.py`
- `_STUB = False` in `backend/app/services/gmail_adapter.py`

Work through every section below — in order — before flipping any flag.

---

## Section 1 — Google Cloud Console Setup

### 1.1 Project
- [ ] Log in to [Google Cloud Console](https://console.cloud.google.com/)
- [ ] Create a new project named `HELIOS` (or reuse an existing one)
- [ ] Note the **Project ID** — needed in later steps

### 1.2 Enable APIs
In the project, navigate to **APIs & Services → Library** and enable:
- [ ] **Google Calendar API**
- [ ] **Gmail API**

Both must show status **Enabled** before credentials are created.

### 1.3 OAuth Consent Screen
Navigate to **APIs & Services → OAuth consent screen**:

- [ ] User Type: **External** (allows any Google account during development; switch to Internal for workspace-only later)
- [ ] App name: `HELIOS`
- [ ] User support email: your email
- [ ] Developer contact information: your email
- [ ] App logo: optional for testing; required for production verification
- [ ] App domain / homepage: required for production; optional while in **Testing** status
- [ ] Authorized domains: add your production domain if deploying (e.g., `helios.app`)
- [ ] Click **Save and Continue**

**Scopes screen:**
- [ ] Click **Add or Remove Scopes**
- [ ] Add these scopes in this order (start minimal, expand later):

| Scope | Purpose | Start with |
|-------|---------|------------|
| `https://www.googleapis.com/auth/calendar.readonly` | Read calendar events | ✅ Yes |
| `https://www.googleapis.com/auth/calendar.events` | Create/update/delete events | ✅ Yes |
| `https://www.googleapis.com/auth/gmail.readonly` | Read Gmail messages | ✅ Yes |
| `https://www.googleapis.com/auth/gmail.send` | Send Gmail messages | ⏳ Later |

> **Do not add `gmail.send` yet.** HELIOS does not implement sending. Adding an unused sensitive scope triggers a more complex Google verification process.

- [ ] Click **Save and Continue**

**Test users screen (Testing status only):**
- [ ] Add your Google account email as a test user
- [ ] Anyone who will test the app must be added here while the app is in Testing status
- [ ] Click **Save and Continue**

### 1.4 OAuth Client ID
Navigate to **APIs & Services → Credentials → Create Credentials → OAuth client ID**:

**For local development (iOS Simulator):**
- [ ] Application type: **iOS**
- [ ] Name: `HELIOS iOS Dev`
- [ ] Bundle ID: match `app.json` → `expo.ios.bundleIdentifier` (e.g., `com.yourname.helios`)
- [ ] Click **Create**
- [ ] Copy the **Client ID** — this is `GOOGLE_CLIENT_ID`

> iOS clients do not have a client secret. For native OAuth flows the `client_secret` field is not used. Set `GOOGLE_CLIENT_SECRET` to a placeholder string (e.g., `not-used-for-ios`) so the config check passes.

**For production (if using web backend redirect):**
- [ ] Application type: **Web application**
- [ ] Name: `HELIOS Web Backend`
- [ ] Authorized redirect URIs: add `https://api.helios.app/api/v1/integrations/google/callback`
- [ ] Copy the **Client ID** and **Client Secret** separately

> HELIOS uses the mobile deep-link flow (`helios://oauth/callback/google`) not the web backend redirect. The iOS credential above is the primary credential for real deployment.

---

## Section 2 — Redirect URI

### 2.1 Deep-link URI
The current configured redirect URI is `helios://oauth/callback/google` (set in `GOOGLE_REDIRECT_URI` env var and defaulted in `backend/app/config.py`).

- [ ] Confirm the Expo app scheme matches. In `mobile/app.json` (or `app.config.js`):
  ```json
  {
    "expo": {
      "scheme": "helios"
    }
  }
  ```
- [ ] For an iOS native credential, deep-link URIs do not need to be registered in Google Cloud Console — the custom URL scheme is validated by the iOS app bundle ID
- [ ] For a web credential, the full `https://` redirect URI must be in the **Authorized redirect URIs** list

### 2.2 Expo Go / Development build note
- [ ] Expo Go does not support custom URI schemes. Use a **development build** (`eas build --profile development`) for OAuth testing
- [ ] `expo-web-browser` (already installed at `~55.0.16`) handles the browser session; it requires a native build to redirect back via the `helios://` scheme

---

## Section 3 — Environment Variables

Set these in `backend/.env` before any other step. Never commit this file.

```bash
# Google OAuth credentials
GOOGLE_CLIENT_ID=<iOS client ID from Google Cloud Console>
GOOGLE_CLIENT_SECRET=not-used-for-ios   # native iOS flow has no client secret
GOOGLE_REDIRECT_URI=helios://oauth/callback/google

# Token encryption — generate a new Fernet key:
# python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
TOKEN_ENCRYPTION_KEY=<your-generated-fernet-key>
```

Verification checklist:
- [ ] `GOOGLE_CLIENT_ID` matches the iOS credential created in Section 1.4
- [ ] `TOKEN_ENCRYPTION_KEY` is a valid Fernet key — start the backend and confirm the startup log says `TOKEN_ENCRYPTION_KEY is configured and valid`
- [ ] Backend health check passes: `curl http://localhost:8000/api/v1/health`
- [ ] `GET /api/v1/integrations/google/connect-url` returns `"configured": true`

---

## Section 4 — Scope Adjustment (Backend)

> **Action required before enabling real OAuth.**

The current scope string in `backend/app/routers/integrations.py` (`_GOOGLE_SCOPES`) includes `gmail.send`. Per the implementation goal, Gmail must start read-only.

**File:** `backend/app/routers/integrations.py` (line ~206)

**Current:**
```python
_GOOGLE_SCOPES = " ".join([
    "https://www.googleapis.com/auth/calendar.readonly",
    "https://www.googleapis.com/auth/calendar.events",
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/gmail.send",    # ← remove for now
])
```

**Change to:**
```python
_GOOGLE_SCOPES = " ".join([
    "https://www.googleapis.com/auth/calendar.readonly",
    "https://www.googleapis.com/auth/calendar.events",
    "https://www.googleapis.com/auth/gmail.readonly",
])
```

Also update `_DEFAULT_SCOPES` for the `"gmail"` key:

**File:** `backend/app/routers/integrations.py` (line ~52)

**Current:**
```python
"gmail": [
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/gmail.send",    # ← remove for now
],
```

**Change to:**
```python
"gmail": [
    "https://www.googleapis.com/auth/gmail.readonly",
],
```

And the same adjustment is needed in `backend/app/services/google_oauth.py` (`_GOOGLE_SCOPES` list, line ~29):
```python
_GOOGLE_SCOPES = [
    "https://www.googleapis.com/auth/calendar.readonly",
    "https://www.googleapis.com/auth/calendar.events",
    "https://www.googleapis.com/auth/gmail.readonly",
    # gmail.send removed until HELIOS implements sending
]
```

- [ ] All three scope lists updated to remove `gmail.send`
- [ ] Confirmed the OAuth consent screen in Google Cloud Console only includes these three scopes

---

## Section 5 — Backend Implementation Steps

Complete these in order. Do not flip `_STUB_EXCHANGE = False` until all are done.

### 5.1 State token persistence (CSRF protection)

**Why:** Without persisting the `state` value, any attacker who can forge a callback URL can complete OAuth on behalf of a user.

**File:** `backend/app/routers/integrations.py`

**Option A — in-memory (dev only, single-process):**
```python
import threading
_state_store: dict[str, float] = {}   # state → expiry timestamp (UTC)
_state_lock = threading.Lock()

def _store_state(state: str, ttl_seconds: int = 300) -> None:
    with _state_lock:
        _state_store[state] = time.time() + ttl_seconds

def _consume_state(state: str) -> bool:
    with _state_lock:
        expiry = _state_store.pop(state, None)
        if expiry is None or time.time() > expiry:
            return False
        return True
```

**Option B — Redis (recommended for production):**
```python
import redis
r = redis.Redis(host=settings.redis_host, port=6379, decode_responses=True)

def _store_state(state: str, ttl_seconds: int = 300) -> None:
    r.setex(f"oauth_state:{state}", ttl_seconds, "1")

def _consume_state(state: str) -> bool:
    return r.delete(f"oauth_state:{state}") == 1
```

**Changes needed:**
- [ ] Call `_store_state(state)` in `GET /google/connect-url` before returning
- [ ] Call `_consume_state(state)` in `POST /google/exchange` — return HTTP 400 if it returns `False`
- [ ] Update the `ExchangeCodeRequest` handler docstring to remove "State verification not yet implemented"

### 5.2 PKCE (Proof Key for Code Exchange)

**Why:** Custom URI scheme redirect targets (`helios://`) in mobile OAuth are vulnerable to authorization code interception without PKCE.

**What needs to change:**

Backend `GET /google/connect-url`:
```python
# Return code_challenge in ConnectUrlResponse so the mobile app can use it
# The verifier is generated mobile-side; the challenge is sent to Google in the URL
```

Alternatively, generate the PKCE pair server-side and return the `code_verifier` to the mobile client, which passes it back in the exchange request. Either pattern works; the mobile-side generation is more standard.

Add to `ConnectUrlResponse` schema:
```python
class ConnectUrlResponse(BaseModel):
    url: str
    state: str
    configured: bool
    note: str
    # Add when implementing PKCE:
    # code_challenge: str
    # code_challenge_method: str  # always "S256"
```

Add to `ExchangeCodeRequest` schema:
```python
class ExchangeCodeRequest(BaseModel):
    code: str
    state: str | None = None
    # Add when implementing PKCE:
    # code_verifier: str
```

Add `code_verifier` to the token exchange POST body in `google_oauth.py`:
```python
data={
    "code": code,
    "client_id": settings.google_client_id,
    "client_secret": settings.google_client_secret,
    "redirect_uri": redirect_uri,
    "grant_type": "authorization_code",
    "code_verifier": code_verifier,   # add this
},
```

- [ ] Decide: PKCE pair generated mobile-side or server-side
- [ ] `ConnectUrlResponse` schema updated with challenge fields (or mobile generates pair independently)
- [ ] `ExchangeCodeRequest` schema updated with `code_verifier`
- [ ] `google_oauth.py` `exchange_authorization_code` signature updated to accept `code_verifier`
- [ ] `integrations.py` exchange handler passes `code_verifier` through

### 5.3 Token refresh service

**Why:** Google access tokens expire in 1 hour. Sync jobs that run after expiry will receive HTTP 401.

**Create:** `backend/app/services/google_token_refresh.py`

```python
"""
Google OAuth token refresh service.
Called by adapters before each API call when the access token is near expiry.
"""
from datetime import datetime, timedelta, timezone
from sqlalchemy.orm import Session

REFRESH_THRESHOLD_MINUTES = 5  # refresh if expiring within 5 minutes

def needs_refresh(token_expires_at: datetime | None) -> bool:
    if not token_expires_at:
        return True
    return token_expires_at < datetime.now(timezone.utc) + timedelta(minutes=REFRESH_THRESHOLD_MINUTES)

def refresh_google_token(user_id: str, provider: str, db: Session) -> str:
    """
    Refresh the access token for the given user+provider.
    Returns the new decrypted access token. NEVER log the return value.
    Raises RuntimeError on failure.
    """
    from app.models.integration import UserIntegration
    from app.services.token_encryption import decrypt_token, encrypt_token
    from app.config import settings
    import httpx

    row = db.execute(
        select(UserIntegration).where(
            UserIntegration.user_id == user_id,
            UserIntegration.provider == provider,
        )
    ).scalar_one_or_none()

    if not row or not row.refresh_token_encrypted:
        raise RuntimeError(f"No refresh token for user {user_id} / {provider}")

    refresh_token = decrypt_token(row.refresh_token_encrypted)

    resp = httpx.post(
        "https://oauth2.googleapis.com/token",
        data={
            "client_id": settings.google_client_id,
            "client_secret": settings.google_client_secret,
            "refresh_token": refresh_token,
            "grant_type": "refresh_token",
        },
        timeout=10.0,
    )
    if resp.status_code != 200:
        raise RuntimeError(f"Token refresh failed: HTTP {resp.status_code}")

    payload = resp.json()
    new_access = payload["access_token"]
    expires_in = payload.get("expires_in", 3600)

    row.access_token_encrypted = encrypt_token(new_access)
    row.token_expires_at = datetime.now(timezone.utc) + timedelta(seconds=expires_in)
    row.updated_at = datetime.now(timezone.utc)
    db.commit()

    return new_access  # NEVER log this value
```

Wire into adapters:
```python
# In google_calendar_adapter.py _get_access_token():
from app.services.google_token_refresh import needs_refresh, refresh_google_token

if needs_refresh(row.token_expires_at):
    return refresh_google_token(user_id, "google_calendar", db)
return decrypt_token(row.access_token_encrypted)
```

- [ ] `backend/app/services/google_token_refresh.py` created
- [ ] Wired into `google_calendar_adapter._get_access_token()`
- [ ] Wired into `gmail_adapter._get_access_token()`

### 5.4 Flip the stub flag

Only after 5.1–5.3 are complete:

- [ ] `backend/app/services/google_oauth.py` → `_STUB_EXCHANGE: bool = False`
- [ ] `backend/app/services/google_calendar_adapter.py` → `_STUB: bool = False`
- [ ] `backend/app/services/gmail_adapter.py` → `_STUB: bool = False`

---

## Section 6 — Frontend Implementation Steps

`expo-web-browser` (`~55.0.16`) and `expo-linking` (`~55.0.15`) are already installed.

### 6.1 Replace the stub exchange call

**File:** `mobile/src/app/(tabs)/integrations.tsx` — `handleGoogleConnect()`

**Current (stub):**
```typescript
const result = await integrationService.exchangeCode(accessToken, {
  code: "stub_pipeline_v2_17",
  state: data.state,
});
```

**Replace with real OAuth flow:**
```typescript
import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";

async function handleGoogleConnect(provider: IntegrationProvider) {
  if (!accessToken) return;
  setConnectingProvider(provider);
  try {
    // 1. Fetch the authorization URL from the backend
    const connectData = await integrationService.getConnectUrl(accessToken);
    if (!connectData.configured) {
      Alert.alert("OAuth Not Configured", "Set credentials in backend/.env first.");
      return;
    }

    // 2. Open browser session — redirects to helios:// on completion
    const redirectUri = Linking.createURL("oauth/callback/google");
    const result = await WebBrowser.openAuthSessionAsync(
      connectData.url,
      redirectUri,
    );

    if (result.type !== "success") {
      // User cancelled or an error occurred
      return;
    }

    // 3. Parse authorization code and state from the redirect URL
    const url = new URL(result.url);
    const code = url.searchParams.get("code");
    const returnedState = url.searchParams.get("state");
    const error = url.searchParams.get("error");

    if (error || !code) {
      Alert.alert("Authorization Failed", error ?? "No authorization code received.");
      return;
    }

    // 4. Exchange the code for tokens via the backend
    const exchangeResult = await integrationService.exchangeCode(accessToken, {
      code,
      state: returnedState ?? undefined,
    });

    if (exchangeResult.tokens_stored) {
      await fetchIntegrations(accessToken);
      Alert.alert("Connected", "Google Calendar and Gmail connected successfully.");
    }

  } catch (err) {
    Alert.alert("Error", err instanceof Error ? err.message : "Connection failed.");
  } finally {
    setConnectingProvider(null);
  }
}
```

- [ ] `handleGoogleConnect` updated to use `WebBrowser.openAuthSessionAsync`
- [ ] Deep-link URL parsed with `URL` constructor (available in React Native via the `url` polyfill, or use `Linking.parse`)
- [ ] `code` and `state` extracted and passed to `exchangeCode`
- [ ] User-cancellation path (`result.type !== "success"`) handled silently (no error alert)
- [ ] Error path from Google (`error` param in redirect) handled with alert

### 6.2 Deep-link route (optional but recommended)
Expo Router can intercept the `helios://oauth/callback/google` deep link even when the app is already open. If users are redirected into the app via a link outside the `openAuthSessionAsync` flow, the app should handle it gracefully:

```typescript
// mobile/src/app/oauth/callback/google.tsx (new file, only if needed)
import { useEffect } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useAuthStore, useIntegrationStore } from "../../store";

export default function GoogleOAuthCallback() {
  const { code, state, error } = useLocalSearchParams<{
    code?: string;
    state?: string;
    error?: string;
  }>();
  const router = useRouter();
  // handle code exchange here if not intercepted by openAuthSessionAsync
  useEffect(() => {
    // ... exchange code, then router.replace("/(tabs)/integrations")
  }, []);
  return null;
}
```

- [ ] Decide whether a dedicated callback route is needed (usually not, if `openAuthSessionAsync` is used correctly)

### 6.3 Linking configuration
- [ ] Confirm `app.json` has `"scheme": "helios"` so `Linking.createURL` produces `helios://`
- [ ] Test `Linking.createURL("oauth/callback/google")` resolves to `helios://oauth/callback/google`

---

## Section 7 — Token Storage and Security Checklist

- [ ] `TOKEN_ENCRYPTION_KEY` is set in `.env` and NOT in `.env.example` as a real value
- [ ] `TOKEN_ENCRYPTION_KEY` startup validation passes — backend log shows `TOKEN_ENCRYPTION_KEY is configured and valid`
- [ ] `access_token_encrypted` and `refresh_token_encrypted` columns are never returned in any API response — verify with `GET /api/v1/integrations` response payload
- [ ] No `logger.info/debug/warning/error` call anywhere logs a raw token value (audit confirmed in V2.20)
- [ ] `POST /google/exchange` rolls back the DB transaction on any storage failure — confirmed in `integrations.py` (V2.17)
- [ ] Stub token strings (`stub_access_token__not_real__do_not_store`) are overwritten when real OAuth runs for the first time
- [ ] If key rotation is ever needed: decrypt all rows with old key, re-encrypt with new key, swap key — do not simply replace key without migration (tokens become unrecoverable)

---

## Section 8 — Local Testing Checklist

### Before any real OAuth
- [ ] `docker-compose up -d db` — PostgreSQL running
- [ ] `alembic upgrade head` — all 12 migrations applied
- [ ] Backend starts cleanly: no warnings about `TOKEN_ENCRYPTION_KEY` (it should log "configured and valid")
- [ ] `GET /api/v1/integrations/google/connect-url` returns `"configured": true`
- [ ] Mock connect still works: `POST /api/v1/integrations/mock-connect` with `{"provider": "google_calendar"}`
- [ ] Mock sync still works: `POST /api/v1/integrations/{id}/sync`

### OAuth flow testing (development build required)
- [ ] Install development build on iOS Simulator: `eas build --profile development --platform ios`
- [ ] Tap **CONNECT GOOGLE** — browser session opens Google login
- [ ] Log in with a test user account (added to OAuth consent screen test users in Section 1.3)
- [ ] Accept the permissions screen
- [ ] App receives the redirect at `helios://oauth/callback/google`
- [ ] `POST /google/exchange` returns `{"success": true, "tokens_stored": true, "stub": false}`
- [ ] Both Google Calendar and Gmail cards show **CONNECTED**
- [ ] `token_expires_at` is approximately 1 hour in the future
- [ ] **SYNC NOW** on Google Calendar card triggers `POST /api/v1/integrations/{id}/sync`
- [ ] Sync job completes successfully
- [ ] Calendar events from the sync appear on the Calendar screen

### Token storage verification
```bash
# Confirm encrypted tokens are in the DB (values should be Fernet ciphertext, not plaintext)
psql $DATABASE_URL -c "SELECT provider, status, token_expires_at, LEFT(access_token_encrypted, 20) FROM user_integrations WHERE provider IN ('google_calendar', 'gmail');"
# access_token_encrypted should start with "gAAAAA" (Fernet prefix)
# token_expires_at should be ~1 hour from now
```

- [ ] `access_token_encrypted` is Fernet ciphertext (starts with `gAAAAA`)
- [ ] `refresh_token_encrypted` is Fernet ciphertext
- [ ] Neither appears in `GET /api/v1/integrations` response

### Disconnect and reconnect
- [ ] Tap **DISCONNECT** on a Google card — card shows DISCONNECTED
- [ ] Confirm row is removed from `user_integrations`
- [ ] Tap **CONNECT GOOGLE** again — new OAuth flow completes successfully

### Token refresh (if testing with expired tokens)
```bash
# Force-expire the access token to test refresh logic
psql $DATABASE_URL -c "UPDATE user_integrations SET token_expires_at = NOW() - INTERVAL '1 minute' WHERE provider = 'google_calendar';"
# Then trigger a sync — should automatically refresh the token
```
- [ ] Sync after forced expiry completes successfully
- [ ] `token_expires_at` is updated to ~1 hour in the future

---

## Section 9 — Production Testing Checklist

### Before deploying real OAuth to production
- [ ] OAuth consent screen app status changed to **In Production** (Google verification may be required for sensitive scopes like `gmail.readonly`)
- [ ] Production `TOKEN_ENCRYPTION_KEY` is different from the development key
- [ ] `JWT_SECRET_KEY` is not a weak placeholder value (startup warning absent)
- [ ] `GOOGLE_CLIENT_ID` in production env matches a production credential (not the dev client ID)
- [ ] `CORS_ORIGINS` is restricted to the production mobile app's API domain if a web frontend is added
- [ ] Error monitoring is in place — `POST /google/exchange` failures should trigger an alert

### Google verification (for sensitive scopes)
`gmail.readonly` is a **restricted scope** that requires Google verification before it can be used by accounts outside your organization. While the app is in **Testing** status (up to 100 test users), verification is not required.

For production (unrestricted):
- [ ] Prepare privacy policy URL
- [ ] Prepare homepage URL explaining how Gmail data is used
- [ ] Submit for [Google OAuth App Verification](https://support.google.com/cloud/answer/13463073)
- [ ] Allow 2–4 weeks for review

`calendar.events` and `calendar.readonly` are **non-sensitive** and do not require special verification.

### Smoke tests in production
- [ ] `GET /api/v1/integrations/google/connect-url` → `"configured": true`
- [ ] Full OAuth flow on a real device (not simulator)
- [ ] `POST /google/exchange` → `"tokens_stored": true, "stub": false`
- [ ] Real calendar events appear after sync
- [ ] Real Gmail messages appear after sync

---

## Section 10 — Rollback Plan

If real OAuth causes issues, roll back by reverting the three flag changes. No DB migration or schema change is required.

### Step 1 — Revert stub flags (immediate, no restart needed if env var)
```python
# backend/app/services/google_oauth.py
_STUB_EXCHANGE: bool = True   # ← revert

# backend/app/services/google_calendar_adapter.py
_STUB: bool = True            # ← revert

# backend/app/services/gmail_adapter.py
_STUB: bool = True            # ← revert
```
Restart the backend. Mock connect and sync continue to work immediately.

### Step 2 — Clear any real tokens from the DB (optional)
```sql
-- Only run this if you want to force all users to reconnect with mock tokens
UPDATE user_integrations
SET access_token_encrypted  = NULL,
    refresh_token_encrypted = NULL,
    token_expires_at        = NULL,
    status                  = 'disconnected'
WHERE provider IN ('google_calendar', 'gmail');
```

### Step 3 — Frontend
The frontend requires no change — `handleGoogleConnect` falls back to the "not configured" alert when `configured: false` is returned, and mock-connect remains available as the secondary button.

### What is NOT affected by rollback
- All calendar events already written to `calendar_events` remain
- All email messages already written to `email_messages` remain
- All mock-connect integrations remain
- JWT auth, all other features unaffected

---

## Section 11 — Known Risks

| Risk | Severity | Mitigation |
|------|----------|-----------|
| State token not persisted | **High** — CSRF | Complete Section 5.1 before flipping `_STUB_EXCHANGE=False` |
| No PKCE | **Medium** — code interception on mobile | Complete Section 5.2 before production use |
| Access token expires before sync | **Medium** — sync fails silently | Complete Section 5.3 token refresh before relying on real sync data |
| `gmail.send` scope added prematurely | **Medium** — Google flags app as sensitive; slows verification | Do not add `gmail.send` until HELIOS implements the send feature (Section 4) |
| Expo Go cannot handle deep-link redirect | **Low in prod** — dev environment only | Use a development build for all OAuth testing |
| Stub tokens left in DB after real OAuth | **Low** — functionally harmless | Real tokens overwrite stub rows automatically in `POST /google/exchange` |
| Key loss = all tokens unrecoverable | **High if key is lost** | Back up `TOKEN_ENCRYPTION_KEY` in a secrets manager; never rotate without re-encrypting existing rows |
| Google OAuth app not verified for `gmail.readonly` | **Medium** — limits to 100 test users | Submit for verification before opening to public users |
| `prompt=consent` forces re-authorization every time | **Low** — user experience | After initial connect, remove `prompt=consent` from `_GOOGLE_SCOPES` URL params (or add only on first connect) |

---

## Quick Reference — Files to Change

| File | Change | Section |
|------|--------|---------|
| `backend/app/routers/integrations.py` | Remove `gmail.send` from `_GOOGLE_SCOPES` and `_DEFAULT_SCOPES` | 4 |
| `backend/app/services/google_oauth.py` | Remove `gmail.send` from `_GOOGLE_SCOPES`; set `_STUB_EXCHANGE = False` | 4, 5.4 |
| `backend/app/routers/integrations.py` | Add state persistence (`_store_state` / `_consume_state`) | 5.1 |
| `backend/app/schemas/integration.py` | Add `code_verifier` to `ExchangeCodeRequest` | 5.2 |
| `backend/app/services/google_oauth.py` | Accept `code_verifier` in `exchange_authorization_code` | 5.2 |
| `backend/app/services/google_token_refresh.py` | **NEW** — token refresh service | 5.3 |
| `backend/app/services/google_calendar_adapter.py` | Wire token refresh; set `_STUB = False` | 5.3, 5.4 |
| `backend/app/services/gmail_adapter.py` | Wire token refresh; set `_STUB = False` | 5.3, 5.4 |
| `mobile/src/app/(tabs)/integrations.tsx` | Replace stub exchange with real `openAuthSessionAsync` flow | 6.1 |

No new database migrations are required. All columns (`access_token_encrypted`, `refresh_token_encrypted`, `token_expires_at`) exist from migration 012.
