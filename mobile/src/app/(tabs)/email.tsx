import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SymbolView } from "expo-symbols";

import InboxItemCard, {
  type InboxPriority,
  type UnifiedInboxItem,
} from "../../components/InboxItemCard";
import {
  useAuthStore,
  useAutonomyStore,
  useCalendarStore,
  useEmailStore,
  useNotificationsStore,
  useRemindersStore,
  type EmailMessage,
  type InboxNotification,
} from "../../store";
import { radius, spacing, typography, type ThemeColors } from "../../theme/theme";
import { useTheme } from "../../theme/ThemeContext";

type Filter = "ALL" | "UNREAD" | "PRIORITY" | "AI" | "ARCHIVED" | "TRASH";
const FILTERS: Filter[] = ["ALL", "UNREAD", "PRIORITY", "AI", "ARCHIVED", "TRASH"];

function emailPriority(message: EmailMessage): InboxPriority {
  if (message.importance === "urgent") return "critical";
  if (message.importance === "high") return "high";
  if (message.importance === "low") return "low";
  return "informational";
}

function toInboxItem(message: EmailMessage): UnifiedInboxItem {
  return {
    id: `email:${message.id}`,
    entityId: message.id,
    entityType: "email",
    category: "email",
    priority: emailPriority(message),
    title: message.subject,
    source: message.sender,
    preview: message.snippet,
    timestamp: message.received_at,
    isUnread: message.status === "unread",
    isArchived: message.status === "archived",
    isTrashed: message.status === "trashed",
    swipeRightActions: ["mark_read", "archive", "complete", "approve"],
    swipeLeftActions: ["delete", "reject", "mute"],
  };
}

function notificationPriority(notification: InboxNotification): InboxPriority {
  if (notification.event_type === "execution_failed") return "critical";
  if (
    notification.event_type === "approval_required" ||
    notification.event_type === "execution_blocked"
  ) return "high";
  if (
    notification.event_type === "new_suggestion" ||
    notification.event_type === "queue_item_created"
  ) return "medium";
  return "informational";
}

function notificationCategory(notification: InboxNotification): UnifiedInboxItem["category"] {
  if (notification.event_type === "new_suggestion") return "ai";
  if (
    notification.event_type === "approval_required" ||
    notification.event_type === "queue_item_created"
  ) return "approval";
  return "system";
}

function notificationSource(notification: InboxNotification): string {
  if (notification.event_type === "new_suggestion") return "AI Notification";
  if (
    notification.event_type === "approval_required" ||
    notification.event_type === "queue_item_created"
  ) return "HELIOS Autonomy";
  return "HELIOS System";
}

function notificationToInboxItem(notification: InboxNotification): UnifiedInboxItem {
  return {
    id: `notification:${notification.id}`,
    entityId: notification.id,
    entityType: "notification",
    category: notificationCategory(notification),
    priority: notificationPriority(notification),
    title: notification.title,
    source: notificationSource(notification),
    preview: notification.body,
    timestamp: notification.created_at,
    isUnread: !notification.is_read,
    isArchived: false,
    isTrashed: false,
    swipeRightActions: ["mark_read", "complete", "approve"],
    swipeLeftActions: ["delete", "reject", "mute"],
  };
}

function applyFilter(items: UnifiedInboxItem[], filter: Filter): UnifiedInboxItem[] {
  switch (filter) {
    case "UNREAD": return items.filter((item) => item.isUnread && !item.isArchived && !item.isTrashed);
    case "PRIORITY": return items.filter(
      (item) => !item.isTrashed && (item.priority === "critical" || item.priority === "high"),
    );
    case "AI": return items.filter(
      (item) => !item.isTrashed && (item.category === "ai" || item.category === "assistant"),
    );
    case "ARCHIVED": return items.filter((item) => item.isArchived && !item.isTrashed);
    case "TRASH": return items.filter((item) => item.isTrashed);
    default: return items.filter((item) => !item.isArchived && !item.isTrashed);
  }
}

function isToday(iso: string): boolean {
  const date = new Date(iso);
  const today = new Date();
  return (
    date.getDate() === today.getDate() &&
    date.getMonth() === today.getMonth() &&
    date.getFullYear() === today.getFullYear()
  );
}

