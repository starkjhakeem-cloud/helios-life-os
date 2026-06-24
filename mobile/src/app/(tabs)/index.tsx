import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  Easing,
  PanResponder,
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
  formatHeroDate,
  formatHeroTime,
  formatHeroTimeLocation,
  getTimeBasedGreeting,
} from "../../utils/homeFormatting";
import { useCurrentDateTime } from "../../hooks/useCurrentDateTime";
import {
  buildIntelligenceContext,
  categorizeTask,
  generateDailyBrief,
  generateHeroMessage,
  prioritizeTasks,
  resolveContext,
} from "../../lib/helios-intelligence";
import type {
  DailyBrief,
  HeliosIntelligenceContext,
  HeliosTask,
} from "../../lib/helios-intelligence";

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

  const openTasks = safeTasks.filter((t) => t.status !== "done").length;

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
        ? "/(tabs)/assistant"
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

  // ── Intelligence Engine ─────────────────────────────────────────────────────
  const notifications = useNotificationsStore((s) => s.notifications);

  const intelligenceCtx = useMemo(
    () =>
      buildIntelligenceContext({
        goals: safeGoals,
        tasks: safeTasks,
        notifications,
        profile: {
          name: displayName,
          location: location ?? "New York, NY",
          timezone: "America/New_York",
        },
        appStatus: {
          apiError: !!(tasksError || goalsError),
          aiOffline: aiProviderOffline,
          isSyncing: !!(syncingId || bgJobsRunning),
          pendingApprovals,
        },
        preferences: { timeFormat: timeFormat ?? "12h" },
        currentTime: now,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [safeGoals, safeTasks, notifications, displayName, location, timeFormat, now.getMinutes()],
  );

  const dailyBrief    = useMemo(() => generateDailyBrief(intelligenceCtx), [intelligenceCtx]);
  const heroMsg       = useMemo(() => generateHeroMessage(intelligenceCtx), [intelligenceCtx]);
  const missionItems  = useMemo(() => buildMissionItems(intelligenceCtx), [intelligenceCtx]);

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
          assistantMessage={`${heroMsg.primary}\n${heroMsg.secondary}`}
        />

        <Section title="TODAY'S FLOW" action="View Queue  ›" onAction={() => router.push("/(tabs)/tasks")} />
        <TodayFlowStack
          items={missionItems}
          now={now}
          onNavigate={(route) => router.push(route as Parameters<typeof router.push>[0])}
          colors={colors}
        />

        <Section title="DAILY BRIEF" action="View full briefing  ›" onAction={() => router.push("/(tabs)/assistant")} />
        <DailyCommand brief={dailyBrief} onPress={() => router.push("/(tabs)/assistant")} />
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
  assistantMessage,
}: {
  greeting: string;
  userName: string;
  dateStr: string;
  timeLocationStr: string;
  systemStatus: SystemStatus;
  onPressStatus: (() => void) | null;
  assistantMessage: string;
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

      {/* Bottom — assistant message (generated by intelligence engine) */}
      <View style={s.heroBottom}>
        <Text style={s.assistantMessage}>{assistantMessage}</Text>
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

// ── Today's Flow (Smart Stack) ────────────────────────────────────────────────

interface MissionItem {
  id: string;
  category: string;
  icon: SFSymbol;
  accent: string;
  title: string;
  reason: string;
  actionLabel: string;
  route: string;
}

const CATEGORY_META: Record<string, { label: string; icon: SFSymbol; accent: string }> = {
  wgu:       { label: "STUDY",     icon: "book.fill",          accent: "#7c3aed" },
  helios:    { label: "BUILD",     icon: "hammer.fill",         accent: "#3b82f6" },
  portfolio: { label: "PORTFOLIO", icon: "briefcase.fill",      accent: "#8b5cf6" },
  creative:  { label: "CREATE",    icon: "pencil.and.outline",  accent: "#ec4899" },
  health:    { label: "HEALTH",    icon: "figure.run",          accent: "#14b8a6" },
  general:   { label: "FOCUS",     icon: "circle.dotted",       accent: "#6366f1" },
};

function buildMissionTitle(task: HeliosTask, category: string): string {
  const inProgress = task.status === "in_progress";
  if (category === "wgu")    return `${inProgress ? "Continue" : "Start"} D278 Study Session`;
  if (category === "helios") return `${inProgress ? "Resume" : "Start"} HELIOS Development`;
  return inProgress ? `Continue ${task.title}` : task.title;
}

function buildMissionReason(task: HeliosTask, category: string, ctx: HeliosIntelligenceContext): string {
  const today = ctx.currentTime.toISOString().split("T")[0];
  if (task.dueDate && task.dueDate.slice(0, 10) < today)   return "This is past its due date — resolve it to stay on track.";
  if (task.dueDate && task.dueDate.slice(0, 10) === today)  return "This is due today.";
  if (task.status === "in_progress") {
    if (category === "wgu")      return "You're closest to completing this milestone.";
    if (category === "helios")   return "Continue refining the HELIOS experience.";
    if (category === "creative") return "Pick up where you left off.";
    return "You already started this — momentum is everything.";
  }
  if (category === "wgu")       return "Consistent daily progress is what passes the OA.";
  if (category === "helios")    return "Next step in building your AI operating system.";
  if (category === "portfolio") return "Building your portfolio strengthens your career trajectory.";
  if (category === "creative")  return "Creative consistency builds the portfolio.";
  if (category === "health")    return "Taking care of your health enables everything else.";
  if (task.priority === "critical" || task.priority === "high") return "This is your highest-priority open task.";
  return "Completing this moves you closer to your goal.";
}

function buildActionLabel(task: HeliosTask, category: string): string {
  const inProgress = task.status === "in_progress";
  if (category === "wgu")    return inProgress ? "Continue Study" : "Start Study";
  if (category === "helios") return inProgress ? "Resume" : "Open";
  return inProgress ? "Continue" : "Open";
}

function buildMissionItems(ctx: HeliosIntelligenceContext): MissionItem[] {
  const resolved = resolveContext(ctx);
  const ranked   = prioritizeTasks(resolved.tasks, resolved.goals, resolved.calendarEvents);
  const open     = ranked.filter((t) => t.status !== "done");
  return open.slice(0, 5).map((task) => {
    const cat  = categorizeTask(task);
    const meta = CATEGORY_META[cat] ?? CATEGORY_META.general;
    return {
      id:          task.id,
      category:    meta.label,
      icon:        meta.icon,
      accent:      meta.accent,
      title:       buildMissionTitle(task, cat),
      reason:      buildMissionReason(task, cat, resolved),
      actionLabel: buildActionLabel(task, cat),
      route:       "/(tabs)/tasks",
    };
  });
}

function getCaughtUpItem(hour: number): MissionItem {
  const isAM  = hour < 10;
  const isMid = hour >= 10 && hour < 14;
  const isPM  = hour >= 14 && hour < 18;
  return {
    id:          "caught-up",
    category:    "AI SUGGESTION",
    icon:        isAM ? "sunrise.fill" : isMid ? "figure.walk" : isPM ? "book.fill" : "moon.stars.fill",
    accent:      "#22d3ee",
    title:       isAM ? "Set your intention" : isMid ? "Take a short break" : isPM ? "Learn something new" : "Reflect on today",
    reason:      isAM ? "What's the one thing you want to accomplish today?" : isMid ? "A brief walk could sharpen your focus." : isPM ? "Explore Apple's latest Human Interface Guidelines." : "Capture what you accomplished and what to tackle tomorrow.",
    actionLabel: "Ask HELIOS",
    route:       "/(tabs)/assistant",
  };
}

const FLOW_CARD_HEIGHT = 200;
const FLOW_CARD_WIDTH  = Dimensions.get("window").width;
const AUTO_ROTATE_MS   = 17000;
const SWIPE_THRESHOLD  = 40;
const ANIM_DURATION    = 320;

function FlowCard({
  item,
  onAction,
  colors,
}: {
  item: MissionItem;
  onAction: () => void;
  colors: ThemeColors;
}) {
  const s = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={s.flowCard}>
      <View style={[s.flowAccentLine, { backgroundColor: item.accent }]} />

      <View style={s.flowCardTop}>
        <View style={s.flowCategoryRow}>
          <SymbolView name={item.icon} size={12} tintColor={item.accent} resizeMode="scaleAspectFit" />
          <Text style={[s.flowCategory, { color: item.accent }]}>{item.category}</Text>
        </View>
        <Text style={s.flowTitle} numberOfLines={2}>{item.title}</Text>
        <Text style={s.flowReason} numberOfLines={2}>{item.reason}</Text>
      </View>

      <TouchableOpacity
        style={[s.flowActionBtn, { backgroundColor: `${item.accent}1a`, borderColor: `${item.accent}40` }]}
        onPress={onAction}
        activeOpacity={0.75}
      >
        <Text style={[s.flowActionText, { color: item.accent }]}>{item.actionLabel}</Text>
        <SymbolView name="arrow.right" size={11} tintColor={item.accent} resizeMode="scaleAspectFit" />
      </TouchableOpacity>
    </View>
  );
}

function TodayFlowStack({
  items: rawItems,
  now,
  onNavigate,
  colors,
}: {
  items: MissionItem[];
  now: Date;
  onNavigate: (route: string) => void;
  colors: ThemeColors;
}) {
  const s     = useMemo(() => createStyles(colors), [colors]);
  const items = rawItems.length > 0 ? rawItems : [getCaughtUpItem(now.getHours())];
  const count = items.length;

  const [displayIdx, setDisplayIdx] = useState(0);
  const [pendingIdx, setPendingIdx] = useState<number | null>(null);

  const activeIdxRef   = useRef(0);
  const countRef       = useRef(count);
  const isAnimatingRef = useRef(false);
  const interactingRef = useRef(false);
  const timerRef       = useRef<ReturnType<typeof setInterval> | null>(null);

  const currentX = useRef(new Animated.Value(0)).current;
  const nextX    = useRef(new Animated.Value(FLOW_CARD_WIDTH)).current;

  useEffect(() => { countRef.current = count; }, [count]);

  const navigate = useCallback((direction: "left" | "right") => {
    if (isAnimatingRef.current || countRef.current <= 1) return;
    isAnimatingRef.current = true;

    const cur   = activeIdxRef.current;
    const next  = direction === "left"
      ? (cur + 1) % countRef.current
      : (cur - 1 + countRef.current) % countRef.current;
    const exitTo    = direction === "left" ? -FLOW_CARD_WIDTH :  FLOW_CARD_WIDTH;
    const enterFrom = direction === "left" ?  FLOW_CARD_WIDTH : -FLOW_CARD_WIDTH;

    nextX.setValue(enterFrom);
    setPendingIdx(next);

    Animated.parallel([
      Animated.timing(currentX, { toValue: exitTo, duration: ANIM_DURATION, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      Animated.timing(nextX,    { toValue: 0,      duration: ANIM_DURATION, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
    ]).start(({ finished }) => {
      if (finished) {
        activeIdxRef.current = next;
        setDisplayIdx(next);
        setPendingIdx(null);
        currentX.setValue(0);
      }
      isAnimatingRef.current = false;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const clearTimer = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }, []);

  const startTimer = useCallback(() => {
    clearTimer();
    if (countRef.current <= 1) return;
    timerRef.current = setInterval(() => {
      if (!interactingRef.current) navigate("left");
    }, AUTO_ROTATE_MS);
  }, [clearTimer, navigate]);

  useEffect(() => {
    startTimer();
    return clearTimer;
  }, [count, startTimer, clearTimer]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, { dx }) => Math.abs(dx) > 8,
      onPanResponderGrant: () => {
        interactingRef.current = true;
        if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
      },
      onPanResponderRelease: (_, { dx }) => {
        if (dx < -SWIPE_THRESHOLD)     navigate("left");
        else if (dx > SWIPE_THRESHOLD) navigate("right");
        setTimeout(() => { interactingRef.current = false; startTimer(); }, 3000);
      },
      onPanResponderTerminate: () => {
        interactingRef.current = false;
        startTimer();
      },
    }),
  ).current;

  const safeDisplay = Math.min(displayIdx, items.length - 1);
  const safePending = pendingIdx !== null && pendingIdx < items.length ? pendingIdx : null;

  return (
    <View style={s.flowWrap}>
      {count > 1 && (
        <View style={s.flowDots}>
          {items.map((_, i) => (
            <View key={i} style={[s.flowDot, i === safeDisplay && s.flowDotActive]} />
          ))}
        </View>
      )}

      {/* @ts-ignore collapsable prevents view flattening so overflow clip works with native driver */}
      <View collapsable={false} style={s.flowContainer} {...panResponder.panHandlers}>
        {/* @ts-ignore */}
        <Animated.View
          collapsable={false}
          style={[StyleSheet.absoluteFill, { transform: [{ translateX: currentX }] }]}
        >
          {items[safeDisplay] && (
            <FlowCard
              item={items[safeDisplay]}
              onAction={() => onNavigate(items[safeDisplay].route)}
              colors={colors}
            />
          )}
        </Animated.View>

        {safePending !== null && (
          // @ts-ignore
          <Animated.View
            collapsable={false}
            style={[StyleSheet.absoluteFill, { transform: [{ translateX: nextX }] }]}
          >
            <FlowCard
              item={items[safePending]}
              onAction={() => onNavigate(items[safePending].route)}
              colors={colors}
            />
          </Animated.View>
        )}
      </View>
    </View>
  );
}

function DailyCommand({ brief, onPress }: { brief: DailyBrief; onPress?: () => void }) {
  const { colors } = useTheme();
  const s = useMemo(() => createStyles(colors), [colors]);

  const time = new Date(brief.timestamp).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

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
        <Text style={s.commandTime}>{time}</Text>
      </View>

      {/* Focus — the main briefing sentence */}
      <Text style={s.commandBody}>{brief.focus}</Text>

      {/* Stats row */}
      <View style={s.commandStatsRow}>
        {brief.stats.map((stat) => (
          <View key={stat.label} style={s.commandStatItem}>
            <View style={s.commandStatDot} />
            <Text style={s.commandStatText}>
              {stat.value} {stat.label}
            </Text>
          </View>
        ))}
      </View>

      {/* Recommendation */}
      <Text style={s.commandRec}>{brief.recommendation}</Text>
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
      borderRadius: 28,
      marginBottom: 20,
      paddingLeft: 20,
      paddingRight: 20,
      paddingTop: 18,
      paddingBottom: 18,
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
      fontSize: 14,
      lineHeight: 18,
      fontWeight: "500",
      marginBottom: 2,
    },
    heroName: {
      color: colors.textPrimary,
      fontSize: 27,
      lineHeight: 32,
      fontWeight: "900",
      letterSpacing: -0.6,
      marginBottom: 7,
    },
    heroDate: {
      color: colors.textSecondary,
      fontSize: 12.5,
      lineHeight: 16,
      fontWeight: "700",
    },
    heroDateBlock: {
      gap: 1,
    },
    heroTimeLocation: {
      color: colors.textMuted,
      fontSize: 11.5,
      lineHeight: 15,
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
      marginTop: 12,
    },
    assistantMessage: {
      color: colors.textMuted,
      fontSize: 13.5,
      lineHeight: 17,
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

    // ── Today's Flow ─────────────────────────────────────────────────────────
    flowWrap: {
      gap: 10,
      marginBottom: 30,
    },
    flowDots: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      paddingLeft: 2,
    },
    flowDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: `${colors.textMuted}40`,
    },
    flowDotActive: {
      width: 20,
      height: 6,
      borderRadius: 3,
      backgroundColor: colors.accent,
    },
    flowContainer: {
      height: FLOW_CARD_HEIGHT,
      borderRadius: 22,
      overflow: "hidden",
    },
    flowCard: {
      flex: 1,
      backgroundColor: colors.card,
      borderRadius: 22,
      borderWidth: 1,
      borderColor: colors.tabBarBorder,
      paddingHorizontal: 20,
      paddingTop: 22,
      paddingBottom: 18,
      overflow: "hidden",
      justifyContent: "space-between",
      shadowColor: "#000",
      shadowOpacity: 0.14,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 8 },
    },
    flowAccentLine: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      height: 2.5,
    },
    flowCardTop: {
      gap: 5,
    },
    flowCategoryRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },
    flowCategory: {
      fontSize: 10,
      fontWeight: "900",
      letterSpacing: 2.2,
    },
    flowTitle: {
      fontSize: 20,
      fontWeight: "900",
      color: colors.textPrimary,
      lineHeight: 25,
      letterSpacing: -0.3,
    },
    flowReason: {
      fontSize: 13,
      fontWeight: "500",
      color: colors.textMuted,
      lineHeight: 18,
    },
    flowActionBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      alignSelf: "flex-start",
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 20,
      borderWidth: 1,
    },
    flowActionText: {
      fontSize: 13,
      fontWeight: "700",
      letterSpacing: 0.2,
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
      fontSize: 15,
      lineHeight: 22,
      fontWeight: "800",
      marginBottom: 12,
    },
    commandStatsRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 12,
      marginBottom: 12,
    },
    commandStatItem: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
    },
    commandStatDot: {
      width: 5,
      height: 5,
      borderRadius: 3,
      backgroundColor: colors.accentCyan,
      opacity: 0.7,
    },
    commandStatText: {
      color: colors.textSecondary,
      fontSize: 12,
      fontWeight: "600",
      lineHeight: 16,
    },
    commandRec: {
      color: colors.textMuted,
      fontSize: 13,
      lineHeight: 19,
      fontWeight: "500",
      fontStyle: "italic",
    },
  });
}
