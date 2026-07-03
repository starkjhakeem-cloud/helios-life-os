# HELIOS V3 Real-Time Awareness Engine

## Purpose

The Real-Time Awareness Engine is the central current-context service for HELIOS.
It answers what HELIOS can know automatically before any AI surface asks the
user for more information.

Consumers should use `RealTimeAwarenessEngine` instead of recalculating time,
calendar availability, task load, goal state, integrations, weather/location,
or future device signals independently.

## Awareness Object

`GET /api/v1/awareness/current` returns:

- `now`, `localTime`, `localDate`, `timezone`, `dayOfWeek`, `month`, `year`
- `dayPeriod`: `morning`, `afternoon`, `evening`, or `night`
- `isWeekend`, `sunrise`, `sunset`
- `weather`: condition, estimated temperature, precipitation chance, source
- `location`: profile or preference-derived city/label
- `calendar`: current event, next event, busy state, available minutes, free windows
- `goals`: active count, urgent count, goals without tasks, stalled count, highest-priority goal
- `tasks`: due today, overdue, remaining, completed today, estimated workload, current/highest-priority task
- `integrations`: Gmail and Google Calendar connection state
- `battery`: future mobile signal slot
- `network`: backend request/network state
- `connectedServices`: normalized integration records

## Consumers

- Assistant context injects `real_time_awareness` and summarizes it in the prompt
  as `REAL-TIME AWARENESS`.
- Priority Engine stores `awareness` in the shared context and exposes a compact
  awareness slice in `compact_priority_package`.
- Today’s Flow and Next Best Action can include awareness-derived recommendations,
  such as evening shutdown planning or weather adjustments.
- Build My Day returns an `awareness` slice and uses weather/calendar availability
  when producing warnings and schedule blocks.
- Daily Brief uses awareness for local-date targeting, greetings, weather/time
  insights, data source tracking, and AI enrichment context.
- Relationship available-window endpoints delegate to the awareness engine’s
  free-window calculation.

## Refresh Strategy

The engine uses a short in-memory cache keyed by user, target date, and current
minute. Default TTL is 60 seconds.

Use `refresh=true` on `GET /api/v1/awareness/current` to bypass the cache.
Engine instances with an explicit `now` do not use the cache, which keeps tests
and deterministic planning safe.

The weather implementation is provider-ready and currently estimated from
location plus season. A live provider can replace `_weather_context` without
changing consumers or the response contract.

## Future Extension Points

The object already reserves stable slots for:

- Apple Calendar
- Apple Reminders
- Apple Health
- Weather providers
- Widgets
- Live Activities
- Dynamic Island
- Maps/location intelligence
- Battery and network telemetry from mobile clients

New providers should normalize their data into this service rather than adding
surface-specific context logic.
