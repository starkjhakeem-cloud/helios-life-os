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
import type { AutonomyQueueItem, RiskLevel, QueueStatus } from "../../store";

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

// ── Sub-components ────────────────────────────────────────────────────────────

type RiskBadgeProps = { level: RiskLevel };

function RiskBadge({ level }: RiskBadgeProps) {
  return (
    <View style={[styles.badge, { borderColor: RISK_COLORS[level] }]}>
      <Text style={[styles.badgeText, { color: RISK_COLORS[level] }]}>
        {level.toUpperCase()}
      </Text>
    </View>
  );
}

type StatusBadgeProps = { status: QueueStatus };

function StatusBadge({ status }: StatusBadgeProps) {
  return (
    <View style={[styles.badge, { borderColor: STATUS_COLORS[status] }]}>
      <Text style={[styles.badgeText, { color: STATUS_COLORS[status] }]}>
        {status.toUpperCase()}
      </Text>
    </View>
  );
}

type QueueCardProps = {
  item: AutonomyQueueItem;
  isMutating: boolean;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
};

function QueueCard({ item, isMutating, onApprove, onReject }: QueueCardProps) {
  const isPending = item.status === "pending";

  const handleApprove = () => {
    Alert.alert(
      "Approve Action",
      `Approve "${item.title}"?\n\nThis marks the proposal as approved. No automatic execution will occur.`,
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

  return (
    <View style={styles.card}>
      {/* Header row */}
      <View style={styles.cardHeader}>
        <View style={styles.cardMeta}>
          <RiskBadge level={item.risk_level as RiskLevel} />
          <StatusBadge status={item.status as QueueStatus} />
        </View>
        <Text style={styles.cardAgent}>{item.source_agent}</Text>
      </View>

      {/* Title + action type */}
      <Text style={styles.cardTitle}>{item.title}</Text>
      <Text style={styles.cardActionType}>{item.proposed_action_type.replace(/_/g, " ").toUpperCase()}</Text>

      {/* Description */}
      {item.description ? (
        <Text style={styles.cardDescription} numberOfLines={3}>{item.description}</Text>
      ) : null}

      {/* Payload preview */}
      {Object.keys(item.payload_preview).length > 0 ? (
        <View style={styles.payloadBox}>
          {Object.entries(item.payload_preview).slice(0, 4).map(([k, v]) => (
            <Text key={k} style={styles.payloadRow} numberOfLines={1}>
              <Text style={styles.payloadKey}>{k}: </Text>
              <Text style={styles.payloadVal}>{String(v)}</Text>
            </Text>
          ))}
        </View>
      ) : null}

      {/* Timestamp */}
      <Text style={styles.cardTimestamp}>
        {new Date(item.created_at).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })}
      </Text>

      {/* Actions — only for pending items */}
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
    </View>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function AutonomyScreen() {
  const insets = useSafeAreaInsets();
  const accessToken = useAuthStore((s) => s.accessToken);
  const { items, isLoading, isMutating, error, fetchQueue, approveItem, rejectItem } =
    useAutonomyStore();

  const load = useCallback(() => {
    if (accessToken) fetchQueue(accessToken);
  }, [accessToken, fetchQueue]);

  useEffect(() => {
    load();
  }, [load]);

  const handleApprove = useCallback(
    (id: string) => {
      if (accessToken) approveItem(accessToken, id);
    },
    [accessToken, approveItem],
  );

  const handleReject = useCallback(
    (id: string) => {
      if (accessToken) rejectItem(accessToken, id);
    },
    [accessToken, rejectItem],
  );

  const pending = items.filter((i) => i.status === "pending");
  const resolved = items.filter((i) => i.status !== "pending");

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + spacing.md },
      ]}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={isLoading}
          onRefresh={load}
          tintColor={colors.accent}
        />
      }
    >
      {/* Hero card */}
      <View style={styles.heroCard}>
        <Text style={styles.heroLabel}>HELIOS AUTONOMY</Text>
        <Text style={styles.heroTitle}>Action Queue</Text>
        <Text style={styles.heroSubtitle}>
          {pending.length > 0
            ? `${pending.length} pending ${pending.length === 1 ? "proposal" : "proposals"}`
            : "No pending proposals."}
        </Text>
      </View>

      {/* Error */}
      {error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      {/* Loading state (initial) */}
      {isLoading && items.length === 0 ? (
        <ActivityIndicator color={colors.accent} style={{ marginTop: spacing.xl }} />
      ) : null}

      {/* Pending section */}
      {!isLoading || items.length > 0 ? (
        <>
          <Text style={styles.sectionLabel}>PENDING REVIEW</Text>

          {pending.length === 0 ? (
            <View style={styles.emptyState}>
              <SymbolView
                name="tray"
                size={40}
                tintColor={colors.textMuted}
                resizeMode="scaleAspectFit"
              />
              <Text style={styles.emptyText}>No pending proposals.</Text>
              <Text style={styles.emptySubtext}>
                Proposals from HELIOS agents will appear here for your review.
              </Text>
            </View>
          ) : (
            pending.map((item) => (
              <QueueCard
                key={item.id}
                item={item}
                isMutating={isMutating}
                onApprove={handleApprove}
                onReject={handleReject}
              />
            ))
          )}

          {/* Resolved section */}
          {resolved.length > 0 ? (
            <>
              <Text style={[styles.sectionLabel, { marginTop: spacing.xl }]}>
                RESOLVED
              </Text>
              {resolved.map((item) => (
                <QueueCard
                  key={item.id}
                  item={item}
                  isMutating={isMutating}
                  onApprove={handleApprove}
                  onReject={handleReject}
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
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingHorizontal: spacing.md,
  },

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
  heroSubtitle: {
    ...typography.body,
    color: colors.textSecondary,
  },

  // Section labels
  sectionLabel: {
    ...typography.caption,
    color: colors.textMuted,
    letterSpacing: 2,
    marginBottom: spacing.sm,
    marginTop: spacing.sm,
  },

  // Error
  errorBox: {
    backgroundColor: "rgba(239, 68, 68, 0.1)",
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.3)",
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  errorText: {
    ...typography.body,
    color: "#ef4444",
  },

  // Empty state
  emptyState: {
    alignItems: "center",
    paddingVertical: spacing.xl * 1.5,
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

  // Queue card
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.md,
    gap: spacing.xs,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.xs,
  },
  cardMeta: {
    flexDirection: "row",
    gap: spacing.xs,
  },
  cardAgent: {
    ...typography.caption,
    color: colors.textMuted,
    letterSpacing: 1,
  },
  cardTitle: {
    ...typography.title,
    color: colors.textPrimary,
  },
  cardActionType: {
    ...typography.caption,
    color: colors.accentCyan,
    letterSpacing: 1,
  },
  cardDescription: {
    ...typography.body,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  cardTimestamp: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },

  // Payload preview box
  payloadBox: {
    backgroundColor: colors.surfaceDark,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.borderDark,
    padding: spacing.sm,
    marginTop: spacing.xs,
    gap: 2,
  },
  payloadRow: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  payloadKey: {
    color: colors.textMuted,
  },
  payloadVal: {
    color: colors.textSecondary,
  },

  // Badges
  badge: {
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  badgeText: {
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 0.8,
  },

  // Action buttons
  actionRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  actionBtn: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    alignItems: "center",
    borderWidth: 1,
  },
  approveBtn: {
    backgroundColor: "rgba(34, 197, 94, 0.1)",
    borderColor: "#22c55e",
  },
  approveBtnText: {
    ...typography.caption,
    color: "#22c55e",
    fontWeight: "700",
    letterSpacing: 1,
  },
  rejectBtn: {
    backgroundColor: "rgba(239, 68, 68, 0.1)",
    borderColor: "#ef4444",
  },
  rejectBtnText: {
    ...typography.caption,
    color: "#ef4444",
    fontWeight: "700",
    letterSpacing: 1,
  },
});
