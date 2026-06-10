# HELIOS — Monitoring and Observability

A lightweight, self-hosted observability foundation for the HELIOS backend and mobile client.

## What this adds

- Structured backend logging with environment-aware log levels.
- Request logging middleware with `X-Request-ID` correlation support.
- Error handlers that log unexpected failures without exposing secrets.
- Startup and shutdown lifecycle logs for the API service.
- A diagnostics endpoint that validates basic system health and database connectivity.
- A frontend error reporter and client-side error boundary for consistent crash visibility.

## Backend logging architecture

The FastAPI service now uses a centralized logging configuration in `backend/app/logging_config.py`.

Key behaviors:

- `INFO` level in production and `DEBUG` level in development, controlled by `debug` and optional `LOG_LEVEL` settings.
- Every request receives a stable `X-Request-ID` header. The same ID is returned in responses and included in backend logs.
- Request timing, response status, and request path are logged for every HTTP request.
- Database errors and unhandled exceptions are logged explicitly with the request ID.
- Startup and shutdown events are logged so runbook timelines can be reconstructed.

## Diagnostics endpoints

The backend exposes:

- `GET /api/v1/health` — simple service status and timestamp.
- `GET /api/v1/version` — service version metadata.
- `GET /api/v1/health/diagnostics` — verifies DB connectivity and reports service version, environment, and timestamp.

## Frontend error handling

The mobile app now includes:

- `mobile/src/services/errorReporter.ts` for centralized client-side error logging.
- `mobile/src/components/ErrorBoundary.tsx` to catch rendering failures and keep the app from crashing silently.
- `mobile/src/app/_layout.tsx` wraps the app in the error boundary while preserving the current UI flow.
- `mobile/src/services/apiClient.ts` improves network and API error handling and reports errors through the centralized reporter.

## Troubleshooting workflow

1. Reproduce the issue and capture the request flow.
2. Check the backend logs for the matching `X-Request-ID` header.
3. Verify `GET /api/v1/health` returns `status: ok`.
4. If the backend is running but the app cannot reach it, confirm the mobile client uses the correct `API_CONFIG.BASE_URL`.
5. For server-side failures, inspect the logs for `Unhandled error` or `Database error` entries.
6. For frontend crashes, use the ErrorBoundary fallback and collection from `errorReporter`.

> Note: Logs intentionally never serialize request bodies or sensitive headers. The only client-visible correlation token is `X-Request-ID`.
