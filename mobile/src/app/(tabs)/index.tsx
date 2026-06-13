import { useCallback, useEffect } from "react";
import { View, Text, ActivityIndicator, StyleSheet, ScrollView, RefreshControl, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SymbolView } from "expo-symbols";
import type { SFSymbol } from "sf-symbols-typescript";

import MetricCard from "../../components/MetricCard";
import SectionCard from "../../components/SectionCard";
import { spacing, typography, type ThemeColors } from "../../theme/theme";
import { useTheme } from "../../theme/ThemeContext";
import { useAIStore, useAppStore, useAuthStore, useDashboardStore, useNotificationsStore, statusLabel, statusColor } from "../../store";

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

const today = new Date().toLocaleDateString("en-US", {
  weekday: "long",
  month: "long",
  day: "numeric",
});

const metricHelpers: Record<string, string> = {
  "active goals": "On track",
  "tasks done": "Completed today",
  "completion rate": "Daily progress",
  "open tasks": "Needs attention",
};

function getMetricHelper(label: string): string {
  return metricHelpers[label.toLowerCase()] ?? "Current status";
}

function formatBriefingTime(generatedAt?: string): string {
  const date = generatedAt ? new Date(generatedAt) : new Date();
  return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const { systemStatus } = useAppStore();
  const { metrics, sections, isLoading: dashLoading, error: dashError, fetchSummary } = useDashboardStore();
  const { briefing, isLoading: aiLoading, error: aiError, fetchBriefing } = useAIStore();
  const accessToken = useAuthStore((s) => s.accessToken);
  const userName = useAuthStore((s) => s.user?.name ?? "ForgePoint Enterprises");
  const unreadCount = useNotificationsStore((s) => s.unreadCount);
  const greeting = getGreeting();
  const commandMessage = briefing
    ? `${briefing.greeting}\n${briefing.summary}`
    : `${greeting}, ${userName}.\nYour priority queue is loaded and systems are nominal.`;

  const onRefresh = useCallback(() => {
    if (accessToken) {
      fetchSummary(accessToken);
      fetchBriefing(accessToken);
    }
  }, [accessToken, fetchSummary, fetchBriefing]);

  useEffect(() => {
    if (accessToken) {
      fetchSummary(accessToken);
      fetchBriefing(accessToken);
    }
  }, [accessToken, fetchSummary, fetchBriefing]);

  return (
    <View style={styles.screen}>
      <View pointerEvents="none" style={styles.backgroundLayer}>
        <View style={styles.deepPanel} />
        <View style={styles.purpleHalo} />
        <View style={styles.cyanHalo} />
        <View style={styles.lowerGlow} />
      </View>

      <ScrollView
        style={styles.scroll}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.container,
          { paddingTop: insets.top + spacing.md },
        ]}
        refreshControl={
          <RefreshControl
            refreshing={dashLoading || aiLoading}
            onRefresh={onRefresh}
            tintColor={colors.accentCyan}
          />
        }
      >
        <View style={styles.topBar}>
          <Text style={styles.wordmark}>HELIOS</Text>
          <View style={styles.headerActions}>
            <HeaderButton
              icon="bell.fill"
              hasBadge={unreadCount > 0}
              onPress={() => router.push("/(tabs)/notifications")}
            />
            <HeaderButton
              icon="gearshape.fill"
              onPress={() => router.push("/(tabs)/profile")}
            />
          </View>
        </View>

        <View style={styles.heroCard}>
          <View style={styles.heroGlowA} />
          <View style={styles.heroGlowB} />
          <View style={styles.heroContent}>
            <View style={styles.heroCopy}>
              <Text style={styles.heroGreeting}>{greeting},</Text>
              <Text style={styles.heroName}>{userName}.</Text>
              <Text style={styles.heroDate}>{today}</Text>
              <View style={styles.topStatus}>
                <View style={[styles.statusDot, { backgroundColor: statusColor[systemStatus] }]} />
                <Text style={styles.statusText}>
                  {systemStatus === "online" ? "ALL SYSTEMS NOMINAL" : statusLabel[systemStatus].toUpperCase()}
                </Text>
              </View>
            </View>
            <View style={styles.orbStage}>
              <View style={styles.orbRingOuter} />
              <View style={styles.orbRingMid} />
              <View style={styles.orbRingInner} />
              <View style={styles.orbCore} />
              <View style={styles.orbSpark} />
            </View>
          </View>
        </View>

        {dashError ? (
          <Text style={styles.errorText}>{dashError}</Text>
        ) : null}

        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionLabel}>{"TODAY'S METRICS"}</Text>
          <Pressable onPress={() => router.push("/(tabs)/analytics")} hitSlop={10}>
            <Text style={styles.sectionLink}>View all &gt;</Text>
          </Pressable>
        </View>

        <View style={styles.metricsGrid}>
          {metrics.map((metric) => (
            <MetricCard
              key={metric.label}
              value={metric.value}
              label={metric.label}
              helper={getMetricHelper(metric.label)}
              icon={metric.icon}
            />
          ))}
        </View>

        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionLabel}>DAILY COMMAND</Text>
          <Pressable onPress={() => router.push("/(tabs)/assistant")} hitSlop={10}>
            <Text style={styles.sectionLink}>View full briefing &gt;</Text>
          </Pressable>
        </View>

        <View style={styles.commandCard}>
          <View style={styles.commandAccent} />
          <View style={styles.commandGlow} />
          <View style={styles.commandHeader}>
            <View style={styles.commandTitleRow}>
              <View style={styles.commandIcon}>
                <SymbolView
                  name="brain.head.profile"
                  size={14}
                  tintColor={colors.accentCyan}
                  resizeMode="scaleAspectFit"
                />
              </View>
              <Text style={styles.commandTitle}>DAILY COMMAND</Text>
            </View>
            {aiLoading && !briefing ? (
              <ActivityIndicator size="small" color={colors.accentCyan} />
            ) : (
              <Text style={styles.commandTime}>{formatBriefingTime(briefing?.generated_at)}</Text>
            )}
          </View>
          <Text style={styles.commandMessage}>{commandMessage}</Text>
        </View>

        {aiError && !briefing ? (
          <Text style={styles.errorText}>{aiError}</Text>
        ) : null}

        <Text style={[styles.sectionLabel, styles.intelligenceLabel]}>INTELLIGENCE</Text>

        {sections.map((section) => (
          <SectionCard key={section.title} title={section.title} icon={section.icon}>
            {section.content}
          </SectionCard>
        ))}
      </ScrollView>
    </View>
  );
}

