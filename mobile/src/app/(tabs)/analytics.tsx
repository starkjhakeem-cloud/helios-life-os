import { useCallback, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  ActivityIndicator,
  StyleSheet,
  ScrollView,
  RefreshControl,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SymbolView } from "expo-symbols";
import type { SFSymbol } from "sf-symbols-typescript";

import { spacing, radius, typography , type ThemeColors } from "../../theme/theme";
import { useTheme } from "../../theme/ThemeContext";
import { useAnalyticsStore, useAuthStore } from "../../store";

// ── Inline components ────────────────────────────────────────────────────────

type StatTileProps = { value: string | number; label: string; icon: SFSymbol; accent?: string };

function StatTile({ value, label, icon, accent }: StatTileProps) {
  const { colors } = useTheme();
  const tileStyles = useMemo(() => StyleSheet.create({
    card: {
      width: "48%" as const,
      backgroundColor: colors.surfaceDark,
      borderRadius: radius.md,
      padding: spacing.md,
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom: spacing.sm,
    },
    icon: { marginBottom: spacing.sm },
    value: { color: colors.textPrimary, fontSize: 26, fontWeight: "800" as const, marginBottom: spacing.xs },
    label: { ...typography.caption, color: colors.textMuted },
  }), [colors]);
  return (
    <View style={tileStyles.card}>
      <SymbolView name={icon} size={16} tintColor={accent ?? colors.accent} resizeMode="scaleAspectFit" style={tileStyles.icon} />
      <Text style={tileStyles.value}>{value}</Text>
      <Text style={tileStyles.label}>{label}</Text>
    </View>
  );
}

type StatBarProps = { label: string; value: number; max: number; color: string; showCount?: boolean };

function StatBar({ label, value, max, color, showCount = false }: StatBarProps) {
  const { colors } = useTheme();
  const barStyles = useMemo(() => StyleSheet.create({
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      marginBottom: spacing.md,
    },
    label: {
      ...typography.caption,
      color: colors.textMuted,
      width: 92,
    },
    track: {
      flex: 1,
      height: 6,
      backgroundColor: colors.surfaceDark,
      borderRadius: 3,
      overflow: "hidden",
    },
    fill: {
      height: 6,
      borderRadius: 3,
      minWidth: 2,
    },
    value: {
      ...typography.label,
      color: colors.textSecondary,
      width: 36,
      textAlign: "right",
    },
  }), [colors]);
  const pct = max > 0 ? Math.min(Math.round((value / max) * 100), 100) : 0;
  return (
    <View style={barStyles.row}>
      <Text style={barStyles.label}>{label}</Text>
      <View style={barStyles.track}>
        <View style={[barStyles.fill, { width: pct > 0 ? `${pct}%` : 2, backgroundColor: color }]} />
      </View>
      <Text style={barStyles.value}>{showCount ? value : `${pct}%`}</Text>
    </View>
  );
}

// ── Screen ───────────────────────────────────────────────────────────────────

