import type { TaskSuggestion } from "../../services/taskEngineService";
import {
  prepareSuggestions,
  sourceBreakdown,
  suggestionReason,
} from "../taskSuggestionRanking";

function suggestion(overrides: Partial<TaskSuggestion>): TaskSuggestion {
  const now = "2026-06-26T00:00:00.000Z";
  return {
    id: "suggestion-1",
    user_id: "user-1",
    title: "Review email",
    description: null,
    status: "pending",
    priority: "medium",
    due_date: null,
    estimated_duration_minutes: null,
    category: null,
    source_type: "gmail",
    source_id: null,
    source_metadata: null,
    linked_goal_id: null,
    confidence: 0.5,
    reason: null,
    accepted_task_id: null,
    rejected_reason: null,
    created_at: now,
    updated_at: now,
    accepted_at: null,
    rejected_at: null,
    ...overrides,
  };
}

describe("taskSuggestionRanking", () => {
  test("dedupes Gmail suggestions by thread metadata and keeps the stronger item", () => {
    const prepared = prepareSuggestions([
      suggestion({
        id: "low",
        title: "Review email: Personal Training Reminder",
        priority: "low",
        source_metadata: { thread_id: "thread-123" },
      }),
      suggestion({
        id: "high",
        title: "Reply to email: Personal Training Reminder",
        priority: "high",
        source_metadata: { thread_id: "thread-123" },
      }),
    ]);

    expect(prepared).toHaveLength(1);
    expect(prepared[0].id).toBe("high");
  });

  test("deprioritizes promotional Gmail suggestions below actionable work", () => {
    const prepared = prepareSuggestions([
      suggestion({
        id: "promo",
        title: "Get $50 when you deposit $100+ into your account. Learn more.",
        priority: "medium",
        source_metadata: { category: "promotions" },
      }),
      suggestion({
        id: "reply",
        title: "Reply to email: Contract deadline",
        priority: "medium",
        reason: "Suggested reply",
      }),
      suggestion({
        id: "calendar",
        title: "Prepare for upcoming calendar event",
        source_type: "calendar",
      }),
    ]);

    expect(prepared.map((item) => item.id)).toEqual(["reply", "calendar", "promo"]);
  });

  test("uses compact contextual copy and source breakdowns", () => {
    const gmail = suggestion({
      reason: "Important Gmail item that may require action.",
    });
    const calendar = suggestion({
      id: "calendar",
      source_type: "calendar",
      title: "Prepare for upcoming calendar event",
    });

    expect(suggestionReason(gmail)).toBe("Gmail • May need review");
    expect(sourceBreakdown([gmail, calendar])).toBe("Gmail and Calendar");
  });
});
