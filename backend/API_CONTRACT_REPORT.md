# HELIOS Phase 4 Backend API Contract Report

Date: 2026-06-26
Scope: backend endpoints required for app-wide intelligence wiring.

## Contract Defaults

- Base path: `/api/v1`
- Auth: all endpoints listed below require `Authorization: Bearer <JWT>`.
- User scoping: every listed endpoint resolves ownership through `current_user.id` and queries or writes rows by `user_id`. Cross-user resource access returns 404 where applicable.
- Frontend-safe errors: validation errors return FastAPI 422; not found returns concise `detail`; relationship/task-engine errors return `{"detail":{"error":"<code>","detail":"<message>"}}`; AI provider failures return 502 with public error detail; uncaught DB/generic errors are sanitized globally.
- Secret safety: OAuth access/refresh tokens and encrypted token columns are not included in response schemas. Integration responses expose status, scopes, account metadata, and token expiry only.

## Verified Endpoint Contracts

| Screen | Endpoint | Method | Purpose | Request shape | Response shape |
|---|---|---:|---|---|---|
| Home | `/daily-brief/today` | GET | Current daily brief | none | `DailyBriefOut`: date, greeting, summary, compact_text, calendar/email/tasks/goals arrays, next_best_action, focus_recommendation, warnings, insights, generated_at, data_sources, ai_used, ai_error |
| Home | `/daily-brief/generate` | POST | Generate or regenerate a daily brief | optional `{date?: YYYY-MM-DD, regenerate?: bool}` | `DailyBriefOut` |
| Home | `/relationships/next-best-action` | GET | Single recommended next action | none | `NextBestActionResponse`: type, title, reason, duration, linked IDs, suggested_start_time, confidence |
| Home | `/dashboard/summary` | GET | User context/dashboard summary | none | `DashboardSummary`: metrics, sections, system_status, last_updated |
| Home / Tasks | `/task-engine/suggestions` | GET | Today flow / recommendations list | query `status=pending|accepted|rejected`, `regenerate`, `limit` | `SuggestedTasksResponse`: suggestions, next_best_action, generated |
| Assistant | `/ai/chat` | POST | Assistant chat with retrieved context | `ChatRequest`: message, context_type?, related_goal_id?, related_task_id?, include_context? | `ChatResponse`: reply, suggested_actions, follow_up_questions, recommended_actions, provider, generated_at |
| Assistant | `/assistant/context/preview` | GET | Assistant context retrieval preview | query `message`, optional `context_type` | `{context_package, summarized_prompt, debug}` |
| Assistant | `/semantic-memory/search` | GET | Semantic/RAG memory context | query `q` or `query`, optional `limit`, `source_type`, `context_type` | `SearchResponse`: query, embedding_used, results[], total |
| Assistant | `/semantic-memory/reindex` | POST | Rebuild user semantic memory | none | `ReindexResponse`: indexed, failed, total, embedding_available, message |
| Tasks | `/tasks` | GET | Task list | none | `TasksResponse`: tasks[] |
| Tasks | `/tasks` | POST | Create task | `TaskCreate`: title, description?, status, priority, due_date?, linked_goal_id?, duration/category/source metadata | `TaskOut` |
| Tasks | `/task-engine/tasks/{task_id}/complete` | POST | Complete task and update history/progress | path `task_id` | `CompleteTaskResponse`: task, daily_history_updated, goal_progress? |
| Tasks | `/task-engine/suggestions/generate` | POST | Generate suggested tasks | `{sources?: string[], limit}` | `SuggestedTasksResponse` |
| Tasks | `/task-engine/suggestions/{suggestion_id}/accept` | POST | Accept suggestion into a task | `{schedule?: bool, schedule_date?, start_time?, end_time?}` | `AcceptSuggestionResponse`: suggestion, task, calendar_event?, goal_progress? |
| Tasks | `/task-engine/suggestions/{suggestion_id}/reject` | POST | Reject suggestion | `{reason?: string}` | `TaskSuggestionOut` |
| Tasks | `/task-engine/tasks/{task_id}/schedule` | POST | Auto/manual schedule task | `{date?, start_time?, end_time?}` | `ScheduleTaskEngineResponse`: task, calendar_event, selected_window? |
| Tasks | `/relationships/next-best-action` | GET | Next best task/action | none | `NextBestActionResponse` |
| Goals | `/goals` | GET | Goals list | none | `GoalsResponse`: goals[] |
| Goals | `/goals/{goal_id}` | GET | Goal detail | path `goal_id` | `GoalOut` |
| Goals | `/relationships/goals/{goal_id}/progress` | GET | Goal progress from linked tasks | path `goal_id` | `GoalProgressResponse` |
| Goals | `/goals/{goal_id}/tasks` | GET | Linked tasks for goal | path `goal_id` | `TasksResponse` |
| Goals | `/relationships/health` | GET | Relationship health diagnostics | none | `RelationshipHealthResponse` |
| Calendar | `/history/month` | GET | Monthly Life Timeline | query `year`, `month` | `DailyHistoryMonthResponse`: year, month, day summaries, total |
| Calendar | `/history/range` | GET | Day history range | query `start_date`, `end_date` | `DailyHistoryRangeResponse` |
| Calendar | `/history/day/{target_date}` | GET | Selected day details | path `target_date` | `DailyHistoryOut` |
| Calendar | `/relationships/available-windows` | GET | Available windows | query optional `date` | `TimeWindow[]` |
| Calendar | `/calendar/events` | GET | Synced/manual calendar events | query optional `upcoming_only` | `CalendarEventsResponse`; Google events use `source="google"` |
| Connected Services | `/integrations` | GET | Integrations status | none | `IntegrationListResponse`: integrations[], provider, services[] |
| Connected Services | `/integrations/google/sync` | POST | Sync Google Calendar/Gmail | optional `{service_type: calendar|gmail|both}` | `GoogleSyncResponse`: provider, summaries[] |
| Connected Services | `/integrations/{integration_id}/sync` | POST | Legacy/mock integration sync | path `integration_id` | `SyncJobOut` |
| Connected Services | `/integrations/google/reconnect-url` | GET | Reconnect Google OAuth | query optional `service_type` | `ConnectUrlResponse`: url, state, configured, note, service_type, scopes |
| Connected Services | `/integrations/google/disconnect` | POST | Disconnect Google service(s) | `{service_type: calendar|gmail|both}` | `GoogleDisconnectResponse`: provider, disconnected[] |
| Connected Services | `/integrations/{integration_id}` | DELETE | Remove legacy integration | path `integration_id` | 204 no body |

