# HELIOS V3 Autonomy Command Center — Guide

**Version:** V3.12
**Screen:** Autonomy tab (Queue icon in tab bar)

---

## Overview

The Command Center is the unified autonomy dashboard in HELIOS V3. It consolidates all AI-driven operational systems into a single screen with live status, one-tap controls, and full navigation to every autonomy feature.

---

## Screen Layout

### 1. Command Center Hero

At the top of the screen, the hero card shows:
- **HELIOS V3** label
- **Command Center** title
- Live subtitle: counts of pending/approved items and suggestions

### 2. Status Row

Four real-time counters:
- **PENDING** — queue items waiting for your approval
- **APPROVED** — queue items approved and ready to execute
- **INBOX** — unread notifications (highlighted when non-zero)
- **JOBS** — enabled background jobs

### 3. Scheduled Jobs Panel

Appears when you have at least one configured background job. Shows:
- Job name and schedule label
- Status indicator (green = enabled, grey = disabled)
- **RUN** button to manually trigger the job

Triggering a job:
- `daily_briefing_generation` — generates a fresh briefing and sends an inbox notification
- `proactive_suggestion_scan` — scans your context and adds N suggestions to the queue as pending items
- `reminder_check` — counts active reminders and notifies if any exist
- `integration_sync_simulation` — records a simulated sync (no external calls)

Configure jobs in the **Profile → Background Jobs** section.

### 4. Daily Plan Section

AI-generated structured daily plan with:
- Focus blocks (time ranges + energy levels)
- Priority tasks with reasoning
- Suggested queue items you can promote

Tap **Generate** to create a fresh plan. Tap **Add to Queue** on suggested items to promote them.

### 5. Proactive Suggestions Section

AI-generated suggestions from scanning your goals, tasks, calendar, memory, and email context. Each suggestion shows:
- Source agent (Strategy, Tasks, Calendar, Email, Memory)
- Risk level (Low / Medium / High)
- Action type
- Reasoning

Tap **Add to Queue** to promote a suggestion into the review queue.

### 6. Pending Review / Approved Sections

All queue items grouped by status. Available actions per item:

| Status | Available Actions |
|--------|-------------------|
| Pending | Approve / Reject |
| Approved | Execute (confirms destructive intent) / Reject |
| Completed | View only |
| Rejected | View only |

Execution is always explicit — no automatic triggering occurs.

### 7. Approval Rules Section

Per-user rules that govern which action types and risk levels are allowed to execute.

- **ALLOW** rules permit execution of that type/risk combination
- **BLOCKED** rules prevent execution and return a 403 at the API
- Add rules via the form at the bottom of the section

Rules are checked at execution time, not at approval time.

### 8. Audit Log Section

Recent autonomy decisions in reverse chronological order. Each entry shows:
- Event type (color-coded)
- Timestamp
- Message
- Associated action type (if applicable)

The audit log is immutable — entries cannot be deleted.

---

## Navigation Links

From the Command Center, access related features via the tab bar:

| Feature | Navigation |
|---------|-----------|
| Inbox notifications | Inbox tab (bell icon) |
| Agent orchestration | Agents tab |
| Background job config | Profile → Background Jobs section |
| AI briefing | Home tab |
| AI assistant | Assistant tab |

---

## Safety Guarantees

1. Nothing executes without your explicit tap on "Execute"
2. All AI-generated items enter the queue as `pending` — you review before anything happens
3. You can block any action type permanently via Approval Rules
4. Every decision is recorded in the Audit Log
5. Background job triggers only create `pending` queue items — they do not execute

---

## Background Jobs Configuration (Profile Screen)

Access via: **Profile tab → Background Jobs section**

Each of the 4 job types can be:
- **Added** (tap ADD) — creates the job with a default schedule label
- **Toggled ON/OFF** — enable/disable without deleting
- **Run Now** — manually trigger (only available when enabled)
- **Removed** — permanently deletes the job config

Job types:
| Job | Default Schedule | What It Does |
|-----|-----------------|-------------|
| Daily Briefing | Daily at 8:00 AM | Generates a briefing and notifies you |
| Proactive Suggestions | Every 30 minutes | Scans context, adds suggestions to queue |
| Reminder Check | Every hour | Counts active reminders, notifies if any |
| Integration Sync | Every 6 hours | Records simulated sync (no external calls) |

**Note:** Schedule labels are display-only. Real scheduled execution requires a background worker (deferred to a future version). Tap "RUN" for immediate manual execution.
