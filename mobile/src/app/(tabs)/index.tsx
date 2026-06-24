import React, { useCallback, useEffect, useMemo, useRef } from "react";
import {
  Animated,
  Dimensions,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { SymbolView } from "expo-symbols";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { SFSymbol } from "sf-symbols-typescript";

import HeliosEnergyCore, { type CoreState } from "../../components/HeliosEnergyCore";
import {
  useAuthStore,
  useAutonomyStore,
  useBackgroundJobsStore,
  useConversationStore,
  useGoalsStore,
  useIntegrationStore,
  useNotificationsStore,
  useProfileStore,
  useSettingsStore,
  useTasksStore,
} from "../../store";
import { useTheme } from "../../theme/ThemeContext";
import type { ThemeColors } from "../../theme/theme";
import {
  formatActiveGoalsSubtitle,
  formatSafeDashboardMetricValue,
  formatSafeMetricPercent,
  formatHeroDate,
  formatHeroTime,
  formatHeroTimeLocation,
  getTimeBasedGreeting,
  isActiveGoalStatus,
} from "../../utils/homeFormatting";
import { useCurrentDateTime } from "../../hooks/useCurrentDateTime";

const { width } = Dimensions.get("window");
const PAGE = width - 52;

// ── System status ─────────────────────────────────────────────────────────────

type StatusTone = "active" | "warning" | "attention" | "danger" | "syncing" | "focus";
type SystemStatus = {
  label: string;
  tone: StatusTone;
  coreState: CoreState;
  targetRoute: string | null;
  accessibilityHint: string;
};

function getAssistantStatus({
  apiError,
  aiProviderOffline,
  pendingApprovals,
  unreadCount,
  overdueTasks,
  highPriorityOpen,
  openTasks,
  attentionRoute,
  isSyncing,
  focusModeActive,
}: {
  apiError: boolean;
  aiProviderOffline: boolean;
  pendingApprovals: number;
  unreadCount: number;
  overdueTasks: number;
  highPriorityOpen: number;
  openTasks: number;
  attentionRoute: string;
  isSyncing: boolean;
  focusModeActive: boolean;
}): SystemStatus {
  if (apiError)
    return {
      label: "Needs your attention",
      tone: "danger",
      coreState: "critical",
      targetRoute: "/(tabs)/more",
      accessibilityHint: "HELIOS needs your attention. Tap to view status.",
    };
  if (aiProviderOffline)
    return {
      label: "Syncing your information",
      tone: "warning",
      coreState: "offline",
      targetRoute: "/(tabs)/integrations",
      accessibilityHint: "HELIOS is syncing information. Tap to view integrations.",
    };
  if (pendingApprovals > 0 || overdueTasks > 0 || highPriorityOpen > 0)
    return {
      label: "Needs your attention",
      tone: "attention",
      coreState: "attention",
      targetRoute: attentionRoute,
      accessibilityHint: "HELIOS has something for you to review.",
    };
  if (isSyncing)
    return {
      label: "Working in the background",
      tone: "syncing",
      coreState: "generating",
      targetRoute: "/(tabs)/integrations",
      accessibilityHint: "HELIOS is working in the background.",
    };
  if (unreadCount > 0)
    return {
      label: "Generating recommendations",
      tone: "syncing",
      coreState: "thinking",
      targetRoute: "/(tabs)/notifications",
      accessibilityHint: "HELIOS has new recommendations and updates.",
    };
  if (openTasks === 0)
    return {
      label: "You're all caught up",
      tone: "active",
      coreState: "idle",
      targetRoute: null,
      accessibilityHint: "You're all caught up.",
    };
  if (focusModeActive)
    return {
      label: "Waiting for your next task",
      tone: "focus",
      coreState: "listening",
      targetRoute: null,
      accessibilityHint: "HELIOS is waiting for your next task.",
    };
  return {
    label: "Ready to help",
    tone: "active",
    coreState: "idle",
    targetRoute: null,
    accessibilityHint: "HELIOS is ready to help.",
  };
}

function getToneColor(tone: StatusTone, colors: ThemeColors): string {
  switch (tone) {
    case "danger":    return colors.danger;
    case "warning":   return colors.warning;
    case "attention": return colors.warning;
    case "syncing":   return colors.accentCyan;
    case "focus":     return colors.accent;
    case "active":    return colors.accentCyan;
  }
}

export default function HomeScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const now = useCurrentDateTime();
  const accessToken = useAuthStore((s) => s.accessToken);
  const authUserName = useAuthStore((s) => s.user?.name ?? "Operator");
  const preferredName = useSettingsStore((s) => s.preferred_name);
  const profileDisplayName = useProfileStore((s) => s.display_name);
  // Priority: preferred_name (set by user for AI/greeting) → profile display_name → auth name
  const userName = preferredName ?? profileDisplayName ?? authUserName;

  const goals = useGoalsStore((s) => s.goals);
  const goalsLoading = useGoalsStore((s) => s.isLoading);
  const goalsError = useGoalsStore((s) => s.error);
  const fetchGoals = useGoalsStore((s) => s.fetchGoals);
  const tasks = useTasksStore((s) => s.tasks);
  const tasksError = useTasksStore((s) => s.error);
  const fetchTasks = useTasksStore((s) => s.fetchTasks);
  const unreadCount = useNotificationsStore((s) => s.notifications.filter((n) => !n.is_read).length);
  const pendingApprovals = useAutonomyStore((s) => s.items.filter((i) => i.status === "pending").length);
  const syncingId = useIntegrationStore((s) => s.syncingId);
  const bgJobsRunning = useBackgroundJobsStore((s) => s.jobs.some((j) => j.status === "running"));
  const aiSendError = useConversationStore((s) => s.sendError);
  const location = useSettingsStore((s) => s.location);
  const timeFormat = useSettingsStore((s) => s.time_format);
  const safeGoals = useMemo(() => goals ?? [], [goals]);
  const safeTasks = useMemo(() => tasks ?? [], [tasks]);

  useEffect(() => {
    if (accessToken) {
      fetchGoals(accessToken);
      fetchTasks(accessToken);
    }
  }, [accessToken, fetchGoals, fetchTasks]);

  useFocusEffect(
    useCallback(() => {
      if (!accessToken) return;
      fetchGoals(accessToken);
      fetchTasks(accessToken);
    }, [accessToken, fetchGoals, fetchTasks]),
  );

  const activeGoals = useMemo(
    () => safeGoals.filter((g) => isActiveGoalStatus(g.status)).length,
    [safeGoals],
  );
  const activeGoalsValue = formatSafeDashboardMetricValue("Active Goals", activeGoals);
  const activeGoalsSubtitle = goalsError
    ? "Unable to load"
    : goalsLoading && goals.length === 0
      ? "Loading goals"
      : formatActiveGoalsSubtitle(activeGoals);
  const goalStatuses = useMemo(
    () => Array.from(new Set(safeGoals.map((g) => g.status ?? "unknown"))),
    [safeGoals],
  );
  const doneTodayTasks = safeTasks.filter((t) => {
    if (t.status !== "done") return false;
    if (!t.updated_at) return false;
    const updated = new Date(t.updated_at);
    return (
      updated.getDate() === now.getDate() &&
      updated.getMonth() === now.getMonth() &&
      updated.getFullYear() === now.getFullYear()
    );
  }).length;
  const openTasks = safeTasks.filter((t) => t.status !== "done").length;
  const totalTasks = safeTasks.length;
  const completedTasks = safeTasks.filter((t) => t.status === "done").length;
  const completionRateValue =
    totalTasks === 0
      ? "0%"
      : formatSafeMetricPercent(Math.round((completedTasks / totalTasks) * 100));
  const doneTodayTasksValue = formatSafeDashboardMetricValue("Tasks Done", doneTodayTasks);
  const openTasksValue = formatSafeDashboardMetricValue("Open Tasks", openTasks);

  useEffect(() => {
    if (!__DEV__) return;
    console.log("[Home metrics] Active Goals", {
      totalGoalsLoaded: safeGoals.length,
      activeGoalsCounted: activeGoals,
      statusesFound: goalStatuses,
      valuePassedToMetricCard: activeGoalsValue,
    });
  }, [activeGoals, activeGoalsValue, goalStatuses, safeGoals.length]);

  const overdueTasks = safeTasks.filter((t) => {
    if (t.status === "done" || !t.due_date) return false;
    return new Date(t.due_date) < now;
  }).length;
  const highPriorityOpen = safeTasks.filter(
    (t) => t.status !== "done" && (t.priority === "critical" || t.priority === "high"),
  ).length;

  const aiProviderOffline =
    aiSendError != null &&
    (aiSendError.toLowerCase().includes("provider") ||
      aiSendError.toLowerCase().includes("unavailable"));

  // Resolve the highest-priority destination when HELIOS needs attention.
  const attentionRoute =
    overdueTasks > 0 || highPriorityOpen > 0
      ? "/(tabs)/tasks"
      : pendingApprovals > 0
        ? "/(tabs)/autonomy"
        : "/(tabs)/notifications";

  const systemStatus = getAssistantStatus({
    apiError: !!(tasksError || goalsError),
    aiProviderOffline,
    pendingApprovals,
    unreadCount,
    overdueTasks,
    highPriorityOpen,
    openTasks,
    attentionRoute,
    isSyncing: !!(syncingId || bgJobsRunning),
    focusModeActive: false,
  });

  const onPressStatus = systemStatus.targetRoute
    ? () => router.push(systemStatus.targetRoute as Parameters<typeof router.push>[0])
    : null;

  const greeting = getTimeBasedGreeting(now);
  const dateStr = formatHeroDate(now);
  const timeLocationStr = formatHeroTimeLocation(now, location, timeFormat);
  const timeStr = formatHeroTime(now, timeFormat);

  const displayName = userName;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Background />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: insets.top + 20,
            paddingBottom: insets.bottom + 188,
          },
        ]}
      >
        <Header
          unreadCount={unreadCount}
          onNotifPress={() => router.push("/(tabs)/notifications")}
          onGearPress={() => router.push("/(tabs)/profile")}
        />
        <Hero
          greeting={greeting}
          userName={displayName}
          dateStr={dateStr}
          timeLocationStr={timeLocationStr}
          systemStatus={systemStatus}
          onPressStatus={onPressStatus}
        />

        <Section title={"TODAY'S METRICS"} action="View all  ›" onAction={() => router.push("/(tabs)/analytics")} />

        <View style={styles.grid}>
          <Metric
            icon="target"
            value={activeGoalsValue}
            label="Active Goals"
            sub={activeGoalsSubtitle}
            onPress={() => router.push({
              pathname: "/(tabs)/goals",
              params: { focus: activeGoals > 0 ? "active" : "empty" },
            })}
          />
          <Metric icon="checkmark.circle.fill" value={doneTodayTasksValue} label="Tasks Done" sub={tasksError ? "Unable to load" : "Completed today"} onPress={() => router.push("/(tabs)/tasks")} />
          <Metric icon="chart.bar.fill" value={completionRateValue} label="Completion Rate" sub={tasksError ? "Unable to load" : "Overall progress"} onPress={() => router.push("/(tabs)/analytics")} />
          <Metric icon="circle" value={openTasksValue} label="Open Tasks" sub={tasksError ? "Unable to load" : openTasks === 0 ? "All clear" : "Needs attention"} onPress={() => router.push("/(tabs)/tasks")} />
        </View>

        <Section title="DAILY BRIEF" action="View full briefing  ›" onAction={() => router.push("/(tabs)/assistant")} />
        <DailyCommand timeStr={timeStr} userName={displayName} onPress={() => router.push("/(tabs)/assistant")} />
      </ScrollView>
    </View>
  );
}

