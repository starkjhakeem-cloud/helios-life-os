import { useCallback, useEffect } from "react";
import { View, Text, ActivityIndicator, StyleSheet, ScrollView, RefreshControl } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SymbolView } from "expo-symbols";

import BriefingCard from "../../components/BriefingCard";
import MetricCard from "../../components/MetricCard";
import SectionCard from "../../components/SectionCard";
import { spacing, radius, typography, type ThemeColors } from "../../theme/theme";
import { useTheme } from "../../theme/ThemeContext";
import { useAIStore, useAppStore, useAuthStore, useDashboardStore, statusLabel, statusColor } from "../../store";

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

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const { systemStatus } = useAppStore();
  const { metrics, sections, isLoading: dashLoading, error: dashError, fetchSummary } = useDashboardStore();
  const { briefing, isLoading: aiLoading, error: aiError, fetchBriefing } = useAIStore();
  const accessToken = useAuthStore((s) => s.accessToken);
  const userName = useAuthStore((s) => s.user?.name ?? "Operator");

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
    <ScrollView
      style={{ backgroundColor: colors.background }}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={[
        styles.container,
        { paddingTop: insets.top + spacing.lg },
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
        <View>
          <Text style={styles.kicker}>HELIOS</Text>
          <Text style={styles.screenTitle}>Command</Text>
        </View>
        <View style={styles.topStatus}>
          <View style={[styles.statusDot, { backgroundColor: statusColor[systemStatus] }]} />
          <Text style={[styles.statusText, { color: statusColor[systemStatus] }]}>
            {statusLabel[systemStatus]}
          </Text>
        </View>
      </View>

      <View style={styles.heroCard}>
        <View style={styles.heroIcon}>
          <SymbolView
            name="sparkles"
            size={28}
            tintColor={colors.accentCyan}
            resizeMode="scaleAspectFit"
          />
        </View>
        <Text style={styles.heroLabel}>{"TODAY'S COMMAND CENTER"}</Text>
        <Text style={styles.heroGreeting}>{getGreeting()}, {userName}.</Text>
        <Text style={styles.heroDate}>{today}</Text>
      </View>

      {dashError ? (
        <Text style={styles.errorText}>{dashError}</Text>
      ) : null}

      <View style={styles.sectionHeaderRow}>
        <Text style={styles.sectionLabel}>{"TODAY'S METRICS"}</Text>
        {dashLoading ? (
          <ActivityIndicator size="small" color={colors.accentCyan} />
        ) : null}
      </View>

      <View style={styles.metricsGrid}>
        {metrics.map((metric) => (
          <MetricCard
            key={metric.label}
            value={metric.value}
            label={metric.label}
            icon={metric.icon}
          />
        ))}
      </View>

      <View style={styles.sectionHeaderRow}>
        <Text style={styles.sectionLabel}>DAILY COMMAND</Text>
        {aiLoading ? (
          <ActivityIndicator size="small" color={colors.accentCyan} />
        ) : null}
      </View>

      {aiLoading && !briefing ? (
        <View style={styles.commandCard}>
          <ActivityIndicator size="small" color={colors.accentCyan} />
          <Text style={styles.briefingLoadingText}>BUILDING BRIEFING...</Text>
        </View>
      ) : briefing ? (
        <BriefingCard {...briefing} />
      ) : aiError ? (
        <Text style={styles.errorText}>{aiError}</Text>
      ) : null}

      <Text style={styles.sectionLabel}>INTELLIGENCE</Text>

      {sections.map((section) => (
        <SectionCard key={section.title} title={section.title} icon={section.icon}>
          {section.content}
        </SectionCard>
      ))}
    </ScrollView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      paddingHorizontal: spacing.lg,
      paddingBottom: spacing.xxl * 2.5,
    },
    topBar: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: spacing.lg,
    },
    kicker: {
      ...typography.label,
      color: colors.accentCyan,
      marginBottom: 2,
    },
    screenTitle: {
      ...typography.displaySmall,
      color: colors.textPrimary,
    },
    topStatus: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: `${colors.accentCyan}25`,
      backgroundColor: `${colors.accentCyan}08`,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
    heroCard: {
      backgroundColor: colors.surface,
      borderRadius: radius.xl,
      padding: spacing.xl,
      borderWidth: 1,
      borderColor: `${colors.accentCyan}24`,
      marginBottom: spacing.xl,
      overflow: "hidden",
    },
    heroIcon: {
      width: 58,
      height: 58,
      borderRadius: 21,
      backgroundColor: `${colors.accentCyan}14`,
      borderWidth: 1,
      borderColor: `${colors.accentCyan}35`,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: spacing.lg,
    },
    heroLabel: {
      ...typography.label,
      color: colors.accent,
      marginBottom: spacing.sm,
    },
    heroGreeting: {
      ...typography.displaySmall,
      color: colors.textPrimary,
      marginBottom: spacing.sm,
    },
    heroDate: {
      ...typography.body,
      color: colors.textSecondary,
    },
    statusDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
    },
    statusText: {
      ...typography.label,
      fontSize: 10,
    },
    sectionLabel: {
      ...typography.label,
      color: colors.textMuted,
      marginBottom: spacing.sm,
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
    errorText: {
      ...typography.caption,
      color: "#ef4444",
      marginBottom: spacing.sm,
    },
    commandCard: {
      minHeight: 116,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: spacing.sm,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      marginBottom: spacing.xl,
    },
    briefingLoadingText: {
      ...typography.label,
      color: colors.textMuted,
    },
  });
}
