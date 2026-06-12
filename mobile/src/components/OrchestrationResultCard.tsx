import { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { SymbolView } from "expo-symbols";

import { colors, spacing, radius, typography } from "../theme/theme";
import type { OrchestrationResponse } from "../services/orchestrationService";
import type { RecommendedAction } from "../store";
import { ACTION_TYPE_LABELS } from "./ActionReviewModal";

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
  onReview,
  acknowledgedIds,
}: {
  result: OrchestrationResponse;
  onReview: (action: RecommendedAction) => void;
  acknowledgedIds: Set<string>;
}) {
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
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

      {/* ── Consensus Summary (V3.11) ── */}
      {result.consensus_summary ? (
        <View style={styles.consensusBox}>
          <View style={styles.consensusHeader}>
            <SymbolView name="checkmark.seal.fill" size={12} tintColor="#22c55e" resizeMode="scaleAspectFit" />
            <Text style={styles.consensusLabel}>AGENT CONSENSUS</Text>
            {result.overall_confidence > 0 ? (
              <View style={styles.overallConfBadge}>
                <Text style={styles.overallConfText}>
                  {Math.round(result.overall_confidence * 100)}% confidence
                </Text>
              </View>
            ) : null}
          </View>
          <Text style={styles.consensusText}>{result.consensus_summary}</Text>
          {result.disagreements.length > 0 ? (
            <>
              <Text style={styles.disagreementsLabel}>DIVERGENT VIEWS</Text>
              {result.disagreements.map((d, i) => (
                <View key={i} style={styles.disagreementRow}>
                  <SymbolView name="arrow.triangle.branch" size={10} tintColor="#f59e0b" resizeMode="scaleAspectFit" />
                  <Text style={styles.disagreementText}>{d}</Text>
                </View>
              ))}
            </>
          ) : null}
        </View>
      ) : null}

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

      {/* ── Actionable Recommendations ── */}
      {result.actionable_recommendations.filter((a) => !dismissedIds.has(a.id)).length > 0 ? (
        <View style={styles.execBox}>
          <View style={styles.actionsHeader}>
            <Text style={styles.execLabel}>ACTIONABLE RECOMMENDATIONS</Text>
            <View style={styles.execBadge}>
              <Text style={styles.execBadgeText}>CONFIRM TO EXECUTE</Text>
            </View>
          </View>
          {result.actionable_recommendations
            .filter((a) => !dismissedIds.has(a.id))
            .map((action) => {
              const isAck = acknowledgedIds.has(action.id);
              const confPct = Math.round(action.confidence * 100);
              return (
                <View key={action.id} style={styles.execActionCard}>
                  <View style={styles.execActionHeader}>
                    <Text style={styles.execActionType}>
                      {ACTION_TYPE_LABELS[action.type] ?? action.type}
                    </Text>
                    <Text style={styles.execConfText}>{confPct}%</Text>
                  </View>
                  <Text style={styles.execActionTitle}>{action.title}</Text>
                  <Text style={styles.execActionDesc}>{action.description}</Text>
                  {isAck ? (
                    <View style={styles.execAckBadge}>
                      <Text style={styles.execAckText}>✓ Confirmed</Text>
                    </View>
                  ) : (
                    <View style={styles.execButtons}>
                      <TouchableOpacity
                        style={styles.execReviewBtn}
                        onPress={() => onReview(action)}
                      >
                        <Text style={styles.execReviewBtnText}>REVIEW</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.execNotNowBtn}
                        onPress={() =>
                          setDismissedIds((prev) => new Set([...prev, action.id]))
                        }
                      >
                        <Text style={styles.execNotNowBtnText}>NOT NOW</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              );
            })}
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

  // Actionable recommendations — structured actions that flow into ActionReviewModal
  execBox: {
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: `${colors.accent}30`,
    backgroundColor: `${colors.accent}08`,
    padding: spacing.md,
    margin: spacing.lg,
    marginTop: spacing.sm,
    gap: spacing.sm,
  },

  execLabel: {
    ...typography.label,
    color: colors.accent,
    fontSize: 9,
  },

  execBadge: {
    backgroundColor: `${colors.accent}20`,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },

  execBadgeText: {
    ...typography.label,
    color: colors.accent,
    fontSize: 8,
  },

  execActionCard: {
    backgroundColor: colors.surfaceDark,
    borderRadius: radius.sm,
    padding: spacing.md,
    gap: 4,
  },

  execActionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 2,
  },

  execActionType: {
    ...typography.label,
    color: colors.textMuted,
    fontSize: 9,
  },

  execConfText: {
    ...typography.label,
    color: colors.accent,
    fontSize: 9,
  },

  execActionTitle: {
    fontSize: 13,
    fontWeight: "600" as const,
    color: colors.textPrimary,
    lineHeight: 18,
  },

  execActionDesc: {
    ...typography.caption,
    color: colors.textSecondary,
    lineHeight: 17,
  },

  execAckBadge: {
    alignSelf: "flex-start" as const,
    backgroundColor: "#10b98120",
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "#10b98140",
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    marginTop: spacing.xs,
  },

  execAckText: {
    ...typography.label,
    color: "#10b981",
    fontSize: 10,
  },

  execButtons: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.xs,
  },

  execReviewBtn: {
    flex: 1,
    backgroundColor: colors.accent,
    borderRadius: radius.sm,
    paddingVertical: spacing.sm,
    alignItems: "center",
  },

  execReviewBtnText: {
    ...typography.label,
    color: colors.background,
    fontSize: 11,
  },

  execNotNowBtn: {
    flex: 1,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.sm,
    alignItems: "center",
  },

  execNotNowBtnText: {
    ...typography.label,
    color: colors.textMuted,
    fontSize: 11,
  },

  consensusBox: {
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: "rgba(34, 197, 94, 0.25)",
    backgroundColor: "rgba(34, 197, 94, 0.06)",
    padding: spacing.md,
    margin: spacing.lg,
    marginTop: 0,
    gap: spacing.xs,
  },
  consensusHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    marginBottom: 2,
  },
  consensusLabel: {
    fontSize: 9,
    fontWeight: "700" as const,
    letterSpacing: 1.2,
    color: "#22c55e",
    flex: 1,
  },
  overallConfBadge: {
    backgroundColor: "rgba(34, 197, 94, 0.15)",
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: "rgba(34, 197, 94, 0.3)",
  },
  overallConfText: {
    fontSize: 9,
    fontWeight: "700" as const,
    color: "#22c55e",
  },
  consensusText: {
    ...typography.caption,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  disagreementsLabel: {
    fontSize: 9,
    fontWeight: "700" as const,
    letterSpacing: 1,
    color: "#f59e0b",
    marginTop: spacing.xs,
  },
  disagreementRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.xs,
    marginTop: 3,
  },
  disagreementText: {
    ...typography.caption,
    color: colors.textSecondary,
    flex: 1,
    lineHeight: 16,
  },
});
