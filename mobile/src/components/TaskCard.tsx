import { useMemo } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { SymbolView } from "expo-symbols";
import * as Haptics from "expo-haptics";

import { spacing, radius, typography , type ThemeColors } from "../theme/theme";
import { useTheme } from "../theme/ThemeContext";
import type { Task } from "../services/tasksService";

function getPriorityColor(c: ThemeColors): Record<string, string> {
  return {
    critical: c.danger,
    high:     "#f97316",
    medium:   c.warning,
    low:      c.textMuted,
  };
}

function getPriorityBg(c: ThemeColors): Record<string, string> {
  return {
    critical: `${c.danger}1f`,
    high:     "rgba(249,115,22,0.12)",
    medium:   `${c.warning}1f`,
    low:      c.surfaceDark,
  };
}

const STATUS_ICON: Record<string, Parameters<typeof SymbolView>[0]["name"]> = {
  todo:        "circle",
  in_progress: "circle.lefthalf.filled",
  done:        "checkmark.circle.fill",
};

function getStatusColor(c: ThemeColors): Record<string, string> {
  return {
    todo:        c.textMuted,
    in_progress: c.accentCyan,
    done:        c.success,
  };
}

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
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const priorityColor = useMemo(() => getPriorityColor(colors), [colors])[task.priority] ?? colors.textMuted;
  const priorityBg    = useMemo(() => getPriorityBg(colors), [colors])[task.priority]    ?? colors.surfaceDark;
  const statusColor   = useMemo(() => getStatusColor(colors), [colors])[task.status]     ?? colors.textMuted;
  const nextStatus    = STATUS_NEXT[task.status]      ?? "todo";

  function handleStatusChange() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    onStatusChange(nextStatus);
  }

  function handleDelete() {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
    onDelete();
  }

  return (
    <View style={styles.card}>
      {/* Left priority bar */}
      <View style={[styles.priorityBar, { backgroundColor: priorityColor }]} />

      <View style={styles.body}>
        <View style={styles.header}>
          <TouchableOpacity
            onPress={handleStatusChange}
            style={styles.statusButton}
            activeOpacity={0.7}
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
            onPress={handleDelete}
            activeOpacity={0.7}
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
                <SymbolView name="calendar" size={11} tintColor={colors.textMuted} resizeMode="scaleAspectFit" />
                <Text style={styles.metaText}>{task.due_date}</Text>
              </View>
            ) : null}
            {task.linked_goal_id ? (
              <View style={styles.metaItem}>
                <SymbolView name="target" size={11} tintColor={colors.accent} resizeMode="scaleAspectFit" />
                <Text style={[styles.metaText, { color: colors.accent }]}>Goal linked</Text>
              </View>
            ) : null}
          </View>
        ) : null}
      </View>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
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
}
