# HELIOS Private Beta Readiness Checklist

Date: 2026-06-26

## Backend

- [ ] Deploy backend with the production `DATABASE_URL`.
- [ ] Set `JWT_SECRET_KEY` to a generated 32-byte-or-larger secret.
- [ ] Set `TOKEN_ENCRYPTION_KEY` to a valid Fernet key before real Google OAuth use.
- [ ] Set AI provider keys for the desired provider path, or set `AI_PROVIDER=mock` for deterministic demo mode.
- [ ] Run `alembic upgrade head` after deploy.
- [ ] Confirm `alembic current` reports `027 (head)`.
- [ ] Confirm `/api/v1/health` returns `{"status":"ok"}`.
- [ ] Confirm `/docs` is unavailable or access-controlled if public exposure is not desired.

## Mobile

- [ ] Set `EXPO_PUBLIC_API_URL` to the production backend base URL for non-development builds.
- [ ] Confirm login/signup use the production backend URL in a release build.
- [ ] Confirm local logout clears access and refresh tokens.
- [ ] Confirm session-expired UX handles backend 401 responses.
- [ ] Confirm Home loads Daily Brief, Task Engine Suggestions, Next Best Action, and Dashboard Summary.
- [ ] Confirm Assistant chat sends to `/api/v1/ai/chat`.
- [ ] Confirm Goals detail opens with backend progress and linked tasks.
- [ ] Confirm Task Center can create, complete, schedule, accept, and reject tasks/suggestions.
- [ ] Confirm Calendar month/day views load History and available windows.
- [ ] Confirm Connected Services can connect, reconnect, sync, and disconnect Google services.

## Google OAuth

- [ ] Google Cloud project has Calendar and Gmail APIs enabled.
- [ ] OAuth consent screen is configured for the private beta audience.
- [ ] Backend redirect URI is registered exactly as `GOOGLE_REDIRECT_URI`.
- [ ] Mobile deep link redirect URI matches `GOOGLE_OAUTH_APP_REDIRECT_URI`.
- [ ] Calendar scopes include `https://www.googleapis.com/auth/calendar.readonly`.
- [ ] Gmail scopes include `https://www.googleapis.com/auth/gmail.readonly`.
- [ ] Token encryption key is present before exchanging real authorization codes.
- [ ] Reconnect flow uses `/api/v1/integrations/google/reconnect-url`.

## Verification Commands

Backend:

```bash
cd backend
PYTHONPATH=. .venv/bin/python -m pytest
PYTHONPATH=. .venv/bin/alembic upgrade head
PYTHONPATH=. .venv/bin/alembic current
PYTHONPATH=. .venv/bin/python -m compileall app
```

Mobile:

```bash
cd mobile
npm test -- --runInBand
npx tsc --noEmit
```

## Known Limitations

- Backend logout/session revocation is not server-side yet; mobile logout is local token clearing.
- "Today's Flow" is composed from Daily Brief, Task Engine Suggestions, and Next Best Action rather than a single backend endpoint.
- Google integration tests are deterministic adapter tests; production success depends on live Google credentials and API availability.
- AI quality and availability depend on configured provider quota; fallback/error normalization is implemented.
- pgvector is enabled where available; keyword/JSON fallback remains functional when the extension is unavailable.
