import { useCallback, useEffect } from "react";
import { View, Text, ActivityIndicator, StyleSheet, ScrollView, RefreshControl } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import BriefingCard from "../../components/BriefingCard";
import MetricCard from "../../components/MetricCard";
import SectionCard from "../../components/SectionCard";
import { colors, spacing, radius, typography } from "../../theme/theme";
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
      <View style={styles.heroCard}>
        <Text style={styles.heroLabel}>HELIOS COMMAND</Text>
        <Text style={styles.heroGreeting}>{getGreeting()}, {userName}.</Text>
        <Text style={styles.heroDate}>{today}</Text>
        <View style={styles.statusRow}>
          <View style={[styles.statusDot, { backgroundColor: statusColor[systemStatus] }]} />
          <Text style={[styles.statusText, { color: statusColor[systemStatus] }]}>
            {statusLabel[systemStatus]}
          </Text>
        </View>
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
        <View style={styles.briefingLoader}>
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

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl * 2,
  },

  heroCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.lg,
  },

  heroLabel: {
    ...typography.label,
    color: colors.accent,
    marginBottom: spacing.md,
  },

  heroGreeting: {
    ...typography.displaySmall,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },

  heroDate: {
    ...typography.body,
    color: colors.textMuted,
    marginBottom: spacing.lg,
  },

  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },

  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },

  statusText: {
    ...typography.label,
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
    gap: spacing.sm,
    marginBottom: spacing.md,
  },

  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.sm,
  },

  errorText: {
    ...typography.caption,
    color: "#ef4444",
    marginBottom: spacing.sm,
  },

  briefingLoader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginBottom: spacing.md,
  },

  briefingLoadingText: {
    ...typography.label,
    color: colors.textMuted,
  },
});
