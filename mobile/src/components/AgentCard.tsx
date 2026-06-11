import { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { SymbolView } from "expo-symbols";

import { colors, spacing, radius, typography } from "../theme/theme";
import type { AgentDetail, AgentProfile } from "../services/agentsService";

// ── Static lookups ────────────────────────────────────────────────────────────

const STATUS_COLOR: Record<string, string> = {
  active: colors.accentCyan,
  standby: "#f59e0b",
  offline: colors.textMuted,
};

const AGENT_ICON: Record<string, string> = {
  strategy: "scope",
  finance: "chart.line.uptrend.xyaxis",
  study: "books.vertical",
  health: "heart.fill",
  career: "briefcase.fill",
};

const AGENT_ACCENT: Record<string, string> = {
  strategy: colors.accent,
  finance: "#10b981",
  study: colors.accentCyan,
  health: "#ef4444",
  career: "#f59e0b",
};

// ── Types ─────────────────────────────────────────────────────────────────────

type Props = {
  agent: AgentProfile;
  detail?: AgentDetail | null;
  isDetailLoading?: boolean;
  onExpand?: (agentId: string) => void;
};

// ── Sub-components ────────────────────────────────────────────────────────────

type CapabilityPillProps = { label: string };
function CapabilityPill({ label }: CapabilityPillProps) {
  return (
    <View style={styles.pill}>
      <Text style={styles.pillText}>{label}</Text>
    </View>
  );
}

// ── AgentCard ─────────────────────────────────────────────────────────────────

export default function AgentCard({ agent, detail, isDetailLoading, onExpand }: Props) {
  const { id, name, role, status, description, priority, capabilities, memory_context_enabled } =
    agent;

  const [expanded, setExpanded] = useState(false);

  const dotColor = STATUS_COLOR[status] ?? colors.textMuted;
  const accentColor = AGENT_ACCENT[id] ?? colors.accent;
  const iconName = (AGENT_ICON[id] ?? "cpu") as Parameters<typeof SymbolView>[0]["name"];

  function handleToggle() {
    const next = !expanded;
    setExpanded(next);
    if (next && onExpand) {
      onExpand(id);
    }
  }

  const contextSummary = detail?.context_summary ?? null;

  return (
    <View style={[styles.card, expanded && styles.cardExpanded]}>
      {/* ── Header row ── */}
      <TouchableOpacity
        style={styles.header}
        onPress={handleToggle}
        activeOpacity={0.75}
      >
        <View style={[styles.iconWrap, { borderColor: `${accentColor}40` }]}>
          <SymbolView
            name={iconName}
            size={18}
            tintColor={accentColor}
            resizeMode="scaleAspectFit"
          />
        </View>

        <View style={styles.headerText}>
          <Text style={styles.name}>{name}</Text>
          <Text style={styles.role}>{role}</Text>
        </View>

        <View style={styles.headerRight}>
          <Text style={[styles.priorityBadge, { color: accentColor }]}>#{priority}</Text>
          <SymbolView
            name={expanded ? "chevron.up" : "chevron.down"}
            size={12}
            tintColor={colors.textMuted}
            resizeMode="scaleAspectFit"
          />
        </View>
      </TouchableOpacity>

      {/* ── Description ── */}
      <Text style={styles.description} numberOfLines={expanded ? undefined : 2}>
        {description}
      </Text>

      {/* ── Collapsed footer ── */}
      {!expanded ? (
        <View style={styles.footer}>
          <View style={styles.statusRow}>
            <View style={[styles.statusDot, { backgroundColor: dotColor }]} />
            <Text style={[styles.statusLabel, { color: dotColor }]}>{status.toUpperCase()}</Text>
          </View>
          <View style={styles.memoryBadgeSmall}>
            <SymbolView
              name={memory_context_enabled ? "brain.head.profile" : "brain"}
              size={10}
              tintColor={memory_context_enabled ? colors.accent : colors.textMuted}
              resizeMode="scaleAspectFit"
            />
            <Text
              style={[
                styles.memoryBadgeText,
                { color: memory_context_enabled ? colors.accent : colors.textMuted },
              ]}
            >
              {memory_context_enabled ? "MEMORY ON" : "MEMORY OFF"}
            </Text>
          </View>
        </View>
      ) : null}

      {/* ── Expanded detail ── */}
      {expanded ? (
        <View style={styles.expandedBody}>
          {/* Status + memory row */}
          <View style={styles.statusMemoryRow}>
            <View style={styles.statusRow}>
              <View style={[styles.statusDot, { backgroundColor: dotColor }]} />
              <Text style={[styles.statusLabel, { color: dotColor }]}>
                {status.toUpperCase()}
              </Text>
            </View>

            <View
              style={[
                styles.memoryContextBadge,
                {
                  borderColor: memory_context_enabled ? `${colors.accent}50` : colors.borderDark,
                  backgroundColor: memory_context_enabled
                    ? `${colors.accent}12`
                    : "transparent",
                },
              ]}
            >
              <SymbolView
                name={memory_context_enabled ? "brain.head.profile" : "brain"}
                size={11}
                tintColor={memory_context_enabled ? colors.accent : colors.textMuted}
                resizeMode="scaleAspectFit"
              />
              <Text
                style={[
                  styles.memoryContextText,
                  { color: memory_context_enabled ? colors.accent : colors.textMuted },
                ]}
              >
                {memory_context_enabled ? "MEMORY CONTEXT: ENABLED" : "MEMORY CONTEXT: DISABLED"}
              </Text>
            </View>
          </View>

          {/* User context summary */}
          {isDetailLoading ? (
            <View style={styles.contextLoadingRow}>
              <ActivityIndicator size="small" color={colors.accentCyan} />
              <Text style={styles.contextLoadingText}>Loading context...</Text>
            </View>
          ) : contextSummary ? (
            <View style={styles.contextSummaryRow}>
              <View style={styles.contextCell}>
                <Text style={[styles.contextValue, { color: accentColor }]}>
                  {contextSummary.total_memories}
                </Text>
                <Text style={styles.contextKey}>MEMORIES</Text>
              </View>
              <View style={styles.contextDivider} />
              <View style={styles.contextCell}>
                <Text style={[styles.contextValue, { color: accentColor }]}>
                  {contextSummary.active_goal_count}
                </Text>
                <Text style={styles.contextKey}>ACTIVE GOALS</Text>
              </View>
              <View style={styles.contextDivider} />
              <View style={styles.contextCell}>
                <View
                  style={[
                    styles.contextReadyDot,
                    {
                      backgroundColor: contextSummary.has_context
                        ? colors.accentCyan
                        : colors.textMuted,
                    },
                  ]}
                />
                <Text
                  style={[
                    styles.contextKey,
                    { color: contextSummary.has_context ? colors.accentCyan : colors.textMuted },
                  ]}
                >
                  {contextSummary.has_context ? "CONTEXT READY" : "NO CONTEXT"}
                </Text>
              </View>
            </View>
          ) : null}

          {/* Capabilities */}
          {capabilities.length > 0 ? (
            <>
              <Text style={styles.capabilitiesLabel}>CAPABILITIES</Text>
              <View style={styles.capabilitiesList}>
                {capabilities.map((cap) => (
                  <View key={cap.id} style={styles.capabilityRow}>
                    <View style={[styles.capabilityDot, { backgroundColor: accentColor }]} />
                    <View style={styles.capabilityBody}>
                      <Text style={styles.capabilityLabel}>{cap.label}</Text>
                      <Text style={styles.capabilityDesc}>{cap.description}</Text>
                    </View>
                  </View>
                ))}
              </View>
            </>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },

  cardExpanded: {
    borderColor: colors.accent + "40",
  },

  // Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    marginBottom: spacing.sm,
  },

  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceDark,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },

  headerText: {
    flex: 1,
  },

  name: {
    ...typography.title,
    color: colors.textPrimary,
    marginBottom: 2,
    fontSize: 16,
  },

  role: {
    ...typography.caption,
    color: colors.textMuted,
  },

  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    flexShrink: 0,
  },

  priorityBadge: {
    ...typography.label,
  },

  // Description
  description: {
    ...typography.body,
    color: colors.textSecondary,
    marginBottom: spacing.md,
    fontSize: 13,
    lineHeight: 20,
  },

  // Collapsed footer
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
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

  statusLabel: {
    ...typography.label,
    fontSize: 9,
  },

  memoryBadgeSmall: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },

  memoryBadgeText: {
    ...typography.label,
    fontSize: 8,
  },

  // Expanded body
  expandedBody: {
    marginTop: spacing.xs,
    gap: spacing.md,
  },

  statusMemoryRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: spacing.sm,
  },

  memoryContextBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.sm,
    borderWidth: 1,
  },

  memoryContextText: {
    ...typography.label,
    fontSize: 8,
  },

  // Context summary strip
  contextSummaryRow: {
    flexDirection: "row",
    backgroundColor: colors.surfaceDark,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.borderDark,
    overflow: "hidden",
  },

  contextCell: {
    flex: 1,
    alignItems: "center",
    paddingVertical: spacing.md,
    gap: 4,
  },

  contextValue: {
    fontSize: 20,
    fontWeight: "800" as const,
    letterSpacing: -0.5,
  },

  contextKey: {
    ...typography.label,
    fontSize: 7,
    color: colors.textMuted,
    textAlign: "center",
  },

  contextDivider: {
    width: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.sm,
  },

  contextReadyDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },

  contextLoadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },

  contextLoadingText: {
    ...typography.caption,
    color: colors.textMuted,
    fontSize: 12,
  },

  // Capabilities
  capabilitiesLabel: {
    ...typography.label,
    color: colors.textMuted,
    marginBottom: spacing.xs,
  },

  capabilitiesList: {
    gap: spacing.sm,
  },

  capabilityRow: {
    flexDirection: "row",
    gap: spacing.md,
    alignItems: "flex-start",
  },

  capabilityDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    marginTop: 6,
    flexShrink: 0,
  },

  capabilityBody: {
    flex: 1,
    gap: 2,
  },

  capabilityLabel: {
    ...typography.caption,
    color: colors.textPrimary,
    fontWeight: "600" as const,
    fontSize: 13,
  },

  capabilityDesc: {
    ...typography.caption,
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },

  // Unused (kept for compatibility if pill style needed elsewhere)
  pill: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceDark,
  },

  pillText: {
    ...typography.label,
    fontSize: 9,
    color: colors.textMuted,
  },
});
