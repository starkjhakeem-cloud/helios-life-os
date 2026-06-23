import { useMemo } from "react";
import { Animated, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Swipeable } from "react-native-gesture-handler";
import { SymbolView } from "expo-symbols";
import type { SFSymbol } from "sf-symbols-typescript";
import * as Haptics from "expo-haptics";

import { radius, spacing, typography, type ThemeColors } from "../theme/theme";
import { useTheme } from "../theme/ThemeContext";
import type { Task } from "../services/tasksService";

export type TaskDisplayMeta = {
  statusLabel: string;
  progress: number;
  priorityLabel: string;
  dueLabel: string;
  durationLabel: string;
  category: string;
  origin: "User" | "HELIOS";
  originLabel: string;
  recommendation?: string;
  isPinned?: boolean;
  isArchived?: boolean;
};

type Props = {
  task: Task;
  meta: TaskDisplayMeta;
  onOpen: () => void;
  onComplete: () => void;
  onArchive: () => void;
  onDelete: () => void;
  onSnooze: () => void;
  onPin: () => void;
};

function priorityColor(priority: string, colors: ThemeColors): string {
  switch (priority) {
    case "critical": return colors.danger;
    case "high": return colors.warning;
    case "medium": return colors.accent;
    default: return colors.accentCyan;
  }
}

function statusSymbol(progress: number): SFSymbol {
  if (progress >= 100) return "circle.fill";
  if (progress >= 75) return "circle.righthalf.filled";
  if (progress >= 45) return "circle.lefthalf.filled";
  if (progress > 0) return "circle.dotted";
  return "circle";
}

function ActionButton({
  label,
  icon,
  color,
  onPress,
}: {
  label: string;
  icon: SFSymbol;
  color: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={[actionStyles.action, { backgroundColor: color }]} onPress={onPress} activeOpacity={0.82}>
      <SymbolView name={icon} size={15} tintColor="#ffffff" resizeMode="scaleAspectFit" />
      <Text style={actionStyles.actionText}>{label}</Text>
    </TouchableOpacity>
  );
}

const actionStyles = StyleSheet.create({
  action: {
    width: 82,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  actionText: {
    color: "#ffffff",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0,
  },
});

export default function TaskCard({
  task,
  meta,
  onOpen,
  onComplete,
  onArchive,
  onDelete,
  onSnooze,
  onPin,
}: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const accent = meta.origin === "HELIOS" ? colors.accent : colors.accentCyan;
  const pColor = priorityColor(task.priority, colors);
  const statusColor = meta.progress >= 100 ? colors.success : meta.progress > 0 ? colors.accentCyan : colors.textMuted;

  function withHaptics(action: () => void) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    action();
  }

  const leftActions = (
    _progress: Animated.AnimatedInterpolation<number>,
    dragX: Animated.AnimatedInterpolation<number>,
  ) => (
    <Animated.View
      style={[
        styles.leftActions,
        {
          opacity: dragX.interpolate({ inputRange: [0, 40, 90], outputRange: [0, 0.7, 1], extrapolate: "clamp" }),
        },
      ]}
    >
      <ActionButton label="Complete" icon="checkmark.circle.fill" color={colors.success} onPress={() => withHaptics(onComplete)} />
    </Animated.View>
  );

  const rightActions = (
    _progress: Animated.AnimatedInterpolation<number>,
    dragX: Animated.AnimatedInterpolation<number>,
  ) => (
    <Animated.View
      style={[
        styles.rightActions,
        {
          opacity: dragX.interpolate({ inputRange: [-240, -60, 0], outputRange: [1, 0.8, 0], extrapolate: "clamp" }),
        },
      ]}
    >
      <ActionButton label="Pin" icon={meta.isPinned ? "pin.slash" : "pin.fill"} color={colors.info} onPress={() => withHaptics(onPin)} />
      <ActionButton label="Snooze" icon="clock.fill" color={colors.warning} onPress={() => withHaptics(onSnooze)} />
      <ActionButton label="Archive" icon="archivebox.fill" color={colors.textMuted} onPress={() => withHaptics(onArchive)} />
      <ActionButton label="Delete" icon="trash.fill" color={colors.danger} onPress={() => withHaptics(onDelete)} />
    </Animated.View>
  );

  return (
    <Swipeable
      renderLeftActions={leftActions}
      renderRightActions={rightActions}
      overshootLeft={false}
      overshootRight={false}
      friction={2}
      leftThreshold={56}
      rightThreshold={56}
    >
      <TouchableOpacity
        style={[
          styles.card,
          meta.origin === "HELIOS" && styles.aiCard,
          meta.isPinned && { borderColor: `${colors.accentCyan}70` },
          meta.isArchived && styles.archivedCard,
        ]}
        onPress={onOpen}
        activeOpacity={0.78}
        accessibilityRole="button"
      >
        <View style={[styles.progressButton, { borderColor: `${statusColor}66`, backgroundColor: `${statusColor}12` }]}>
          <SymbolView name={statusSymbol(meta.progress)} size={19} tintColor={statusColor} resizeMode="scaleAspectFit" />
        </View>

        <View style={styles.content}>
          <View style={styles.topRow}>
            <View style={styles.titleBlock}>
              <View style={styles.originRow}>
                <Text style={[styles.origin, { color: accent }]}>{meta.originLabel}</Text>
                {meta.isPinned ? <Text style={styles.pinLabel}>PINNED</Text> : null}
                {meta.isArchived ? <Text style={styles.archiveLabel}>ARCHIVED</Text> : null}
              </View>
              <Text style={[styles.title, task.status === "done" && styles.titleDone]} numberOfLines={2}>
                {task.title}
              </Text>
            </View>
            <View style={[styles.priorityBadge, { borderColor: `${pColor}55`, backgroundColor: `${pColor}14` }]}>
              <View style={[styles.priorityDot, { backgroundColor: pColor }]} />
              <Text style={[styles.priorityText, { color: pColor }]}>{meta.priorityLabel}</Text>
            </View>
          </View>

          {meta.recommendation ? (
            <Text style={styles.recommendation} numberOfLines={2}>{meta.recommendation}</Text>
          ) : task.description ? (
            <Text style={styles.description} numberOfLines={2}>{task.description}</Text>
          ) : null}

          <View style={styles.metaGrid}>
            <MetaItem icon={statusSymbol(meta.progress)} label={meta.statusLabel} color={statusColor} />
            <MetaItem icon="calendar" label={meta.dueLabel} color={colors.textMuted} />
            <MetaItem icon="timer" label={meta.durationLabel} color={colors.textMuted} />
            <MetaItem icon="square.grid.2x2.fill" label={meta.category} color={colors.textMuted} />
            <MetaItem icon={meta.origin === "HELIOS" ? "sparkles" : "person.fill"} label={meta.origin} color={accent} />
          </View>
        </View>
      </TouchableOpacity>
    </Swipeable>
  );
}

