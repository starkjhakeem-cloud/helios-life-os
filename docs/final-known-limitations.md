# HELIOS — Final Known Limitations

**Date:** 2026-06-12
**Audit:** V3.14
**Context:** These are honest limitations of the current implementation. They are known, documented, and non-blocking for demo and portfolio use.

---

## 1. No Real Background Scheduler

**What works:** Background jobs can be created, configured, enabled/disabled, and triggered manually via `POST /background-jobs/{id}/trigger`. The trigger executes all job logic (AI briefing, suggestion scan, reminder check, integration sync) and returns results immediately.

**What doesn't work:** Jobs do not run on a schedule automatically. Schedule labels ("Daily at 8:00 AM", "Every 30 minutes") are display-only strings.

**What's needed:** A task queue (Celery + Redis) with a beat scheduler, or a cron-based serverless function. The trigger endpoint already contains all the execution logic — it only needs a caller.

---

## 2. No Push Notification Delivery

**What works:** In-app notifications are created in the database and displayed in the Inbox tab. The tab bar badge updates in real time. Notifications are emitted for all autonomy events, job triggers, and suggestion scans.

**What doesn't work:** No OS-level push notifications are sent. If the app is closed, the user will not receive an alert.

**What's needed:** APNs (iOS) or FCM (Android) device token registration, token storage per user, and a push delivery service. The notification content already exists in the database — delivery infrastructure is what's missing.

---

## 3. Calendar and Email Are Simulated

**What works:** The calendar and email screens display data, and the AI briefing and context engine include calendar events and emails in their outputs. The Google integration OAuth pipeline, adapter classes, and token encryption are all implemented.

**What doesn't work:** All calendar events and email messages come from the `sync_simulator` fixture data. No real Google Calendar or Gmail API calls are made.

**What's needed:** Set `_STUB=False` in `google_calendar_adapter.py` and `gmail_adapter.py`, supply real `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `TOKEN_ENCRYPTION_KEY`, and activate the real OAuth exchange by setting `_STUB_EXCHANGE=False` in `google_oauth.py`.

---

## 4. AI Responses Are Mocked by Default

**What works:** All AI features work with the mock provider — briefings, plans, chat, suggestions, daily plans, orchestration, agent context. The mock provider returns deterministic, representative responses.

**What doesn't work:** Responses are not data-driven or personalized — the mock provider returns the same template text regardless of user data (though the context engine does compose real user data into prompts).

**What's needed:** Set `AI_PROVIDER=openai` and provide a valid `OPENAI_API_KEY`. The OpenAI provider parses all mock response structures, so the switch is a config-only change. Rate limits and token costs apply.

---

## 5. JWT Secret Is a Weak Placeholder in the Example Config

**What works:** The backend starts and issues valid JWTs. A startup warning is logged if the secret matches known weak placeholders.

**What doesn't work:** The default `JWT_SECRET_KEY` in `.env.example` and the fallback in `config.py` is a placeholder. Using it in production would allow anyone to forge tokens.

**What's needed:** Before any non-local deployment, generate and set a strong secret:
```
python3 -c "import secrets; print(secrets.token_hex(32))"
```

---

## 6. Token Encryption Key Not Set by Default

**What works:** Mock connect and all OAuth-free features work without `TOKEN_ENCRYPTION_KEY`. The startup check validates the key if present and logs a warning if absent.

**What doesn't work:** OAuth tokens cannot be stored without a valid Fernet key. Real Google sign-in would fail at token storage.

**What's needed:** Generate a Fernet key and set it in the production environment:
```
python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

---

## 7. Briefings Are Not Persisted

**What works:** The daily briefing is generated on-demand and returned immediately. The background job trigger generates a briefing and sends an inbox notification with the greeting and summary.

**What doesn't work:** The briefing content is not stored in a dedicated table. There is no briefing history — each request generates a fresh briefing.

**What's needed:** A `daily_briefings` table with `user_id`, `generated_at`, `content` columns, and a dedicated endpoint to retrieve past briefings.

---

## 8. Reminder Check Does Not Detect Overdue Reminders

**What works:** The `reminder_check` job trigger counts all active reminders and emits a notification with the count.

**What doesn't work:** The check does not distinguish overdue reminders from future ones. It counts all reminders regardless of due date.

**What's needed:** An index on `Reminder.due_at` and a query that filters `due_at < now()` with `completed=False`.

---

## 9. ~~ESLint Not Installed~~ (Resolved in V3.14)

`eslint` and `eslint-config-expo` added to devDependencies. `eslint.config.js` created with Expo flat config. `npm run lint` now works.

---

## 10. Email Sending Not Implemented

**What works:** Email messages can be read, updated, and browsed. The Gmail adapter stub supports `list_messages`, `get_message`, `mark_as_read`, `archive_message`, and `search_messages`.

**What doesn't work:** There is no email compose or send capability. No endpoint or adapter method for sending emails exists.

**What's needed:** A `send_message` method in `gmail_adapter.py`, a dedicated endpoint, and Gmail send scope in the OAuth flow.

---

## 11. No HTTPS in Development Docker Setup

**What works:** The Docker Compose setup runs correctly for local development on `http://localhost:8000`.

**What doesn't work:** There is no TLS termination in the development Docker Compose configuration. Deploying as-is to a public host would serve traffic over HTTP.

**What's needed:** An nginx or Traefik reverse proxy in the Docker Compose configuration with Let's Encrypt certificate provisioning. Alternatively, deploy behind a cloud load balancer with TLS offloading.

---

## 12. No JWT Refresh Tokens

**What works:** Access tokens with a 60-minute expiry (configurable via `JWT_ACCESS_TOKEN_EXPIRE_MINUTES`). The mobile app stores the token in AsyncStorage and sends it with every request.

**What doesn't work:** When the access token expires, the user must log in again. There is no silent token refresh mechanism.

**What's needed:** A separate refresh token endpoint (`POST /auth/refresh`) with longer-lived tokens stored securely. The mobile `apiClient.ts` would need an interceptor to detect 401s and attempt a refresh before retrying.

---

## Summary Table

| Limitation | Severity for Demo | Severity for Production |
|------------|-------------------|------------------------|
| No background scheduler | None (manual trigger works) | High |
| No push notifications | Low (in-app inbox works) | Medium |
| Calendar/email simulated | None (fixture data works) | High |
| AI responses mocked | None (mock looks correct) | Low (config change) |
| Weak JWT secret in example | None | Critical |
| Token encryption key unset | None (mock-only) | Critical for OAuth |
| Briefings not persisted | None | Low |
| Reminder check not overdue-aware | None | Low |
| ESLint not installed | None (resolved) | Resolved |
| Email sending missing | None | Low |
| No HTTPS in dev compose | None (local only) | Critical |
| No JWT refresh | Low (60min sessions) | Medium |