function Header({
  unreadCount,
  onNotifPress,
  onGearPress,
}: {
  unreadCount: number;
  onNotifPress: () => void;
  onGearPress: () => void;
}) {
  const { colors } = useTheme();
  const s = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={s.header}>
      <Text style={s.logo}>H E L I O S</Text>

      <View style={s.headerIcons}>
        <TouchableOpacity
          style={s.roundButton}
          onPress={onNotifPress}
          activeOpacity={0.75}
          accessibilityLabel={
            unreadCount > 0
              ? `${unreadCount} unread notification${unreadCount === 1 ? "" : "s"}. Tap to view.`
              : "Notifications. Tap to view."
          }
          accessibilityRole="button"
        >
          <SymbolView
            name="bell"
            size={20}
            tintColor={colors.textSecondary}
            resizeMode="scaleAspectFit"
          />
          {unreadCount > 0 && (
            <View style={s.badge}>
              <Text style={s.badgeText}>{unreadCount > 9 ? "9+" : unreadCount}</Text>
            </View>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={s.roundButton}
          onPress={onGearPress}
          activeOpacity={0.75}
          accessibilityLabel="Settings"
          accessibilityRole="button"
        >
          <SymbolView
            name="gearshape"
            size={21}
            tintColor={colors.textSecondary}
            resizeMode="scaleAspectFit"
          />
        </TouchableOpacity>
      </View>
    </View>
  );
}

function Hero({
  greeting,
  userName,
  dateStr,
  timeLocationStr,
  systemStatus,
  onPressStatus,
}: {
  greeting: string;
  userName: string;
  dateStr: string;
  timeLocationStr: string;
  systemStatus: SystemStatus;
  onPressStatus: (() => void) | null;
}) {
  const { colors } = useTheme();
  const s = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={s.heroCard}>
      {/* Left column — greeting, name, date */}
      <View style={s.heroLeft}>
        <Text style={s.heroGreeting}>{greeting}</Text>
        <Text style={s.heroName} numberOfLines={2}>{userName}</Text>
        <View style={s.heroDateBlock}>
          <Text style={s.heroDate}>{dateStr}</Text>
          <Text style={s.heroTimeLocation}>{timeLocationStr}</Text>
        </View>
      </View>

      {/* Energy Core — visual centerpiece, top-right */}
      <View style={s.heroOrbArea}>
        <HeliosEnergyCore
          size={142}
          state={systemStatus.coreState}
          showParticles={false}
          onPress={onPressStatus ?? undefined}
        />
      </View>

      {/* Bottom — assistant message */}
      <View style={s.heroBottom}>
        <Text style={s.assistantMessage}>
          {"Welcome back.\nEverything looks good today."}
        </Text>
      </View>
    </View>
  );
}