function MetaItem({ icon, label, color }: { icon: SFSymbol; label: string; color: string }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.metaItem}>
      <SymbolView name={icon} size={11} tintColor={color} resizeMode="scaleAspectFit" />
      <Text style={styles.metaText} numberOfLines={1}>{label}</Text>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    card: {
      flexDirection: "row",
      gap: spacing.sm,
      backgroundColor: colors.card,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.sm,
      marginBottom: spacing.sm,
      shadowColor: colors.accent,
      shadowOpacity: 0.08,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 10 },
    },
    aiCard: {
      borderColor: `${colors.accent}55`,
      backgroundColor: `${colors.accent}10`,
    },
    archivedCard: {
      opacity: 0.62,
    },
    progressButton: {
      width: 36,
      height: 36,
      borderRadius: 18,
      borderWidth: 1,
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
    },
    content: {
      flex: 1,
      minWidth: 0,
      gap: spacing.xs,
    },
    topRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: spacing.sm,
    },
    titleBlock: {
      flex: 1,
      minWidth: 0,
    },
    originRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.xs,
      marginBottom: 2,
      flexWrap: "wrap",
    },
    origin: {
      ...typography.label,
      fontSize: 10,
    },
    pinLabel: {
      ...typography.label,
      fontSize: 9,
      color: colors.accentCyan,
    },
    archiveLabel: {
      ...typography.label,
      fontSize: 9,
      color: colors.textMuted,
    },
    title: {
      fontSize: 16,
      fontWeight: "800",
      letterSpacing: 0,
      color: colors.textPrimary,
      lineHeight: 20,
    },
    titleDone: {
      color: colors.textMuted,
      textDecorationLine: "line-through",
    },
    priorityBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      borderWidth: 1,
      borderRadius: radius.sm,
      paddingHorizontal: spacing.sm,
      paddingVertical: 4,
      flexShrink: 0,
    },
    priorityDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
    },
    priorityText: {
      fontSize: 9,
      fontWeight: "800",
      letterSpacing: 0,
    },
    recommendation: {
      ...typography.caption,
      color: colors.textSecondary,
      lineHeight: 18,
    },
    description: {
      ...typography.caption,
      color: colors.textMuted,
      lineHeight: 18,
    },
    metaGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: spacing.xs,
      paddingTop: spacing.xs,
    },
    metaItem: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      borderRadius: radius.sm,
      borderWidth: 1,
      borderColor: colors.borderDark,
      backgroundColor: colors.surfaceDark,
      paddingHorizontal: spacing.sm,
      paddingVertical: 5,
      maxWidth: "48%",
    },
    metaText: {
      fontSize: 11,
      fontWeight: "700",
      color: colors.textMuted,
      letterSpacing: 0,
    },
    leftActions: {
      flexDirection: "row",
      marginBottom: spacing.sm,
      borderRadius: radius.md,
      overflow: "hidden",
    },
    rightActions: {
      flexDirection: "row",
      justifyContent: "flex-end",
      marginBottom: spacing.sm,
      borderRadius: radius.md,
      overflow: "hidden",
    },
  });
}
