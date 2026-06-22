import { useMemo } from "react";
import { View, Text, StyleSheet } from "react-native";
import { SymbolView } from "expo-symbols";

import { spacing, radius, typography , type ThemeColors } from "../theme/theme";
import { useTheme } from "../theme/ThemeContext";
import type { PlanResponse } from "../services/aiService";

type Props = PlanResponse;

export default function PlanCard({
  plan_title,
  summary,
  steps,
  estimated_timeline,
  risks,
  recommendation,
  generated_at,
}: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const time = new Date(generated_at).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <View style={styles.card}>
      <View style={styles.accentBar} />

      {/* Header */}
      <View style={styles.header}>
        <SymbolView
          name="sparkles"
          size={15}
          tintColor={colors.accentCyan}
          resizeMode="scaleAspectFit"
        />
        <Text style={styles.headerLabel}>HELIOS PLAN</Text>
      </View>

      <Text style={styles.planTitle}>{plan_title}</Text>
      <Text style={styles.summary}>{summary}</Text>

      {/* Steps */}
      <View style={styles.stepsHeader}>
        <SymbolView
          name="list.number"
          size={13}
          tintColor={colors.textMuted}
          resizeMode="scaleAspectFit"
        />
        <Text style={styles.sectionLabel}>EXECUTION STEPS</Text>
      </View>

      {steps.map((step) => (
        <View key={step.step_number} style={styles.stepRow}>
          <View style={styles.stepBadge}>
            <Text style={styles.stepNumber}>{step.step_number}</Text>
          </View>
          <View style={styles.stepBody}>
            <View style={styles.stepTitleRow}>
              <Text style={styles.stepTitle}>{step.title}</Text>
              <View style={styles.dayBadge}>
                <Text style={styles.dayText}>Day {step.day_target}</Text>
              </View>
            </View>
            <Text style={styles.stepDesc}>{step.description}</Text>
          </View>
        </View>
      ))}

      {/* Risks */}
      {risks.length > 0 ? (
        <>
          <Text style={[styles.sectionLabel, styles.riskLabel]}>RISKS</Text>
          {risks.map((risk) => (
            <View key={risk} style={styles.riskRow}>
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

      {/* Recommendation */}
      <View style={styles.recommendBox}>
        <View style={styles.recommendHeader}>
          <SymbolView
            name="lightbulb.fill"
            size={12}
            tintColor={colors.accentCyan}
            resizeMode="scaleAspectFit"
          />
          <Text style={styles.recommendLabel}>RECOMMENDATION</Text>
        </View>
        <Text style={styles.recommendText}>{recommendation}</Text>
      </View>

      {/* Footer */}
      <Text style={styles.timestamp}>
        Generated {time} · {estimated_timeline} horizon
      </Text>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: spacing.md,
    overflow: "hidden",
  },

  accentBar: {
    height: 3,
    backgroundColor: colors.accentCyan,
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
  },

  headerLabel: {
    ...typography.label,
    color: colors.accentCyan,
  },

  planTitle: {
    ...typography.title,
    color: colors.textPrimary,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },

  summary: {
    ...typography.body,
    color: colors.textSecondary,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
  },

  stepsHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },

  sectionLabel: {
    ...typography.label,
    color: colors.textMuted,
  },

  stepRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },

  stepBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    marginTop: 1,
  },

  stepNumber: {
    fontSize: 11,
    fontWeight: "800" as const,
    color: colors.textPrimary,
  },

  stepBody: {
    flex: 1,
  },

  stepTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 3,
  },

  stepTitle: {
    fontSize: 14,
    fontWeight: "600" as const,
    color: colors.textPrimary,
    flex: 1,
  },

  dayBadge: {
    backgroundColor: colors.surfaceDark,
    borderRadius: 6,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    marginLeft: spacing.sm,
  },

  dayText: {
    ...typography.label,
    color: colors.textMuted,
    fontSize: 9,
  },

  stepDesc: {
    ...typography.caption,
    color: colors.textMuted,
    lineHeight: 18,
  },

  riskLabel: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
    marginTop: spacing.xs,
  },

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
  },

  recommendBox: {
    backgroundColor: colors.surfaceDark,
    borderRadius: radius.sm,
    padding: spacing.md,
    margin: spacing.lg,
    marginTop: spacing.sm,
  },

  recommendHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    marginBottom: spacing.xs,
  },

  recommendLabel: {
    ...typography.label,
    color: colors.accentCyan,
  },

  recommendText: {
    ...typography.body,
    color: colors.textSecondary,
  },

  timestamp: {
    ...typography.caption,
    color: colors.textMuted,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    paddingTop: spacing.xs,
  },
});
}
