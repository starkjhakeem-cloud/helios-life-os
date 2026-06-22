import { useCallback, useEffect, useState, useMemo } from 'react';
import {
  View,
  Text,
  ActivityIndicator,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SymbolView } from "expo-symbols";

import { spacing, radius, typography , type ThemeColors } from "../../theme/theme";
import { useTheme } from "../../theme/ThemeContext";
import { useAuthStore, useAutonomyStore, useNotificationsStore, useBackgroundJobsStore } from "../../store";
import type {
  AutonomyAuditLogEntry,
  AutonomyExecuteResult,
  AutonomyQueueItem,
  AutonomyRule,
  AutonomyRuleCreate,
  DailyPlan,
  FocusBlock,
  PriorityTask,
  QueueStatus,
  RiskLevel,
  SuggestionItem,
} from "../../store";

// ── Constants ─────────────────────────────────────────────────────────────────

function getEnergyColors(c: ThemeColors): Record<string, string> {
  return { high: c.accent, medium: c.warning, low: c.textMuted };
}
function getPriorityColors(c: ThemeColors): Record<string, string> {
  return { critical: c.danger, high: c.warning, medium: c.accentCyan, low: c.textMuted };
}
function getRiskColors(c: ThemeColors): Record<string, string> {
  return { low: c.success, medium: c.warning, high: c.danger };
}
function getStatusColors(c: ThemeColors): Record<string, string> {
  return { pending: c.accentCyan, approved: c.success, rejected: c.textMuted, completed: c.textMuted };
}

const AGENT_LABELS: Record<string, string> = {
  strategy_agent:       "STRATEGY",
  task_manager:         "TASKS",
  analytics_engine:     "ANALYTICS",
  calendar_intelligence: "CALENDAR",
  email_intelligence:   "EMAIL",
};

function agentLabel(name: string): string {
  return AGENT_LABELS[name] ?? name.replace(/_/g, " ").toUpperCase();
}

// ── Shared badge ──────────────────────────────────────────────────────────────

type BadgeProps = { label: string; color: string };

function Badge({
label, color }: BadgeProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={[styles.badge, { borderColor: color }]}>
      <Text style={[styles.badgeText, { color }]}>{label}</Text>
    </View>
  );
}

// ── Suggestion card ───────────────────────────────────────────────────────────

type SuggestionCardProps = {
  item: SuggestionItem;
  isQueued: boolean;
  isMutating: boolean;
  onAddToQueue: (suggestion: SuggestionItem) => void;
};

