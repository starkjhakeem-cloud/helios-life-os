import { useMemo } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { SymbolView } from "expo-symbols";
import * as Haptics from "expo-haptics";

import { spacing, radius, typography , type ThemeColors } from "../theme/theme";
import { useTheme } from "../theme/ThemeContext";
import type { Goal } from "../services/goalsService";

function getStatusColor(c: ThemeColors): Record<string, string> {
  return {
    active: c.accentCyan,
    completed: c.success,
    paused: c.warning,
  };
}

const STATUS_NEXT: Record<string, string> = {
  active: "completed",
  completed: "paused",
  paused: "active",
};

const STATUS_ICON: Record<string, Parameters<typeof SymbolView>[0]["name"]> = {
  active: "circle",
  completed: "checkmark.circle.fill",
  paused: "pause.circle.fill",
};

type Props = {
  goal: Goal;
  onStatusChange: (nextStatus: string) => void;
  onDelete: () => void;
};

export default function GoalCard({ goal, onStatusChange, onDelete }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const dotColor = useMemo(() => getStatusColor(colors), [colors])[goal.status] ?? colors.textMuted;
  const nextStatus = STATUS_NEXT[goal.status] ?? "active";

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
      <View style={styles.header}>
        <TouchableOpacity
          onPress={handleStatusChange}
          style={styles.statusButton}
          activeOpacity={0.7}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <SymbolView
            name={STATUS_ICON[goal.status] ?? "circle"}
            size={22}
            tintColor={dotColor}
            resizeMode="scaleAspectFit"
          />
        </TouchableOpacity>

        <View style={styles.titleBlock}>
          <Text
            style={[styles.title, goal.status === "completed" && styles.titleDone]}
            numberOfLines={2}
          >
            {goal.title}
          </Text>
          <Text style={[styles.statusLabel, { color: dotColor }]}>
            {goal.status.toUpperCase()}
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

      {goal.description ? (
        <Text style={styles.description} numberOfLines={3}>
          {goal.description}
        </Text>
      ) : null}

      {goal.target_date ? (
        <View style={styles.dateRow}>
          <SymbolView
            name="calendar"
            size={12}
            tintColor={colors.textMuted}
            resizeMode="scaleAspectFit"
          />
          <Text style={styles.dateText}>{goal.target_date}</Text>
        </View>
      ) : null}
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
    padding: spacing.lg,
    marginBottom: spacing.md,
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
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

  description: {
    ...typography.body,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },

  dateRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    marginTop: spacing.xs,
  },

  dateText: {
    ...typography.caption,
    color: colors.textMuted,
  },
});
}
