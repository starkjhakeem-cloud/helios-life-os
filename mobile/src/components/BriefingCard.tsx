import { useMemo } from "react";
import { View, Text, StyleSheet } from "react-native";
import { SymbolView } from "expo-symbols";

import { spacing, radius, typography , type ThemeColors } from "../theme/theme";
import { useTheme } from "../theme/ThemeContext";

// ── Types ─────────────────────────────────────────────────────────────────────

type Priority = { label: string; detail: string };

type Props = {
  greeting: string;
  summary: string;
  priorities: Priority[];
  risks: string[];
  focus_block: string;
  recommended_agent: string;
  email_summary?: string | null;
  important_emails?: string[];
  email_risks?: string[];
  suggested_email_actions?: string[];
  context_sources?: string[];
  generated_at: string;
};

// ── Agent accent colours matching AgentCard ───────────────────────────────────

function getAgentAccent(c: ThemeColors): Record<string, string> {
  return {
    "Strategy Agent": c.accent,
    "Finance Agent":  c.success,
    "Study Agent":    c.accentCyan,
    "Health Agent":   c.danger,
    "Career Agent":   c.warning,
  };
}

const AGENT_ICON: Record<string, Parameters<typeof SymbolView>[0]["name"]> = {
  "Strategy Agent": "scope",
  "Finance Agent":  "chart.line.uptrend.xyaxis",
  "Study Agent":    "books.vertical",
  "Health Agent":   "heart.fill",
  "Career Agent":   "briefcase.fill",
};

// ── BriefingCard ──────────────────────────────────────────────────────────────

// Human-readable labels for context source keys returned by the backend.
const SOURCE_LABEL: Record<string, string> = {
  user_profile:  "PROFILE",
  goals:         "GOALS",
  tasks:         "TASKS",
  memories:      "MEMORY",
  analytics:     "ANALYTICS",
  calendar:      "CALENDAR",
  email:         "EMAIL",
  conversations: "HISTORY",
};

