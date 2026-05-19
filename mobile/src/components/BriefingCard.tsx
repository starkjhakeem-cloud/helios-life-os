import { View, Text, StyleSheet } from "react-native";
import { SymbolView } from "expo-symbols";

import { colors, spacing, radius, typography } from "../theme/theme";

type Priority = {
  label: string;
  detail: string;
};

type Props = {
  summary: string;
  priorities: Priority[];
  risks: string[];
  recommendation: string;
  generated_at: string;
};

export default function BriefingCard({
  summary,
  priorities,
  risks,
  recommendation,
  generated_at,
}: Props) {
  const time = new Date(generated_at).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <View style={styles.card}>
      <View style={styles.accentBar} />

      <View style={styles.header}>
        <SymbolView name="brain" size={15} tintColor={colors.accentCyan} resizeMode="scaleAspectFit" />
        <Text style={styles.headerLabel}>HELIOS INTELLIGENCE</Text>
      </View>

      <Text style={styles.summary}>{summary}</Text>

      <Text style={styles.sectionLabel}>PRIORITIES</Text>
      {priorities.map((p) => (
        <View key={p.label} style={styles.priorityRow}>
          <View style={styles.priorityDot} />
          <View style={styles.priorityBody}>
            <Text style={styles.priorityLabel}>{p.label}</Text>
            <Text style={styles.priorityDetail}>{p.detail}</Text>
          </View>
        </View>
      ))}

      {risks.length > 0 ? (
        <>
          <Text style={[styles.sectionLabel, styles.riskSectionLabel]}>RISKS</Text>
          {risks.map((risk) => (
            <View key={risk} style={styles.riskRow}>
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

      <Text style={styles.timestamp}>Generated {time}</Text>
    </View>
  );
}

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
  summary: {
    ...typography.body,
    color: colors.textSecondary,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
  },
  sectionLabel: {
    ...typography.label,
    color: colors.textMuted,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  riskSectionLabel: {
    marginTop: spacing.xs,
  },
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
    color: "#f59e0b",
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
