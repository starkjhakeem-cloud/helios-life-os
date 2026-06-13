import { useCallback, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  ActivityIndicator,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SymbolView } from "expo-symbols";

import { spacing, radius, typography , type ThemeColors } from "../../theme/theme";
import { useTheme } from "../../theme/ThemeContext";
import { useAuthStore, useNotificationsStore } from "../../store";
import type { InboxNotification } from "../../store";

// ── Event metadata ────────────────────────────────────────────────────────────

const EVENT_LABELS: Record<string, string> = {
  new_suggestion:      "NEW SUGGESTIONS",
  queue_item_created:  "ITEM QUEUED",
  approval_required:   "APPROVAL REQUIRED",
  execution_blocked:   "EXECUTION BLOCKED",
  execution_completed: "COMPLETED",
  execution_failed:    "FAILED",
};

const EVENT_COLORS: Record<string, string> = {
  new_suggestion:      "#6366f1",
  queue_item_created:  "#22d3ee",
  approval_required:   "#a855f7",
  execution_blocked:   "#f59e0b",
  execution_completed: "#22c55e",
  execution_failed:    "#ef4444",
};

const EVENT_ICONS: Record<string, string> = {
  new_suggestion:      "lightbulb",
  queue_item_created:  "plus.circle",
  approval_required:   "checkmark.shield",
  execution_blocked:   "xmark.shield",
  execution_completed: "checkmark.circle",
  execution_failed:    "exclamationmark.circle",
};

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return "just now";
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  } catch {
    return iso;
  }
}

// ── Notification card ─────────────────────────────────────────────────────────

type NotificationCardProps = {
  item: InboxNotification;
  isMutating: boolean;
  onMarkRead: (id: string) => void;
  onDelete: (id: string) => void;
};