type HeaderButtonProps = {
  icon: SFSymbol;
  hasBadge?: boolean;
  onPress: () => void;
};

function HeaderButton({ icon, hasBadge = false, onPress }: HeaderButtonProps) {
  const { colors } = useTheme();
  const styles = createStyles(colors);

  return (
    <Pressable style={styles.headerButton} onPress={onPress} hitSlop={8}>
      <SymbolView
        name={icon}
        size={18}
        tintColor={colors.textPrimary}
        resizeMode="scaleAspectFit"
      />
      {hasBadge ? <View style={styles.headerBadge} /> : null}
    </Pressable>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: colors.background,
    },
    scroll: {
      flex: 1,
      backgroundColor: "transparent",
    },
    backgroundLayer: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: "#020617",
      overflow: "hidden",
    },
    deepPanel: {
      position: "absolute",
      top: 90,
      left: -24,
      right: -24,
      height: 320,
      backgroundColor: "#050a18",
      borderRadius: 80,
      opacity: 0.72,
    },
    purpleHalo: {
      position: "absolute",
      top: -90,
      right: -88,
      width: 240,
      height: 240,
      borderRadius: 120,
      backgroundColor: `${colors.accent}32`,
      opacity: 0.75,
    },
    cyanHalo: {
      position: "absolute",
      top: 230,
      left: -122,
      width: 260,
      height: 260,
      borderRadius: 130,
      backgroundColor: `${colors.accentCyan}1b`,
    },
    lowerGlow: {
      position: "absolute",
      bottom: 80,
      right: -120,
      width: 280,
      height: 280,
      borderRadius: 140,
      backgroundColor: "#0a1024",
      opacity: 0.86,
    },
    container: {
      paddingHorizontal: spacing.lg,
      paddingBottom: spacing.xxl * 3,
    },
    topBar: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: spacing.md,
    },
    wordmark: {
      color: colors.accent,
      fontSize: 19,
      fontWeight: "900",
      letterSpacing: 6,
      textShadowColor: `${colors.accent}80`,
      textShadowOffset: { width: 0, height: 0 },
      textShadowRadius: 13,
    },
    headerActions: {
      flexDirection: "row",
      gap: spacing.sm,
    },
    headerButton: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: `${colors.surface}cc`,
      borderWidth: 1,
      borderColor: `${colors.accentCyan}20`,
      shadowColor: colors.accent,
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: 0.2,
      shadowRadius: 16,
    },
    headerBadge: {
      position: "absolute",
      top: 9,
      right: 10,
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: colors.accent,
      borderWidth: 1,
      borderColor: colors.textPrimary,
    },
    topStatus: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: `${colors.accentCyan}25`,
      backgroundColor: `${colors.accentCyan}10`,
      paddingHorizontal: spacing.md,
      paddingVertical: 9,
      alignSelf: "flex-start",
      marginTop: spacing.lg,
    },
    heroCard: {
      minHeight: 260,
      backgroundColor: `${colors.surface}db`,
      borderRadius: 30,
      padding: spacing.lg,
      borderWidth: 1,
      borderColor: `${colors.accentCyan}26`,
      marginBottom: spacing.xl,
      overflow: "hidden",
      shadowColor: colors.accent,
      shadowOffset: { width: 0, height: 18 },
      shadowOpacity: 0.27,
      shadowRadius: 32,
    },
    heroGlowA: {
      position: "absolute",
      top: -70,
      right: -54,
      width: 210,
      height: 210,
      borderRadius: 105,
      backgroundColor: `${colors.accent}28`,
    },
    heroGlowB: {
      position: "absolute",
      bottom: -80,
      left: -64,
      width: 190,
      height: 190,
      borderRadius: 95,
      backgroundColor: `${colors.accentCyan}12`,
    },
    heroContent: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: spacing.md,
    },
    heroCopy: {
      flex: 1,
    },
    heroGreeting: {
      fontSize: 31,
      fontWeight: "900",
      color: colors.textPrimary,
      letterSpacing: 0,
      lineHeight: 37,
    },
    heroName: {
      fontSize: 31,
      fontWeight: "900",
      color: colors.textPrimary,
      letterSpacing: 0,
      lineHeight: 37,
    },
    heroDate: {
      ...typography.body,
      color: colors.textSecondary,
      marginTop: spacing.md,
    },
    orbStage: {
      width: 128,
      height: 128,
      alignItems: "center",
      justifyContent: "center",
    },
    orbRingOuter: {
      position: "absolute",
      width: 126,
      height: 126,
      borderRadius: 63,
      borderWidth: 1,
      borderColor: `${colors.accentCyan}24`,
      backgroundColor: `${colors.accent}08`,
    },
    orbRingMid: {
      position: "absolute",
      width: 96,
      height: 96,
      borderRadius: 48,
      borderWidth: 1,
      borderColor: `${colors.accent}40`,
      backgroundColor: `${colors.accent}12`,
    },
    orbRingInner: {
      position: "absolute",
      width: 66,
      height: 66,
      borderRadius: 33,
      borderWidth: 1,
      borderColor: `${colors.accentCyan}50`,
      backgroundColor: `${colors.accentCyan}10`,
    },
    orbCore: {
      width: 38,
      height: 38,
      borderRadius: 19,
      backgroundColor: colors.accent,
      shadowColor: colors.accent,
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.95,
      shadowRadius: 22,
    },
    orbSpark: {
      position: "absolute",
      top: 39,
      right: 40,
      width: 13,
      height: 13,
      borderRadius: 7,
      backgroundColor: colors.accentCyan,
      opacity: 0.92,
    },
    statusDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
    },
    statusText: {
      ...typography.label,
      fontSize: 10,
      color: colors.accentCyan,
    },
    sectionLabel: {
      ...typography.label,
      color: colors.textPrimary,
    },
    sectionLink: {
      color: colors.accentCyan,
      fontSize: 13,
      fontWeight: "800",
    },
    metricsGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      justifyContent: "space-between",
      rowGap: spacing.md,
      marginBottom: spacing.xl,
    },
    sectionHeaderRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: spacing.md,
    },
    intelligenceLabel: {
      marginBottom: spacing.md,
    },
    errorText: {
      ...typography.caption,
      color: "#ef4444",
      marginBottom: spacing.sm,
    },
    commandCard: {
      minHeight: 172,
      borderRadius: 26,
      borderWidth: 1,
      borderColor: `${colors.accentCyan}28`,
      backgroundColor: `${colors.surface}e8`,
      marginBottom: spacing.xl,
      padding: spacing.lg,
      overflow: "hidden",
      shadowColor: colors.accentCyan,
      shadowOffset: { width: 0, height: 12 },
      shadowOpacity: 0.18,
      shadowRadius: 24,
    },
    commandAccent: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      height: 3,
      backgroundColor: colors.accentCyan,
      shadowColor: colors.accentCyan,
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.85,
      shadowRadius: 12,
    },
    commandGlow: {
      position: "absolute",
      top: -46,
      right: -36,
      width: 120,
      height: 120,
      borderRadius: 60,
      backgroundColor: `${colors.accentCyan}14`,
    },
    commandHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: spacing.lg,
    },
    commandTitleRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
    },
    commandIcon: {
      width: 32,
      height: 32,
      borderRadius: 12,
      backgroundColor: `${colors.accentCyan}14`,
      borderWidth: 1,
      borderColor: `${colors.accentCyan}32`,
      alignItems: "center",
      justifyContent: "center",
    },
    commandTitle: {
      ...typography.label,
      color: colors.accentCyan,
    },
    commandTime: {
      ...typography.label,
      color: colors.textMuted,
      fontSize: 9,
    },
    commandMessage: {
      color: colors.textPrimary,
      fontSize: 16,
      lineHeight: 25,
      fontWeight: "600",
    },
  });
}