function countCalendarConflicts(events: ReturnType<typeof useCalendarStore.getState>["events"]): number {
  const todayEvents = events
    .filter((event) => isToday(event.start_time))
    .map((event) => ({
      start: new Date(event.start_time).getTime(),
      end: new Date(event.end_time).getTime(),
    }))
    .filter((event) => Number.isFinite(event.start) && Number.isFinite(event.end))
    .sort((a, b) => a.start - b.start);

  let conflicts = 0;
  for (let index = 1; index < todayEvents.length; index += 1) {
    if (todayEvents[index].start < todayEvents[index - 1].end) conflicts += 1;
  }
  return conflicts;
}

function SummaryMetric({ value, label }: { value: number; label: string }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.summaryMetric}>
      <Text style={styles.summaryValue}>{value}</Text>
      <Text style={styles.summaryLabel}>{label}</Text>
    </View>
  );
}

export default function EmailScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const accessToken = useAuthStore((state) => state.accessToken);
  const messages = useEmailStore((state) => state.messages);
  const isLoading = useEmailStore((state) => state.isLoading);
  const isMutating = useEmailStore((state) => state.isMutating);
  const error = useEmailStore((state) => state.error);
  const fetchMessages = useEmailStore((state) => state.fetchMessages);
  const updateMessage = useEmailStore((state) => state.updateMessage);
  const deleteMessage = useEmailStore((state) => state.deleteMessage);
  const notifications = useNotificationsStore((state) => state.notifications);
  const fetchNotifications = useNotificationsStore((state) => state.fetchNotifications);
  const markNotificationRead = useNotificationsStore((state) => state.markRead);
  const deleteNotification = useNotificationsStore((state) => state.deleteNotification);
  const reminders = useRemindersStore((state) => state.reminders);
  const fetchReminders = useRemindersStore((state) => state.fetchReminders);
  const autonomyItems = useAutonomyStore((state) => state.items);
  const recommendations = useAutonomyStore((state) => state.suggestions);
  const fetchQueue = useAutonomyStore((state) => state.fetchQueue);
  const fetchSuggestions = useAutonomyStore((state) => state.fetchSuggestions);
  const calendarEvents = useCalendarStore((state) => state.events);
  const fetchEvents = useCalendarStore((state) => state.fetchEvents);

  const [filter, setFilter] = useState<Filter>("ALL");
  const [query, setQuery] = useState("");
  const [isClearing, setIsClearing] = useState(false);
  const entrance = useRef(new Animated.Value(0)).current;
  const scrollRef = useRef<ScrollView>(null);
  const inboxListY = useRef(0);

  const refreshInbox = useCallback(() => {
    if (!accessToken) return;
    fetchMessages(accessToken);
    fetchNotifications(accessToken);
    fetchReminders(accessToken);
    fetchQueue(accessToken);
    fetchSuggestions(accessToken);
    fetchEvents(accessToken, true);
  }, [
    accessToken,
    fetchEvents,
    fetchMessages,
    fetchNotifications,
    fetchQueue,
    fetchReminders,
    fetchSuggestions,
  ]);

  useEffect(() => {
    refreshInbox();
  }, [refreshInbox]);

  useEffect(() => {
    Animated.timing(entrance, {
      toValue: 1,
      duration: 420,
      useNativeDriver: true,
    }).start();
  }, [entrance]);

  const inboxItems = useMemo(
    () => [
      ...messages.map(toInboxItem),
      ...notifications.map(notificationToInboxItem),
    ].sort((a, b) => b.timestamp.localeCompare(a.timestamp)),
    [messages, notifications],
  );
  const unreadCount = useMemo(
    () => inboxItems.filter((item) => item.isUnread && !item.isArchived && !item.isTrashed).length,
    [inboxItems],
  );
  const filteredItems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return applyFilter(inboxItems, filter).filter((item) =>
      !normalizedQuery ||
      item.title.toLowerCase().includes(normalizedQuery) ||
      item.source.toLowerCase().includes(normalizedQuery) ||
      item.preview?.toLowerCase().includes(normalizedQuery),
    );
  }, [filter, inboxItems, query]);
  const pendingApprovalCount = useMemo(
    () => autonomyItems.filter((item) => item.status === "pending").length,
    [autonomyItems],
  );
  const activeReminders = useMemo(
    () => reminders.filter((reminder) => reminder.is_enabled).length,
    [reminders],
  );
  const calendarConflicts = useMemo(
    () => countCalendarConflicts(calendarEvents),
    [calendarEvents],
  );
  const aiRecommendations = recommendations.length;
  const totalAttention = unreadCount + pendingApprovalCount + calendarConflicts;
  const clearableItems = useMemo(
    () => inboxItems.filter((item) => !item.isArchived && !item.isTrashed),
    [inboxItems],
  );

  function handleToggleRead(item: UnifiedInboxItem) {
    if (!accessToken) return;
    if (item.entityType === "notification") {
      if (item.isUnread) markNotificationRead(accessToken, item.entityId);
      return;
    }
    const message = messages.find((candidate) => candidate.id === item.entityId);
    if (!message) return;
    updateMessage(accessToken, message.id, {
      status: message.status === "unread" ? "read" : "unread",
    });
  }

  function handleArchive(item: UnifiedInboxItem) {
    if (accessToken && item.entityType === "email") {
      updateMessage(accessToken, item.entityId, { status: "archived" });
    }
  }

  function handleDelete(item: UnifiedInboxItem) {
    if (!accessToken) return;
    if (item.entityType === "notification") {
      deleteNotification(accessToken, item.entityId);
    } else if (item.isTrashed) {
      Alert.alert(
        "Delete Permanently",
        "This email will be permanently deleted and cannot be recovered.",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Delete",
            style: "destructive",
            onPress: () => deleteMessage(accessToken, item.entityId),
          },
        ],
      );
    } else {
      updateMessage(accessToken, item.entityId, { status: "trashed" });
    }
  }

  function handleRestore(item: UnifiedInboxItem) {
    if (accessToken && item.entityType === "email" && item.isTrashed) {
      updateMessage(accessToken, item.entityId, { status: "read" });
    }
  }

  function handleClearAll() {
    if (!accessToken || isClearing) return;
    if (clearableItems.length === 0) return;

    Alert.alert(
      "Clear Inbox",
      `Clear all ${clearableItems.length} inbox item${clearableItems.length === 1 ? "" : "s"}? Email messages will move to Trash, notifications will be removed, and archived emails will be preserved.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear All",
          style: "destructive",
          onPress: async () => {
            setIsClearing(true);
            try {
              // Execute sequentially so each optimistic store update is applied
              // before the next deletion and the API is not flooded.
              for (const item of clearableItems) {
                if (item.entityType === "notification") {
                  await deleteNotification(accessToken, item.entityId);
                } else {
                  await updateMessage(accessToken, item.entityId, { status: "trashed" });
                }
              }

              setFilter("ALL");
              setQuery("");
              await Promise.all([
                fetchMessages(accessToken),
                fetchNotifications(accessToken),
              ]);
            } finally {
              setIsClearing(false);
            }
          },
        },
      ],
    );
  }

  return (
    <ScrollView
      ref={scrollRef}
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={[styles.container, { paddingTop: insets.top + spacing.md }]}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={isLoading} onRefresh={refreshInbox} tintColor={colors.accent} />
      }
    >
      <Animated.View
        style={{
          opacity: entrance,
          transform: [{ translateY: entrance.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }],
        }}
      >
        <View style={styles.heroCard}>
          <View style={styles.heroGlow} />
          <View style={styles.heroTop}>
            <View>
              <Text style={styles.heroLabel}>COMMUNICATION HUB</Text>
              <Text style={styles.heroTitle}>Inbox</Text>
            </View>
            <View style={[styles.healthIcon, totalAttention > 0 && styles.healthIconAttention]}>
              <SymbolView
                name={totalAttention > 0 ? "bell.badge.fill" : "checkmark.seal.fill"}
                size={21}
                tintColor={totalAttention > 0 ? colors.warning : colors.success}
                resizeMode="scaleAspectFit"
              />
            </View>
          </View>
          <Text style={styles.unreadCount}>{unreadCount} Unread</Text>
          <Text style={styles.heroSubtitle}>
            {totalAttention === 0
              ? "Everything is up to date."
              : `${totalAttention} item${totalAttention === 1 ? "" : "s"} may need your attention.`}
          </Text>
          <Text style={styles.heroDescription}>
            HELIOS gathers notifications, emails, reminders, AI insights, approvals, and system activity into one unified inbox.
          </Text>
        </View>

        <View style={styles.summaryCard}>
          <View style={styles.summaryHeader}>
            <View style={styles.summaryTitleWrap}>
              <SymbolView name="sparkles" size={15} tintColor={colors.accent} resizeMode="scaleAspectFit" />
              <Text style={styles.summaryTitle}>Today&apos;s Summary</Text>
            </View>
            <TouchableOpacity
              accessibilityRole="button"
              onPress={() => scrollRef.current?.scrollTo({ y: inboxListY.current, animated: true })}
            >
              <Text style={styles.summaryLink}>View Details →</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.summaryGrid}>
            <SummaryMetric value={unreadCount} label="unread" />
            <SummaryMetric value={pendingApprovalCount} label="approvals" />
            <SummaryMetric value={activeReminders} label="reminders" />
            <SummaryMetric value={calendarConflicts} label="conflicts" />
            <SummaryMetric value={aiRecommendations} label="AI actions" />
          </View>
        </View>

        <View style={styles.searchBar}>
          <SymbolView name="magnifyingglass" size={15} tintColor={colors.textMuted} resizeMode="scaleAspectFit" />
          <TextInput
            style={styles.searchInput}
            value={query}
            onChangeText={setQuery}
            placeholder="Search Inbox"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            clearButtonMode="while-editing"
            accessibilityLabel="Search Inbox"
          />
        </View>

        <View style={styles.filterHeader}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterContent}>
            {FILTERS.map((option) => (
              <TouchableOpacity
                key={option}
                style={[styles.chip, filter === option && styles.chipActive]}
                onPress={() => setFilter(option)}
                activeOpacity={0.72}
              >
                <Text style={[styles.chipText, filter === option && styles.chipTextActive]}>
                  {option === "AI" ? "AI" : option[0] + option.slice(1).toLowerCase()}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          {(isLoading || isMutating) ? <ActivityIndicator size="small" color={colors.accentCyan} /> : null}
        </View>

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        {filteredItems.length === 0 && !isLoading ? (
          <View style={styles.emptyState}>
            <View style={styles.emptyIcon}>
              <SymbolView name="tray.fill" size={29} tintColor={colors.accentCyan} resizeMode="scaleAspectFit" />
            </View>
            <Text style={styles.emptyTitle}>
              {inboxItems.length === 0 ? "Your Inbox is Clear" : `No ${filter.toLowerCase()} items`}
            </Text>
            <Text style={styles.emptyText}>
              {inboxItems.length === 0
                ? "No unread messages, notifications, reminders, or AI updates need your attention."
                : "No inbox items match this search or filter."}
            </Text>
            <TouchableOpacity style={styles.refreshButton} onPress={refreshInbox} activeOpacity={0.8}>
              <SymbolView name="arrow.clockwise" size={14} tintColor={colors.background} resizeMode="scaleAspectFit" />
              <Text style={styles.refreshButtonText}>Refresh Inbox</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View
            style={styles.inboxList}
            onLayout={(event) => { inboxListY.current = event.nativeEvent.layout.y; }}
          >
            <View style={styles.inboxListHeading}>
              <Text style={styles.inboxListTitle}>Inbox</Text>
              <View style={styles.inboxListActions}>
                <Text style={styles.inboxListCount}>{filteredItems.length}</Text>
                <TouchableOpacity
                  style={[
                    styles.clearAllButton,
                    (isClearing || clearableItems.length === 0) && styles.clearAllButtonDisabled,
                  ]}
                  onPress={handleClearAll}
                  disabled={isClearing || clearableItems.length === 0}
                  activeOpacity={0.72}
                  accessibilityRole="button"
                  accessibilityLabel="Clear all inbox items"
                >
                  {isClearing ? (
                    <ActivityIndicator size="small" color={colors.danger} />
                  ) : (
                    <Text style={styles.clearAllText}>Clear All</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
            {filteredItems.map((item) => (
              <InboxItemCard
                key={item.id}
                item={item}
                onToggleRead={
                  !item.isTrashed && (item.entityType === "email" || item.isUnread)
                    ? () => handleToggleRead(item)
                    : undefined
                }
                onArchive={
                  item.entityType === "email" && !item.isTrashed
                    ? () => handleArchive(item)
                    : undefined
                }
                onRestore={item.isTrashed ? () => handleRestore(item) : undefined}
                onDelete={() => handleDelete(item)}
              />
            ))}
          </View>
        )}

        <View style={{ height: spacing.xxl }} />
      </Animated.View>
    </ScrollView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { paddingHorizontal: spacing.md, paddingBottom: spacing.xxl },
    heroCard: {
      backgroundColor: colors.card,
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: `${colors.accent}40`,
      padding: spacing.lg,
      marginBottom: spacing.md,
      overflow: "hidden",
    },
    heroGlow: {
      position: "absolute",
      width: 170,
      height: 170,
      borderRadius: 85,
      right: -70,
      top: -85,
      backgroundColor: `${colors.accent}10`,
    },
    heroTop: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
      marginBottom: spacing.lg,
    },
    heroLabel: { ...typography.label, color: colors.accent, letterSpacing: 2.1, marginBottom: spacing.xs },
    heroTitle: { ...typography.displaySmall, color: colors.textPrimary, letterSpacing: -0.6 },
    healthIcon: {
      width: 44,
      height: 44,
      borderRadius: 16,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: `${colors.success}12`,
      borderWidth: 1,
      borderColor: `${colors.success}35`,
    },
    healthIconAttention: { backgroundColor: `${colors.warning}12`, borderColor: `${colors.warning}35` },
    unreadCount: { fontSize: 18, fontWeight: "800", color: colors.textPrimary },
    heroSubtitle: { ...typography.body, color: colors.textSecondary, marginTop: 2 },
    heroDescription: {
      ...typography.caption,
      color: colors.textMuted,
      lineHeight: 19,
      marginTop: spacing.md,
      maxWidth: 340,
    },
    summaryCard: {
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.md,
      marginBottom: spacing.md,
    },
    summaryHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: spacing.md,
    },
    summaryTitleWrap: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
    summaryTitle: { fontSize: 14, fontWeight: "800", color: colors.textPrimary },
    summaryLink: { fontSize: 11, fontWeight: "700", color: colors.accent },
    summaryGrid: { flexDirection: "row", alignItems: "stretch", gap: 5 },
    summaryMetric: {
      flex: 1,
      minWidth: 0,
      alignItems: "center",
      backgroundColor: colors.surfaceDark,
      borderRadius: 11,
      paddingVertical: spacing.sm,
      paddingHorizontal: 2,
    },
    summaryValue: { fontSize: 16, fontWeight: "800", color: colors.textPrimary },
    summaryLabel: { fontSize: 8, color: colors.textMuted, marginTop: 2 },
    searchBar: {
      minHeight: 46,
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: spacing.md,
      marginBottom: spacing.md,
    },
    searchInput: { flex: 1, color: colors.textPrimary, fontSize: 14, paddingVertical: spacing.sm },
    filterHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      marginBottom: spacing.md,
    },
    filterContent: { paddingRight: spacing.md },
    chip: {
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceDark,
      borderRadius: radius.sm,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      marginRight: spacing.xs,
    },
    chipActive: { backgroundColor: `${colors.accent}20`, borderColor: colors.accent },
    chipText: { fontSize: 11, fontWeight: "700", color: colors.textMuted },
    chipTextActive: { color: colors.accent },
    errorText: {
      ...typography.caption,
      color: colors.danger,
      backgroundColor: `${colors.danger}12`,
      borderRadius: radius.md,
      padding: spacing.md,
      marginBottom: spacing.md,
    },
    emptyState: {
      alignItems: "center",
      backgroundColor: colors.card,
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.xl,
    },
    emptyIcon: {
      width: 62,
      height: 62,
      borderRadius: 22,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: `${colors.accentCyan}12`,
      borderWidth: 1,
      borderColor: `${colors.accentCyan}30`,
      marginBottom: spacing.md,
    },
    emptyTitle: { fontSize: 19, fontWeight: "800", color: colors.textPrimary, textAlign: "center" },
    emptyText: {
      ...typography.body,
      color: colors.textMuted,
      textAlign: "center",
      lineHeight: 21,
      marginTop: spacing.sm,
      maxWidth: 320,
    },
    refreshButton: {
      minHeight: 44,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: spacing.sm,
      backgroundColor: colors.accent,
      borderRadius: radius.md,
      paddingHorizontal: spacing.lg,
      marginTop: spacing.lg,
    },
    refreshButtonText: { fontSize: 12, fontWeight: "800", color: colors.background },
    inboxList: { marginTop: spacing.xs },
    inboxListHeading: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: spacing.md,
    },
    inboxListTitle: { fontSize: 19, fontWeight: "800", color: colors.textPrimary },
    inboxListActions: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
    },
    inboxListCount: {
      minWidth: 26,
      height: 26,
      borderRadius: 13,
      textAlign: "center",
      textAlignVertical: "center",
      fontSize: 11,
      fontWeight: "800",
      color: colors.accent,
      backgroundColor: `${colors.accent}18`,
      paddingTop: 6,
    },
    clearAllButton: {
      minHeight: 32,
      minWidth: 72,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: radius.sm,
      borderWidth: 1,
      borderColor: `${colors.danger}45`,
      backgroundColor: `${colors.danger}10`,
      paddingHorizontal: spacing.sm,
    },
    clearAllButtonDisabled: {
      opacity: 0.55,
    },
    clearAllText: {
      fontSize: 10,
      fontWeight: "800",
      color: colors.danger,
    },
  });
}