export default function BriefingCard({
  greeting,
  summary,
  priorities,
  risks,
  focus_block,
  recommended_agent,
  email_summary,
  important_emails = [],
  email_risks = [],
  suggested_email_actions = [],
  context_sources = [],
  generated_at,
}: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const AGENT_ACCENT = useMemo(() => getAgentAccent(colors), [colors]);
  const time = new Date(generated_at).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });

  const agentAccent = AGENT_ACCENT[recommended_agent] ?? colors.textMuted;
  const agentIcon = AGENT_ICON[recommended_agent] ?? "cpu";

  const hasEmailData = !!email_summary || important_emails.length > 0;
  const topEmail = important_emails[0] ?? null;
  const topEmailAction = suggested_email_actions[0] ?? null;

  return (
    <View style={styles.card}>
      {/* Top accent bar */}
      <View style={styles.accentBar} />

      {/* ── Header ── */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <SymbolView
            name="brain.head.profile"
            size={14}
            tintColor={colors.accentCyan}
            resizeMode="scaleAspectFit"
          />
          <Text style={styles.headerLabel}>DAILY COMMAND</Text>
        </View>
        <Text style={styles.timestamp}>{time}</Text>
      </View>

      {/* ── Greeting ── */}
      <Text style={styles.greeting}>{greeting}</Text>

      {/* ── Summary ── */}
      <Text style={styles.summary}>{summary}</Text>

      {/* ── Priorities ── */}
      <Text style={styles.sectionLabel}>PRIORITIES</Text>
      {priorities.map((p, i) => (
        <View key={i} style={styles.priorityRow}>
          <View style={styles.priorityDot} />
          <View style={styles.priorityBody}>
            <Text style={styles.priorityLabel}>{p.label}</Text>
            <Text style={styles.priorityDetail}>{p.detail}</Text>
          </View>
        </View>
      ))}

      {/* ── Urgent Risks ── */}
      {risks.length > 0 ? (
        <>
          <Text style={[styles.sectionLabel, styles.riskSectionLabel]}>URGENT RISKS</Text>
          {risks.map((risk, i) => (
            <View key={i} style={styles.riskRow}>
              <SymbolView
                name="exclamationmark.triangle.fill"
                size={12}
                tintColor={colors.warning}
                resizeMode="scaleAspectFit"
              />
              <Text style={styles.riskText}>{risk}</Text>
            </View>
          ))}
        </>
      ) : null}

      {/* ── Inbox Status ── */}
      {hasEmailData ? (
        <View style={styles.inboxBox}>
          {/* Header row */}
          <View style={styles.inboxHeader}>
            <View style={styles.inboxHeaderLeft}>
              <SymbolView
                name="envelope.fill"
                size={12}
                tintColor={colors.warning}
                resizeMode="scaleAspectFit"
              />
              <Text style={styles.inboxLabel}>INBOX STATUS</Text>
            </View>
            {important_emails.length > 0 ? (
              <View style={styles.inboxBadge}>
                <Text style={styles.inboxBadgeText}>
                  {important_emails.length} FLAGGED
                </Text>
              </View>
            ) : null}
          </View>

          {/* Summary */}
          {email_summary ? (
            <Text style={styles.inboxSummary}>{email_summary}</Text>
          ) : null}

          {/* Top important email */}
          {topEmail ? (
            <View style={styles.inboxEmailRow}>
              <View style={styles.inboxDot} />
              <Text style={styles.inboxEmailText} numberOfLines={2}>{topEmail}</Text>
            </View>
          ) : null}

          {/* Email risks */}
          {email_risks.map((risk, i) => (
            <View key={i} style={styles.inboxRiskRow}>
              <SymbolView
                name="exclamationmark.triangle.fill"
                size={10}
                tintColor={colors.warning}
                resizeMode="scaleAspectFit"
              />
              <Text style={styles.inboxRiskText}>{risk}</Text>
            </View>
          ))}

          {/* Suggested action */}
          {topEmailAction ? (
            <View style={styles.inboxActionRow}>
              <SymbolView
                name="arrow.right.circle.fill"
                size={11}
                tintColor={colors.warning}
                resizeMode="scaleAspectFit"
              />
              <Text style={styles.inboxActionText}>{topEmailAction}</Text>
            </View>
          ) : null}
        </View>
      ) : null}

      {/* ── Focus Block ── */}
      <View style={styles.focusBox}>
        <View style={styles.focusHeader}>
          <SymbolView
            name="bolt.fill"
            size={12}
            tintColor={colors.accentCyan}
            resizeMode="scaleAspectFit"
          />
          <Text style={styles.focusLabel}>FOCUS BLOCK</Text>
        </View>
        <Text style={styles.focusText}>{focus_block}</Text>
      </View>

      {/* ── Recommended Agent ── */}
      <View style={styles.agentRow}>
        <Text style={styles.agentRowLabel}>RECOMMENDED AGENT</Text>
        <View style={[styles.agentChip, { borderColor: `${agentAccent}50`, backgroundColor: `${agentAccent}12` }]}>
          <SymbolView
            name={agentIcon}
            size={11}
            tintColor={agentAccent}
            resizeMode="scaleAspectFit"
          />
          <Text style={[styles.agentChipText, { color: agentAccent }]}>
            {recommended_agent.toUpperCase()}
          </Text>
        </View>
      </View>

      {/* ── Context Sources ── */}
      {context_sources.length > 0 ? (
        <View style={styles.sourcesRow}>
          <Text style={styles.sourcesLabel}>CONTEXT</Text>
          <View style={styles.sourcesChips}>
            {context_sources.map((src) => (
              <View key={src} style={styles.sourceChip}>
                <Text style={styles.sourceChipText}>
                  {SOURCE_LABEL[src] ?? src.toUpperCase()}
                </Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
    overflow: "hidden",
  },

  accentBar: {
    height: 3,
    backgroundColor: colors.accentCyan,
  },

  // Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
  },

  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },

  headerLabel: {
    ...typography.label,
    color: colors.accentCyan,
  },

  timestamp: {
    ...typography.label,
    color: colors.textMuted,
    fontSize: 9,
  },

  // Greeting
  greeting: {
    fontSize: 15,
    fontWeight: "600" as const,
    color: colors.textPrimary,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
    lineHeight: 22,
  },

  // Summary
  summary: {
    ...typography.body,
    color: colors.textSecondary,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    fontSize: 14,
    lineHeight: 21,
  },

  // Section labels
  sectionLabel: {
    ...typography.label,
    color: colors.textMuted,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },

  riskSectionLabel: {
    marginTop: spacing.xs,
  },

  // Priority rows
  priorityRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },

  priorityDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.accent,
    marginTop: 6,
    flexShrink: 0,
  },

  priorityBody: {
    flex: 1,
  },

  priorityLabel: {
    fontSize: 14,
    fontWeight: "600" as const,
    color: colors.textPrimary,
  },

  priorityDetail: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: 2,
    lineHeight: 18,
  },

  // Risk rows
  riskRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },

  riskText: {
    ...typography.caption,
    color: colors.warning,
    flex: 1,
    lineHeight: 18,
  },

  // Inbox status box
  inboxBox: {
    backgroundColor: `${colors.warning}1a`,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: `${colors.warning}4d`,
    padding: spacing.md,
    margin: spacing.lg,
    marginTop: spacing.xs,
    marginBottom: spacing.xs,
    gap: 6,
  },

  inboxHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  inboxHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },

  inboxLabel: {
    ...typography.label,
    color: colors.warning,
    fontSize: 9,
  },

  inboxBadge: {
    backgroundColor: `${colors.warning}40`,
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },

  inboxBadgeText: {
    ...typography.label,
    color: colors.warning,
    fontSize: 8,
  },

  inboxSummary: {
    ...typography.caption,
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 17,
  },

  inboxEmailRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
  },

  inboxDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.warning,
    marginTop: 5,
    flexShrink: 0,
  },

  inboxEmailText: {
    ...typography.caption,
    color: colors.textPrimary,
    fontSize: 12,
    fontWeight: "600" as const,
    flex: 1,
    lineHeight: 17,
  },

  inboxRiskRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 5,
  },

  inboxRiskText: {
    ...typography.caption,
    color: colors.warning,
    fontSize: 11,
    flex: 1,
    lineHeight: 16,
  },

  inboxActionRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 5,
    marginTop: 2,
  },

  inboxActionText: {
    ...typography.caption,
    color: colors.textSecondary,
    fontSize: 12,
    flex: 1,
    lineHeight: 17,
    fontStyle: "italic" as const,
  },

  // Focus block box
  focusBox: {
    backgroundColor: colors.surfaceDark,
    borderRadius: radius.sm,
    padding: spacing.md,
    margin: spacing.lg,
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
  },

  focusHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    marginBottom: spacing.xs,
  },

  focusLabel: {
    ...typography.label,
    color: colors.accentCyan,
  },

  focusText: {
    ...typography.body,
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 21,
  },

  // Recommended agent row
  agentRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    paddingTop: spacing.xs,
  },

  agentRowLabel: {
    ...typography.label,
    color: colors.textMuted,
    fontSize: 9,
  },

  agentChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.sm,
    borderWidth: 1,
  },

  agentChipText: {
    ...typography.label,
    fontSize: 9,
  },

  // Context sources strip
  sourcesRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: spacing.xs,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    paddingTop: 0,
  },

  sourcesLabel: {
    ...typography.label,
    color: colors.textMuted,
    fontSize: 8,
    opacity: 0.6,
  },

  sourcesChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
    flex: 1,
  },

  sourceChip: {
    borderWidth: 1,
    borderColor: `${colors.border}`,
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
    opacity: 0.7,
  },

  sourceChipText: {
    ...typography.label,
    fontSize: 7,
    color: colors.textMuted,
  },
});
}
