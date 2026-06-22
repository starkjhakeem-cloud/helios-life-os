import React, { useEffect, useMemo, useRef } from "react";
import {
  Animated,
  Dimensions,
  Easing,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { SymbolView } from "expo-symbols";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { SFSymbol } from "sf-symbols-typescript";
import Svg, {
  Circle,
  Defs,
  G,
  LinearGradient,
  Path,
  RadialGradient,
  Stop,
} from "react-native-svg";

import {
  useAuthStore,
  useAutonomyStore,
  useBackgroundJobsStore,
  useConversationStore,
  useGoalsStore,
  useIntegrationStore,
  useNotificationsStore,
  useTasksStore,
} from "../../store";
import { useTheme } from "../../theme/ThemeContext";
import type { ThemeColors } from "../../theme/theme";

const { width } = Dimensions.get("window");
const PAGE = width - 52;

// ── System status ─────────────────────────────────────────────────────────────

type StatusTone = "active" | "warning" | "attention" | "danger" | "syncing" | "focus";
type SystemStatus = {
  label: string;
  tone: StatusTone;
  targetRoute: string | null;
  accessibilityHint: string;
};

function getSystemStatus({
  apiError,
  aiProviderOffline,
  hasAttention,
  attentionRoute,
  isSyncing,
  focusModeActive,
}: {
  apiError: boolean;
  aiProviderOffline: boolean;
  hasAttention: boolean;
  attentionRoute: string;
  isSyncing: boolean;
  focusModeActive: boolean;
}): SystemStatus {
  if (apiError)
    return {
      label: "SYSTEM ALERT",
      tone: "danger",
      targetRoute: "/(tabs)/more",
      accessibilityHint: "System alert active. Tap to view status.",
    };
  if (aiProviderOffline)
    return {
      label: "AI PROVIDER OFFLINE",
      tone: "warning",
      targetRoute: "/(tabs)/integrations",
      accessibilityHint: "AI provider offline. Tap to view integrations.",
    };
  if (hasAttention)
    return {
      label: "ATTENTION REQUIRED",
      tone: "attention",
      targetRoute: attentionRoute,
      accessibilityHint: "Attention required. Tap to review.",
    };
  if (isSyncing)
    return {
      label: "SYNCING SYSTEMS",
      tone: "syncing",
      targetRoute: "/(tabs)/integrations",
      accessibilityHint: "Systems syncing. Tap to view integrations.",
    };
  if (focusModeActive)
    return {
      label: "FOCUS MODE ACTIVE",
      tone: "focus",
      targetRoute: null,
      accessibilityHint: "Focus mode active.",
    };
  return {
    label: "ALL SYSTEMS ACTIVE",
    tone: "active",
    targetRoute: null,
    accessibilityHint: "All systems active.",
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
  const accessToken = useAuthStore((s) => s.accessToken);
  const userName = useAuthStore((s) => s.user?.name ?? "Operator");

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

  useEffect(() => {
    if (accessToken) {
      fetchGoals(accessToken);
      fetchTasks(accessToken);
    }
  }, [accessToken]);

  const activeGoals = goals.filter((g) => g.status === "active").length;
  const doneTodayTasks = tasks.filter((t) => {
    if (t.status !== "done") return false;
    if (!t.updated_at) return false;
    const updated = new Date(t.updated_at);
    const now = new Date();
    return (
      updated.getDate() === now.getDate() &&
      updated.getMonth() === now.getMonth() &&
      updated.getFullYear() === now.getFullYear()
    );
  }).length;
  const openTasks = tasks.filter((t) => t.status !== "done").length;
  const totalTasks = tasks.length;
  const completionRate =
    totalTasks === 0
      ? "—"
      : `${Math.round((tasks.filter((t) => t.status === "done").length / totalTasks) * 100)}%`;

  const today = new Date();
  const overdueTasks = tasks.filter((t) => {
    if (t.status === "done" || !t.due_date) return false;
    return new Date(t.due_date) < today;
  }).length;
  const highPriorityOpen = tasks.filter(
    (t) => t.status !== "done" && (t.priority === "critical" || t.priority === "high"),
  ).length;

  const aiProviderOffline =
    aiSendError != null &&
    (aiSendError.toLowerCase().includes("provider") ||
      aiSendError.toLowerCase().includes("unavailable"));

  // Resolve the highest-priority destination for ATTENTION REQUIRED
  const attentionRoute =
    overdueTasks > 0 || highPriorityOpen > 0
      ? "/(tabs)/tasks"
      : pendingApprovals > 0
        ? "/(tabs)/autonomy"
        : "/(tabs)/notifications";

  const systemStatus = getSystemStatus({
    apiError: !!(tasksError || goalsError),
    aiProviderOffline,
    hasAttention: unreadCount > 0 || pendingApprovals > 0 || overdueTasks > 0 || highPriorityOpen > 0,
    attentionRoute,
    isSyncing: !!(syncingId || bgJobsRunning),
    focusModeActive: false,
  });

  const onPressStatus = systemStatus.targetRoute
    ? () => router.push(systemStatus.targetRoute as Parameters<typeof router.push>[0])
    : null;

  const now = today;
  const hour = now.getHours();
  const greeting = hour < 12 ? "Good morning," : hour < 17 ? "Good afternoon," : "Good evening,";
  const dateStr = now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
  const timeStr = now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

  const displayName = userName.split(" ").slice(0, 2).join(" ");

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
        <Hero greeting={greeting} userName={displayName} dateStr={dateStr} systemStatus={systemStatus} onPressStatus={onPressStatus} />

        <Section title={"TODAY'S METRICS"} action="View all  ›" onAction={() => router.push("/(tabs)/analytics")} />

        <View style={styles.grid}>
          <Metric icon="target" value={String(activeGoals)} label="Active Goals" sub={activeGoals === 1 ? "On track" : "In progress"} onPress={() => router.push("/(tabs)/goals")} />
          <Metric icon="checkmark.circle.fill" value={String(doneTodayTasks)} label="Tasks Done" sub="Completed today" onPress={() => router.push("/(tabs)/tasks")} />
          <Metric icon="chart.bar.fill" value={completionRate} label="Completion Rate" sub="Overall progress" onPress={() => router.push("/(tabs)/analytics")} />
          <Metric icon="circle" value={String(openTasks)} label="Open Tasks" sub={openTasks === 0 ? "All clear" : "Needs attention"} onPress={() => router.push("/(tabs)/tasks")} />
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
  systemStatus,
  onPressStatus,
}: {
  greeting: string;
  userName: string;
  dateStr: string;
  systemStatus: SystemStatus;
  onPressStatus: (() => void) | null;
}) {
  const { colors } = useTheme();
  const s = useMemo(() => createStyles(colors), [colors]);
  const toneColor = getToneColor(systemStatus.tone, colors);

  const pillStyle = [
    s.statusPill,
    { backgroundColor: `${toneColor}24`, borderColor: `${toneColor}2e` },
  ] as const;

  const pillInner = (
    <>
      <View style={[s.statusDot, { backgroundColor: toneColor }]} />
      <Text style={[s.statusText, { color: toneColor }]}>{systemStatus.label}</Text>
    </>
  );

  return (
    <View style={s.heroCard}>
      <View style={s.heroLeft}>
        <Text style={s.heroGreeting}>{greeting}</Text>
        <Text style={s.heroName} numberOfLines={2}>{userName}.</Text>
        <Text style={s.heroDate}>{dateStr}</Text>

        {onPressStatus ? (
          <TouchableOpacity
            style={pillStyle}
            onPress={onPressStatus}
            activeOpacity={0.65}
            accessibilityLabel={systemStatus.accessibilityHint}
            accessibilityRole="button"
          >
            {pillInner}
          </TouchableOpacity>
        ) : (
          <View style={pillStyle}>
            {pillInner}
          </View>
        )}
      </View>

      <View style={s.heroOrbArea}>
        <HeliosOrb />
      </View>
    </View>
  );
}

function HeliosOrb() {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 1800,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 1800,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );

    loop.start();
    return () => loop.stop();
  }, [pulse]);

  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.025] });
  const opacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.88, 1] });

  return (
    <Animated.View style={{ opacity, transform: [{ scale }] }}>
      <Svg width={118} height={118} viewBox="0 0 118 118">
        <Defs>
          <RadialGradient id="orbHalo" cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor="#A855F7" stopOpacity="0.2" />
            <Stop offset="45%" stopColor="#8B3DFF" stopOpacity="0.08" />
            <Stop offset="100%" stopColor="#8B3DFF" stopOpacity="0" />
          </RadialGradient>
          <RadialGradient id="orbWash" cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor="#111B36" stopOpacity="0.46" />
            <Stop offset="58%" stopColor="#25145E" stopOpacity="0.18" />
            <Stop offset="100%" stopColor="#020617" stopOpacity="0" />
          </RadialGradient>
          <RadialGradient id="orbCore" cx="35%" cy="28%" r="72%">
            <Stop offset="0%" stopColor="#F5D0FE" stopOpacity="0.96" />
            <Stop offset="18%" stopColor="#C4B5FD" stopOpacity="0.98" />
            <Stop offset="42%" stopColor="#8B5CF6" stopOpacity="1" />
            <Stop offset="72%" stopColor="#6D28D9" stopOpacity="1" />
            <Stop offset="100%" stopColor="#2E1065" stopOpacity="1" />
          </RadialGradient>
          <RadialGradient id="coreHalo" cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor="#A855F7" stopOpacity="0.34" />
            <Stop offset="100%" stopColor="#A855F7" stopOpacity="0" />
          </RadialGradient>
          <RadialGradient id="coreShade" cx="72%" cy="78%" r="58%">
            <Stop offset="0%" stopColor="#160A36" stopOpacity="0.62" />
            <Stop offset="58%" stopColor="#2E1065" stopOpacity="0.22" />
            <Stop offset="100%" stopColor="#2E1065" stopOpacity="0" />
          </RadialGradient>
          <RadialGradient id="coreSpecular" cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.62" />
            <Stop offset="46%" stopColor="#F5D0FE" stopOpacity="0.26" />
            <Stop offset="100%" stopColor="#F5D0FE" stopOpacity="0" />
          </RadialGradient>
          <RadialGradient id="particle" cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor="#F0FDFF" stopOpacity="1" />
            <Stop offset="52%" stopColor="#22D3EE" stopOpacity="0.62" />
            <Stop offset="100%" stopColor="#22D3EE" stopOpacity="0" />
          </RadialGradient>
          <LinearGradient id="outerArc" x1="90" y1="22" x2="99" y2="82">
            <Stop offset="0%" stopColor="#22D3EE" stopOpacity="0" />
            <Stop offset="28%" stopColor="#C084FC" stopOpacity="0.78" />
            <Stop offset="72%" stopColor="#8B5CF6" stopOpacity="0.48" />
            <Stop offset="100%" stopColor="#22D3EE" stopOpacity="0" />
          </LinearGradient>
        </Defs>

        <Circle cx="59" cy="59" r="57" fill="url(#orbHalo)" />
        <Circle cx="59" cy="59" r="45" fill="url(#orbWash)" opacity="0.58" />
        <Circle cx="59" cy="59" r="43" fill="none" stroke="rgba(139, 92, 246, 0.26)" strokeWidth="1" />
        <Circle cx="59" cy="59" r="31" fill="none" stroke="rgba(139, 92, 246, 0.56)" strokeWidth="1.25" />
        <Circle cx="59" cy="59" r="20" fill="rgba(139, 92, 246, 0.12)" stroke="rgba(192, 132, 252, 0.18)" strokeWidth="0.65" />
        <Path d="M 89.5 26.5 A 45 45 0 0 1 92.5 83" fill="none" stroke="url(#outerArc)" strokeWidth="2.8" strokeLinecap="round" />
        <Path d="M 88 30 A 41 41 0 0 1 88.8 77" fill="none" stroke="rgba(139, 92, 246, 0.26)" strokeWidth="1.2" strokeLinecap="round" />
        <Circle cx="59" cy="59" r="24" fill="url(#coreHalo)" />
        <Circle cx="59" cy="59" r="16.8" fill="none" stroke="rgba(216, 180, 254, 0.16)" strokeWidth="2" />
        <Circle cx="59" cy="59" r="16.2" fill="url(#orbCore)" />
        <Circle cx="60.8" cy="61.4" r="15.6" fill="url(#coreShade)" />
        <Circle cx="53.6" cy="52" r="7.3" fill="url(#coreSpecular)" />
        <Circle cx="51.4" cy="49.2" r="2.4" fill="rgba(255, 255, 255, 0.42)" />
        <Path d="M 46.8 62.5 A 15.8 15.8 0 0 0 70.8 67.1" fill="none" stroke="rgba(20, 10, 48, 0.28)" strokeWidth="1.4" strokeLinecap="round" />
        <G opacity="0.78">
          <Circle cx="25" cy="80" r="1.4" fill="url(#particle)" />
          <Path d="M25 76.8 L25 83.2 M21.8 80 L28.2 80" stroke="rgba(34, 211, 238, 0.3)" strokeWidth="0.5" strokeLinecap="round" />
        </G>
        <G opacity="0.7">
          <Circle cx="94" cy="54" r="1.25" fill="#22D3EE" />
          <Path d="M94 51.2 L94 56.8 M91.2 54 L96.8 54" stroke="rgba(34, 211, 238, 0.24)" strokeWidth="0.42" strokeLinecap="round" />
        </G>
        <Circle cx="64" cy="24" r="0.9" fill="rgba(196, 181, 253, 0.7)" />
        <Circle cx="78" cy="91" r="0.75" fill="rgba(139, 92, 246, 0.72)" />
        <Circle cx="39" cy="36" r="0.65" fill="rgba(34, 211, 238, 0.45)" />
        <Circle cx="31" cy="65" r="0.6" fill="rgba(139, 92, 246, 0.52)" />
        <Circle cx="91" cy="34" r="0.55" fill="rgba(139, 92, 246, 0.48)" />
      </Svg>
    </Animated.View>
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

  return (
    <TouchableOpacity
      style={s.metric}
      onPress={onPress}
      activeOpacity={0.75}
      accessibilityLabel={`${label}: ${value}. ${sub}. Tap to view.`}
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
          <Text style={s.metricValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>{value}</Text>
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
        {"Good to see you, "}{userName}.{"\n"}
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
      height: 232,
      borderRadius: 28,
      marginBottom: 34,
      paddingLeft: 17,
      paddingTop: 21,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.tabBarBorder,
      overflow: "hidden",
    },
    heroLeft: {
      width: 208,
      zIndex: 5,
    },
    heroGreeting: {
      color: colors.textMuted,
      fontSize: 17,
      lineHeight: 22,
      fontWeight: "500",
      marginBottom: 6,
    },
    heroName: {
      color: colors.textPrimary,
      fontSize: 31,
      lineHeight: 38,
      fontWeight: "900",
      letterSpacing: -0.7,
      marginBottom: 10,
    },
    heroDate: {
      color: colors.textMuted,
      fontSize: 14,
      lineHeight: 22,
      fontWeight: "600",
      marginBottom: 18,
    },
    statusPill: {
      height: 32,
      alignSelf: "flex-start",
      borderRadius: 16,
      paddingHorizontal: 13,
      flexDirection: "row",
      alignItems: "center",
      gap: 9,
      backgroundColor: `${colors.accentCyan}24`,
      borderWidth: 1,
      borderColor: `${colors.accentCyan}2e`,
    },
    statusDot: {
      width: 9,
      height: 9,
      borderRadius: 5,
      backgroundColor: colors.accentCyan,
    },
    statusText: {
      color: colors.accentCyan,
      fontSize: 9.5,
      fontWeight: "900",
      letterSpacing: 1.9,
    },
    heroOrbArea: {
      position: "absolute",
      right: 27,
      top: 45,
      width: 118,
      height: 118,
      alignItems: "center",
      justifyContent: "center",
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