## Contracts Changed

- Added `GET /api/v1/goals/{goal_id}` for goal detail.
- Added `GET /api/v1/goals/{goal_id}/tasks` for linked tasks.
- Reused existing `GoalOut`, `TaskOut`, and `TasksResponse` schemas; no mobile/frontend files changed.

## Tests Added / Updated

- Added `test_goal_detail_and_linked_tasks_are_user_scoped` in `backend/tests/test_auth_and_goals.py`.
- The new test verifies:
  - owner can fetch goal detail,
  - owner can fetch tasks linked to the goal,
  - another authenticated user receives 404 for both endpoints.

## Missing Endpoints

- No hard blocker remains for the requested backend capabilities.
- Naming note: there is no single endpoint literally named "Today's Flow"; the contract is served by `/daily-brief/today`, `/task-engine/suggestions`, and `/relationships/next-best-action`.
- Naming note: Google reconnect is an auth URL endpoint (`/integrations/google/reconnect-url`), not a token-refresh endpoint.

## Verification

- Focused contract suite: `PYTHONPATH=. .venv/bin/python -m pytest tests/test_auth_and_goals.py tests/test_task_engine.py tests/test_relationship_logic.py tests/test_daily_brief.py tests/test_semantic_memory.py tests/test_google_integrations.py`
- Result: 125 passed.
- Full suite: `PYTHONPATH=. .venv/bin/python -m pytest`
- Result: 194 passed.
- Migrations: `PYTHONPATH=. .venv/bin/alembic upgrade head`
- Result: passed against local Postgres.
- Compile check: `PYTHONPATH=. .venv/bin/python -m compileall app`
- Result: passed.

## Next Steps For Claude

1. Wire Home to `/daily-brief/today`, `/task-engine/suggestions?regenerate=true`, `/relationships/next-best-action`, and `/dashboard/summary`.
2. Wire Assistant to `/ai/chat`; use `/assistant/context/preview` only for debug/developer context inspection.
3. Wire Tasks suggestion actions to `/task-engine/suggestions/{id}/accept|reject`; use `/task-engine/tasks/{id}/schedule` and `/task-engine/tasks/{id}/complete` for schedule/complete flows.
4. Wire Goals detail to `/goals/{goal_id}`, progress to `/relationships/goals/{goal_id}/progress`, and linked tasks to `/goals/{goal_id}/tasks`.
5. Wire Calendar timeline to `/history/month`, selected day to `/history/day/{date}`, windows to `/relationships/available-windows`, and Google events from `/calendar/events`.
6. Wire Connected Services status/sync/reconnect/disconnect through `/integrations`, `/integrations/google/sync`, `/integrations/google/reconnect-url`, and `/integrations/google/disconnect`.
