import { useCallback, useEffect, useMemo } from "react";
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { SymbolView } from "expo-symbols";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuthStore, useAutonomyStore } from "../../store";
import type { AutonomyAuditLogEntry } from "../../store";
import { radius, spacing, typography, type ThemeColors } from "../../theme/theme";
import { useTheme } from "../../theme/ThemeContext";

const EVENT_LABELS: Record<string, string> = {
  suggestion_created: "Recommendations generated",
  queue_item_created: "Approval requested",
  queue_item_approved: "Approval granted",
  queue_item_rejected: "Approval dismissed",
  queue_item_executed: "Action completed",
  execution_blocked_by_rule: "Blocked by permission",
  execution_failed: "Error",
};

function formatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function formatAction(value: string | null): string {
  if (!value) return "Background";
  return value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function AuditLogScreen() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const { auditLog, isAuditLogLoading, auditLogError, fetchAuditLog } = useAutonomyStore();
  const developerModeEnabled = __DEV__;

  const load = useCallback(() => {
    if (accessToken && developerModeEnabled) fetchAuditLog(accessToken);
  }, [accessToken, developerModeEnabled, fetchAuditLog]);

  useEffect(() => {
    load();
  }, [load]);

  if (!developerModeEnabled) {
    return (
      <View style={[styles.blockedScreen, { paddingTop: insets.top + spacing.lg }]}>
        <Text style={styles.title}>Developer Mode is off.</Text>
        <Text style={styles.subtitle}>Audit diagnostics are hidden from the normal HELIOS experience.</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={[styles.container, { paddingTop: insets.top + spacing.lg }]}
      refreshControl={<RefreshControl refreshing={isAuditLogLoading} onRefresh={load} tintColor={colors.accentCyan} />}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.label}>DEVELOPER OPTIONS</Text>
      <Text style={styles.title}>Audit Log</Text>
      <Text style={styles.subtitle}>AI requests, recommendations generated, executions, approvals, blocks, errors, background jobs, API failures, and performance diagnostics.</Text>

      {auditLogError ? <Text style={styles.errorText}>Unable to load diagnostics. Pull to refresh.</Text> : null}
      {isAuditLogLoading && auditLog.length === 0 ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator color={colors.accent} size="small" />
          <Text style={styles.loadingText}>Loading diagnostics…</Text>
        </View>
      ) : auditLog.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>No diagnostics yet.</Text>
          <Text style={styles.emptyText}>Developer events will appear here as HELIOS works.</Text>
        </View>
      ) : (
        <View style={styles.listCard}>
          {auditLog.map((entry) => (
            <AuditRow key={entry.id} entry={entry} />
          ))}
        </View>
      )}
    </ScrollView>
  );
}

function AuditRow({ entry }: { entry: AutonomyAuditLogEntry }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const label = EVENT_LABELS[entry.event_type] ?? entry.event_type.replace(/_/g, " ");

  return (
    <View style={styles.row}>
      <View style={styles.dotWrap}>
        <SymbolView name="circle.fill" size={9} tintColor={colors.accentCyan} resizeMode="scaleAspectFit" />
      </View>
      <View style={styles.rowBody}>
        <View style={styles.rowHeader}>
          <Text style={styles.rowTitle}>{label}</Text>
          <Text style={styles.rowTime}>{formatTime(entry.created_at)}</Text>
        </View>
        <Text style={styles.rowMessage}>{entry.message}</Text>
        <Text style={styles.rowMeta}>{formatAction(entry.action_type)} • {entry.source}</Text>
      </View>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl * 2 },
    blockedScreen: { flex: 1, backgroundColor: colors.background, paddingHorizontal: spacing.lg },
    label: { ...typography.label, color: colors.accentCyan, marginBottom: spacing.sm },
    title: { ...typography.displaySmall, color: colors.textPrimary, marginBottom: spacing.sm },
    subtitle: { ...typography.body, color: colors.textSecondary, marginBottom: spacing.xl },
    errorText: { ...typography.caption, color: colors.warning, marginBottom: spacing.md },
    loadingRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, padding: spacing.lg },
    loadingText: { ...typography.caption, color: colors.textMuted },
    emptyCard: {
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      padding: spacing.lg,
      gap: spacing.xs,
    },
    emptyTitle: { ...typography.body, color: colors.textPrimary, fontWeight: "800" },
    emptyText: { ...typography.caption, color: colors.textMuted },
    listCard: {
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      overflow: "hidden",
    },
    row: {
      flexDirection: "row",
      gap: spacing.md,
      padding: spacing.lg,
      borderBottomWidth: 1,
      borderBottomColor: colors.borderDark,
    },
    dotWrap: { paddingTop: 5 },
    rowBody: { flex: 1, gap: spacing.xs },
    rowHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md },
    rowTitle: { ...typography.body, color: colors.textPrimary, fontWeight: "800", flex: 1 },
    rowTime: { ...typography.caption, color: colors.textMuted },
    rowMessage: { ...typography.caption, color: colors.textSecondary },
    rowMeta: { ...typography.caption, color: colors.accentCyan, fontWeight: "800" },
  });
}