function NotificationCard({
item, isMutating, onMarkRead, onDelete }: NotificationCardProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const color = EVENT_COLORS[item.event_type] ?? "#8490ab";
  const label = EVENT_LABELS[item.event_type] ?? item.event_type.replace(/_/g, " ").toUpperCase();
  const icon = (EVENT_ICONS[item.event_type] ?? "bell") as Parameters<typeof SymbolView>[0]["name"];

  const handleDelete = () => {
    Alert.alert(
      "Delete Notification",
      "Remove this notification?",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: () => onDelete(item.id) },
      ],
    );
  };

  return (
    <View style={[styles.card, !item.is_read && styles.cardUnread]}>
      {!item.is_read && <View style={[styles.unreadDot, { backgroundColor: color }]} />}

      <View style={styles.cardInner}>
        <View style={styles.cardLeft}>
          <View style={[styles.iconBubble, { backgroundColor: `${color}18` }]}>
            <SymbolView name={icon} size={18} tintColor={color} resizeMode="scaleAspectFit" />
          </View>
        </View>

        <View style={styles.cardBody}>
          <View style={styles.cardHeader}>
            <Text style={[styles.eventLabel, { color }]}>{label}</Text>
            <Text style={styles.timestamp}>{formatTime(item.created_at)}</Text>
          </View>
          <Text style={styles.cardTitle}>{item.title}</Text>
          {item.body ? (
            <Text style={styles.cardBody2} numberOfLines={3}>{item.body}</Text>
          ) : null}
          {item.action_type ? (
            <Text style={styles.actionType}>{item.action_type.replace(/_/g, " ").toUpperCase()}</Text>
          ) : null}

          <View style={styles.cardActions}>
            {!item.is_read ? (
              <TouchableOpacity
                style={[styles.actionBtn, isMutating && styles.btnDisabled]}
                onPress={() => onMarkRead(item.id)}
                disabled={isMutating}
                activeOpacity={0.7}
              >
                <Text style={styles.actionBtnText}>Mark Read</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity
              style={[styles.deleteBtn, isMutating && styles.btnDisabled]}
              onPress={handleDelete}
              disabled={isMutating}
              activeOpacity={0.7}
            >
              <Text style={styles.deleteBtnText}>Delete</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </View>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function NotificationsScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const accessToken = useAuthStore((s) => s.accessToken);
  const {
    notifications,
    unreadCount,
    isLoading,
    isMutating,
    error,
    fetchNotifications,
    markRead,
    markAllRead,
    deleteNotification,
  } = useNotificationsStore();

  const load = useCallback(() => {
    if (accessToken) fetchNotifications(accessToken);
  }, [accessToken, fetchNotifications]);

  useEffect(() => { load(); }, [load]);

  const handleMarkRead = useCallback(
    (id: string) => { if (accessToken) markRead(accessToken, id); },
    [accessToken, markRead],
  );

  const handleMarkAllRead = useCallback(() => {
    if (!accessToken) return;
    Alert.alert(
      "Mark All Read",
      "Mark all notifications as read?",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Mark All Read", onPress: () => markAllRead(accessToken) },
      ],
    );
  }, [accessToken, markAllRead]);

  const handleDelete = useCallback(
    (id: string) => { if (accessToken) deleteNotification(accessToken, id); },
    [accessToken, deleteNotification],
  );

  const unread = notifications.filter((n) => !n.is_read);
  const read   = notifications.filter((n) => n.is_read);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.md }]}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={isLoading} onRefresh={load} tintColor={"#a855f7"} />
      }
    >
      {/* Hero */}
      <View style={styles.heroCard}>
        <Text style={styles.heroLabel}>HELIOS</Text>
        <View style={styles.heroRow}>
          <Text style={styles.heroTitle}>Notifications</Text>
          {unreadCount > 0 ? (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{unreadCount > 99 ? "99+" : unreadCount}</Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.heroSubtitle}>
          {unreadCount > 0
            ? `${unreadCount} unread notification${unreadCount !== 1 ? "s" : ""}`
            : "You're all caught up."}
        </Text>
      </View>

      {/* Error */}
      {error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      {/* Loading */}
      {isLoading && notifications.length === 0 ? (
        <ActivityIndicator color={"#a855f7"} style={{ marginTop: spacing.xl }} />
      ) : null}

      {/* Mark all read */}
      {unreadCount > 0 ? (
        <TouchableOpacity
          style={[styles.markAllBtn, isMutating && styles.btnDisabled]}
          onPress={handleMarkAllRead}
          disabled={isMutating}
          activeOpacity={0.75}
        >
          <Text style={styles.markAllBtnText}>Mark All Read</Text>
        </TouchableOpacity>
      ) : null}

      {/* Unread section */}
      {unread.length > 0 ? (
        <>
          <Text style={styles.sectionLabel}>UNREAD</Text>
          {unread.map((n) => (
            <NotificationCard
              key={n.id}
              item={n}
              isMutating={isMutating}
              onMarkRead={handleMarkRead}
              onDelete={handleDelete}
            />
          ))}
        </>
      ) : null}

      {/* Read section */}
      {read.length > 0 ? (
        <>
          <Text style={[styles.sectionLabel, unread.length > 0 && { marginTop: spacing.xl }]}>
            READ
          </Text>
          {read.map((n) => (
            <NotificationCard
              key={n.id}
              item={n}
              isMutating={isMutating}
              onMarkRead={handleMarkRead}
              onDelete={handleDelete}
            />
          ))}
        </>
      ) : null}

      {/* Empty state */}
      {!isLoading && notifications.length === 0 ? (
        <View style={styles.emptyState}>
          <SymbolView name="bell.slash" size={48} tintColor={"#8490ab"} resizeMode="scaleAspectFit" />
          <Text style={styles.emptyText}>No notifications yet.</Text>
          <Text style={styles.emptySubtext}>
            Notifications will appear here when HELIOS generates suggestions, processes queue items, or executes actions.
          </Text>
        </View>
      ) : null}

      <View style={{ height: spacing.xl * 2 }} />
    </ScrollView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: spacing.md },

  heroCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  heroLabel: {
    fontSize: 11,
    fontWeight: "700" as const,
    letterSpacing: 2,
    color: colors.accent,
    marginBottom: spacing.xs,
  },
  heroRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  heroTitle: {
    ...typography.displaySmall,
    color: colors.textPrimary,
  },
  badge: {
    backgroundColor: colors.accent,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
    minWidth: 24,
    alignItems: "center",
  },
  badgeText: {
    fontSize: 11,
    fontWeight: "700" as const,
    color: "#fff",
  },
  heroSubtitle: { ...typography.body, color: colors.textSecondary },

  sectionLabel: {
    fontSize: 11,
    fontWeight: "700" as const,
    letterSpacing: 2,
    color: colors.textMuted,
    marginBottom: spacing.sm,
    marginTop: spacing.sm,
  },

  errorBox: {
    backgroundColor: "rgba(239, 68, 68, 0.1)",
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.3)",
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  errorText: { ...typography.body, color: "#ef4444" },

  emptyState: {
    alignItems: "center",
    paddingVertical: spacing.xxl,
    gap: spacing.sm,
  },
  emptyText: {
    ...typography.body,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  emptySubtext: {
    ...typography.caption,
    color: colors.textMuted,
    textAlign: "center",
    paddingHorizontal: spacing.lg,
    lineHeight: 20,
  },

  markAllBtn: {
    alignSelf: "flex-end",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.accent,
    marginBottom: spacing.md,
  },
  markAllBtnText: {
    fontSize: 11,
    fontWeight: "700" as const,
    letterSpacing: 0.8,
    color: colors.accent,
  },

  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
    overflow: "hidden",
  },
  cardUnread: {
    borderColor: colors.accent,
    borderLeftWidth: 3,
  },
  unreadDot: {
    position: "absolute",
    top: spacing.md,
    right: spacing.md,
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  cardInner: {
    flexDirection: "row",
    padding: spacing.md,
    gap: spacing.sm,
  },
  cardLeft: {
    paddingTop: 2,
  },
  iconBubble: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  cardBody: { flex: 1, gap: spacing.xs },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  eventLabel: {
    fontSize: 9,
    fontWeight: "700" as const,
    letterSpacing: 1.2,
  },
  timestamp: { ...typography.caption, color: colors.textMuted },
  cardTitle: { ...typography.title, color: colors.textPrimary, fontSize: 15 },
  cardBody2: { ...typography.body, color: colors.textSecondary, lineHeight: 20, fontSize: 14 },
  actionType: {
    fontSize: 9,
    fontWeight: "700" as const,
    letterSpacing: 0.8,
    color: colors.textMuted,
    marginTop: 2,
  },

  cardActions: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  actionBtn: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs - 2,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: "#22c55e",
    backgroundColor: "rgba(34, 197, 94, 0.08)",
  },
  actionBtnText: {
    fontSize: 10,
    fontWeight: "700" as const,
    letterSpacing: 0.5,
    color: "#22c55e",
  },
  deleteBtn: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs - 2,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceDark,
  },
  deleteBtnText: {
    fontSize: 10,
    fontWeight: "700" as const,
    letterSpacing: 0.5,
    color: colors.textMuted,
  },
  btnDisabled: { opacity: 0.5 },
});
}
