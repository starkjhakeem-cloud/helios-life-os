import { useCallback, useEffect } from "react";
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

import { colors, spacing, radius, typography } from "../../theme/theme";
import { useAuthStore, useAutonomyStore } from "../../store";
import type {
  AutonomyExecuteResult,
  AutonomyQueueItem,
  QueueStatus,
  RiskLevel,
  SuggestionItem,
} from "../../store";

// ── Constants ─────────────────────────────────────────────────────────────────

const RISK_COLORS: Record<RiskLevel, string> = {
  low: "#22c55e",
  medium: "#f59e0b",
  high: "#ef4444",
};

const STATUS_COLORS: Record<QueueStatus, string> = {
  pending: colors.accentCyan,
  approved: "#22c55e",
  rejected: colors.textMuted,
  completed: colors.textMuted,
};

const AGENT_LABELS: Record<string, string> = {
  strategy_agent:       "STRATEGY",
  task_manager:         "TASKS",
  analytics_engine:     "ANALYTICS",
  calendar_intelligence: "CALENDAR",
  email_intelligence:   "EMAIL",
};

function agentLabel(name: string): string {
  return AGENT_LABELS[name] ?? name.replace(/_/g, " ").toUpperCase();
}

// ── Shared badge ──────────────────────────────────────────────────────────────

type BadgeProps = { label: string; color: string };

function Badge({ label, color }: BadgeProps) {
  return (
    <View style={[styles.badge, { borderColor: color }]}>
      <Text style={[styles.badgeText, { color }]}>{label}</Text>
    </View>
  );
}

// ── Suggestion card ───────────────────────────────────────────────────────────

type SuggestionCardProps = {
  item: SuggestionItem;
  isQueued: boolean;
  isMutating: boolean;
  onAddToQueue: (suggestion: SuggestionItem) => void;
};