function Section({ title, action, onAction }: { title: string; action: string; onAction?: () => void }) {
  const { colors } = useTheme();
  const s = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={s.section}>
      <Text style={s.sectionTitle}>{title}</Text>
      <TouchableOpacity onPress={onAction} activeOpacity={0.7}>
        <Text style={s.sectionAction}>{action}</Text>
      </TouchableOpacity>
    </View>
  );
}

function Metric({
  icon,
  value,
  label,
  sub,
  onPress,
}: {
  icon: SFSymbol;
  value: string;
  label: string;
  sub: string;
  onPress?: () => void;
}) {
  const { colors } = useTheme();
  const s = useMemo(() => createStyles(colors), [colors]);
  const displayValue = formatSafeDashboardMetricValue(label, value);

  return (
    <TouchableOpacity
      style={s.metric}
      onPress={onPress}
      activeOpacity={0.75}
      accessibilityLabel={`${label}: ${displayValue}. ${sub}. Tap to view.`}
      accessibilityRole="button"
      disabled={!onPress}
    >
      <View style={s.metricTop}>
        <View style={s.metricIcon}>
          <SymbolView
            name={icon}
            size={24}
            tintColor={colors.tabBarActive}
            resizeMode="scaleAspectFit"
          />
        </View>

        <View style={s.metricTextWrap}>
          <Text style={s.metricValue} numberOfLines={1}>{displayValue}</Text>
          <Text style={s.metricLabel}>{label}</Text>
          <Text style={s.metricSub}>{sub}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

function DailyCommand({ timeStr, userName, onPress }: { timeStr: string; userName: string; onPress?: () => void }) {
  const { colors } = useTheme();
  const s = useMemo(() => createStyles(colors), [colors]);

  return (
    <TouchableOpacity
      style={s.command}
      onPress={onPress}
      activeOpacity={0.78}
      accessibilityLabel="Daily Brief. Tap to open assistant."
      accessibilityRole="button"
      disabled={!onPress}
    >
      <View style={s.commandLine} />

      <View style={s.commandTop}>
        <View style={s.commandTitleWrap}>
          <SymbolView
            name="brain.head.profile"
            size={16}
            tintColor={colors.accentCyan}
            resizeMode="scaleAspectFit"
          />
          <Text style={s.commandTitle}>DAILY BRIEF</Text>
        </View>

        <Text style={s.commandTime}>{timeStr}</Text>
      </View>

      <Text style={s.commandBody}>
        {"Good to see you\n"}{userName}{"\n"}
        {"Your priority queue is loaded and systems are nominal."}
      </Text>
    </TouchableOpacity>
  );
}

function Background() {
  const { colors } = useTheme();
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <View style={[StyleSheet.absoluteFillObject, { backgroundColor: colors.background }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 26,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: 14,
    marginBottom: 38,
  },
});

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    header: {
      minHeight: 54,
      marginBottom: 16,
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    logo: {
      color: colors.tabBarActive,
      fontSize: 21,
      fontWeight: "900",
      letterSpacing: 8,
      textShadowColor: `${colors.tabBarActive}a6`,
      textShadowRadius: 8,
    },
    headerIcons: {
      flexDirection: "row",
      gap: 12,
    },
    roundButton: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: `${colors.surface}b8`,
      borderWidth: 1,
      borderColor: `${colors.textMuted}26`,
      alignItems: "center",
      justifyContent: "center",
      shadowColor: "#000",
      shadowOpacity: 0.22,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 8 },
    },
    badge: {
      position: "absolute",
      top: -3,
      right: -3,
      minWidth: 19,
      height: 19,
      borderRadius: 10,
      backgroundColor: colors.tabBarActive,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 3,
      borderWidth: 2,
      borderColor: colors.background,
    },
    badgeText: {
      color: colors.textPrimary,
      fontSize: 10,
      fontWeight: "900",
    },

    heroCard: {
      width: PAGE,
      minHeight: 264,
      borderRadius: 28,
      marginBottom: 20,
      paddingLeft: 20,
      paddingRight: 20,
      paddingTop: 20,
      paddingBottom: 16,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.tabBarBorder,
      overflow: "hidden",
    },
    heroLeft: {
      width: "58%",
      zIndex: 5,
    },
    heroGreeting: {
      color: colors.textMuted,
      fontSize: 15,
      lineHeight: 20,
      fontWeight: "500",
      marginBottom: 3,
    },
    heroName: {
      color: colors.textPrimary,
      fontSize: 29,
      lineHeight: 36,
      fontWeight: "900",
      letterSpacing: -0.6,
      marginBottom: 10,
    },
    heroDate: {
      color: colors.textSecondary,
      fontSize: 13,
      lineHeight: 17,
      fontWeight: "700",
    },
    heroDateBlock: {
      gap: 2,
    },
    heroTimeLocation: {
      color: colors.textMuted,
      fontSize: 12,
      lineHeight: 16,
      fontWeight: "500",
      letterSpacing: 0.1,
    },
    heroOrbArea: {
      position: "absolute",
      right: -10,
      top: 8,
      width: 152,
      height: 140,
      alignItems: "center",
      justifyContent: "center",
    },
    heroBottom: {
      marginTop: 20,
    },
    assistantMessage: {
      color: colors.textMuted,
      fontSize: 14,
      lineHeight: 18,
      fontWeight: "500",
      letterSpacing: 0.1,
    },

    section: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 15,
    },
    sectionTitle: {
      color: colors.textPrimary,
      fontSize: 12,
      fontWeight: "900",
      letterSpacing: 3.8,
    },
    sectionAction: {
      color: colors.tabBarActive,
      fontSize: 12,
      fontWeight: "800",
    },

    metric: {
      width: "48%",
      minHeight: 110,
      borderRadius: 20,
      padding: 13,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.tabBarBorder,
      justifyContent: "center",
      shadowColor: "#000",
      shadowOpacity: 0.14,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 10 },
    },
    metricIcon: {
      width: 40,
      height: 40,
      borderRadius: 12,
      backgroundColor: `${colors.tabBarActive}29`,
      alignItems: "center",
      justifyContent: "center",
    },
    metricTop: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 14,
    },
    metricTextWrap: {
      flex: 1,
      marginTop: -1,
    },
    metricValue: {
      color: colors.textPrimary,
      fontSize: 31,
      lineHeight: 34,
      fontWeight: "900",
      letterSpacing: 0,
    },
    metricLabel: {
      color: colors.textSecondary,
      fontSize: 12.5,
      lineHeight: 16,
      fontWeight: "700",
      marginTop: 4,
    },
    metricSub: {
      color: colors.textMuted,
      fontSize: 11,
      lineHeight: 14,
      fontWeight: "500",
      marginTop: 5,
    },

    command: {
      minHeight: 166,
      borderRadius: 24,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.tabBarBorder,
      paddingHorizontal: 20,
      paddingTop: 24,
      paddingBottom: 20,
      overflow: "hidden",
      shadowColor: colors.accentCyan,
      shadowOpacity: 0.09,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 10 },
    },
    commandLine: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      height: 2.5,
      backgroundColor: colors.accentCyan,
      shadowColor: colors.accentCyan,
      shadowRadius: 12,
      shadowOpacity: 1,
    },
    commandTop: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 18,
    },
    commandTitleWrap: {
      flexDirection: "row",
      alignItems: "center",
      gap: 9,
    },
    commandTitle: {
      color: colors.accentCyan,
      fontSize: 12.5,
      fontWeight: "900",
      letterSpacing: 2.8,
    },
    commandTime: {
      color: colors.textMuted,
      fontSize: 12.5,
      fontWeight: "800",
      letterSpacing: 1.8,
    },
    commandBody: {
      color: colors.textPrimary,
      fontSize: 15.5,
      lineHeight: 23,
      fontWeight: "800",
    },
  });
}