export default function AnalyticsScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const accessToken = useAuthStore((s) => s.accessToken);
  const { summary, isLoading, error, fetchSummary } = useAnalyticsStore();

  const load = useCallback(() => {
    if (accessToken) fetchSummary(accessToken);
  }, [accessToken, fetchSummary]);

  useEffect(() => { load(); }, [load]);

  const updatedAt = summary
    ? new Date(summary.generated_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
    : null;

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={[styles.container, { paddingTop: insets.top + spacing.md }]}
      refreshControl={
        <RefreshControl
          refreshing={isLoading}
          onRefresh={load}
          tintColor={colors.accentCyan}
        />
      }
    >
      {/* Hero */}
      <View style={styles.heroCard}>
        <Text style={styles.heroLabel}>HELIOS ANALYTICS</Text>
        <Text style={styles.heroTitle}>Performance Report</Text>
        <Text style={styles.heroSubtitle}>
          {updatedAt ? `Last updated ${updatedAt}` : "Pull to refresh for live data."}
        </Text>
        {isLoading && !summary ? (
          <ActivityIndicator size="small" color={colors.accentCyan} style={{ marginTop: spacing.sm }} />
        ) : null}
      </View>

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      {summary ? (
        <>
          {/* Goals Overview */}
          <Text style={styles.sectionLabel}>GOALS OVERVIEW</Text>
          <View style={styles.grid}>
            <StatTile value={summary.total_goals}      label="Total Goals"      icon="target" />
            <StatTile value={summary.completed_goals}  label="Completed"        icon="checkmark.circle.fill" accent={colors.success} />
            <StatTile value={summary.active_goals}     label="Active"           icon="circle" accent={colors.accentCyan} />
            <StatTile value={`${summary.goal_completion_rate}%`} label="Completion Rate" icon="percent" accent={colors.accent} />
          </View>

          {/* Tasks Overview */}
          <Text style={styles.sectionLabel}>EXECUTION METRICS</Text>
          <View style={styles.grid}>
            <StatTile value={summary.total_tasks}        label="Total Tasks"    icon="checklist" />
            <StatTile value={summary.completed_tasks}    label="Completed"      icon="checkmark.circle.fill" accent={colors.success} />
            <StatTile value={summary.overdue_tasks}      label="Overdue"        icon="exclamationmark.circle.fill" accent={summary.overdue_tasks > 0 ? colors.danger : colors.textMuted} />
            <StatTile value={summary.high_priority_tasks} label="High Priority" icon="bolt.fill" accent={summary.high_priority_tasks > 0 ? "#f97316" : colors.textMuted} />
          </View>

          {/* Completion Rates */}
          <View style={styles.rateCard}>
            <Text style={styles.cardLabel}>COMPLETION RATES</Text>
            <StatBar
              label="Goals"
              value={summary.completed_goals}
              max={summary.total_goals}
              color={colors.accent}
            />
            <StatBar
              label="Tasks"
              value={summary.completed_tasks}
              max={summary.total_tasks}
              color={colors.accentCyan}
            />
          </View>

          {/* Task Breakdown */}
          <View style={styles.rateCard}>
            <Text style={styles.cardLabel}>TASK BREAKDOWN</Text>
            <StatBar
              label="Todo"
              value={summary.todo_tasks}
              max={summary.total_tasks}
              color={colors.textMuted}
              showCount
            />
            <StatBar
              label="In Progress"
              value={summary.in_progress_tasks}
              max={summary.total_tasks}
              color={colors.accentCyan}
              showCount
            />
            <StatBar
              label="Done"
              value={summary.completed_tasks}
              max={summary.total_tasks}
              color={colors.success}
              showCount
            />
            {summary.overdue_tasks > 0 ? (
              <StatBar
                label="Overdue"
                value={summary.overdue_tasks}
                max={summary.total_tasks}
                color={colors.danger}
                showCount
              />
            ) : null}
          </View>

          {/* Goal Breakdown */}
          <View style={[styles.rateCard, styles.lastCard]}>
            <Text style={styles.cardLabel}>GOAL BREAKDOWN</Text>
            <StatBar
              label="Active"
              value={summary.active_goals}
              max={summary.total_goals}
              color={colors.accentCyan}
              showCount
            />
            <StatBar
              label="Completed"
              value={summary.completed_goals}
              max={summary.total_goals}
              color={colors.success}
              showCount
            />
            <StatBar
              label="Paused"
              value={summary.paused_goals}
              max={summary.total_goals}
              color={colors.warning}
              showCount
            />
          </View>
        </>
      ) : !isLoading ? (
        <View style={styles.emptyState}>
          <SymbolView name="chart.bar" size={32} tintColor={colors.textMuted} resizeMode="scaleAspectFit" />
          <Text style={styles.emptyText}>
            Create goals and tasks to see your performance analytics.
          </Text>
        </View>
      ) : null}
    </ScrollView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
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

  heroTitle: {
    ...typography.displaySmall,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },

  heroSubtitle: {
    ...typography.body,
    color: colors.textMuted,
  },

  sectionLabel: {
    ...typography.label,
    color: colors.textMuted,
    marginBottom: spacing.sm,
  },

  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    marginBottom: spacing.md,
  },

  rateCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },

  lastCard: {
    marginBottom: 0,
  },

  cardLabel: {
    ...typography.label,
    color: colors.textMuted,
    marginBottom: spacing.lg,
  },

  errorText: {
    ...typography.caption,
    color: colors.danger,
    marginBottom: spacing.sm,
  },

  emptyState: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xxl,
    alignItems: "center",
    gap: spacing.md,
  },

  emptyText: {
    ...typography.body,
    color: colors.textMuted,
    textAlign: "center",
  },
});
}
