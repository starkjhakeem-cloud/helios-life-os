import { useMemo } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SymbolView } from "expo-symbols";
import type { SFSymbol } from "sf-symbols-typescript";

import { radius, spacing, typography, type ThemeColors } from "../theme/theme";
import { useTheme } from "../theme/ThemeContext";

export type InboxPriority = "critical" | "high" | "medium" | "low" | "informational";
export type InboxCategory =
  | "ai"
  | "assistant"
  | "email"
  | "calendar"
  | "goal"
  | "task"
  | "system"
  | "integration"
  | "approval"
  | "reminder";

export type PreparedSwipeAction =
  | "mark_read"
  | "archive"
  | "complete"
  | "approve"
  | "delete"
  | "reject"
  | "mute";

export type UnifiedInboxItem = {
  id: string;
  entityId: string;
  entityType: "email" | "notification";
  category: InboxCategory;
  priority: InboxPriority;
  title: string;
  source: string;
  preview?: string | null;
  timestamp: string;
  isUnread: boolean;
  isArchived: boolean;
  isTrashed: boolean;
  swipeRightActions: PreparedSwipeAction[];
  swipeLeftActions: PreparedSwipeAction[];
};

type Props = {
  item: UnifiedInboxItem;
  onToggleRead?: () => void;
  onArchive?: () => void;
  onRestore?: () => void;
  onDelete?: () => void;
};

const CATEGORY_ICONS: Record<InboxCategory, SFSymbol> = {
  ai: "sparkles",
  assistant: "brain.head.profile",
  email: "envelope.fill",
  calendar: "calendar",
  goal: "target",
  task: "checkmark.circle",
  system: "gearshape.fill",
  integration: "link",
  approval: "checkmark.seal.fill",
  reminder: "bell.fill",
};

function priorityColor(priority: InboxPriority, colors: ThemeColors): string {
  switch (priority) {
    case "critical": return colors.danger;
    case "high": return colors.warning;
    case "medium": return colors.accent;
    case "low": return colors.accentCyan;
    case "informational": return colors.textMuted;
  }
}

function categoryColor(category: InboxCategory, colors: ThemeColors): string {
  switch (category) {
    case "email": return colors.accentCyan;
    case "ai":
    case "assistant": return colors.accent;
    case "approval": return colors.warning;
    case "system": return colors.textSecondary;
    default: return colors.success;
  }
}

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

export function InboxPriorityBadge({ priority }: { priority: InboxPriority }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const color = priorityColor(priority, colors);

  return (
    <View style={[styles.priorityBadge, { borderColor: `${color}55`, backgroundColor: `${color}14` }]}>
      <View style={[styles.priorityDot, { backgroundColor: color }]} />
      <Text style={[styles.priorityText, { color }]}>{priority.toUpperCase()}</Text>
    </View>
  );
}

export default function InboxItemCard({
  item,
  onToggleRead,
  onArchive,
  onRestore,
  onDelete,
}: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const accent = categoryColor(item.category, colors);

  return (
    <View style={[styles.card, item.isUnread && { borderColor: `${accent}55` }]}>
      <View style={[styles.categoryIcon, { backgroundColor: `${accent}16` }]}>
        <SymbolView
          name={CATEGORY_ICONS[item.category]}
          size={17}
          tintColor={accent}
          resizeMode="scaleAspectFit"
        />
      </View>

      <View style={styles.content}>
        <View style={styles.metaRow}>
          <Text style={[styles.category, { color: accent }]}>{item.category.toUpperCase()}</Text>
          <Text style={styles.timestamp}>{formatTimestamp(item.timestamp)}</Text>
        </View>

        <Text style={[styles.title, item.isUnread && styles.titleUnread]} numberOfLines={2}>
          {item.title}
        </Text>
        <Text style={styles.source} numberOfLines={1}>{item.source}</Text>
        {item.preview ? (
          <Text style={styles.preview} numberOfLines={2}>{item.preview}</Text>
        ) : null}

        <View style={styles.footer}>
          <View style={styles.badges}>
            {(item.priority === "critical" || item.priority === "high" || item.priority === "medium") ? (
              <InboxPriorityBadge priority={item.priority} />
            ) : null}
            {item.isArchived ? <Text style={styles.archivedLabel}>ARCHIVED</Text> : null}
            {item.isTrashed ? <Text style={styles.trashedLabel}>TRASH</Text> : null}
          </View>

          <View style={styles.actions}>
            {onToggleRead ? (
              <TouchableOpacity
                style={styles.actionButton}
                onPress={onToggleRead}
                accessibilityLabel={item.isUnread ? "Mark read" : "Mark unread"}
              >
                <SymbolView
                  name={item.isUnread ? "envelope.open" : "envelope"}
                  size={14}
                  tintColor={item.isUnread ? colors.accentCyan : colors.textMuted}
                  resizeMode="scaleAspectFit"
                />
              </TouchableOpacity>
            ) : null}
            {onArchive && !item.isArchived ? (
              <TouchableOpacity style={styles.actionButton} onPress={onArchive} accessibilityLabel="Archive">
                <SymbolView name="archivebox" size={14} tintColor={colors.textMuted} resizeMode="scaleAspectFit" />
              </TouchableOpacity>
            ) : null}
            {onRestore ? (
              <TouchableOpacity style={styles.actionButton} onPress={onRestore} accessibilityLabel="Restore email">
                <SymbolView
                  name="arrow.uturn.backward"
                  size={14}
                  tintColor={colors.success}
                  resizeMode="scaleAspectFit"
                />
              </TouchableOpacity>
            ) : null}
            {onDelete ? (
              <TouchableOpacity
                style={styles.actionButton}
                onPress={onDelete}
                accessibilityLabel={item.isTrashed ? "Delete permanently" : "Move to Trash"}
              >
                <SymbolView name="trash" size={14} tintColor={colors.danger} resizeMode="scaleAspectFit" />
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      </View>
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
    },
    categoryIcon: {
      width: 34,
      height: 34,
      borderRadius: 11,
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
    },
    content: { flex: 1, minWidth: 0 },
    metaRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 3,
    },
    category: { fontSize: 9, fontWeight: "800", letterSpacing: 1.3 },
    timestamp: { ...typography.caption, color: colors.textMuted, fontSize: 10 },
    title: {
      fontSize: 14,
      lineHeight: 18,
      fontWeight: "600",
      color: colors.textSecondary,
    },
    titleUnread: { color: colors.textPrimary, fontWeight: "800" },
    source: { fontSize: 10.5, color: colors.textMuted, marginTop: 2 },
    preview: {
      ...typography.caption,
      color: colors.textSecondary,
      fontSize: 12,
      lineHeight: 16,
      marginTop: 3,
    },
    footer: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: spacing.sm,
      marginTop: spacing.xs,
    },
    badges: { flexDirection: "row", alignItems: "center", gap: spacing.xs, flex: 1 },
    priorityBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      borderWidth: 1,
      borderRadius: 8,
      paddingHorizontal: 6,
      paddingVertical: 3,
    },
    priorityDot: { width: 5, height: 5, borderRadius: 3 },
    priorityText: { fontSize: 8, fontWeight: "800", letterSpacing: 0.7 },
    archivedLabel: { fontSize: 8, fontWeight: "700", color: colors.textMuted, letterSpacing: 0.8 },
    trashedLabel: { fontSize: 8, fontWeight: "700", color: colors.danger, letterSpacing: 0.8 },
    actions: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
    actionButton: {
      width: 30,
      height: 30,
      borderRadius: 10,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.surfaceDark,
      borderWidth: 1,
      borderColor: colors.borderDark,
    },
  });
}
