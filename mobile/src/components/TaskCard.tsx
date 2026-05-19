import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { SymbolView } from "expo-symbols";

import { colors, spacing, radius, typography } from "../theme/theme";
import type { Task } from "../services/tasksService";

const PRIORITY_COLOR: Record<string, string> = {
  critical: "#ef4444",
  high:     "#f97316",
  medium:   "#f59e0b",
  low:      colors.textMuted,
};

const PRIORITY_BG: Record<string, string> = {
  critical: "rgba(239,68,68,0.12)",
  high:     "rgba(249,115,22,0.12)",
  medium:   "rgba(245,158,11,0.12)",
  low:      colors.surfaceDark,
};

const STATUS_ICON: Record<string, Parameters<typeof SymbolView>[0]["name"]> = {
  todo:        "circle",
  in_progress: "circle.lefthalf.filled",
  done:        "checkmark.circle.fill",
};

const STATUS_COLOR: Record<string, string> = {
  todo:        colors.textMuted,
  in_progress: colors.accentCyan,
  done:        "#22c55e",
};

const STATUS_NEXT: Record<string, string> = {
  todo:        "in_progress",
  in_progress: "done",
  done:        "todo",
};

type Props = {
  task: Task;
  onStatusChange: (nextStatus: string) => void;
  onDelete: () => void;
};

export default function TaskCard({ task, onStatusChange, onDelete }: Props) {
  const priorityColor = PRIORITY_COLOR[task.priority] ?? colors.textMuted;
  const priorityBg    = PRIORITY_BG[task.priority]    ?? colors.surfaceDark;
  const statusColor   = STATUS_COLOR[task.status]     ?? colors.textMuted;
  const nextStatus    = STATUS_NEXT[task.status]      ?? "todo";

  return (
    <View style={styles.card}>
      {/* Left priority bar */}
      <View style={[styles.priorityBar, { backgroundColor: priorityColor }]} />

      <View style={styles.body}>
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => onStatusChange(nextStatus)}
            style={styles.statusButton}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <SymbolView
              name={STATUS_ICON[task.status] ?? "circle"}
              size={22}
              tintColor={statusColor}
              resizeMode="scaleAspectFit"
            />
          </TouchableOpacity>

          <View style={styles.titleBlock}>
            <Text
              style={[styles.title, task.status === "done" && styles.titleDone]}
              numberOfLines={2}
            >
              {task.title}
            </Text>
            <Text style={[styles.statusLabel, { color: statusColor }]}>
              {task.status.replace("_", " ").toUpperCase()}
            </Text>
          </View>

          <View style={[styles.priorityChip, { backgroundColor: priorityBg }]}>
            <Text style={[styles.priorityText, { color: priorityColor }]}>
              {task.priority.toUpperCase()}
            </Text>
          </View>

          <TouchableOpacity
            onPress={onDelete}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <SymbolView
              name="trash"
              size={16}
              tintColor={colors.textMuted}
              resizeMode="scaleAspectFit"
            />
          </TouchableOpacity>
        </View>

        {task.description ? (
          <Text style={styles.description} numberOfLines={2}>
            {task.description}
          </Text>
        ) : null}

        {(task.due_date || task.linked_goal_id) ? (
          <View style={styles.metaRow}>
            {task.due_date ? (
              <View style={styles.metaItem}>
                <SymbolView
                  name="calendar"
                  size={11}
                  tintColor={colors.textMuted}
                  resizeMode="scaleAspectFit"
                />
                <Text style={styles.metaText}>{task.due_date}</Text>
              </View>
            ) : null}
            {task.linked_goal_id ? (
              <View style={styles.metaItem}>
                <SymbolView
                  name="target"
                  size={11}
                  tintColor={colors.accent}
                  resizeMode="scaleAspectFit"
                />
                <Text style={[styles.metaText, { color: colors.accent }]}>
                  Goal linked
                </Text>
              </View>
            ) : null}
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
    flexDirection: "row",
    overflow: "hidden",
  },

  priorityBar: {
    width: 3,
    flexShrink: 0,
  },

  body: {
    flex: 1,
    padding: spacing.lg,
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },

  statusButton: {
    flexShrink: 0,
  },

  titleBlock: {
    flex: 1,
  },

  title: {
    ...typography.title,
    color: colors.textPrimary,
    marginBottom: 2,
  },

  titleDone: {
    color: colors.textMuted,
    textDecorationLine: "line-through",
  },

  statusLabel: {
    ...typography.label,
  },

  priorityChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: 6,
    flexShrink: 0,
  },

  priorityText: {
    fontSize: 9,
    fontWeight: "700" as const,
    letterSpacing: 1,
  },

  description: {
    ...typography.body,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },

  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    marginTop: spacing.xs,
  },

  metaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },

  metaText: {
    ...typography.caption,
    color: colors.textMuted,
  },
});
