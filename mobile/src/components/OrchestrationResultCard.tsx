import { View, Text, StyleSheet } from "react-native";
import { SymbolView } from "expo-symbols";

import { colors, spacing, radius, typography } from "../theme/theme";
import type { OrchestrationResponse } from "../services/orchestrationService";

// ── Agent accent colours (keyed by agent id) ─────────────────────────────────

const AGENT_ACCENT: Record<string, string> = {
  strategy: colors.accent,
  finance:  "#10b981",
  study:    colors.accentCyan,
  health:   "#ef4444",
  career:   "#f59e0b",
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function OrchestrationResultCard({
  result,
}: {
  result: OrchestrationResponse;
}) {
  const time = new Date(result.generated_at).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <View style={styles.card}>
      {/* Accent bar */}
      <View style={styles.accentBar} />

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <SymbolView
            name="cpu"
            size={13}
            tintColor={colors.accent}
            resizeMode="scaleAspectFit"
          />
          <Text style={styles.headerLabel}>COMMAND RESULT</Text>
        </View>
        <Text style={styles.timestamp}>{time}</Text>
      </View>

      <Text style={styles.objectiveText} numberOfLines={4}>
        {result.objective}
      </Text>

      {/* ── Agent Assessments ── */}
      <Text style={styles.sectionLabel}>AGENT ASSESSMENTS</Text>

      {result.agent_assessments.map((assessment) => {
        const accent = AGENT_ACCENT[assessment.agent_id] ?? colors.textMuted;
        const confPct = Math.round(assessment.confidence * 100);
        return (
          <View key={assessment.agent_id} style={styles.assessmentRow}>
            <View
              style={[styles.assessmentAccentBar, { backgroundColor: accent }]}
            />
            <View style={styles.assessmentBody}>
              <View style={styles.assessmentHeader}>
                <Text style={[styles.agentName, { color: accent }]}>
                  {assessment.agent_name}
                </Text>
                <View
                  style={[
                    styles.confBadge,
                    {
                      backgroundColor: `${accent}20`,
                      borderColor: `${accent}40`,
                    },
                  ]}
                >
                  <Text style={[styles.confText, { color: accent }]}>
                    {confPct}%
                  </Text>
                </View>
              </View>
              <Text style={styles.agentRole}>{assessment.role}</Text>
              <Text style={styles.perspectiveText}>
                {assessment.perspective}
              </Text>
              {assessment.key_actions.map((action, i) => (
                <View key={i} style={styles.keyActionRow}>
                  <View
                    style={[
                      styles.keyActionDot,
                      { backgroundColor: accent },
                    ]}
                  />
                  <Text style={styles.keyActionText}>{action}</Text>
                </View>
              ))}
            </View>
          </View>
        );
      })}

      {/* ── Coordinated Plan ── */}
      <View style={styles.planBox}>
        <View style={styles.planHeader}>
          <SymbolView
            name="bolt.fill"
            size={12}
            tintColor={colors.accent}
            resizeMode="scaleAspectFit"
          />
          <Text style={styles.planLabel}>COORDINATED PLAN</Text>
        </View>
        <Text style={styles.planText}>{result.coordinated_plan}</Text>
      </View>

      {/* ── Cross-Domain Risks ── */}
      {result.risks.length > 0 ? (
        <>
          <Text style={styles.sectionLabel}>CROSS-DOMAIN RISKS</Text>
          {result.risks.map((risk, i) => (
            <View key={i} style={styles.riskRow}>
              <SymbolView
                name="exclamationmark.triangle.fill"
                size={11}
                tintColor="#f59e0b"
                resizeMode="scaleAspectFit"
              />
              <Text style={styles.riskText}>{risk}</Text>
            </View>
          ))}
        </>
      ) : null}

      {/* ── Recommended Next Actions ── */}
      {result.recommended_next_actions.length > 0 ? (
        <View style={styles.actionsBox}>
          <View style={styles.actionsHeader}>
            <Text style={styles.actionsLabel}>RECOMMENDED NEXT ACTIONS</Text>
            <View style={styles.reviewBadge}>
              <Text style={styles.reviewBadgeText}>REVIEW ONLY</Text>
            </View>
          </View>
          {result.recommended_next_actions.map((action, i) => (
            <View key={i} style={styles.nextActionRow}>
              <Text style={styles.nextActionNum}>{i + 1}</Text>
              <Text style={styles.nextActionText}>{action}</Text>
            </View>
          ))}
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
    borderColor: `${colors.accent}40`,
    marginBottom: spacing.sm,
    overflow: "hidden",
  },

  accentBar: {
    height: 3,
    backgroundColor: colors.accent,
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xs,
  },

  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },

  headerLabel: {
    ...typography.label,
    color: colors.accent,
  },

  timestamp: {
    ...typography.label,
    color: colors.textMuted,
    fontSize: 9,
  },

  objectiveText: {
    fontSize: 14,
    fontWeight: "600" as const,
    color: colors.textPrimary,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    lineHeight: 20,
  },

  sectionLabel: {
    ...typography.label,
    color: colors.textMuted,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },

  // Assessment rows
  assessmentRow: {
    flexDirection: "row",
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    backgroundColor: colors.surfaceDark,
    borderRadius: radius.sm,
    overflow: "hidden",
  },

  assessmentAccentBar: {
    width: 3,
    flexShrink: 0,
  },

  assessmentBody: {
    flex: 1,
    padding: spacing.md,
    gap: 4,
  },

  assessmentHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 2,
  },

  agentName: {
    fontSize: 13,
    fontWeight: "700" as const,
  },

  confBadge: {
    borderRadius: 4,
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },

  confText: {
    ...typography.label,
    fontSize: 9,
  },

  agentRole: {
    ...typography.label,
    color: colors.textMuted,
    fontSize: 9,
    marginBottom: 4,
  },

  perspectiveText: {
    ...typography.caption,
    color: colors.textSecondary,
    lineHeight: 17,
    marginBottom: 4,
  },

  keyActionRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
  },

  keyActionDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    marginTop: 6,
    flexShrink: 0,
  },

  keyActionText: {
    ...typography.caption,
    color: colors.textSecondary,
    flex: 1,
    lineHeight: 17,
  },

  // Coordinated plan box
  planBox: {
    backgroundColor: colors.surfaceDark,
    borderRadius: radius.sm,
    padding: spacing.md,
    margin: spacing.lg,
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
    borderLeftWidth: 3,
    borderLeftColor: colors.accent,
  },

  planHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    marginBottom: spacing.xs,
  },

  planLabel: {
    ...typography.label,
    color: colors.accent,
  },

  planText: {
    ...typography.body,
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 21,
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

  // Recommended actions box
  actionsBox: {
    backgroundColor: `${colors.accentCyan}08`,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: `${colors.accentCyan}25`,
    padding: spacing.md,
    margin: spacing.lg,
    marginTop: spacing.sm,
    gap: 8,
  },

  actionsHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 2,
  },

  actionsLabel: {
    ...typography.label,
    color: colors.accentCyan,
    fontSize: 9,
  },

  reviewBadge: {
    backgroundColor: `${colors.accentCyan}20`,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },

  reviewBadgeText: {
    ...typography.label,
    color: colors.accentCyan,
    fontSize: 8,
  },

  nextActionRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
  },

  nextActionNum: {
    fontSize: 11,
    fontWeight: "700" as const,
    color: colors.accentCyan,
    width: 14,
    flexShrink: 0,
    paddingTop: 1,
  },

  nextActionText: {
    ...typography.caption,
    color: colors.textSecondary,
    flex: 1,
    lineHeight: 18,
  },
});
