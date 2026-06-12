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

import ActionReviewModal from "../../components/ActionReviewModal";
import AgentCard from "../../components/AgentCard";
import OrchestrationResultCard from "../../components/OrchestrationResultCard";
import PlanCard from "../../components/PlanCard";
import { colors, spacing, radius, typography } from "../../theme/theme";
import { useTheme } from "../../theme/ThemeContext";
import {
  useAgentsStore,
  useAIStore,
  useAuthStore,
  useGoalsStore,
  useOrchestrationStore,
  type RecommendedAction,
} from "../../store";

const HORIZONS: { label: string; days: number }[] = [
  { label: "7D",  days: 7  },
  { label: "14D", days: 14 },
  { label: "30D", days: 30 },
  { label: "90D", days: 90 },
];

const ORCH_ACCENT: Record<string, string> = {
  strategy: "#7c3aed",
  finance:  "#10b981",
  study:    "#22d3ee",
  health:   "#ef4444",
  career:   "#f59e0b",
};

export default function AgentsScreen() {
  const { colors } = useTheme();
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
  const {
    result: orchResult,
    isLoading: isOrchLoading,
    error: orchError,
    orchestrate,
    clearResult: clearOrchResult,
  } = useOrchestrationStore();

  const [prompt, setPrompt] = useState("");
  const [horizonDays, setHorizonDays] = useState(30);
  const [linkedGoalId, setLinkedGoalId] = useState<string | null>(null);
  const [promptError, setPromptError] = useState<string | null>(null);
  const [expandedAgentId, setExpandedAgentId] = useState<string | null>(null);
  const [orchObjective, setOrchObjective] = useState("");
  const [orchSelectedIds, setOrchSelectedIds] = useState<string[] | null>(null);
  const [orchObjectiveError, setOrchObjectiveError] = useState<string | null>(null);
  const [reviewingAction, setReviewingAction] = useState<RecommendedAction | null>(null);
  const [orchAcknowledgedIds, setOrchAcknowledgedIds] = useState<Set<string>>(new Set());

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

  function toggleAgentSelection(agentId: string) {
    if (orchSelectedIds === null) {
      // All currently selected — deselect this one
      const next = agents.map((a) => a.id).filter((id) => id !== agentId);
      setOrchSelectedIds(next);
    } else if (orchSelectedIds.includes(agentId)) {
      if (orchSelectedIds.length === 1) return; // always keep at least one
      const next = orchSelectedIds.filter((id) => id !== agentId);
      // Normalise back to null (all) if every agent is now included
      setOrchSelectedIds(next.length === agents.length ? null : next);
    } else {
      const next = [...orchSelectedIds, agentId];
      setOrchSelectedIds(next.length === agents.length ? null : next);
    }
  }

  async function handleOrchestrate() {
    if (!accessToken) return;
    if (!orchObjective.trim()) {
      setOrchObjectiveError("Describe the objective for orchestration.");
      return;
    }
    setOrchObjectiveError(null);
    await orchestrate(accessToken, {
      objective: orchObjective.trim(),
      selected_agent_ids: orchSelectedIds ?? undefined,
      context_scope: "daily_briefing",
    });
  }

  function handleOrchReview(action: RecommendedAction) {
    setReviewingAction(action);
  }

  function handleOrchAcknowledge(id: string) {
    setOrchAcknowledgedIds((prev) => new Set([...prev, id]));
    setReviewingAction(null);
  }

  function handleCancelReview() {
    setReviewingAction(null);
  }

  const activeAgents = agents.filter((a) => a.status === "active");
  const standbyAgents = agents.filter((a) => a.status !== "active");
  const activeGoals = goals.filter((g) => g.status === "active");

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
    <ScrollView
      style={{ flex: 1 }}
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

      {/* ── Divider ── */}
      <View style={styles.divider} />

      {/* ── Agent Orchestration ── */}
      <View style={styles.sectionHeaderRow}>
        <Text style={styles.sectionLabel}>AGENT ORCHESTRATION</Text>
        {isOrchLoading ? (
          <ActivityIndicator size="small" color={colors.accent} />
        ) : null}
      </View>

      <View style={styles.plannerCard}>
        <Text style={styles.plannerHint}>
          Coordinate all agents around a shared objective for a multi-domain
          assessment. No actions are executed automatically.
        </Text>

        <Text style={styles.fieldLabel}>OBJECTIVE</Text>
        <TextInput
          style={[
            styles.promptInput,
            orchObjectiveError ? styles.promptInputError : null,
          ]}
          placeholder="e.g. Launch a freelance consulting practice in 60 days"
          placeholderTextColor={colors.textMuted}
          value={orchObjective}
          onChangeText={(t) => {
            setOrchObjective(t);
            setOrchObjectiveError(null);
          }}
          multiline
          numberOfLines={3}
          textAlignVertical="top"
        />
        {orchObjectiveError ? (
          <Text style={styles.fieldError}>{orchObjectiveError}</Text>
        ) : null}

        {agents.length > 0 ? (
          <>
            <Text style={styles.fieldLabel}>PARTICIPATING AGENTS</Text>
            <View style={styles.orchAgentRow}>
              {agents.map((agent) => {
                const isSelected =
                  orchSelectedIds === null ||
                  orchSelectedIds.includes(agent.id);
                const accent = ORCH_ACCENT[agent.id] ?? colors.textMuted;
                return (
                  <TouchableOpacity
                    key={agent.id}
                    style={[
                      styles.orchAgentChip,
                      isSelected && {
                        borderColor: `${accent}80`,
                        backgroundColor: `${accent}18`,
                      },
                    ]}
                    onPress={() => toggleAgentSelection(agent.id)}
                  >
                    <Text
                      style={[
                        styles.orchAgentChipText,
                        isSelected && { color: accent },
                      ]}
                    >
                      {agent.name.replace(" Agent", "")}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </>
        ) : null}

        <TouchableOpacity
          style={[
            styles.generateButton,
            styles.orchButton,
            isOrchLoading && styles.generateButtonDisabled,
          ]}
          onPress={handleOrchestrate}
          disabled={isOrchLoading}
        >
          {isOrchLoading ? (
            <ActivityIndicator size="small" color={colors.textPrimary} />
          ) : null}
          <Text style={styles.generateButtonText}>
            {isOrchLoading ? "ORCHESTRATING..." : "ORCHESTRATE"}
          </Text>
        </TouchableOpacity>

        {orchError ? (
          <Text style={[styles.fieldError, { marginTop: spacing.sm }]}>
            {orchError}
          </Text>
        ) : null}
      </View>

      {orchResult ? (
        <>
          <OrchestrationResultCard
            result={orchResult}
            onReview={handleOrchReview}
            acknowledgedIds={orchAcknowledgedIds}
          />
          <TouchableOpacity style={styles.clearButton} onPress={clearOrchResult}>
            <Text style={styles.clearButtonText}>CLEAR RESULT</Text>
          </TouchableOpacity>
        </>
      ) : null}
    </ScrollView>
    <ActionReviewModal
      action={reviewingAction}
      onConfirm={handleOrchAcknowledge}
      onCancel={handleCancelReview}
    />
    </View>
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

  // Orchestration
  orchButton: {
    backgroundColor: colors.accent,
    marginTop: spacing.sm,
  },

  orchAgentRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },

  orchAgentChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceDark,
  },

  orchAgentChipText: {
    ...typography.label,
    color: colors.textMuted,
    fontSize: 11,
  },
});
