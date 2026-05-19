import { useEffect } from "react";
import {
  View,
  Text,
  ActivityIndicator,
  StyleSheet,
  ScrollView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import AgentCard from "../../components/AgentCard";
import { colors, spacing, radius, typography } from "../../theme/theme";
import { useAgentsStore, useAuthStore } from "../../store";

export default function AgentsScreen() {
  const insets = useSafeAreaInsets();
  const accessToken = useAuthStore((s) => s.accessToken);
  const { agents, isLoading, error, fetchAgents } = useAgentsStore();

  useEffect(() => {
    if (accessToken) {
      fetchAgents(accessToken);
    }
  }, [accessToken, fetchAgents]);

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={[
        styles.container,
        { paddingTop: insets.top + spacing.md },
      ]}
    >
      <View style={styles.heroCard}>
        <Text style={styles.heroLabel}>HELIOS AGENTS</Text>
        <Text style={styles.heroTitle}>Specialized Intelligence</Text>
        <Text style={styles.heroSubtitle}>
          Five autonomous agents monitoring your life systems in real time.
        </Text>
      </View>

      <View style={styles.sectionHeaderRow}>
        <Text style={styles.sectionLabel}>AGENT ROSTER</Text>
        {isLoading ? (
          <ActivityIndicator size="small" color={colors.accentCyan} />
        ) : null}
      </View>

      {error ? (
        <Text style={styles.errorText}>{error}</Text>
      ) : null}

      {agents.map((agent) => (
        <AgentCard key={agent.id} {...agent} />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl * 2,
  },

  heroCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.lg,
  },

  heroLabel: {
    ...typography.label,
    color: colors.accent,
    marginBottom: spacing.md,
  },

  heroTitle: {
    ...typography.displaySmall,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },

  heroSubtitle: {
    ...typography.body,
    color: colors.textMuted,
  },

  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.sm,
  },

  sectionLabel: {
    ...typography.label,
    color: colors.textMuted,
  },

  errorText: {
    ...typography.caption,
    color: "#ef4444",
    marginBottom: spacing.sm,
  },
});
