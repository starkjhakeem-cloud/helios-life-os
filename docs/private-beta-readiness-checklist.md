# HELIOS Private Beta Readiness Checklist

Date: 2026-06-27

## V3 Readiness Snapshot

V3 is feature/polish complete on the `helios-v3` branch and ready for final beta gating. The codebase has passed local backend and mobile validation, and sanitized screenshots are available under `screenshots/sanitized/` for README, portfolio, and recruiter review.

Before treating V3 as the public beta snapshot, complete the real-world gates that cannot be fully verified from local automation:

- [ ] Real-device QA on an iPhone
- [ ] Live Google Calendar OAuth connect/sync/disconnect/reconnect
- [ ] Live Gmail OAuth connect/sync/disconnect/reconnect
- [ ] `helios-v3` merged into `main`
- [ ] `main` pushed to GitHub
- [ ] Beta tag created, for example `v1.0.0-beta`

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
- [ ] Confirm theme preference persists after app restart.
- [ ] Confirm 12-hour time is the default for a fresh account.
- [ ] Confirm Profile system settings can switch between 12-hour and 24-hour time.
- [ ] Confirm native date pickers open correctly in Profile, Goals, Tasks, and Calendar forms.
- [ ] Confirm Home loads Daily Brief, Task Engine Suggestions, Next Best Action, and Dashboard Summary.
- [ ] Confirm Assistant chat sends to `/api/v1/ai/chat`.
- [ ] Confirm Goals detail opens with backend progress and linked tasks.
- [ ] Confirm Task Center can create, complete, schedule, accept, and reject tasks/suggestions.
- [ ] Confirm Calendar month/day views load History and available windows.
- [ ] Confirm Connected Services can connect, reconnect, sync, and disconnect Google services.
- [ ] Confirm floating bottom navigation does not cover the final actionable content on Home, Goals, Tasks, Calendar, More, Connected Services, Life Area, and Notifications.

## Real-Device QA

Use this pass to catch issues the simulator can miss.

- [ ] Install a development or preview build on a real iPhone.
- [ ] Sign up with a fresh account.
- [ ] Log out and log back in.
- [ ] Force-close and reopen the app to confirm session and preferences persist.
- [ ] Test the keyboard on every editable form: login, signup, profile, password, email, goals, tasks, calendar, assistant.
- [ ] Verify Caps Lock, Shift, autocapitalization, and email/password fields behave like standard iOS inputs.
- [ ] Check modals and sheets in portrait orientation.
- [ ] Check light mode, dark mode, and system theme.
- [ ] Test Location Services auto-detect with device permission enabled and denied.
- [ ] Confirm no personal account data appears in portfolio screenshots or public docs.

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
npx jest --runInBand --watchman=false
npx tsc --noEmit
npx eslint .
```

Repository:

```bash
git status --short --branch
git diff --check
```

## Tester Brief

Give private beta testers a small, bounded script instead of asking them to explore blindly:

1. Create an account and complete basic profile settings.
2. Create one long-term goal and two supporting tasks.
3. Open Home and confirm Daily Brief / Today’s Flow feel relevant.
4. Ask Assistant one planning question and one schedule/context question.
5. Create a calendar event and review the Calendar timeline.
6. Connect Google Calendar or Gmail only if the test build is configured for live OAuth.
7. Change theme and time format, force-close the app, then confirm preferences persist.
8. Report any dead taps, confusing copy, loading loops, red screens, or sensitive-data leaks.

## Known Limitations

- Backend logout/session revocation is not server-side yet; mobile logout is local token clearing.
- "Today's Flow" is composed from Daily Brief, Task Engine Suggestions, and Next Best Action rather than a single backend endpoint.
- Google integration tests are deterministic adapter tests; production success depends on live Google credentials and API availability.
- AI quality and availability depend on configured provider quota; fallback/error normalization is implemented.
- pgvector is enabled where available; keyword/JSON fallback remains functional when the extension is unavailable.