function SuggestionCard({
item, isQueued, isMutating, onAddToQueue }: SuggestionCardProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const handleAdd = () => {
    Alert.alert(
      "Add to Queue",
      `Add "${item.title}" to the autonomy queue for review?\n\nYou can approve and execute it from the queue.`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Add to Queue", onPress: () => onAddToQueue(item) },
      ],
    );
  };

  return (
    <View style={[styles.card, isQueued && styles.cardQueued]}>
      {/* Header row */}
      <View style={styles.cardHeader}>
        <View style={styles.cardMeta}>
          <Badge label={agentLabel(item.source_agent)} color={colors.accent} />
          <Badge label={item.risk_level.toUpperCase()} color={getRiskColors(colors)[item.risk_level] ?? colors.textMuted} />
        </View>
        <Badge
          label={item.suggested_action_type.replace(/_/g, " ").toUpperCase()}
          color={colors.accentCyan}
        />
      </View>

      <Text style={styles.cardTitle}>{item.title}</Text>
      <Text style={styles.cardDescription}>{item.description}</Text>

      {/* Reason */}
      <View style={styles.reasonBox}>
        <Text style={styles.reasonLabel}>WHY HELIOS SUGGESTS THIS</Text>
        <Text style={styles.reasonText}>{item.reason}</Text>
      </View>

      {/* Add to Queue button */}
      {isQueued ? (
        <View style={styles.queuedRow}>
          <SymbolView
            name="checkmark.circle.fill"
            size={14}
            tintColor={colors.success}
            resizeMode="scaleAspectFit"
          />
          <Text style={styles.queuedText}>Added to Queue</Text>
        </View>
      ) : (
        <TouchableOpacity
          style={[styles.actionBtn, styles.addToQueueBtn, isMutating && styles.btnDisabled]}
          onPress={handleAdd}
          disabled={isMutating}
          activeOpacity={0.75}
        >
          <Text style={styles.addToQueueBtnText}>Add to Queue</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// ── Queue card ────────────────────────────────────────────────────────────────

type QueueCardProps = {
  item: AutonomyQueueItem;
  isMutating: boolean;
  isExecuting: boolean;
  isBlocked: boolean;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onExecute: (id: string) => void;
};

function QueueCard({
  item,
  isMutating,
  isExecuting,
  isBlocked,
  onApprove,
  onReject,
  onExecute,
}: QueueCardProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const isPending  = item.status === "pending";
  const isApproved = item.status === "approved";

  const handleApprove = () => {
    Alert.alert(
      "Approve Action",
      `Approve "${item.title}"?\n\nNo automatic execution will occur.`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Approve", onPress: () => onApprove(item.id) },
      ],
    );
  };

  const handleReject = () => {
    Alert.alert(
      "Reject Action",
      `Reject "${item.title}"?`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Reject", style: "destructive", onPress: () => onReject(item.id) },
      ],
    );
  };

  const handleExecute = () => {
    Alert.alert(
      "Execute Action",
      `Execute "${item.title}"?\n\nThis will run the proposed action now. This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Execute", onPress: () => onExecute(item.id) },
      ],
    );
  };

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.cardMeta}>
          <Badge
            label={item.risk_level.toUpperCase()}
            color={getRiskColors(colors)[item.risk_level] ?? colors.textMuted}
          />
          <Badge
            label={item.status.toUpperCase()}
            color={getStatusColors(colors)[item.status] ?? colors.textMuted}
          />
        </View>
        <Text style={styles.cardAgent}>{agentLabel(item.source_agent)}</Text>
      </View>

      <Text style={styles.cardTitle}>{item.title}</Text>
      <Text style={styles.cardActionType}>
        {item.proposed_action_type.replace(/_/g, " ").toUpperCase()}
      </Text>

      {item.description ? (
        <Text style={styles.cardDescription} numberOfLines={3}>{item.description}</Text>
      ) : null}

      {Object.keys(item.payload_preview).length > 0 ? (
        <View style={styles.payloadBox}>
          {Object.entries(item.payload_preview)
            .slice(0, 4)
            .map(([k, v]) => (
              <Text key={k} style={styles.payloadRow} numberOfLines={1}>
                <Text style={styles.payloadKey}>{k}: </Text>
                <Text style={styles.payloadVal}>{String(v)}</Text>
              </Text>
            ))}
        </View>
      ) : null}

      <Text style={styles.cardTimestamp}>
        {new Date(item.created_at).toLocaleDateString("en-US", {
          month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
        })}
      </Text>

      {isPending ? (
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={[styles.actionBtn, styles.approveBtn]}
            onPress={handleApprove}
            disabled={isMutating}
            activeOpacity={0.75}
          >
            <Text style={styles.approveBtnText}>Approve</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtn, styles.rejectBtn]}
            onPress={handleReject}
            disabled={isMutating}
            activeOpacity={0.75}
          >
            <Text style={styles.rejectBtnText}>Reject</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {isApproved ? (
        isBlocked ? (
          <View style={styles.blockedRow}>
            <SymbolView name="lock.fill" size={12} tintColor={colors.danger} resizeMode="scaleAspectFit" />
            <Text style={styles.blockedText}>BLOCKED BY RULE — update rules to allow execution</Text>
          </View>
        ) : isExecuting ? (
          <View style={styles.executingRow}>
            <ActivityIndicator color={colors.accent} size="small" />
            <Text style={styles.executingText}>Executing…</Text>
          </View>
        ) : (
          <TouchableOpacity
            style={[styles.actionBtn, styles.executeBtn]}
            onPress={handleExecute}
            disabled={isMutating}
            activeOpacity={0.75}
          >
            <Text style={styles.executeBtnText}>Execute</Text>
          </TouchableOpacity>
        )
      ) : null}
    </View>
  );
}

// ── Daily plan section ────────────────────────────────────────────────────────

type DailyPlanSectionProps = {
  plan: DailyPlan | null;
  isLoading: boolean;
  error: string | null;
  isMutating: boolean;
  queuedIds: string[];
  onGenerate: () => void;
  onAddToQueue: (item: SuggestionItem) => void;
};

function DailyPlanSection({
  plan,
  isLoading,
  error,
  isMutating,
  queuedIds,
  onGenerate,
  onAddToQueue,
}: DailyPlanSectionProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const handleAdd = (item: SuggestionItem) => {
    Alert.alert(
      "Add to Queue",
      `Add "${item.title}" to the autonomy queue for review?`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Add to Queue", onPress: () => onAddToQueue(item) },
      ],
    );
  };

  return (
    <>
      {/* Section header with generate button */}
      <View style={styles.planSectionHeader}>
        <Text style={styles.sectionLabel}>DAILY PLAN</Text>
        <TouchableOpacity
          onPress={onGenerate}
          disabled={isLoading}
          activeOpacity={0.75}
          style={[styles.generateBtn, isLoading && styles.btnDisabled]}
        >
          {isLoading ? (
            <ActivityIndicator color={colors.accent} size="small" />
          ) : (
            <Text style={styles.generateBtnText}>{plan ? "Regenerate" : "Generate"}</Text>
          )}
        </TouchableOpacity>
      </View>

      {error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : !plan && !isLoading ? (
        <View style={styles.emptyState}>
          <SymbolView name="calendar.badge.clock" size={36} tintColor={colors.textMuted} resizeMode="scaleAspectFit" />
          <Text style={styles.emptyText}>No plan generated yet.</Text>
          <Text style={styles.emptySubtext}>Tap Generate to build today&apos;s operational plan.</Text>
        </View>
      ) : plan ? (
        <>
          {/* Overview */}
          <View style={styles.planOverviewCard}>
            <Text style={styles.planDate}>{plan.plan_date}</Text>
            <Text style={styles.planOverview}>{plan.overview}</Text>
          </View>

          {/* Focus Blocks */}
          <Text style={styles.planSubLabel}>FOCUS BLOCKS</Text>
          {plan.focus_blocks.map((block: FocusBlock, idx: number) => (
            <View key={idx} style={styles.focusBlockRow}>
              <View style={styles.focusBlockLeft}>
                <Text style={styles.focusTimeRange}>{block.time_range}</Text>
                <Text style={styles.focusActivity}>{block.activity}</Text>
              </View>
              <View style={[styles.energyDot, { backgroundColor: getEnergyColors(colors)[block.energy_level] ?? colors.textMuted }]} />
            </View>
          ))}

          {/* Priority Tasks */}
          <Text style={[styles.planSubLabel, { marginTop: spacing.md }]}>PRIORITY TASKS</Text>
          {plan.priority_tasks.map((task: PriorityTask) => (
            <View key={task.rank} style={styles.priorityTaskRow}>
              <View style={styles.priorityTaskHeader}>
                <Text style={styles.priorityRank}>#{task.rank}</Text>
                <Badge
                  label={task.priority.toUpperCase()}
                  color={getPriorityColors(colors)[task.priority] ?? colors.textMuted}
                />
                <Text style={styles.priorityDuration}>{task.estimated_duration}</Text>
              </View>
              <Text style={styles.priorityTaskTitle}>{task.title}</Text>
              <Text style={styles.priorityTaskReason}>{task.reason}</Text>
            </View>
          ))}

          {/* Suggested Queue Items */}
          {plan.suggested_queue_items.length > 0 ? (
            <>
              <Text style={[styles.planSubLabel, { marginTop: spacing.md }]}>SUGGESTED ACTIONS</Text>
              {plan.suggested_queue_items.map((item: SuggestionItem) => {
                const isQueued = queuedIds.includes(item.id);
                return (
                  <View key={item.id} style={[styles.card, isQueued && styles.cardQueued]}>
                    <View style={styles.cardHeader}>
                      <View style={styles.cardMeta}>
                        <Badge label={agentLabel(item.source_agent)} color={colors.accent} />
                        <Badge label={item.risk_level.toUpperCase()} color={getRiskColors(colors)[item.risk_level] ?? colors.textMuted} />
                      </View>
                      <Badge
                        label={item.suggested_action_type.replace(/_/g, " ").toUpperCase()}
                        color={colors.accentCyan}
                      />
                    </View>
                    <Text style={styles.cardTitle}>{item.title}</Text>
                    <Text style={styles.cardDescription}>{item.description}</Text>
                    <View style={styles.reasonBox}>
                      <Text style={styles.reasonLabel}>WHY THIS IS SUGGESTED</Text>
                      <Text style={styles.reasonText}>{item.reason}</Text>
                    </View>
                    {isQueued ? (
                      <View style={styles.queuedRow}>
                        <SymbolView name="checkmark.circle.fill" size={14} tintColor={colors.success} resizeMode="scaleAspectFit" />
                        <Text style={styles.queuedText}>Added to Queue</Text>
                      </View>
                    ) : (
                      <TouchableOpacity
                        style={[styles.actionBtn, styles.addToQueueBtn, isMutating && styles.btnDisabled]}
                        onPress={() => handleAdd(item)}
                        disabled={isMutating}
                        activeOpacity={0.75}
                      >
                        <Text style={styles.addToQueueBtnText}>Add to Queue</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                );
              })}
            </>
          ) : null}

          {/* Risks */}
          {plan.risks.length > 0 ? (
            <>
              <Text style={[styles.planSubLabel, { marginTop: spacing.md }]}>RISKS</Text>
              <View style={styles.planListCard}>
                {plan.risks.map((risk, idx) => (
                  <Text key={idx} style={styles.planListItem}>
                    <Text style={styles.planBullet}>• </Text>{risk}
                  </Text>
                ))}
              </View>
            </>
          ) : null}

          {/* Agent recommendations */}
          {plan.recommended_agent_actions.length > 0 ? (
            <>
              <Text style={[styles.planSubLabel, { marginTop: spacing.md }]}>AGENT RECOMMENDATIONS</Text>
              <View style={styles.planListCard}>
                {plan.recommended_agent_actions.map((action, idx) => (
                  <Text key={idx} style={styles.planListItem}>
                    <Text style={styles.planBullet}>→ </Text>{action}
                  </Text>
                ))}
              </View>
            </>
          ) : null}

          {/* Schedule conflicts */}
          {plan.schedule_conflicts.length > 0 ? (
            <>
              <Text style={[styles.planSubLabel, { marginTop: spacing.md }]}>SCHEDULE CONFLICTS</Text>
              <View style={[styles.planListCard, styles.conflictCard]}>
                {plan.schedule_conflicts.map((conflict, idx) => (
                  <Text key={idx} style={[styles.planListItem, { color: colors.warning }]}>
                    <Text style={{ color: colors.warning }}>⚠ </Text>{conflict}
                  </Text>
                ))}
              </View>
            </>
          ) : null}
        </>
      ) : null}
    </>
  );
}

// ── Rule helpers ──────────────────────────────────────────────────────────────

const SAFE_ACTION_TYPES = [
  "create_task",
  "create_goal",
  "update_task_status",
  "generate_plan",
] as const;

const ACTION_LABELS: Record<string, string> = {
  create_task:        "Create Task",
  create_goal:        "Create Goal",
  update_task_status: "Update Status",
  generate_plan:      "Generate Plan",
};

function isBlockedByRules(item: AutonomyQueueItem, rules: AutonomyRule[]): boolean {
  return rules.some(
    (r) =>
      r.action_type === item.proposed_action_type &&
      !r.allow_execution &&
      (r.risk_level === null || r.risk_level === item.risk_level),
  );
}

// ── Add rule form ─────────────────────────────────────────────────────────────

type AddRuleFormProps = {
  onSave: (data: AutonomyRuleCreate) => void;
  onCancel: () => void;
  isMutating: boolean;
};

function AddRuleForm({
onSave, onCancel, isMutating }: AddRuleFormProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [actionType, setActionType] = useState<string>(SAFE_ACTION_TYPES[0]);
  const [riskLevel, setRiskLevel] = useState<"any" | RiskLevel>("any");
  const [allowExecution, setAllowExecution] = useState(true);

  const handleSave = () => {
    onSave({
      action_type: actionType,
      risk_level: riskLevel === "any" ? null : riskLevel,
      requires_manual_approval: true,
      allow_execution: allowExecution,
    });
  };

  return (
    <View style={styles.addRuleForm}>
      {/* Action type */}
      <Text style={styles.formLabel}>ACTION TYPE</Text>
      <View style={styles.formOptionGrid}>
        {SAFE_ACTION_TYPES.map((at) => (
          <TouchableOpacity
            key={at}
            style={[styles.formOption, actionType === at && styles.formOptionActive]}
            onPress={() => setActionType(at)}
            activeOpacity={0.75}
          >
            <Text style={[styles.formOptionText, actionType === at && styles.formOptionActiveText]}>
              {ACTION_LABELS[at]}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Risk level */}
      <Text style={[styles.formLabel, { marginTop: spacing.sm }]}>RISK LEVEL</Text>
      <View style={styles.formOptionRow}>
        {(["any", "low", "medium", "high"] as const).map((rl) => (
          <TouchableOpacity
            key={rl}
            style={[styles.formOption, riskLevel === rl && styles.formOptionActive]}
            onPress={() => setRiskLevel(rl)}
            activeOpacity={0.75}
          >
            <Text style={[styles.formOptionText, riskLevel === rl && styles.formOptionActiveText]}>
              {rl.toUpperCase()}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Execution permission */}
      <Text style={[styles.formLabel, { marginTop: spacing.sm }]}>EXECUTION</Text>
      <View style={styles.formOptionRow}>
        <TouchableOpacity
          style={[styles.formOption, allowExecution && styles.formOptionAllowed]}
          onPress={() => setAllowExecution(true)}
          activeOpacity={0.75}
        >
          <Text style={[styles.formOptionText, allowExecution && { color: colors.success }]}>ALLOW</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.formOption, !allowExecution && styles.formOptionBlocked]}
          onPress={() => setAllowExecution(false)}
          activeOpacity={0.75}
        >
          <Text style={[styles.formOptionText, !allowExecution && { color: colors.danger }]}>BLOCK</Text>
        </TouchableOpacity>
      </View>

      <View style={[styles.actionRow, { marginTop: spacing.md }]}>
        <TouchableOpacity
          style={[styles.actionBtn, styles.approveBtn, isMutating && styles.btnDisabled]}
          onPress={handleSave}
          disabled={isMutating}
          activeOpacity={0.75}
        >
          <Text style={styles.approveBtnText}>Save Rule</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionBtn, styles.rejectBtn]}
          onPress={onCancel}
          activeOpacity={0.75}
        >
          <Text style={styles.rejectBtnText}>Cancel</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ── Rule card ─────────────────────────────────────────────────────────────────

type RuleCardProps = {
  rule: AutonomyRule;
  isMutating: boolean;
  onToggleExecution: (id: string, newValue: boolean) => void;
  onDelete: (id: string) => void;
};

function RuleCard({
rule, isMutating, onToggleExecution, onDelete }: RuleCardProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const handleToggle = () => {
    const newAllow = !rule.allow_execution;
    Alert.alert(
      newAllow ? "Allow Execution" : "Block Execution",
      `${newAllow ? "Allow" : "Block"} execution of "${ACTION_LABELS[rule.action_type] ?? rule.action_type}" actions${rule.risk_level ? ` at ${rule.risk_level} risk` : " (any risk level)"}?`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Confirm", onPress: () => onToggleExecution(rule.id, newAllow) },
      ],
    );
  };

  const handleDelete = () => {
    Alert.alert(
      "Delete Rule",
      `Remove rule for "${ACTION_LABELS[rule.action_type] ?? rule.action_type}"?`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: () => onDelete(rule.id) },
      ],
    );
  };

  return (
    <View style={styles.ruleCard}>
      <View style={styles.cardHeader}>
        <View style={styles.cardMeta}>
          <Badge
            label={(ACTION_LABELS[rule.action_type] ?? rule.action_type).toUpperCase()}
            color={colors.accentCyan}
          />
          <Badge
            label={rule.risk_level ? rule.risk_level.toUpperCase() : "ANY RISK"}
            color={rule.risk_level ? (getRiskColors(colors)[rule.risk_level] ?? colors.textMuted) : colors.textMuted}
          />
        </View>
        <Badge
          label={rule.allow_execution ? "ALLOW" : "BLOCKED"}
          color={rule.allow_execution ? colors.success : colors.danger}
        />
      </View>

      {rule.notes ? (
        <Text style={styles.cardDescription}>{rule.notes}</Text>
      ) : null}

      <Text style={styles.ruleIndicatorText}>
        {rule.requires_manual_approval
          ? "⚠ Manual approval required before execution"
          : "○ No manual approval requirement set"}
      </Text>

      <View style={styles.actionRow}>
        <TouchableOpacity
          style={[
            styles.actionBtn,
            rule.allow_execution ? styles.rejectBtn : styles.approveBtn,
            isMutating && styles.btnDisabled,
          ]}
          onPress={handleToggle}
          disabled={isMutating}
          activeOpacity={0.75}
        >
          <Text style={rule.allow_execution ? styles.rejectBtnText : styles.approveBtnText}>
            {rule.allow_execution ? "Block" : "Allow"}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionBtn, styles.rejectBtn, isMutating && styles.btnDisabled]}
          onPress={handleDelete}
          disabled={isMutating}
          activeOpacity={0.75}
        >
          <Text style={styles.rejectBtnText}>Delete</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ── Audit log section ─────────────────────────────────────────────────────────

const AUDIT_EVENT_LABELS: Record<string, string> = {
  suggestion_created:      "Suggestions generated",
  queue_item_created:      "Item added to queue",
  queue_item_approved:     "Item approved",
  queue_item_rejected:     "Item rejected",
  queue_item_executed:     "Execution succeeded",
  execution_blocked_by_rule: "Execution blocked",
  execution_failed:        "Execution failed",
};

function getAuditEventColors(c: ThemeColors): Record<string, string> {
  return {
    suggestion_created:       c.info,
    queue_item_created:       c.accentCyan,
    queue_item_approved:      c.success,
    queue_item_rejected:      c.textMuted,
    queue_item_executed:      c.success,
    execution_blocked_by_rule: c.warning,
    execution_failed:         c.danger,
  };
}

function formatAuditTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

type AuditEntryRowProps = { entry: AutonomyAuditLogEntry };

function AuditEntryRow({
entry }: AuditEntryRowProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const color = getAuditEventColors(colors)[entry.event_type] ?? colors.textMuted;
  const label = AUDIT_EVENT_LABELS[entry.event_type] ?? entry.event_type.replace(/_/g, " ").toUpperCase();
  return (
    <View style={styles.auditRow}>
      <View style={[styles.auditDot, { backgroundColor: color }]} />
      <View style={styles.auditRowContent}>
        <View style={styles.auditRowHeader}>
          <Text style={[styles.auditEventLabel, { color }]}>{label}</Text>
          <Text style={styles.auditTimestamp}>{formatAuditTime(entry.created_at)}</Text>
        </View>
        <Text style={styles.auditMessage} numberOfLines={2}>{entry.message}</Text>
        {entry.action_type ? (
          <Text style={styles.auditActionType}>{entry.action_type.replace(/_/g, " ").toUpperCase()}</Text>
        ) : null}
      </View>
    </View>
  );
}

type AuditLogSectionProps = {
  entries: AutonomyAuditLogEntry[];
  isLoading: boolean;
  error: string | null;
};

function AuditLogSection({
entries, isLoading, error }: AuditLogSectionProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <>
      <View style={{ height: 1, backgroundColor: colors.border, marginVertical: spacing.lg }} />
      <Text style={styles.sectionLabel}>AUDIT LOG</Text>
      <Text style={styles.rulesDescription}>
        Recent autonomy decisions — approvals, executions, blocks, and failures.
      </Text>

      {isLoading && entries.length === 0 ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator color={colors.accent} size="small" />
          <Text style={styles.loadingText}>Loading audit log…</Text>
        </View>
      ) : error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : entries.length === 0 ? (
        <View style={styles.emptyState}>
          <SymbolView name="doc.text.magnifyingglass" size={36} tintColor={colors.textMuted} resizeMode="scaleAspectFit" />
          <Text style={styles.emptyText}>No audit events yet.</Text>
          <Text style={styles.emptySubtext}>
            Events appear here as you review, approve, and execute autonomy queue items.
          </Text>
        </View>
      ) : (
        <View style={styles.auditCard}>
          {entries.map((entry, i) => (
            <View key={entry.id}>
              <AuditEntryRow entry={entry} />
              {i < entries.length - 1 ? (
                <View style={styles.auditDivider} />
              ) : null}
            </View>
          ))}
        </View>
      )}
    </>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function AutonomyScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const accessToken = useAuthStore((s) => s.accessToken);
  const {
    items,
    isLoading,
    isMutating,
    executingItemId,
    error,
    suggestions,
    isSuggestionsLoading,
    suggestionsError,
    queuedSuggestionIds,
    dailyPlan,
    isDailyPlanLoading,
    dailyPlanError,
    dailyPlanQueuedIds,
    rules,
    isRulesLoading,
    rulesError,
    isRulesMutating,
    auditLog,
    isAuditLogLoading,
    auditLogError,
    fetchQueue,
    fetchSuggestions,
    approveItem,
    rejectItem,
    executeItem,
    addSuggestionToQueue,
    generateDailyPlan,
    addDailyPlanItemToQueue,
    fetchRules,
    createRule,
    updateRule,
    deleteRule,
    fetchAuditLog,
  } = useAutonomyStore();

  const [showAddRuleForm, setShowAddRuleForm] = useState(false);

  const { unreadCount } = useNotificationsStore();
  const {
    jobs: bgJobs,
    isMutating: bgJobsMutating,
    fetchJobs,
    triggerJob,
  } = useBackgroundJobsStore();

  const loadAll = useCallback(() => {
    if (!accessToken) return;
    fetchQueue(accessToken);
    fetchSuggestions(accessToken);
    fetchRules(accessToken);
    fetchAuditLog(accessToken);
    fetchJobs(accessToken);
  }, [accessToken, fetchQueue, fetchSuggestions, fetchRules, fetchAuditLog, fetchJobs]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const handleApprove = useCallback(
    (id: string) => { if (accessToken) approveItem(accessToken, id); },
    [accessToken, approveItem],
  );

  const handleReject = useCallback(
    (id: string) => { if (accessToken) rejectItem(accessToken, id); },
    [accessToken, rejectItem],
  );

  const handleExecute = useCallback(
    async (id: string) => {
      if (!accessToken) return;
      const result: AutonomyExecuteResult | null = await executeItem(accessToken, id);
      if (!result) return;
      if (result.action_type === "generate_plan" && result.plan) {
        const { plan_title, summary, steps } = result.plan;
        const stepLines = steps.slice(0, 3).map((s) => `${s.step_number}. ${s.title}`).join("\n");
        Alert.alert("Plan Generated", `${plan_title}\n\n${summary}\n\nFirst steps:\n${stepLines}`, [{ text: "OK" }]);
      } else {
        Alert.alert("Done", result.message, [{ text: "OK" }]);
      }
    },
    [accessToken, executeItem],
  );

  const handleAddToQueue = useCallback(
    (suggestion: SuggestionItem) => {
      if (accessToken) addSuggestionToQueue(accessToken, suggestion);
    },
    [accessToken, addSuggestionToQueue],
  );

  const handleGenerateDailyPlan = useCallback(() => {
    if (accessToken) generateDailyPlan(accessToken);
  }, [accessToken, generateDailyPlan]);

  const handleAddDailyPlanItemToQueue = useCallback(
    (item: SuggestionItem) => {
      if (accessToken) addDailyPlanItemToQueue(accessToken, item);
    },
    [accessToken, addDailyPlanItemToQueue],
  );

  const handleCreateRule = useCallback(
    (data: AutonomyRuleCreate) => {
      if (!accessToken) return;
      createRule(accessToken, data).then(() => setShowAddRuleForm(false));
    },
    [accessToken, createRule],
  );

  const handleToggleRuleExecution = useCallback(
    (id: string, newValue: boolean) => {
      if (accessToken) updateRule(accessToken, id, { allow_execution: newValue });
    },
    [accessToken, updateRule],
  );

  const handleDeleteRule = useCallback(
    (id: string) => {
      if (accessToken) deleteRule(accessToken, id);
    },
    [accessToken, deleteRule],
  );

  const pending  = items.filter((i) => i.status === "pending");
  const approved = items.filter((i) => i.status === "approved");
  const resolved = items.filter((i) => i.status === "rejected" || i.status === "completed");
  const isRefreshing = isLoading || isSuggestionsLoading || isRulesLoading || isAuditLogLoading;
  const enabledBgJobs = bgJobs.filter((j) => j.enabled);

  const getIsBlocked = useCallback(
    (item: AutonomyQueueItem) => isBlockedByRules(item, rules),
    [rules],
  );

  const heroSubtitle =
    suggestions.length > 0 || pending.length > 0
      ? [
          pending.length > 0 ? `${pending.length} pending` : null,
          approved.length > 0 ? `${approved.length} approved` : null,
          suggestions.length > 0 ? `${suggestions.length} suggestion${suggestions.length !== 1 ? "s" : ""}` : null,
        ]
          .filter(Boolean)
          .join(" · ")
      : "All clear.";

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.md }]}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={isRefreshing} onRefresh={loadAll} tintColor={colors.accent} />
      }
    >
      {/* Hero */}
      <View style={styles.heroCard}>
        <Text style={styles.heroLabel}>HELIOS V3</Text>
        <Text style={styles.heroTitle}>Command Center</Text>
        <Text style={styles.heroSubtitle}>{heroSubtitle}</Text>
      </View>

      {/* ── Command Center Status Row ─────────────────────────────────── */}
      <View style={styles.ccRow}>
        <View style={styles.ccStat}>
          <Text style={styles.ccStatValue}>{pending.length}</Text>
          <Text style={styles.ccStatLabel}>PENDING</Text>
        </View>
        <View style={styles.ccDivider} />
        <View style={styles.ccStat}>
          <Text style={styles.ccStatValue}>{approved.length}</Text>
          <Text style={styles.ccStatLabel}>APPROVED</Text>
        </View>
        <View style={styles.ccDivider} />
        <View style={styles.ccStat}>
          <Text style={[styles.ccStatValue, unreadCount > 0 && { color: colors.accent }]}>
            {unreadCount}
          </Text>
          <Text style={styles.ccStatLabel}>INBOX</Text>
        </View>
        <View style={styles.ccDivider} />
        <View style={styles.ccStat}>
          <Text style={styles.ccStatValue}>{enabledBgJobs.length}</Text>
          <Text style={styles.ccStatLabel}>JOBS</Text>
        </View>
      </View>

      {/* ── Background Jobs Panel ─────────────────────────────────────── */}
      {bgJobs.length > 0 ? (
        <>
          <View style={{ height: 1, backgroundColor: colors.border, marginVertical: spacing.lg }} />
          <Text style={styles.sectionLabel}>SCHEDULED JOBS</Text>
          <Text style={styles.rulesDescription}>
            Manually trigger any job below. Created items enter the review queue — no auto-execution.
          </Text>
          <View style={styles.bgJobsCard}>
            {bgJobs.map((job, idx) => {
              const JOB_LABELS: Record<string, string> = {
                daily_briefing_generation: "Daily Briefing",
                proactive_suggestion_scan: "Proactive Scan",
                reminder_check:            "Reminder Check",
                integration_sync_simulation: "Integration Sync",
              };
              return (
                <View key={job.id}>
                  {idx > 0 ? <View style={styles.auditDivider} /> : null}
                  <View style={styles.bgJobRow}>
                    <View style={[styles.bgJobDot, { backgroundColor: job.enabled ? colors.success : colors.textMuted }]} />
                    <View style={styles.bgJobInfo}>
                      <Text style={styles.bgJobName}>{JOB_LABELS[job.job_type] ?? job.job_type}</Text>
                      <Text style={styles.bgJobSchedule}>{job.schedule_label}</Text>
                    </View>
                    {job.enabled ? (
                      <TouchableOpacity
                        style={[styles.bgJobRunBtn, bgJobsMutating && styles.btnDisabled]}
                        onPress={() => {
                          if (!accessToken) return;
                          triggerJob(accessToken, job.id).then((result) => {
                            if (result) Alert.alert("Job Triggered", result.result_summary, [{ text: "OK" }]);
                          });
                        }}
                        disabled={bgJobsMutating}
                        activeOpacity={0.7}
                      >
                        <SymbolView name="play.fill" size={10} tintColor={colors.success} resizeMode="scaleAspectFit" />
                        <Text style={styles.bgJobRunBtnText}>RUN</Text>
                      </TouchableOpacity>
                    ) : (
                      <Text style={styles.bgJobDisabled}>DISABLED</Text>
                    )}
                  </View>
                </View>
              );
            })}
          </View>
        </>
      ) : null}

      {/* Global error */}
      {error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      {/* Initial queue loading */}
      {isLoading && items.length === 0 ? (
        <ActivityIndicator color={colors.accent} style={{ marginTop: spacing.xl }} />
      ) : null}

      {/* ── Daily Plan ───────────────────────────────────────────────── */}
      <DailyPlanSection
        plan={dailyPlan}
        isLoading={isDailyPlanLoading}
        error={dailyPlanError}
        isMutating={isMutating}
        queuedIds={dailyPlanQueuedIds}
        onGenerate={handleGenerateDailyPlan}
        onAddToQueue={handleAddDailyPlanItemToQueue}
      />

      <View style={{ height: 1, backgroundColor: colors.border, marginVertical: spacing.lg }} />

      {/* ── Proactive Suggestions ─────────────────────────────────────── */}
      <Text style={styles.sectionLabel}>PROACTIVE SUGGESTIONS</Text>

      {isSuggestionsLoading && suggestions.length === 0 ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator color={colors.accent} size="small" />
          <Text style={styles.loadingText}>Generating suggestions…</Text>
        </View>
      ) : suggestionsError ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{suggestionsError}</Text>
        </View>
      ) : suggestions.length === 0 ? (
        <View style={styles.emptyState}>
          <SymbolView name="lightbulb" size={36} tintColor={colors.textMuted} resizeMode="scaleAspectFit" />
          <Text style={styles.emptyText}>No suggestions right now.</Text>
          <Text style={styles.emptySubtext}>Pull to refresh for fresh recommendations.</Text>
        </View>
      ) : (
        suggestions.map((s) => (
          <SuggestionCard
            key={s.id}
            item={s}
            isQueued={queuedSuggestionIds.includes(s.id)}
            isMutating={isMutating}
            onAddToQueue={handleAddToQueue}
          />
        ))
      )}

      {/* ── Pending Review ────────────────────────────────────────────── */}
      {(!isLoading || items.length > 0) ? (
        <>
          <Text style={[styles.sectionLabel, { marginTop: spacing.xl }]}>PENDING REVIEW</Text>
          {pending.length === 0 ? (
            <View style={styles.emptyState}>
              <SymbolView name="tray" size={36} tintColor={colors.textMuted} resizeMode="scaleAspectFit" />
              <Text style={styles.emptyText}>No pending proposals.</Text>
              <Text style={styles.emptySubtext}>Add a suggestion to the queue to get started.</Text>
            </View>
          ) : (
            pending.map((item) => (
              <QueueCard
                key={item.id}
                item={item}
                isMutating={isMutating}
                isExecuting={executingItemId === item.id}
                isBlocked={getIsBlocked(item)}
                onApprove={handleApprove}
                onReject={handleReject}
                onExecute={handleExecute}
              />
            ))
          )}

          {/* ── Approved ─────────────────────────────────────────────── */}
          {approved.length > 0 ? (
            <>
              <Text style={[styles.sectionLabel, { marginTop: spacing.xl }]}>
                APPROVED — READY TO EXECUTE
              </Text>
              {approved.map((item) => (
                <QueueCard
                  key={item.id}
                  item={item}
                  isMutating={isMutating}
                  isExecuting={executingItemId === item.id}
                  isBlocked={getIsBlocked(item)}
                  onApprove={handleApprove}
                  onReject={handleReject}
                  onExecute={handleExecute}
                />
              ))}
            </>
          ) : null}

          {/* ── Resolved ─────────────────────────────────────────────── */}
          {resolved.length > 0 ? (
            <>
              <Text style={[styles.sectionLabel, { marginTop: spacing.xl }]}>RESOLVED</Text>
              {resolved.map((item) => (
                <QueueCard
                  key={item.id}
                  item={item}
                  isMutating={isMutating}
                  isExecuting={false}
                  isBlocked={false}
                  onApprove={handleApprove}
                  onReject={handleReject}
                  onExecute={handleExecute}
                />
              ))}
            </>
          ) : null}
        </>
      ) : null}

      {/* ── Approval Rules ───────────────────────────────────────────── */}
      <View style={{ height: 1, backgroundColor: colors.border, marginVertical: spacing.lg }} />
      <View style={styles.planSectionHeader}>
        <Text style={styles.sectionLabel}>APPROVAL RULES</Text>
        <TouchableOpacity
          onPress={() => setShowAddRuleForm((v) => !v)}
          style={styles.generateBtn}
          activeOpacity={0.75}
        >
          <Text style={styles.generateBtnText}>{showAddRuleForm ? "Cancel" : "Add Rule"}</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.rulesDescription}>
        Configure which action types require extra review or are blocked from execution entirely.
      </Text>

      {rulesError ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{rulesError}</Text>
        </View>
      ) : null}

      {showAddRuleForm ? (
        <AddRuleForm
          onSave={handleCreateRule}
          onCancel={() => setShowAddRuleForm(false)}
          isMutating={isRulesMutating}
        />
      ) : null}

      {isRulesLoading && rules.length === 0 ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator color={colors.accent} size="small" />
          <Text style={styles.loadingText}>Loading rules…</Text>
        </View>
      ) : rules.length === 0 && !showAddRuleForm ? (
        <View style={styles.emptyState}>
          <SymbolView name="slider.horizontal.3" size={36} tintColor={colors.textMuted} resizeMode="scaleAspectFit" />
          <Text style={styles.emptyText}>No rules configured.</Text>
          <Text style={styles.emptySubtext}>
            Default: all approved actions require explicit execution. Add a rule to block specific types.
          </Text>
        </View>
      ) : (
        rules.map((rule) => (
          <RuleCard
            key={rule.id}
            rule={rule}
            isMutating={isRulesMutating}
            onToggleExecution={handleToggleRuleExecution}
            onDelete={handleDeleteRule}
          />
        ))
      )}

      {/* ── Audit Log ───────────────────────────────────────────────── */}
      <AuditLogSection
        entries={auditLog}
        isLoading={isAuditLogLoading}
        error={auditLogError}
      />

      <View style={{ height: spacing.xl * 2 }} />
    </ScrollView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content:   { paddingHorizontal: spacing.md },

  // Hero
  heroCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  heroLabel: {
    ...typography.caption,
    color: colors.accent,
    letterSpacing: 2,
    marginBottom: spacing.xs,
  },
  heroTitle: {
    ...typography.displaySmall,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  heroSubtitle: { ...typography.body, color: colors.textSecondary },

  // Section labels
  sectionLabel: {
    ...typography.caption,
    color: colors.textMuted,
    letterSpacing: 2,
    marginBottom: spacing.sm,
    marginTop: spacing.sm,
  },

  // Inline loading row (for suggestions)
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.md,
  },
  loadingText: { ...typography.caption, color: colors.textMuted },

  // Error
  errorBox: {
    backgroundColor: `${colors.danger}1a`,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: `${colors.danger}4d`,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  errorText: { ...typography.body, color: colors.danger },

  // Empty state
  emptyState: {
    alignItems: "center",
    paddingVertical: spacing.xl,
    gap: spacing.sm,
  },
  emptyText: {
    ...typography.body,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  emptySubtext: {
    ...typography.caption,
    color: colors.textMuted,
    textAlign: "center",
    paddingHorizontal: spacing.lg,
  },

  // Cards (shared base)
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.md,
    gap: spacing.xs,
  },
  cardQueued: {
    borderColor: colors.success,
    opacity: 0.75,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.xs,
  },
  cardMeta: { flexDirection: "row", gap: spacing.xs },
  cardAgent: { ...typography.caption, color: colors.textMuted, letterSpacing: 1 },
  cardTitle: { ...typography.title, color: colors.textPrimary },
  cardActionType: { ...typography.caption, color: colors.accentCyan, letterSpacing: 1 },
  cardDescription: { ...typography.body, color: colors.textSecondary, marginTop: spacing.xs },
  cardTimestamp: { ...typography.caption, color: colors.textMuted, marginTop: spacing.xs },

  // Reason box (suggestions only)
  reasonBox: {
    backgroundColor: colors.surfaceDark,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.borderDark,
    padding: spacing.sm,
    marginTop: spacing.xs,
    gap: spacing.xs,
  },
  reasonLabel: {
    fontSize: 9,
    fontWeight: "700" as const,
    letterSpacing: 1.5,
    color: colors.accent,
  },
  reasonText: { ...typography.caption, color: colors.textSecondary, lineHeight: 18 },

  // Payload preview box (queue items)
  payloadBox: {
    backgroundColor: colors.surfaceDark,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.borderDark,
    padding: spacing.sm,
    marginTop: spacing.xs,
    gap: 2,
  },
  payloadRow: { ...typography.caption, color: colors.textSecondary },
  payloadKey: { color: colors.textMuted },
  payloadVal: { color: colors.textSecondary },

  // Badges
  badge: {
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  badgeText: { fontSize: 9, fontWeight: "700" as const, letterSpacing: 0.8 },

  // Action buttons
  actionRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm },
  actionBtn: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    alignItems: "center",
    borderWidth: 1,
  },
  btnDisabled: { opacity: 0.5 },

  approveBtn: { backgroundColor: `${colors.success}1a`, borderColor: colors.success },
  approveBtnText: { ...typography.caption, color: colors.success, fontWeight: "700" as const, letterSpacing: 1 },

  rejectBtn: { backgroundColor: `${colors.danger}1a`, borderColor: colors.danger },
  rejectBtnText: { ...typography.caption, color: colors.danger, fontWeight: "700" as const, letterSpacing: 1 },

  executeBtn: { backgroundColor: `${colors.accent}26`, borderColor: colors.accent, marginTop: spacing.sm },
  executeBtnText: { ...typography.caption, color: colors.accent, fontWeight: "700" as const, letterSpacing: 1 },

  addToQueueBtn: {
    backgroundColor: `${colors.accentCyan}1a`,
    borderColor: colors.accentCyan,
    marginTop: spacing.sm,
  },
  addToQueueBtnText: { ...typography.caption, color: colors.accentCyan, fontWeight: "700" as const, letterSpacing: 1 },

  queuedRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    marginTop: spacing.sm,
    paddingVertical: spacing.xs,
  },
  queuedText: { ...typography.caption, color: colors.success, letterSpacing: 1 },

  executingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    marginTop: spacing.sm,
    paddingVertical: spacing.sm,
  },
  executingText: { ...typography.caption, color: colors.accent, letterSpacing: 1 },

  // Daily plan
  planSectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.sm,
    marginTop: spacing.sm,
  },
  generateBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.accent,
    backgroundColor: `${colors.accent}1f`,
    minWidth: 80,
    alignItems: "center",
  },
  generateBtnText: {
    ...typography.caption,
    color: colors.accent,
    fontWeight: "700" as const,
    letterSpacing: 1,
  },
  planOverviewCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
    gap: spacing.xs,
  },
  planDate: {
    ...typography.caption,
    color: colors.accent,
    letterSpacing: 1.5,
    marginBottom: spacing.xs,
  },
  planOverview: { ...typography.body, color: colors.textSecondary, lineHeight: 22 },
  planSubLabel: {
    fontSize: 9,
    fontWeight: "700" as const,
    letterSpacing: 1.5,
    color: colors.textMuted,
    marginBottom: spacing.xs,
  },
  focusBlockRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.xs,
  },
  focusBlockLeft: { flex: 1, gap: 2 },
  focusTimeRange: {
    ...typography.caption,
    color: colors.accentCyan,
    letterSpacing: 0.5,
    fontWeight: "700" as const,
  },
  focusActivity: { ...typography.body, color: colors.textPrimary },
  energyDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginLeft: spacing.sm,
  },
  priorityTaskRow: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.xs,
    gap: spacing.xs,
  },
  priorityTaskHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginBottom: 2,
  },
  priorityRank: {
    ...typography.caption,
    color: colors.textMuted,
    fontWeight: "700" as const,
    minWidth: 20,
  },
  priorityDuration: { ...typography.caption, color: colors.textMuted, marginLeft: "auto" },
  priorityTaskTitle: { ...typography.title, color: colors.textPrimary },
  priorityTaskReason: { ...typography.caption, color: colors.textSecondary, lineHeight: 18 },
  planListCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  conflictCard: { borderColor: `${colors.warning}59` },
  planListItem: { ...typography.body, color: colors.textSecondary, lineHeight: 22 },
  planBullet: { color: colors.textMuted },

  // Blocked by rule indicator
  blockedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    marginTop: spacing.sm,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    backgroundColor: `${colors.danger}14`,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: `${colors.danger}40`,
  },
  blockedText: {
    ...typography.caption,
    color: colors.danger,
    letterSpacing: 0.5,
    flex: 1,
  },

  // Rules section
  rulesDescription: {
    ...typography.caption,
    color: colors.textMuted,
    marginBottom: spacing.md,
    lineHeight: 18,
  },
  ruleCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.md,
    gap: spacing.xs,
  },
  ruleIndicatorText: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: 2,
    lineHeight: 16,
  },

  // Add rule form
  addRuleForm: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.accent,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  formLabel: {
    fontSize: 9,
    fontWeight: "700" as const,
    letterSpacing: 1.5,
    color: colors.textMuted,
    marginBottom: spacing.xs,
  },
  formOptionGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
  },
  formOptionRow: {
    flexDirection: "row",
    gap: spacing.xs,
  },
  formOption: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceDark,
  },
  formOptionActive: {
    borderColor: colors.accentCyan,
    backgroundColor: `${colors.accentCyan}1a`,
  },
  formOptionAllowed: {
    borderColor: colors.success,
    backgroundColor: `${colors.success}1a`,
  },
  formOptionBlocked: {
    borderColor: colors.danger,
    backgroundColor: `${colors.danger}1a`,
  },
  formOptionText: {
    fontSize: 9,
    fontWeight: "700" as const,
    letterSpacing: 0.8,
    color: colors.textMuted,
  },
  formOptionActiveText: { color: colors.accentCyan },

  // Audit log
  auditCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
    marginBottom: spacing.md,
  },
  auditRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
  },
  auditDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 5,
    flexShrink: 0,
  },
  auditRowContent: { flex: 1, gap: 2 },
  auditRowHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: spacing.xs,
  },
  auditEventLabel: {
    fontSize: 9,
    fontWeight: "700" as const,
    letterSpacing: 1.2,
    flex: 1,
  },
  auditTimestamp: { ...typography.caption, color: colors.textMuted },
  auditMessage: { ...typography.body, color: colors.textSecondary, lineHeight: 20 },
  auditActionType: {
    fontSize: 9,
    fontWeight: "700" as const,
    letterSpacing: 0.8,
    color: colors.textMuted,
    marginTop: 2,
  },
  auditDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginHorizontal: spacing.md,
  },

  // ── Command Center ──────────────────────────────────────────────────────────
  ccRow: {
    flexDirection: "row",
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
    overflow: "hidden",
  },
  ccStat: {
    flex: 1,
    alignItems: "center",
    paddingVertical: spacing.md,
  },
  ccStatValue: {
    fontSize: 22,
    fontWeight: "700" as const,
    color: colors.textPrimary,
    letterSpacing: -0.5,
  },
  ccStatLabel: {
    fontSize: 8,
    fontWeight: "700" as const,
    letterSpacing: 1.2,
    color: colors.textMuted,
    marginTop: 2,
  },
  ccDivider: {
    width: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.sm,
  },

  // ── Background jobs (command center panel) ─────────────────────────────────
  bgJobsCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.md,
    overflow: "hidden",
  },
  bgJobRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  bgJobDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    flexShrink: 0,
  },
  bgJobInfo: { flex: 1 },
  bgJobName: { ...typography.body, color: colors.textPrimary, fontWeight: "600" as const, fontSize: 14 },
  bgJobSchedule: { ...typography.caption, color: colors.textMuted, marginTop: 1 },
  bgJobRunBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs - 2,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.success,
    backgroundColor: `${colors.success}14`,
  },
  bgJobRunBtnText: {
    fontSize: 9,
    fontWeight: "700" as const,
    letterSpacing: 0.8,
    color: colors.success,
  },
  bgJobDisabled: {
    fontSize: 8,
    fontWeight: "700" as const,
    letterSpacing: 1,
    color: colors.textMuted,
    opacity: 0.5,
  },
});
}
