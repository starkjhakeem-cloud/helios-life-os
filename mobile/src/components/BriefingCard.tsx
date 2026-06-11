import { View, Text, StyleSheet } from "react-native";
import { SymbolView } from "expo-symbols";

import { colors, spacing, radius, typography } from "../theme/theme";

// ── Types ─────────────────────────────────────────────────────────────────────

type Priority = { label: string; detail: string };

type Props = {
  greeting: string;
  summary: string;
  priorities: Priority[];
  risks: string[];
  focus_block: string;
  recommended_agent: string;
  generated_at: string;
};

// ── Agent accent colours matching AgentCard ───────────────────────────────────

const AGENT_ACCENT: Record<string, string> = {
  "Strategy Agent": colors.accent,
  "Finance Agent":  "#10b981",
  "Study Agent":    colors.accentCyan,
  "Health Agent":   "#ef4444",
  "Career Agent":   "#f59e0b",
};

const AGENT_ICON: Record<string, Parameters<typeof SymbolView>[0]["name"]> = {
  "Strategy Agent": "scope",
  "Finance Agent":  "chart.line.uptrend.xyaxis",
  "Study Agent":    "books.vertical",
  "Health Agent":   "heart.fill",
  "Career Agent":   "briefcase.fill",
};

// ── BriefingCard ──────────────────────────────────────────────────────────────

export default function BriefingCard({
  greeting,
  summary,
  priorities,
  risks,
  focus_block,
  recommended_agent,
  generated_at,
}: Props) {
  const time = new Date(generated_at).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });

  const agentAccent = AGENT_ACCENT[recommended_agent] ?? colors.textMuted;
  const agentIcon = AGENT_ICON[recommended_agent] ?? "cpu";

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
                tintColor="#f59e0b"
                resizeMode="scaleAspectFit"
              />
              <Text style={styles.riskText}>{risk}</Text>
            </View>
          ))}
        </>
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
    color: "#f59e0b",
    flex: 1,
    lineHeight: 18,
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
});
