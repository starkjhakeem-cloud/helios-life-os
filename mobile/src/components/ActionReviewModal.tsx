/**
 * Shared action review modal — extracted from assistant.tsx so it can be
 * reused by the Agent Orchestration screen (agents.tsx) without duplicating
 * the review/execute/acknowledge flow.
 *
 * The executing logic, refresh side-effects, and UI states are all here.
 * Callers only need to provide: the action to review, onConfirm, onCancel.
 */

import { useEffect, useRef, useState, useMemo } from 'react';
import {
  ActivityIndicator,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from "react-native";

import { ApiError } from "../services/apiClient";
import { aiService, type RecommendedAction } from "../services/aiService";
import { useAuthStore, useGoalsStore, useTasksStore } from "../store";
import { radius, spacing, typography , type ThemeColors } from "../theme/theme";
import { useTheme } from "../theme/ThemeContext";

// ── Exported helpers (used by message bubbles and orchestration card) ─────────

export const ACTION_TYPE_LABELS: Record<RecommendedAction["type"], string> = {
  create_task:        "Create Task",
  update_task_status: "Update Task",
  create_goal:        "Create Goal",
  prioritize_tasks:   "Prioritize Tasks",
  generate_plan:      "Generate Plan",
};

export const EXECUTABLE_TYPES = new Set<RecommendedAction["type"]>([
  "create_task",
  "create_goal",
  "update_task_status",
]);

export function canExecuteAction(action: RecommendedAction): boolean {
  return EXECUTABLE_TYPES.has(action.type) && !!action.execution_payload;
}

// ── Component ─────────────────────────────────────────────────────────────────

type ExecState = "idle" | "executing" | "success" | "error";

type Props = {
  action: RecommendedAction | null;
  onConfirm: (id: string) => void;
  onCancel: () => void;
};

export default function ActionReviewModal({ action, onConfirm, onCancel }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const accessToken = useAuthStore((s) => s.accessToken);
  const fetchGoals   = useGoalsStore((s) => s.fetchGoals);
  const fetchTasks   = useTasksStore((s) => s.fetchTasks);

  const [execState, setExecState]   = useState<ExecState>("idle");
  const [execMessage, setExecMessage] = useState("");
  const [execError, setExecError]   = useState("");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset state whenever a new action is presented.
  const actionId = action?.id;
  useEffect(() => {
    setExecState("idle");
    setExecMessage("");
    setExecError("");
  }, [actionId]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const canExecute = action ? canExecuteAction(action) : false;

  const handleConfirm = async () => {
    if (!action || !accessToken) return;

    // Non-executable actions (generate_plan, prioritize_tasks) are simply
    // acknowledged — no backend call, operator navigates manually.
    if (!canExecute) {
      onConfirm(action.id);
      return;
    }

    setExecState("executing");
    try {
      const result = await aiService.executeAction(accessToken, {
        action_type: action.type as "create_task" | "create_goal" | "update_task_status",
        payload: action.execution_payload as Record<string, unknown>,
      });
      setExecMessage(result.message);
      setExecState("success");
      // Refresh the relevant store so the new record appears immediately.
      if (action.type === "create_goal") {
        fetchGoals(accessToken).catch(() => {});
      } else {
        fetchTasks(accessToken).catch(() => {});
      }
      timerRef.current = setTimeout(() => onConfirm(action.id), 1500);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Execution failed. Please try again.";
      setExecError(msg);
      setExecState("error");
    }
  };

  const previewEntries = action ? Object.entries(action.payload_preview) : [];

  return (
    <Modal
      visible={action !== null}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
      statusBarTranslucent
    >
      <TouchableWithoutFeedback
        onPress={() => {
          if (execState === "idle") onCancel();
        }}
      >
        <View style={styles.overlay}>
          <TouchableWithoutFeedback onPress={() => {}}>
            <View style={styles.card}>

              {/* ── Executing ── */}
              {execState === "executing" && (
                <View style={styles.centeredState}>
                  <ActivityIndicator size="large" color={"#22d3ee"} />
                  <Text style={styles.executingText}>EXECUTING...</Text>
                </View>
              )}

              {/* ── Success ── */}
              {execState === "success" && (
                <View style={styles.centeredState}>
                  <View style={styles.successIcon}>
                    <Text style={styles.successIconText}>✓</Text>
                  </View>
                  <Text style={styles.successTitle}>Action Executed</Text>
                  <Text style={styles.successSub}>{execMessage}</Text>
                </View>
              )}

              {/* ── Error ── */}
              {execState === "error" && (
                <View style={styles.centeredState}>
                  <Text style={styles.errorTitle}>Execution Failed</Text>
                  <Text style={styles.errorMessage}>{execError}</Text>
                  <View style={styles.buttons}>
                    <TouchableOpacity
                      style={styles.confirmButton}
                      onPress={() => setExecState("idle")}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.confirmButtonText}>RETRY</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.cancelButton}
                      onPress={onCancel}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.cancelButtonText}>CANCEL</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              {/* ── Idle: review panel ── */}
              {execState === "idle" && action && (
                <>
                  <View style={styles.typeBadge}>
                    <Text style={styles.typeBadgeText}>
                      {ACTION_TYPE_LABELS[action.type]}
                    </Text>
                  </View>

                  <Text style={styles.title}>{action.title}</Text>
                  <Text style={styles.description}>{action.description}</Text>

                  <View style={styles.confidenceSection}>
                    <Text style={styles.metaLabel}>CONFIDENCE</Text>
                    <View style={styles.confidenceTrack}>
                      <View
                        style={[
                          styles.confidenceFill,
                          {
                            width: `${Math.round(
                              action.confidence * 100,
                            )}%` as `${number}%`,
                          },
                        ]}
                      />
                    </View>
                    <Text style={styles.confidenceValue}>
                      {Math.round(action.confidence * 100)}%
                    </Text>
                  </View>

                  {previewEntries.length > 0 && (
                    <View style={styles.previewSection}>
                      <Text style={styles.metaLabel}>PAYLOAD PREVIEW</Text>
                      {previewEntries.map(([k, v]) => (
                        <View key={k} style={styles.previewRow}>
                          <Text style={styles.previewKey}>{k}</Text>
                          <Text style={styles.previewValue}>{String(v)}</Text>
                        </View>
                      ))}
                    </View>
                  )}

                  <View
                    style={[
                      styles.bannerBase,
                      canExecute ? styles.bannerExec : styles.bannerNoExec,
                    ]}
                  >
                    <Text
                      style={[
                        styles.bannerText,
                        canExecute ? styles.bannerTextExec : styles.bannerTextNoExec,
                      ]}
                    >
                      {canExecute
                        ? "Confirming will create or update data in your account."
                        : "Manual action required — navigate to the relevant tab."}
                    </Text>
                  </View>

                  <View style={styles.buttons}>
                    <TouchableOpacity
                      style={styles.confirmButton}
                      onPress={handleConfirm}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.confirmButtonText}>
                        {canExecute ? "CONFIRM" : "ACKNOWLEDGE"}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.cancelButton}
                      onPress={onCancel}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.cancelButtonText}>CANCEL</Text>
                    </TouchableOpacity>
                  </View>
                </>
              )}

            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(5,8,22,0.85)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
  },

  card: {
    width: "100%",
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },

  centeredState: {
    alignItems: "center",
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },

  executingText: {
    ...typography.label,
    color: colors.accentCyan,
    fontSize: 11,
  },

  successIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "rgba(34,211,238,0.15)",
    borderWidth: 1,
    borderColor: "rgba(34,211,238,0.4)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.xs,
  },

  successIconText: {
    fontSize: 24,
    color: colors.accentCyan,
  },

  successTitle: {
    ...typography.title,
    color: colors.textPrimary,
    textAlign: "center",
  },

  successSub: {
    ...typography.body,
    color: colors.textMuted,
    textAlign: "center",
    lineHeight: 22,
  },

  errorTitle: {
    ...typography.title,
    color: "#ef4444",
    textAlign: "center",
    marginBottom: spacing.xs,
  },

  errorMessage: {
    ...typography.body,
    color: colors.textMuted,
    textAlign: "center",
    lineHeight: 22,
    marginBottom: spacing.sm,
  },

  typeBadge: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(124,58,237,0.18)",
    borderWidth: 1,
    borderColor: "rgba(124,58,237,0.5)",
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    marginBottom: spacing.sm,
  },

  typeBadgeText: {
    ...typography.label,
    color: "#a78bfa",
    fontSize: 10,
  },

  title: {
    ...typography.title,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },

  description: {
    ...typography.body,
    color: colors.textSecondary,
    lineHeight: 22,
    marginBottom: spacing.md,
  },

  metaLabel: {
    ...typography.label,
    color: colors.textMuted,
    fontSize: 9,
    marginBottom: spacing.xs,
  },

  confidenceSection: {
    marginBottom: spacing.md,
  },

  confidenceTrack: {
    height: 4,
    backgroundColor: colors.surfaceDark,
    borderRadius: 2,
    overflow: "hidden",
    marginBottom: 4,
  },

  confidenceFill: {
    height: 4,
    backgroundColor: colors.accentCyan,
    borderRadius: 2,
  },

  confidenceValue: {
    ...typography.caption,
    color: colors.accentCyan,
    fontSize: 12,
  },

  previewSection: {
    backgroundColor: colors.surfaceDark,
    borderRadius: radius.sm,
    padding: spacing.sm,
    marginBottom: spacing.md,
    gap: spacing.xs,
  },

  previewRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: spacing.sm,
  },

  previewKey: {
    ...typography.caption,
    color: colors.textMuted,
    flex: 1,
  },

  previewValue: {
    ...typography.caption,
    color: colors.textSecondary,
    flex: 2,
    textAlign: "right",
  },

  bannerBase: {
    borderRadius: radius.sm,
    borderWidth: 1,
    padding: spacing.sm,
    marginBottom: spacing.md,
  },

  bannerNoExec: {
    backgroundColor: "rgba(34,211,238,0.06)",
    borderColor: "rgba(34,211,238,0.2)",
  },

  bannerExec: {
    backgroundColor: "rgba(245,158,11,0.08)",
    borderColor: "rgba(245,158,11,0.3)",
  },

  bannerText: {
    ...typography.caption,
    textAlign: "center",
  },

  bannerTextNoExec: {
    color: colors.accentCyan,
    opacity: 0.8,
  },

  bannerTextExec: {
    color: "#f59e0b",
  },

  buttons: {
    flexDirection: "row",
    gap: spacing.sm,
  },

  confirmButton: {
    flex: 1,
    backgroundColor: colors.accentCyan,
    borderRadius: radius.sm,
    paddingVertical: spacing.sm,
    alignItems: "center",
  },

  confirmButtonText: {
    ...typography.label,
    color: colors.background,
    fontSize: 12,
    fontWeight: "700" as const,
  },

  cancelButton: {
    flex: 1,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.sm,
    alignItems: "center",
  },

  cancelButtonText: {
    ...typography.label,
    color: colors.textMuted,
    fontSize: 12,
  },
});
}
