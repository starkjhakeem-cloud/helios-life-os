import { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  ActivityIndicator,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  TextInput,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import AgentCard from "../../components/AgentCard";
import PlanCard from "../../components/PlanCard";
import { colors, spacing, radius, typography } from "../../theme/theme";
import { useAgentsStore, useAIStore, useAuthStore, useGoalsStore } from "../../store";

const HORIZONS: { label: string; days: number }[] = [
  { label: "7D",  days: 7  },
  { label: "14D", days: 14 },
  { label: "30D", days: 30 },
  { label: "90D", days: 90 },
];

export default function AgentsScreen() {
  const insets = useSafeAreaInsets();
  const accessToken = useAuthStore((s) => s.accessToken);

  const {
    agents,
    agentContextMap,
    isLoading: agentsLoading,
    isContextLoading,
    error: agentsError,
    fetchAgents,
    fetchAgentContext,
  } = useAgentsStore();

  const { plan, isPlanLoading, planError, generatePlan, clearPlan } = useAIStore();
  const { goals } = useGoalsStore();

  const [prompt, setPrompt] = useState("");
  const [horizonDays, setHorizonDays] = useState(30);
  const [linkedGoalId, setLinkedGoalId] = useState<string | null>(null);
  const [promptError, setPromptError] = useState<string | null>(null);
  const [expandedAgentId, setExpandedAgentId] = useState<string | null>(null);

  const load = useCallback(() => {
    if (accessToken) fetchAgents(accessToken);
  }, [accessToken, fetchAgents]);

  useEffect(() => {
    load();
  }, [load]);

  function handleExpand(agentId: string) {
    setExpandedAgentId(agentId);
    // Fetch context only on first expand (cache hit skips re-fetch in store)
    if (expandedAgentId !== agentId && accessToken && !agentContextMap[agentId]) {
      fetchAgentContext(accessToken, agentId);
    }
  }

  async function handleGenerate() {
    if (!accessToken) return;
    if (!prompt.trim()) {
      setPromptError("Describe what you want to plan.");
      return;
    }
    setPromptError(null);
    await generatePlan(accessToken, {
      prompt: prompt.trim(),
      planning_horizon_days: horizonDays,
      goal_id: linkedGoalId ?? undefined,
    });
  }

  const activeAgents = agents.filter((a) => a.status === "active");
  const standbyAgents = agents.filter((a) => a.status !== "active");
  const activeGoals = goals.filter((g) => g.status === "active");

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={[
        styles.container,
        { paddingTop: insets.top + spacing.md },
      ]}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        <RefreshControl
          refreshing={agentsLoading}
          onRefresh={load}
          tintColor={colors.accentCyan}
        />
      }
    >
      {/* ── Hero ── */}
      <View style={styles.heroCard}>
        <Text style={styles.heroLabel}>HELIOS AGENTS</Text>
        <Text style={styles.heroTitle}>Specialized Intelligence</Text>
        <Text style={styles.heroSubtitle}>
          {agents.length > 0
            ? `${activeAgents.length} active · ${standbyAgents.length} on standby · tap an agent to inspect capabilities`
            : "Intelligent agents monitoring your life systems."}
        </Text>
      </View>

      {/* ── Active agents ── */}
      <View style={styles.sectionHeaderRow}>
        <Text style={styles.sectionLabel}>ACTIVE AGENTS</Text>
        {agentsLoading ? (
          <ActivityIndicator size="small" color={colors.accentCyan} />
        ) : null}
      </View>

      {agentsError ? (
        <Text style={styles.errorText}>{agentsError}</Text>
      ) : null}

      {activeAgents.map((agent) => (
        <AgentCard
          key={agent.id}
          agent={agent}
          agentContext={agentContextMap[agent.id] ?? null}
          isContextLoading={isContextLoading && expandedAgentId === agent.id}
          onExpand={handleExpand}
        />
      ))}

      {/* ── Standby agents ── */}
      {standbyAgents.length > 0 ? (
        <>
          <Text style={[styles.sectionLabel, styles.sectionLabelSpaced]}>
            STANDBY AGENTS
          </Text>
          {standbyAgents.map((agent) => (
            <AgentCard
              key={agent.id}
              agent={agent}
              agentContext={agentContextMap[agent.id] ?? null}
              isContextLoading={isContextLoading && expandedAgentId === agent.id}
              onExpand={handleExpand}
            />
          ))}
        </>
      ) : null}

      {/* ── Divider ── */}
      <View style={styles.divider} />

      {/* ── AI Planner ── */}
      <View style={styles.sectionHeaderRow}>
        <Text style={styles.sectionLabel}>AI PLANNER</Text>
      </View>

      <View style={styles.plannerCard}>
        <Text style={styles.plannerHint}>
          Describe an objective and HELIOS will generate a structured execution plan.
        </Text>

        <Text style={styles.fieldLabel}>OBJECTIVE</Text>
        <TextInput
          style={[styles.promptInput, promptError ? styles.promptInputError : null]}
          placeholder="e.g. Build and launch a mobile app in 30 days"
          placeholderTextColor={colors.textMuted}
          value={prompt}
          onChangeText={(t) => { setPrompt(t); setPromptError(null); }}
          multiline
          numberOfLines={3}
          textAlignVertical="top"
        />
        {promptError ? (
          <Text style={styles.fieldError}>{promptError}</Text>
        ) : null}

        <Text style={styles.fieldLabel}>PLANNING HORIZON</Text>
        <View style={styles.horizonRow}>
          {HORIZONS.map(({ label, days }) => (
            <TouchableOpacity
              key={days}
              style={[styles.horizonChip, horizonDays === days && styles.horizonChipActive]}
              onPress={() => setHorizonDays(days)}
            >
              <Text style={[styles.horizonChipText, horizonDays === days && styles.horizonChipTextActive]}>
                {label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {activeGoals.length > 0 ? (
          <>
            <Text style={styles.fieldLabel}>LINK TO GOAL</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.goalScroll}
              contentContainerStyle={styles.goalScrollContent}
            >
              <TouchableOpacity
                style={[styles.goalChip, linkedGoalId === null && styles.goalChipActive]}
                onPress={() => setLinkedGoalId(null)}
              >
                <Text style={[styles.goalChipText, linkedGoalId === null && styles.goalChipTextActive]}>
                  None
                </Text>
              </TouchableOpacity>
              {activeGoals.map((g) => (
                <TouchableOpacity
                  key={g.id}
                  style={[styles.goalChip, linkedGoalId === g.id && styles.goalChipActive]}
                  onPress={() => setLinkedGoalId(g.id)}
                >
                  <Text
                    style={[styles.goalChipText, linkedGoalId === g.id && styles.goalChipTextActive]}
                    numberOfLines={1}
                  >
                    {g.title}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </>
        ) : null}

        <TouchableOpacity
          style={[styles.generateButton, isPlanLoading && styles.generateButtonDisabled]}
          onPress={handleGenerate}
          disabled={isPlanLoading}
        >
          {isPlanLoading ? (
            <ActivityIndicator size="small" color={colors.textPrimary} />
          ) : null}
          <Text style={styles.generateButtonText}>
            {isPlanLoading ? "GENERATING..." : "GENERATE PLAN"}
          </Text>
        </TouchableOpacity>

        {planError ? (
          <Text style={[styles.fieldError, { marginTop: spacing.sm }]}>{planError}</Text>
        ) : null}
      </View>

      {plan ? (
        <>
          <PlanCard {...plan} />
          <TouchableOpacity style={styles.clearButton} onPress={clearPlan}>
            <Text style={styles.clearButtonText}>CLEAR PLAN</Text>
          </TouchableOpacity>
        </>
      ) : null}
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

  sectionLabelSpaced: {
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },

  errorText: {
    ...typography.caption,
    color: "#ef4444",
    marginBottom: spacing.sm,
  },

  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.lg,
  },

  plannerCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.sm,
  },

  plannerHint: {
    ...typography.body,
    color: colors.textMuted,
    marginBottom: spacing.lg,
  },

  fieldLabel: {
    ...typography.label,
    color: colors.textMuted,
    marginBottom: spacing.sm,
  },

  promptInput: {
    backgroundColor: colors.surfaceDark,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.borderDark,
    color: colors.textPrimary,
    ...typography.body,
    padding: spacing.md,
    minHeight: 80,
    marginBottom: spacing.md,
  },

  promptInputError: {
    borderColor: "#ef4444",
  },

  fieldError: {
    ...typography.caption,
    color: "#ef4444",
    marginBottom: spacing.sm,
  },

  horizonRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },

  horizonChip: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
  },

  horizonChipActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },

  horizonChipText: {
    ...typography.label,
    color: colors.textMuted,
  },

  horizonChipTextActive: {
    color: colors.textPrimary,
  },

  goalScroll: {
    marginBottom: spacing.lg,
  },

  goalScrollContent: {
    gap: spacing.sm,
    paddingRight: spacing.sm,
  },

  goalChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceDark,
    maxWidth: 180,
  },

  goalChipActive: {
    borderColor: colors.accent,
    backgroundColor: "rgba(124,58,237,0.15)",
  },

  goalChipText: {
    ...typography.caption,
    color: colors.textMuted,
  },

  goalChipTextActive: {
    color: colors.accent,
  },

  generateButton: {
    backgroundColor: colors.accentCyan,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: spacing.sm,
  },

  generateButtonDisabled: {
    opacity: 0.6,
  },

  generateButtonText: {
    ...typography.label,
    color: colors.background,
    fontSize: 13,
  },

  clearButton: {
    alignItems: "center",
    paddingVertical: spacing.md,
  },

  clearButtonText: {
    ...typography.label,
    color: colors.textMuted,
  },
});