function SuggestionCard({ item, isQueued, isMutating, onAddToQueue }: SuggestionCardProps) {
  const handleAdd = () => {
    Alert.alert(
      "Add to Queue",
      `Add "${item.title}" to the autonomy queue for review?\n\nYou can approve and execute it from the queue.`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Add to Queue", onPress: () => onAddToQueue(item) },
      ],
    );
  };

  return (
    <View style={[styles.card, isQueued && styles.cardQueued]}>
      {/* Header row */}
      <View style={styles.cardHeader}>
        <View style={styles.cardMeta}>
          <Badge label={agentLabel(item.source_agent)} color={colors.accent} />
          <Badge label={item.risk_level.toUpperCase()} color={RISK_COLORS[item.risk_level as RiskLevel]} />
        </View>
        <Badge
          label={item.suggested_action_type.replace(/_/g, " ").toUpperCase()}
          color={colors.accentCyan}
        />
      </View>

      <Text style={styles.cardTitle}>{item.title}</Text>
      <Text style={styles.cardDescription}>{item.description}</Text>

      {/* Reason */}
      <View style={styles.reasonBox}>
        <Text style={styles.reasonLabel}>WHY HELIOS SUGGESTS THIS</Text>
        <Text style={styles.reasonText}>{item.reason}</Text>
      </View>

      {/* Add to Queue button */}
      {isQueued ? (
        <View style={styles.queuedRow}>
          <SymbolView
            name="checkmark.circle.fill"
            size={14}
            tintColor="#22c55e"
            resizeMode="scaleAspectFit"
          />
          <Text style={styles.queuedText}>Added to Queue</Text>
        </View>
      ) : (
        <TouchableOpacity
          style={[styles.actionBtn, styles.addToQueueBtn, isMutating && styles.btnDisabled]}
          onPress={handleAdd}
          disabled={isMutating}
          activeOpacity={0.75}
        >
          <Text style={styles.addToQueueBtnText}>Add to Queue</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// ── Queue card ────────────────────────────────────────────────────────────────

type QueueCardProps = {
  item: AutonomyQueueItem;
  isMutating: boolean;
  isExecuting: boolean;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onExecute: (id: string) => void;
};

function QueueCard({
  item,
  isMutating,
  isExecuting,
  onApprove,
  onReject,
  onExecute,
}: QueueCardProps) {
  const isPending  = item.status === "pending";
  const isApproved = item.status === "approved";

  const handleApprove = () => {
    Alert.alert(
      "Approve Action",
      `Approve "${item.title}"?\n\nNo automatic execution will occur.`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Approve", onPress: () => onApprove(item.id) },
      ],
    );
  };

  const handleReject = () => {
    Alert.alert(
      "Reject Action",
      `Reject "${item.title}"?`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Reject", style: "destructive", onPress: () => onReject(item.id) },
      ],
    );
  };

  const handleExecute = () => {
    Alert.alert(
      "Execute Action",
      `Execute "${item.title}"?\n\nThis will run the proposed action now. This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Execute", onPress: () => onExecute(item.id) },
      ],
    );
  };

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.cardMeta}>
          <Badge
            label={item.risk_level.toUpperCase()}
            color={RISK_COLORS[item.risk_level as RiskLevel]}
          />
          <Badge
            label={item.status.toUpperCase()}
            color={STATUS_COLORS[item.status as QueueStatus]}
          />
        </View>
        <Text style={styles.cardAgent}>{agentLabel(item.source_agent)}</Text>
      </View>

      <Text style={styles.cardTitle}>{item.title}</Text>
      <Text style={styles.cardActionType}>
        {item.proposed_action_type.replace(/_/g, " ").toUpperCase()}
      </Text>

      {item.description ? (
        <Text style={styles.cardDescription} numberOfLines={3}>{item.description}</Text>
      ) : null}

      {Object.keys(item.payload_preview).length > 0 ? (
        <View style={styles.payloadBox}>
          {Object.entries(item.payload_preview)
            .slice(0, 4)
            .map(([k, v]) => (
              <Text key={k} style={styles.payloadRow} numberOfLines={1}>
                <Text style={styles.payloadKey}>{k}: </Text>
                <Text style={styles.payloadVal}>{String(v)}</Text>
              </Text>
            ))}
        </View>
      ) : null}

      <Text style={styles.cardTimestamp}>
        {new Date(item.created_at).toLocaleDateString("en-US", {
          month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
        })}
      </Text>

      {isPending ? (
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={[styles.actionBtn, styles.approveBtn]}
            onPress={handleApprove}
            disabled={isMutating}
            activeOpacity={0.75}
          >
            <Text style={styles.approveBtnText}>Approve</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtn, styles.rejectBtn]}
            onPress={handleReject}
            disabled={isMutating}
            activeOpacity={0.75}
          >
            <Text style={styles.rejectBtnText}>Reject</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {isApproved ? (
        isExecuting ? (
          <View style={styles.executingRow}>
            <ActivityIndicator color={colors.accent} size="small" />
            <Text style={styles.executingText}>Executing…</Text>
          </View>
        ) : (
          <TouchableOpacity
            style={[styles.actionBtn, styles.executeBtn]}
            onPress={handleExecute}
            disabled={isMutating}
            activeOpacity={0.75}
          >
            <Text style={styles.executeBtnText}>Execute</Text>
          </TouchableOpacity>
        )
      ) : null}
    </View>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function AutonomyScreen() {
  const insets = useSafeAreaInsets();
  const accessToken = useAuthStore((s) => s.accessToken);
  const {
    items,
    isLoading,
    isMutating,
    executingItemId,
    error,
    suggestions,
    isSuggestionsLoading,
    suggestionsError,
    queuedSuggestionIds,
    fetchQueue,
    fetchSuggestions,
    approveItem,
    rejectItem,
    executeItem,
    addSuggestionToQueue,
  } = useAutonomyStore();

  const loadAll = useCallback(() => {
    if (!accessToken) return;
    fetchQueue(accessToken);
    fetchSuggestions(accessToken);
  }, [accessToken, fetchQueue, fetchSuggestions]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const handleApprove = useCallback(
    (id: string) => { if (accessToken) approveItem(accessToken, id); },
    [accessToken, approveItem],
  );

  const handleReject = useCallback(
    (id: string) => { if (accessToken) rejectItem(accessToken, id); },
    [accessToken, rejectItem],
  );

  const handleExecute = useCallback(
    async (id: string) => {
      if (!accessToken) return;
      const result: AutonomyExecuteResult | null = await executeItem(accessToken, id);
      if (!result) return;
      if (result.action_type === "generate_plan" && result.plan) {
        const { plan_title, summary, steps } = result.plan;
        const stepLines = steps.slice(0, 3).map((s) => `${s.step_number}. ${s.title}`).join("\n");
        Alert.alert("Plan Generated", `${plan_title}\n\n${summary}\n\nFirst steps:\n${stepLines}`, [{ text: "OK" }]);
      } else {
        Alert.alert("Done", result.message, [{ text: "OK" }]);
      }
    },
    [accessToken, executeItem],
  );

  const handleAddToQueue = useCallback(
    (suggestion: SuggestionItem) => {
      if (accessToken) addSuggestionToQueue(accessToken, suggestion);
    },
    [accessToken, addSuggestionToQueue],
  );

  const pending  = items.filter((i) => i.status === "pending");
  const approved = items.filter((i) => i.status === "approved");
  const resolved = items.filter((i) => i.status === "rejected" || i.status === "completed");
  const isRefreshing = isLoading || isSuggestionsLoading;

  const heroSubtitle =
    suggestions.length > 0 || pending.length > 0
      ? [
          pending.length > 0 ? `${pending.length} pending` : null,
          approved.length > 0 ? `${approved.length} approved` : null,
          suggestions.length > 0 ? `${suggestions.length} suggestion${suggestions.length !== 1 ? "s" : ""}` : null,
        ]
          .filter(Boolean)
          .join(" · ")
      : "All clear.";

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.md }]}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={isRefreshing} onRefresh={loadAll} tintColor={colors.accent} />
      }
    >
      {/* Hero */}
      <View style={styles.heroCard}>
        <Text style={styles.heroLabel}>HELIOS AUTONOMY</Text>
        <Text style={styles.heroTitle}>Action Queue</Text>
        <Text style={styles.heroSubtitle}>{heroSubtitle}</Text>
      </View>

      {/* Global error */}
      {error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      {/* Initial queue loading */}
      {isLoading && items.length === 0 ? (
        <ActivityIndicator color={colors.accent} style={{ marginTop: spacing.xl }} />
      ) : null}

      {/* ── Proactive Suggestions ─────────────────────────────────────── */}
      <Text style={styles.sectionLabel}>PROACTIVE SUGGESTIONS</Text>

      {isSuggestionsLoading && suggestions.length === 0 ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator color={colors.accent} size="small" />
          <Text style={styles.loadingText}>Generating suggestions…</Text>
        </View>
      ) : suggestionsError ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{suggestionsError}</Text>
        </View>
      ) : suggestions.length === 0 ? (
        <View style={styles.emptyState}>
          <SymbolView name="lightbulb" size={36} tintColor={colors.textMuted} resizeMode="scaleAspectFit" />
          <Text style={styles.emptyText}>No suggestions right now.</Text>
          <Text style={styles.emptySubtext}>Pull to refresh for fresh recommendations.</Text>
        </View>
      ) : (
        suggestions.map((s) => (
          <SuggestionCard
            key={s.id}
            item={s}
            isQueued={queuedSuggestionIds.includes(s.id)}
            isMutating={isMutating}
            onAddToQueue={handleAddToQueue}
          />
        ))
      )}

      {/* ── Pending Review ────────────────────────────────────────────── */}
      {(!isLoading || items.length > 0) ? (
        <>
          <Text style={[styles.sectionLabel, { marginTop: spacing.xl }]}>PENDING REVIEW</Text>
          {pending.length === 0 ? (
            <View style={styles.emptyState}>
              <SymbolView name="tray" size={36} tintColor={colors.textMuted} resizeMode="scaleAspectFit" />
              <Text style={styles.emptyText}>No pending proposals.</Text>
              <Text style={styles.emptySubtext}>Add a suggestion to the queue to get started.</Text>
            </View>
          ) : (
            pending.map((item) => (
              <QueueCard
                key={item.id}
                item={item}
                isMutating={isMutating}
                isExecuting={executingItemId === item.id}
                onApprove={handleApprove}
                onReject={handleReject}
                onExecute={handleExecute}
              />
            ))
          )}

          {/* ── Approved ─────────────────────────────────────────────── */}
          {approved.length > 0 ? (
            <>
              <Text style={[styles.sectionLabel, { marginTop: spacing.xl }]}>
                APPROVED — READY TO EXECUTE
              </Text>
              {approved.map((item) => (
                <QueueCard
                  key={item.id}
                  item={item}
                  isMutating={isMutating}
                  isExecuting={executingItemId === item.id}
                  onApprove={handleApprove}
                  onReject={handleReject}
                  onExecute={handleExecute}
                />
              ))}
            </>
          ) : null}

          {/* ── Resolved ─────────────────────────────────────────────── */}
          {resolved.length > 0 ? (
            <>
              <Text style={[styles.sectionLabel, { marginTop: spacing.xl }]}>RESOLVED</Text>
              {resolved.map((item) => (
                <QueueCard
                  key={item.id}
                  item={item}
                  isMutating={isMutating}
                  isExecuting={false}
                  onApprove={handleApprove}
                  onReject={handleReject}
                  onExecute={handleExecute}
                />
              ))}
            </>
          ) : null}
        </>
      ) : null}

      <View style={{ height: spacing.xl * 2 }} />
    </ScrollView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content:   { paddingHorizontal: spacing.md },

  // Hero
  heroCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  heroLabel: {
    ...typography.caption,
    color: colors.accent,
    letterSpacing: 2,
    marginBottom: spacing.xs,
  },
  heroTitle: {
    ...typography.displaySmall,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  heroSubtitle: { ...typography.body, color: colors.textSecondary },

  // Section labels
  sectionLabel: {
    ...typography.caption,
    color: colors.textMuted,
    letterSpacing: 2,
    marginBottom: spacing.sm,
    marginTop: spacing.sm,
  },

  // Inline loading row (for suggestions)
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.md,
  },
  loadingText: { ...typography.caption, color: colors.textMuted },

  // Error
  errorBox: {
    backgroundColor: "rgba(239, 68, 68, 0.1)",
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.3)",
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  errorText: { ...typography.body, color: "#ef4444" },

  // Empty state
  emptyState: {
    alignItems: "center",
    paddingVertical: spacing.xl,
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
  },

  // Cards (shared base)
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.md,
    gap: spacing.xs,
  },
  cardQueued: {
    borderColor: "#22c55e",
    opacity: 0.75,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.xs,
  },
  cardMeta: { flexDirection: "row", gap: spacing.xs },
  cardAgent: { ...typography.caption, color: colors.textMuted, letterSpacing: 1 },
  cardTitle: { ...typography.title, color: colors.textPrimary },
  cardActionType: { ...typography.caption, color: colors.accentCyan, letterSpacing: 1 },
  cardDescription: { ...typography.body, color: colors.textSecondary, marginTop: spacing.xs },
  cardTimestamp: { ...typography.caption, color: colors.textMuted, marginTop: spacing.xs },

  // Reason box (suggestions only)
  reasonBox: {
    backgroundColor: colors.surfaceDark,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.borderDark,
    padding: spacing.sm,
    marginTop: spacing.xs,
    gap: spacing.xs,
  },
  reasonLabel: {
    fontSize: 9,
    fontWeight: "700" as const,
    letterSpacing: 1.5,
    color: colors.accent,
  },
  reasonText: { ...typography.caption, color: colors.textSecondary, lineHeight: 18 },

  // Payload preview box (queue items)
  payloadBox: {
    backgroundColor: colors.surfaceDark,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.borderDark,
    padding: spacing.sm,
    marginTop: spacing.xs,
    gap: 2,
  },
  payloadRow: { ...typography.caption, color: colors.textSecondary },
  payloadKey: { color: colors.textMuted },
  payloadVal: { color: colors.textSecondary },

  // Badges
  badge: {
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  badgeText: { fontSize: 9, fontWeight: "700" as const, letterSpacing: 0.8 },

  // Action buttons
  actionRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm },
  actionBtn: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    alignItems: "center",
    borderWidth: 1,
  },
  btnDisabled: { opacity: 0.5 },

  approveBtn: { backgroundColor: "rgba(34, 197, 94, 0.1)", borderColor: "#22c55e" },
  approveBtnText: { ...typography.caption, color: "#22c55e", fontWeight: "700" as const, letterSpacing: 1 },

  rejectBtn: { backgroundColor: "rgba(239, 68, 68, 0.1)", borderColor: "#ef4444" },
  rejectBtnText: { ...typography.caption, color: "#ef4444", fontWeight: "700" as const, letterSpacing: 1 },

  executeBtn: { backgroundColor: "rgba(124, 58, 237, 0.15)", borderColor: colors.accent, marginTop: spacing.sm },
  executeBtnText: { ...typography.caption, color: colors.accent, fontWeight: "700" as const, letterSpacing: 1 },

  addToQueueBtn: {
    backgroundColor: "rgba(34, 211, 238, 0.1)",
    borderColor: colors.accentCyan,
    marginTop: spacing.sm,
  },
  addToQueueBtnText: { ...typography.caption, color: colors.accentCyan, fontWeight: "700" as const, letterSpacing: 1 },

  queuedRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    marginTop: spacing.sm,
    paddingVertical: spacing.xs,
  },
  queuedText: { ...typography.caption, color: "#22c55e", letterSpacing: 1 },

  executingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    marginTop: spacing.sm,
    paddingVertical: spacing.sm,
  },
  executingText: { ...typography.caption, color: colors.accent, letterSpacing: 1 },
});
