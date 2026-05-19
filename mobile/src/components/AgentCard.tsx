import { View, Text, StyleSheet } from "react-native";
import { SymbolView } from "expo-symbols";

import { colors, spacing, radius, typography } from "../theme/theme";
import type { AgentProfile } from "../services/agentsService";

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

type Props = AgentProfile;

export default function AgentCard({
  id,
  name,
  role,
  status,
  description,
  priority,
}: Props) {
  const dotColor = STATUS_COLOR[status] ?? colors.textMuted;
  const iconName = (AGENT_ICON[id] ?? "cpu") as Parameters<typeof SymbolView>[0]["name"];

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.iconWrap}>
          <SymbolView
            name={iconName}
            size={18}
            tintColor={colors.accent}
            resizeMode="scaleAspectFit"
          />
        </View>

        <View style={styles.headerText}>
          <Text style={styles.name}>{name}</Text>
          <Text style={styles.role}>{role}</Text>
        </View>

        <Text style={styles.priority}>#{priority}</Text>
      </View>

      <Text style={styles.description}>{description}</Text>

      <View style={styles.footer}>
        <View style={[styles.statusDot, { backgroundColor: dotColor }]} />
        <Text style={[styles.statusLabel, { color: dotColor }]}>
          {status.toUpperCase()}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    marginBottom: spacing.md,
  },

  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceDark,
    borderWidth: 1,
    borderColor: colors.borderDark,
    alignItems: "center",
    justifyContent: "center",
  },

  headerText: {
    flex: 1,
  },

  name: {
    ...typography.title,
    color: colors.textPrimary,
    marginBottom: 2,
  },

  role: {
    ...typography.caption,
    color: colors.textMuted,
  },

  priority: {
    ...typography.label,
    color: colors.accent,
  },

  description: {
    ...typography.body,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },

  footer: {
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
  },
});
