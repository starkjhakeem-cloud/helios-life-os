/* eslint-disable @typescript-eslint/no-unused-vars */
import { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import {
  Animated,
  View,
  Text,
  ActivityIndicator,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Alert,
  AppState,
  type AppStateStatus,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SymbolView } from "expo-symbols";
import * as Haptics from "expo-haptics";

import { spacing, radius, typography, type ThemeColors } from "../../theme/theme";
import { useTheme } from "../../theme/ThemeContext";
import {
  useAuthStore, useAutonomyStore, useBackgroundJobsStore,
} from "../../store";
import type {
  AutonomyAuditLogEntry,
  AutonomyExecuteResult,
  AutonomyQueueItem,
  AutonomyRule,
  AutonomyRuleCreate,
  BackgroundJob,
  BackgroundJobTriggerResult,
  DailyPlan,
  FocusBlock,
  RiskLevel,
  SuggestionItem,
} from "../../store";
import type { Goal } from "../../services/goalsService";
import type { Task } from "../../services/tasksService";

// ── Constants ─────────────────────────────────────────────────────────────────

const JOB_LABELS: Record<string, string> = {
  daily_briefing_generation:   "Daily Briefing",
  proactive_suggestion_scan:   "Proactive Scan",
  reminder_check:              "Reminder Check",
  integration_sync_simulation: "Integration Sync",
};

const JOB_ICONS: Record<string, Parameters<typeof SymbolView>[0]["name"]> = {
  daily_briefing_generation:   "doc.text.fill",
  proactive_suggestion_scan:   "lightbulb.fill",
  reminder_check:              "bell.fill",
  integration_sync_simulation: "arrow.triangle.2.circlepath",
};

const ACTION_DURATION: Record<string, string> = {
  create_task:        "~10 min",
  create_goal:        "~15 min",
  generate_plan:      "~5 min",
  update_task_status: "~5 min",
};

function getEnergyColors(c: ThemeColors): Record<string, string> {
  return { high: c.accent, medium: c.warning, low: c.textMuted };
}
function getRiskColors(c: ThemeColors): Record<string, string> {
  return { low: c.success, medium: c.warning, high: c.danger };
}
function getStatusColors(c: ThemeColors): Record<string, string> {
  return { pending: c.accentCyan, approved: c.success, rejected: c.textMuted, completed: c.textMuted };
}

const AGENT_LABELS: Record<string, string> = {
  strategy_agent:        "STRATEGY",
  task_manager:          "TASKS",
  analytics_engine:      "ANALYTICS",
  calendar_intelligence: "CALENDAR",
  email_intelligence:    "EMAIL",
};

function agentLabel(name: string): string {
  return AGENT_LABELS[name] ?? name.replace(/_/g, " ").toUpperCase();
}

// ── Local recommendation fallback ─────────────────────────────────────────────

type LocalRecommendation = {
  id: string;
  title: string;
  subtitle: string;
  icon: Parameters<typeof SymbolView>[0]["name"];
  priority: "high" | "medium" | "low";
};

function generateLocalRecommendations(opts: {
  unreadCount: number;
  pendingCount: number;
  hasDailyPlan: boolean;
  goals: Goal[];
  tasks: Task[];
  bgJobs: BackgroundJob[];
}): LocalRecommendation[] {
  const { unreadCount, pendingCount, hasDailyPlan, goals, tasks, bgJobs } = opts;
  const recs: LocalRecommendation[] = [];

  const failedJob = bgJobs.find((j) => j.status === "failed");
  if (failedJob) {
    recs.push({
      id: "local_job_failed",
      title: `Investigate failed job: ${JOB_LABELS[failedJob.job_type] ?? failedJob.job_type}`,
      subtitle: "A background service needs your attention",
      icon: "exclamationmark.triangle.fill",
      priority: "high",
    });
  }

  if (pendingCount > 0) {
    recs.push({
      id: "local_pending",
      title: `Review ${pendingCount} suggestion${pendingCount === 1 ? "" : "s"}`,
      subtitle: "HELIOS is waiting for your approval before proceeding",
      icon: "tray.full.fill",
      priority: "high",
    });
  }

  if (unreadCount > 0) {
    recs.push({
      id: "local_unread",
      title: `Review ${unreadCount} unread notification${unreadCount === 1 ? "" : "s"}`,
      subtitle: "Stay informed on recent HELIOS activity",
      icon: "bell.badge.fill",
      priority: "medium",
    });
  }

  if (!hasDailyPlan) {
    recs.push({
      id: "local_plan",
      title: "Generate today's plan",
      subtitle: "HELIOS will intelligently organize your day",
      icon: "calendar.badge.clock",
      priority: "medium",
    });
  }

  const activeTask = tasks.find((t) => t.status === "in_progress");
  if (activeTask) {
    recs.push({
      id: "local_active_task",
      title: `Continue: ${activeTask.title}`,
      subtitle: "You have an in-progress task awaiting action",
      icon: "arrow.right.circle.fill",
      priority: "medium",
    });
  } else {
    const nextTask = tasks.find((t) => t.status === "todo" || t.status === "pending");
    if (nextTask) {
      recs.push({
        id: "local_next_task",
        title: `Start: ${nextTask.title}`,
        subtitle: `${tasks.filter((t) => t.status === "todo" || t.status === "pending").length} tasks ready to begin`,
        icon: "checkmark.circle",
        priority: "low",
      });
    }
  }

  const latestGoal = goals[0];
  if (latestGoal) {
    recs.push({
      id: "local_goal",
      title: `Continue milestone: ${latestGoal.title}`,
      subtitle: "Review your goal progress and next steps",
      icon: "target",
      priority: "low",
    });
  }

  return recs.slice(0, 5);
}

// ── Job run stages ─────────────────────────────────────────────────────────────

const JOB_RUN_STAGES = [
  "Connecting…",
  "Loading context…",
  "Analyzing goals…",
  "Generating output…",
  "Saving results…",
];

// ── Shared time formatter ─────────────────────────────────────────────────────

function formatRelativeTime(iso: string, now: Date): string {
  try {
    const d = new Date(iso);
    const timeStr = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    const isToday =
      d.getDate() === now.getDate() &&
      d.getMonth() === now.getMonth() &&
      d.getFullYear() === now.getFullYear();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const isYesterday =
      d.getDate() === yesterday.getDate() &&
      d.getMonth() === yesterday.getMonth() &&
      d.getFullYear() === yesterday.getFullYear();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const isTomorrow =
      d.getDate() === tomorrow.getDate() &&
      d.getMonth() === tomorrow.getMonth() &&
      d.getFullYear() === tomorrow.getFullYear();
    if (isToday)     return `Today • ${timeStr}`;
    if (isTomorrow)  return `Tomorrow • ${timeStr}`;
    if (isYesterday) return `Yesterday • ${timeStr}`;
    return `${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })} • ${timeStr}`;
  } catch {
    return iso;
  }
}

// ── Error helpers ──────────────────────────────────────────────────────────────

function mapToFriendlyError(raw: string): string {
  const lower = raw.toLowerCase();
  if (lower.includes("internal server error") || lower.includes("500")) {
    return "HELIOS couldn't reach the service. This is a temporary issue.";
  }
  if (lower.includes("network") || lower.includes("timeout") || lower.includes("fetch")) {
    return "Network unavailable. Check your connection and try again.";
  }
  if (lower.includes("unavailable") || lower.includes("503")) {
    return "Service temporarily unavailable. We'll retry automatically.";
  }
  if (lower.includes("not found") || lower.includes("404")) {
    return "The requested resource could not be found.";
  }
  if (lower.includes("something went wrong")) {
    return "An unexpected error occurred. Please try again.";
  }
  return raw;
}

type ErrorCardProps = {
  title?: string;
  message: string;
  onRetry?: () => void;
  endpoint?: string;
};

function ErrorCard({ title = "Something went wrong", message, onRetry, endpoint }: ErrorCardProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [showDetails, setShowDetails] = useState(false);
  const friendlyMessage = mapToFriendlyError(message);

  return (
    <View style={styles.errorCard}>
      <View style={styles.errorCardTop}>
        <View style={styles.errorCardIconWrap}>
          <SymbolView name="exclamationmark.triangle.fill" size={15} tintColor={colors.danger} resizeMode="scaleAspectFit" />
        </View>
        <View style={styles.errorCardBody}>
          <Text style={styles.errorCardTitle}>{title}</Text>
          <Text style={styles.errorCardMessage}>{friendlyMessage}</Text>
        </View>
        {onRetry ? (
          <TouchableOpacity
            style={styles.errorRetryBtn}
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onRetry(); }}
            activeOpacity={0.75}
          >
            <Text style={styles.errorRetryText}>Retry</Text>
          </TouchableOpacity>
        ) : null}
      </View>
      {endpoint ? (
        <TouchableOpacity
          onPress={() => setShowDetails((v) => !v)}
          style={styles.errorDetailsToggle}
          activeOpacity={0.7}
        >
          <Text style={styles.errorDetailsToggleText}>
            {showDetails ? "Hide details" : "View details"}
          </Text>
          <SymbolView
            name={showDetails ? "chevron.up" : "chevron.down"}
            size={9}
            tintColor={colors.textMuted}
            resizeMode="scaleAspectFit"
          />
        </TouchableOpacity>
      ) : null}
      {endpoint && showDetails ? (
        <View style={styles.errorDetailsBox}>
          <Text style={styles.errorDetailRow}>
            <Text style={styles.errorDetailKey}>Timestamp  </Text>
            {new Date().toLocaleString(undefined, {
              month: "short",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
            })}
          </Text>
          {endpoint ? (
            <Text style={styles.errorDetailRow}>
              <Text style={styles.errorDetailKey}>Endpoint   </Text>
              {endpoint}
            </Text>
          ) : null}
          <Text style={styles.errorDetailRow}>
            <Text style={styles.errorDetailKey}>Detail     </Text>
            {message}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

// ── Shared badge ──────────────────────────────────────────────────────────────

type BadgeProps = { label: string; color: string };

function Badge({ label, color }: BadgeProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={[styles.badge, { borderColor: color }]}>
      <Text style={[styles.badgeText, { color }]}>{label}</Text>
    </View>
  );
}

// ── Job card ──────────────────────────────────────────────────────────────────

type JobCardProps = {
  job: BackgroundJob;
  isMutating: boolean;
  onTrigger: (id: string) => Promise<BackgroundJobTriggerResult | null>;
  now: Date;
};

function JobCard({ job, isMutating, onTrigger, now }: JobCardProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [runPhase, setRunPhase] = useState<"idle" | "running" | "done" | "error">("idle");
  const [runStage, setRunStage] = useState(0);
  const [runAttempt, setRunAttempt] = useState(0);
  const [runError, setRunError] = useState<string | null>(null);
  const stageIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (stageIntervalRef.current) clearInterval(stageIntervalRef.current);
    };
  }, []);

  // DELAYED: job is enabled + idle + its next_run_at is already in the past
  const isDelayed =
    job.enabled &&
    job.status === "idle" &&
    !!job.next_run_at &&
    new Date(job.next_run_at) < now;

  const healthStatus =
    job.status === "failed"  ? "FAILED"   :
    !job.enabled             ? "DISABLED" :
    job.status === "running" ? "RUNNING"  :
    isDelayed                ? "DELAYED"  : "HEALTHY";

  const healthColor =
    job.status === "failed"  ? colors.danger  :
    !job.enabled             ? colors.textMuted :
    job.status === "running" ? colors.warning :
    isDelayed                ? colors.warning  : colors.success;

  const formatJobTime = (iso: string | null): string =>
    iso ? formatRelativeTime(iso, now) : "—";

  const handleRun = async () => {
    if (isMutating || runPhase === "running") return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setRunPhase("running");
    setRunStage(0);
    setRunError(null);
    setRunAttempt(1);

    // Advance through visual stages
    let stageIdx = 0;
    stageIntervalRef.current = setInterval(() => {
      stageIdx = Math.min(stageIdx + 1, JOB_RUN_STAGES.length - 2);
      setRunStage(stageIdx);
    }, 750);

    // 3-attempt retry with exponential backoff
    let result: BackgroundJobTriggerResult | null = null;
    const RETRY_DELAYS_MS = [0, 1200, 2400];
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt > 0) {
        setRunAttempt(attempt + 1);
        await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt]));
      }
      result = await onTrigger(job.id);
      if (result !== null) break;
    }

    if (stageIntervalRef.current) {
      clearInterval(stageIntervalRef.current);
      stageIntervalRef.current = null;
    }

    if (result === null) {
      setRunPhase("error");
      setRunAttempt(0);
      setRunError("Service unavailable after 3 attempts. Please try again later.");
      setTimeout(() => { setRunPhase("idle"); setRunError(null); }, 5000);
      return;
    }

    // Success: show final stage briefly, then "done"
    setRunStage(JOB_RUN_STAGES.length - 1);
    setRunAttempt(0);
    await new Promise((r) => setTimeout(r, 400));
    setRunPhase("done");
    setTimeout(() => setRunPhase("idle"), 2500);
    Alert.alert("Job Triggered", result.result_summary, [{ text: "OK" }]);
  };

  const iconName = JOB_ICONS[job.job_type] ?? "gearshape.fill";
  const runStageLabel =
    runAttempt > 1
      ? `Retrying (${runAttempt}/3)…`
      : JOB_RUN_STAGES[runStage] ?? "Running…";

  return (
    <TouchableOpacity
      style={styles.jobCard}
      onPress={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}
      activeOpacity={0.88}
    >
      {/* Header row */}
      <View style={styles.jobCardHeader}>
        <View style={styles.jobCardHeaderLeft}>
          <View style={[styles.jobIconWrap, { backgroundColor: `${healthColor}18` }]}>
            <SymbolView name={iconName} size={14} tintColor={healthColor} resizeMode="scaleAspectFit" />
          </View>
          <View style={styles.jobCardInfo}>
            <Text style={styles.jobName}>{JOB_LABELS[job.job_type] ?? job.job_type}</Text>
            <Text style={styles.jobSchedule}>{job.schedule_label}</Text>
          </View>
        </View>
        <View style={[styles.jobHealthBadge, { borderColor: `${healthColor}55`, backgroundColor: `${healthColor}15` }]}>
          <View style={[styles.jobHealthDot, { backgroundColor: healthColor }]} />
          <Text style={[styles.jobHealthText, { color: healthColor }]}>{healthStatus}</Text>
        </View>
      </View>

      {/* Last / Next run row */}
      <View style={styles.jobMetaRow}>
        <View style={styles.jobMetaItem}>
          <Text style={styles.jobMetaLabel}>LAST RUN</Text>
          <Text style={styles.jobMetaValue}>{formatJobTime(job.last_run_at)}</Text>
        </View>
        <View style={styles.jobMetaDivider} />
        <View style={styles.jobMetaItem}>
          <Text style={styles.jobMetaLabel}>NEXT RUN</Text>
          <Text style={[
            styles.jobMetaValue,
            isDelayed && { color: colors.warning },
          ]}>{formatJobTime(job.next_run_at)}</Text>
        </View>
      </View>

      {/* Last error row — shown when job is in failed state or after a failed manual run */}
      {(job.status === "failed" || runPhase === "error") ? (
        <View style={styles.jobErrorRow}>
          <SymbolView name="exclamationmark.circle.fill" size={11} tintColor={colors.danger} resizeMode="scaleAspectFit" />
          <Text style={styles.jobErrorText} numberOfLines={2}>
            {runError ?? "Last run failed. Tap Run Now to retry."}
          </Text>
        </View>
      ) : null}

      {/* Run button */}
      {job.enabled ? (
        <TouchableOpacity
          style={[
            styles.jobRunBtn,
            runPhase === "running" && styles.jobRunBtnRunning,
            runPhase === "done"    && styles.jobRunBtnDone,
            runPhase === "error"   && styles.jobRunBtnError,
            (isMutating || runPhase === "running") && styles.btnDisabled,
          ]}
          onPress={handleRun}
          disabled={isMutating || runPhase === "running"}
          activeOpacity={0.75}
        >
          {runPhase === "running" ? (
            <>
              <ActivityIndicator size="small" color={colors.warning} style={{ width: 12, height: 12 }} />
              <Text style={[styles.jobRunBtnText, { color: colors.warning }]} numberOfLines={1}>
                {runStageLabel}
              </Text>
            </>
          ) : runPhase === "done" ? (
            <>
              <SymbolView name="checkmark.circle.fill" size={12} tintColor={colors.success} resizeMode="scaleAspectFit" />
              <Text style={[styles.jobRunBtnText, { color: colors.success }]}>COMPLETED</Text>
            </>
          ) : runPhase === "error" ? (
            <>
              <SymbolView name="exclamationmark.circle" size={12} tintColor={colors.danger} resizeMode="scaleAspectFit" />
              <Text style={[styles.jobRunBtnText, { color: colors.danger }]}>FAILED — TAP TO RETRY</Text>
            </>
          ) : (
            <>
              <SymbolView name="play.fill" size={10} tintColor={colors.success} resizeMode="scaleAspectFit" />
              <Text style={styles.jobRunBtnText}>Run Now</Text>
            </>
          )}
        </TouchableOpacity>
      ) : (
        <View style={styles.jobDisabledRow}>
          <SymbolView name="pause.circle" size={12} tintColor={colors.textMuted} resizeMode="scaleAspectFit" />
          <Text style={styles.jobDisabledText}>JOB DISABLED — enable in settings</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

// ── Suggestion card ───────────────────────────────────────────────────────────

type SuggestionCardProps = {
  item: SuggestionItem;
  isQueued: boolean;
  isMutating: boolean;
  onAddToQueue: (suggestion: SuggestionItem) => void;
  onRunNow: (suggestion: SuggestionItem) => Promise<AutonomyExecuteResult | null>;
};

function getRecommendationDetails(item: SuggestionItem) {
  const confidence =
    typeof item.payload_preview.confidence === "number"
      ? Math.round(item.payload_preview.confidence * (item.payload_preview.confidence <= 1 ? 100 : 1))
      : item.risk_level === "low" ? 94 : item.risk_level === "medium" ? 88 : 82;
  const expectedBenefit =
    typeof item.payload_preview.expected_benefit === "string"
      ? item.payload_preview.expected_benefit
      : item.reason;
  return {
    confidence: Math.max(0, Math.min(100, confidence)),
    expectedBenefit,
    duration: ACTION_DURATION[item.suggested_action_type] ?? "~20 min",
  };
}

function SuggestionCard({ item, isQueued, isMutating, onAddToQueue, onRunNow }: SuggestionCardProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [isRunning, setIsRunning] = useState(false);
  const details = getRecommendationDetails(item);
  const priorityColor = getRiskColors(colors)[item.risk_level] ?? colors.textMuted;

  const handleReview = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Alert.alert(
      item.title,
      `${item.description}\n\nExpected benefit\n${details.expectedBenefit}\n\nEstimated time: ${details.duration}\nConfidence: ${details.confidence}%`,
      [{ text: "Done" }],
    );
  };

  const handleRunNow = () => {
    Alert.alert(
      "Run this action now?",
      `HELIOS will execute “${item.title}” immediately after your confirmation.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Run Now",
          onPress: async () => {
            setIsRunning(true);
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            const result = await onRunNow(item);
            setIsRunning(false);
            if (result) Alert.alert("Completed", result.message, [{ text: "Done" }]);
          },
        },
      ],
    );
  };

  return (
    <View style={[styles.recommendationCard, isQueued && styles.cardQueued]}>
      <View style={styles.recommendationGlow} />
      <View style={styles.recommendationHeader}>
        <View style={[styles.priorityPill, { backgroundColor: `${priorityColor}18`, borderColor: `${priorityColor}55` }]}>
          <View style={[styles.priorityDot, { backgroundColor: priorityColor }]} />
          <Text style={[styles.priorityPillText, { color: priorityColor }]}>
            {item.risk_level.toUpperCase()}
          </Text>
        </View>
        <View style={styles.confidenceWrap}>
          <Text style={styles.recommendationMetaLabel}>Confidence</Text>
          <Text style={styles.confidenceValue}>{details.confidence}%</Text>
        </View>
      </View>

      <Text style={styles.recommendationTitle}>{item.title}</Text>
      <Text style={styles.recommendationDescription}>{item.description}</Text>

      <View style={styles.recommendationDetails}>
        <View style={styles.benefitBlock}>
          <Text style={styles.recommendationMetaLabel}>Expected benefit</Text>
          <Text style={styles.benefitText}>{details.expectedBenefit}</Text>
        </View>
        <View style={styles.durationBlock}>
          <SymbolView name="clock" size={13} tintColor={colors.accentCyan} resizeMode="scaleAspectFit" />
          <View>
            <Text style={styles.recommendationMetaLabel}>Estimated time</Text>
            <Text style={styles.durationValue}>{details.duration}</Text>
          </View>
        </View>
      </View>

      {isQueued ? (
        <View style={styles.queuedRow}>
          <SymbolView name="checkmark.circle.fill" size={14} tintColor={colors.success} resizeMode="scaleAspectFit" />
          <Text style={styles.queuedText}>Waiting for your review</Text>
        </View>
      ) : (
        <View style={styles.recommendationActions}>
          <TouchableOpacity style={styles.secondaryActionBtn} onPress={handleReview} activeOpacity={0.75}>
            <Text style={styles.secondaryActionText}>Review</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.runNowBtn, (isMutating || isRunning) && styles.btnDisabled]}
            onPress={handleRunNow}
            disabled={isMutating || isRunning}
            activeOpacity={0.75}
          >
            {isRunning ? (
              <ActivityIndicator color={colors.background} size="small" />
            ) : (
              <SymbolView name="bolt.fill" size={12} tintColor={colors.background} resizeMode="scaleAspectFit" />
            )}
            <Text style={styles.runNowText}>{isRunning ? "Running" : "Run Now"}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.secondaryActionBtn, isMutating && styles.btnDisabled]}
            onPress={() => onAddToQueue(item)}
            disabled={isMutating}
            activeOpacity={0.75}
          >
            <Text style={styles.secondaryActionText}>Ask First</Text>
          </TouchableOpacity>
        </View>
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
  item, isMutating, isExecuting, isBlocked, onApprove, onReject, onExecute,
}: QueueCardProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const isPending  = item.status === "pending";
  const isApproved = item.status === "approved";

  const handleApprove = () => {
    Alert.alert(
      "Approve Action",
      `Approve "${item.title}"?\n\nHELIOS will wait for your next step.`,
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
          <Badge label={item.risk_level.toUpperCase()} color={getRiskColors(colors)[item.risk_level] ?? colors.textMuted} />
          <Badge label={item.status.toUpperCase()} color={getStatusColors(colors)[item.status] ?? colors.textMuted} />
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
            <Text style={styles.blockedText}>Needs a permission update before HELIOS can continue</Text>
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

// ── Compact plan card ─────────────────────────────────────────────────────────

type CompactPlanCardProps = {
  plan: DailyPlan | null;
  isLoading: boolean;
  error: string | null;
  now: Date;
  onGenerate: () => Promise<DailyPlan | null>;
};

const PLAN_STAGES = [
  "Connecting to HELIOS…",
  "Loading your context…",
  "Analyzing goals & tasks…",
  "Reviewing your calendar…",
  "Building your plan…",
  "Saving results…",
];

function CompactPlanCard({ plan, isLoading, error, now, onGenerate }: CompactPlanCardProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [generationStep, setGenerationStep] = useState(0);
  const [isOrchestrating, setIsOrchestrating] = useState(false);

  const handleGenerate = async () => {
    if (isLoading || isOrchestrating) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setGenerationStep(0);
    setIsOrchestrating(true);
    const interval = setInterval(
      () => setGenerationStep((s) => Math.min(s + 1, PLAN_STAGES.length - 2)),
      640,
    );
    await Promise.all([
      onGenerate(),
      new Promise((r) => setTimeout(r, 3500)),
    ]);
    clearInterval(interval);
    setGenerationStep(PLAN_STAGES.length - 1);
    setIsOrchestrating(false);
  };

  const effectiveLoading = isLoading || isOrchestrating;
  const generatedStr = plan ? formatRelativeTime(plan.generated_at, now) : null;

  return (
    <View style={styles.compactPlanCard}>
      <View style={styles.compactPlanHeader}>
        <Text style={styles.sectionLabel}>{"TODAY'S SUPPORT"}</Text>
        {plan && !effectiveLoading ? (
          <TouchableOpacity
            onPress={handleGenerate}
            style={styles.compactPlanRefreshBtn}
            activeOpacity={0.7}
            accessibilityLabel="Refresh today's support"
          >
            <SymbolView name="arrow.clockwise" size={13} tintColor={colors.textMuted} resizeMode="scaleAspectFit" />
            <Text style={styles.compactPlanRefreshText}>Refresh</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {error ? (
        <ErrorCard
          title="Unable to generate today's plan"
          message={error}
          onRetry={handleGenerate}
          endpoint="/api/v1/autonomy/daily-plan"
        />
      ) : effectiveLoading ? (
        <View style={styles.compactPlanLoadingCard}>
          <ActivityIndicator color={colors.accent} size="small" />
          <View style={{ flex: 1, gap: 6 }}>
          <Text style={styles.compactPlanLoadingLabel}>{PLAN_STAGES[generationStep]}</Text>
            <View style={styles.generationProgress}>
              {PLAN_STAGES.map((_, i) => (
                <View
                  key={i}
                  style={[styles.generationProgressSegment, i <= generationStep && styles.generationProgressSegmentActive]}
                />
              ))}
            </View>
          </View>
        </View>
      ) : plan ? (
        <View style={styles.compactPlanBody}>
          <View style={styles.compactPlanTop}>
            <View style={styles.livePlanPill}>
              <View style={styles.livePlanDot} />
              <Text style={styles.livePlanText}>READY</Text>
            </View>
            {generatedStr ? (
              <Text style={styles.compactPlanGenTime}>{generatedStr}</Text>
            ) : null}
          </View>
          <Text style={styles.compactPlanOverview} numberOfLines={3}>{plan.overview}</Text>
          <View style={styles.compactPlanMetrics}>
            <View style={styles.compactPlanMetric}>
              <Text style={styles.compactPlanMetricValue}>{plan.focus_blocks.length}</Text>
              <Text style={styles.compactPlanMetricLabel}>blocks</Text>
            </View>
            <View style={styles.compactPlanMetricDivider} />
            <View style={styles.compactPlanMetric}>
              <Text style={styles.compactPlanMetricValue}>{plan.priority_tasks.length}</Text>
              <Text style={styles.compactPlanMetricLabel}>priorities</Text>
            </View>
            <View style={styles.compactPlanMetricDivider} />
            <View style={styles.compactPlanMetric}>
              <Text style={[styles.compactPlanMetricValue, plan.schedule_conflicts.length > 0 && { color: colors.warning }]}>
                {plan.schedule_conflicts.length}
              </Text>
              <Text style={styles.compactPlanMetricLabel}>conflicts</Text>
            </View>
          </View>
          {plan.schedule_conflicts.length > 0 ? (
            <View style={styles.compactPlanConflict}>
              <SymbolView name="exclamationmark.triangle.fill" size={12} tintColor={colors.warning} resizeMode="scaleAspectFit" />
              <Text style={styles.compactPlanConflictText} numberOfLines={2}>{plan.schedule_conflicts[0]}</Text>
            </View>
          ) : null}
        </View>
      ) : (
        <View style={styles.compactPlanEmpty}>
          <View style={styles.compactPlanEmptyCopy}>
            <Text style={styles.compactPlanEmptyTitle}>No plan yet.</Text>
            <Text style={styles.compactPlanEmptyBody}>
              Generate a plan and HELIOS will organize your goals, tasks, calendar, and reminders.
            </Text>
          </View>
          <TouchableOpacity
            style={styles.compactPlanGenBtn}
            onPress={handleGenerate}
            activeOpacity={0.8}
          >
            <SymbolView name="bolt.fill" size={11} tintColor={colors.background} resizeMode="scaleAspectFit" />
            <Text style={styles.compactPlanGenBtnText}>Generate Plan</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

// ── Quick actions row ─────────────────────────────────────────────────────────

type QuickAction = {
  id: string;
  label: string;
  icon: Parameters<typeof SymbolView>[0]["name"];
  onPress: () => void;
  badge?: number;
};

function QuickActionsRow({ actions }: { actions: QuickAction[] }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.quickActionsRow}
    >
      {actions.map((action) => (
        <TouchableOpacity
          key={action.id}
          style={styles.quickActionChip}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            action.onPress();
          }}
          activeOpacity={0.72}
        >
          <SymbolView name={action.icon} size={12} tintColor={colors.textPrimary} resizeMode="scaleAspectFit" />
          <Text style={styles.quickActionLabel}>{action.label}</Text>
          {action.badge && action.badge > 0 ? (
            <View style={styles.quickActionBadge}>
              <Text style={styles.quickActionBadgeText}>{action.badge > 9 ? "9+" : action.badge}</Text>
            </View>
          ) : null}
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

// ── System status card ────────────────────────────────────────────────────────

type SystemService = {
  id: string;
  label: string;
  icon: Parameters<typeof SymbolView>[0]["name"];
  statusText: string;
  dotColor: string;
  onPress?: () => void;
};

function SystemStatusCard({ services }: { services: SystemService[] }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.systemStatusCard}>
      {services.map((svc, i) => (
        <View key={svc.id}>
          <TouchableOpacity
            style={styles.serviceRow}
            onPress={svc.onPress}
            activeOpacity={svc.onPress ? 0.7 : 1}
            disabled={!svc.onPress}
          >
            <View style={styles.serviceRowLeft}>
              <SymbolView name={svc.icon} size={13} tintColor={svc.dotColor} resizeMode="scaleAspectFit" />
              <Text style={styles.serviceLabel}>{svc.label}</Text>
            </View>
            <View style={styles.serviceStatusWrap}>
              <View style={[styles.serviceStatusDot, { backgroundColor: svc.dotColor }]} />
              <Text style={[styles.serviceStatusText, { color: svc.dotColor }]}>{svc.statusText}</Text>
              {svc.onPress ? (
                <SymbolView name="chevron.right" size={10} tintColor={colors.textMuted} resizeMode="scaleAspectFit" />
              ) : null}
            </View>
          </TouchableOpacity>
          {i < services.length - 1 ? <View style={styles.serviceDivider} /> : null}
        </View>
      ))}
    </View>
  );
}

// ── Recommendation list section ───────────────────────────────────────────────

type RecommendationListSectionProps = {
  suggestions: SuggestionItem[];
  localFallback: LocalRecommendation[];
  isLoading: boolean;
  error: string | null;
  isMutating: boolean;
  onAddToQueue: (s: SuggestionItem) => void;
  onRunNow: (s: SuggestionItem) => Promise<AutonomyExecuteResult | null>;
  onRetry: () => void;
};

function RecommendationListSection({
  suggestions, localFallback, isLoading, error, isMutating, onAddToQueue, onRunNow, onRetry,
}: RecommendationListSectionProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const handleAIRowPress = (item: SuggestionItem) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Alert.alert(
      item.title,
      item.description,
      [
        { text: "Dismiss", style: "cancel" },
        { text: "Ask First", onPress: () => onAddToQueue(item) },
        {
          text: "Run Now",
          onPress: async () => {
            const result = await onRunNow(item);
            if (result) Alert.alert("Completed", result.message, [{ text: "Done" }]);
          },
        },
      ],
    );
  };

  const showAI   = suggestions.length > 0;
  const showLocal = !showAI && localFallback.length > 0;
  const totalCount = showAI ? suggestions.length : localFallback.length;

  return (
    <View>
      <View style={styles.sectionHeaderRow}>
        <Text style={styles.sectionLabel}>HELIOS RECOMMENDATIONS</Text>
        {totalCount > 0 ? (
          <View style={styles.countPill}>
            <Text style={styles.countPillText}>{totalCount}</Text>
          </View>
        ) : null}
      </View>

      {isLoading ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator color={colors.accent} size="small" />
          <Text style={styles.loadingText}>Scanning for recommendations…</Text>
        </View>
      ) : (
        <>
          {/* Error notice (non-blocking — local fallback shown below) */}
          {error ? (
            <View style={styles.recommendationErrorNotice}>
              <SymbolView name="wifi.slash" size={12} tintColor={colors.textMuted} resizeMode="scaleAspectFit" />
              <Text style={styles.recommendationErrorText}>
                {"Couldn't reach the recommendation service. Showing local intelligence."}
              </Text>
              <TouchableOpacity onPress={onRetry} style={styles.recommendationErrorRetry}>
                <Text style={styles.recommendationErrorRetryText}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          {/* AI suggestions */}
          {showAI ? (
            <View style={styles.recommendationListCard}>
              {suggestions.map((item, i) => {
                const dotColor = getRiskColors(colors)[item.risk_level] ?? colors.textMuted;
                return (
                  <View key={item.id}>
                    <TouchableOpacity
                      style={styles.recommendationListRow}
                      onPress={() => handleAIRowPress(item)}
                      activeOpacity={0.75}
                      disabled={isMutating}
                    >
                      <View style={[styles.recommendationListDot, { backgroundColor: dotColor }]} />
                      <Text style={styles.recommendationListName} numberOfLines={1}>{item.title}</Text>
                      <View style={styles.recommendationListMeta}>
                        <Text style={styles.recommendationListAgent}>{agentLabel(item.source_agent)}</Text>
                        <SymbolView name="chevron.right" size={11} tintColor={colors.textMuted} resizeMode="scaleAspectFit" />
                      </View>
                    </TouchableOpacity>
                    {i < suggestions.length - 1 ? <View style={styles.recommendationListDivider} /> : null}
                  </View>
                );
              })}
            </View>
          ) : showLocal ? (
            /* Local HELIOS intelligence fallback */
            <View style={styles.recommendationListCard}>
              {localFallback.map((item, i) => {
                const dotColor =
                  item.priority === "high" ? colors.warning :
                  item.priority === "medium" ? colors.accentCyan : colors.textMuted;
                return (
                  <View key={item.id}>
                    <View style={styles.recommendationListRow}>
                      <SymbolView name={item.icon} size={14} tintColor={dotColor} resizeMode="scaleAspectFit" />
                      <View style={{ flex: 1, gap: 1 }}>
                        <Text style={styles.recommendationListName} numberOfLines={1}>{item.title}</Text>
                        <Text style={styles.recommendationListSubtitle} numberOfLines={1}>{item.subtitle}</Text>
                      </View>
                      <SymbolView name="chevron.right" size={11} tintColor={colors.textMuted} resizeMode="scaleAspectFit" />
                    </View>
                    {i < localFallback.length - 1 ? <View style={styles.recommendationListDivider} /> : null}
                  </View>
                );
              })}
            </View>
          ) : null}
        </>
      )}
    </View>
  );
}

// ── Recent activity section ───────────────────────────────────────────────────

type RecentActivitySectionProps = {
  entries: AutonomyAuditLogEntry[];
  isLoading: boolean;
  now: Date;
  onPressEntry?: (entry: AutonomyAuditLogEntry) => void;
};

function RecentActivitySection({ entries, isLoading, now, onPressEntry }: RecentActivitySectionProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View>
      <Text style={styles.sectionLabel}>RECENT ACTIVITY</Text>
      {isLoading ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator color={colors.accent} size="small" />
          <Text style={styles.loadingText}>Loading activity…</Text>
        </View>
      ) : entries.length === 0 ? (
        <View style={styles.emptyState}>
          <SymbolView name="clock.arrow.circlepath" size={28} tintColor={colors.textMuted} resizeMode="scaleAspectFit" />
          <Text style={styles.emptyText}>No activity yet.</Text>
          <Text style={styles.emptySubtext}>
            HELIOS logs every autonomous decision here — approvals, executions, and system events appear as they happen.
          </Text>
        </View>
      ) : (
        <View style={styles.activityCard}>
          {entries.map((entry, i) => {
            const color    = getAuditEventColors(colors)[entry.event_type] ?? colors.textMuted;
            const label    = AUDIT_EVENT_LABELS[entry.event_type] ?? entry.event_type.replace(/_/g, " ");
            const iconName = AUDIT_EVENT_ICONS[entry.event_type] ?? "circle.fill";
            return (
              <View key={entry.id}>
                <TouchableOpacity
                  style={styles.activityRow}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    if (onPressEntry) {
                      onPressEntry(entry);
                    } else {
                      Alert.alert(label, entry.message || "No additional details.", [{ text: "Done" }]);
                    }
                  }}
                  activeOpacity={0.75}
                >
                  <View style={[styles.activityIconWrap, { backgroundColor: `${color}18` }]}>
                    <SymbolView name={iconName} size={12} tintColor={color} resizeMode="scaleAspectFit" />
                  </View>
                  <Text style={styles.activityLabel} numberOfLines={1}>{label}</Text>
                  <Text style={styles.activityTime}>{formatRelativeTime(entry.created_at, now)}</Text>
                </TouchableOpacity>
                {i < entries.length - 1 ? <View style={styles.activityDivider} /> : null}
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

// ── AI confidence card ────────────────────────────────────────────────────────

type AIConfidenceCardProps = {
  score: number;
  goalsCount: number;
  tasksCount: number;
  hasPlan: boolean;
  hasSuggestions: boolean;
  hasActivity: boolean;
};

function AIConfidenceCard({ score, goalsCount, tasksCount, hasPlan, hasSuggestions, hasActivity }: AIConfidenceCardProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const sources: string[] = [];
  if (goalsCount > 0)   sources.push("Goals");
  if (tasksCount > 0)   sources.push("Tasks");
  if (hasPlan)          sources.push("Execution Plan");
  if (hasSuggestions)   sources.push("AI Signals");
  if (hasActivity)      sources.push("Activity Log");
  if (sources.length === 0) sources.push("Basic profile");

  const barColor = score >= 80 ? colors.success : score >= 55 ? colors.warning : colors.danger;

  return (
    <View style={styles.confidenceCard}>
      <View style={styles.confidenceHeader}>
        <SymbolView name="brain.head.profile" size={14} tintColor={colors.accentCyan} resizeMode="scaleAspectFit" />
        <Text style={styles.confidenceTitle}>PLANNING CONFIDENCE</Text>
      </View>
      <View style={styles.confidenceBody}>
        <Text style={[styles.confidenceScore, { color: barColor }]}>{score}%</Text>
        <View style={styles.confidenceTrackWrap}>
          <View style={styles.confidenceTrack}>
            <View style={{ flex: score, height: 5, backgroundColor: barColor, borderRadius: 3 }} />
            <View style={{ flex: Math.max(0, 100 - score) }} />
          </View>
          <Text style={styles.confidenceScoreLabel}>
            {score >= 80 ? "High confidence" : score >= 55 ? "Moderate" : "Low — add more context"}
          </Text>
        </View>
      </View>
      <Text style={styles.confidenceSources}>Based on: {sources.join(" · ")}</Text>
    </View>
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

function AddRuleForm({ onSave, onCancel, isMutating }: AddRuleFormProps) {
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

function RuleCard({ rule, isMutating, onToggleExecution, onDelete }: RuleCardProps) {
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
          <Badge label={(ACTION_LABELS[rule.action_type] ?? rule.action_type).toUpperCase()} color={colors.accentCyan} />
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

      {rule.notes ? <Text style={styles.cardDescription}>{rule.notes}</Text> : null}

      <Text style={styles.ruleIndicatorText}>
        {rule.requires_manual_approval
          ? "⚠ Manual approval required before execution"
          : "○ No manual approval requirement set"}
      </Text>

      <View style={styles.actionRow}>
        <TouchableOpacity
          style={[styles.actionBtn, rule.allow_execution ? styles.rejectBtn : styles.approveBtn, isMutating && styles.btnDisabled]}
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
  suggestion_created:        "AI recommendations refreshed",
  queue_item_created:        "Action queued for review",
  queue_item_approved:       "Action approved",
  queue_item_rejected:       "Action dismissed",
  queue_item_executed:       "Action executed successfully",
  execution_blocked_by_rule: "Execution blocked by rule",
  execution_failed:          "Execution failed",
};

const AUDIT_EVENT_ICONS: Record<string, Parameters<typeof SymbolView>[0]["name"]> = {
  suggestion_created:        "lightbulb.fill",
  queue_item_created:        "plus.circle.fill",
  queue_item_approved:       "checkmark.circle.fill",
  queue_item_rejected:       "xmark.circle.fill",
  queue_item_executed:       "bolt.fill",
  execution_blocked_by_rule: "lock.fill",
  execution_failed:          "exclamationmark.circle.fill",
};

function getAuditEventColors(c: ThemeColors): Record<string, string> {
  return {
    suggestion_created:        c.info,
    queue_item_created:        c.accentCyan,
    queue_item_approved:       c.success,
    queue_item_rejected:       c.textMuted,
    queue_item_executed:       c.success,
    execution_blocked_by_rule: c.warning,
    execution_failed:          c.danger,
  };
}

function formatAuditTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

type AuditEntryRowProps = { entry: AutonomyAuditLogEntry };

function AuditEntryRow({ entry }: AuditEntryRowProps) {
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
  onRetry?: () => void;
};

function AuditLogSection({ entries, isLoading, error, onRetry }: AuditLogSectionProps) {
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
        <ErrorCard
          title="Audit log unavailable"
          message={error}
          onRetry={onRetry}
          endpoint="/api/v1/autonomy/audit-log"
        />
      ) : entries.length === 0 ? (
        <View style={styles.emptyState}>
          <SymbolView name="doc.text.magnifyingglass" size={36} tintColor={colors.textMuted} resizeMode="scaleAspectFit" />
          <Text style={styles.emptyText}>No activity recorded yet.</Text>
          <Text style={styles.emptySubtext}>
            Your full decision history — approvals, rejections, and executions — appears here.
          </Text>
        </View>
      ) : (
        <View style={styles.auditCard}>
          {entries.map((entry, i) => (
            <View key={entry.id}>
              <AuditEntryRow entry={entry} />
              {i < entries.length - 1 ? <View style={styles.auditDivider} /> : null}
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
    items, isLoading, error,
    isSuggestionsLoading, suggestionsError,
    dailyPlanError,
    isRulesLoading,
    fetchQueue, fetchSuggestions, generateDailyPlan,
    fetchRules,
  } = useAutonomyStore();

  const { fetchJobs } = useBackgroundJobsStore();

  // ── Entrance animations ──────────────────────────────────────────────────────
  const fadeAnims = useRef(
    Array.from({ length: 5 }, () => new Animated.Value(0))
  ).current;

  useEffect(() => {
    Animated.stagger(
      80,
      fadeAnims.map((a) =>
        Animated.timing(a, { toValue: 1, duration: 380, useNativeDriver: true })
      )
    ).start();
  }, [fadeAnims]);

  const pulseAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1, duration: 1600, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 0, duration: 1600, useNativeDriver: true }),
      ]),
    ).start();
  }, [pulseAnim]);

  const slideStyle = (idx: number) => ({
    opacity: fadeAnims[idx],
    transform: [{ translateY: fadeAnims[idx].interpolate({ inputRange: [0, 1], outputRange: [22, 0] }) }],
  });

  // ── Scroll navigation ────────────────────────────────────────────────────────
  const scrollRef = useRef<ScrollView>(null);
  const planY     = useRef(0);

  // ── Data ─────────────────────────────────────────────────────────────────────
  const loadAll = useCallback(() => {
    if (!accessToken) return;
    fetchQueue(accessToken);
    fetchSuggestions(accessToken);
    fetchRules(accessToken);
    fetchJobs(accessToken);
  }, [accessToken, fetchQueue, fetchSuggestions, fetchRules, fetchJobs]);

  useEffect(() => { loadAll(); }, [loadAll]);

  // ── Auto-refresh every 60 s while the app is active ──────────────────────────
  useEffect(() => {
    const intervalRef = { current: null as ReturnType<typeof setInterval> | null };

    const start = () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = setInterval(() => {
        if (accessToken) {
          fetchSuggestions(accessToken);
          fetchQueue(accessToken);
          fetchJobs(accessToken);
        }
      }, 60_000);
    };

    start();

    const sub = AppState.addEventListener("change", (s: AppStateStatus) => {
      if (s === "active") { loadAll(); start(); }
      else if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    });

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      sub.remove();
    };
  // intentional: only restarts when token changes; individual fetch fns are stable
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  const handleGenerateDailyPlan = useCallback(
    () => accessToken ? generateDailyPlan(accessToken) : Promise.resolve(null),
    [accessToken, generateDailyPlan],
  );
  const isRefreshing = isLoading || isSuggestionsLoading || isRulesLoading;

  // ── Approved reference content ─────────────────────────────────────────────
  const assistantStatus = { text: "Ready", dotColor: colors.success };

  const pulseStyle = {
    opacity: pulseAnim.interpolate({ inputRange: [0, 1], outputRange: [0.38, 1] }),
    transform: [{ scale: pulseAnim.interpolate({ inputRange: [0, 1], outputRange: [0.78, 1.25] }) }],
  };
  const analysisItems = [
    { id: "calendar", icon: "calendar", title: "Calendar synchronized", time: "9:26 PM", color: colors.success },
    { id: "study", icon: "book.closed.fill", title: "Study schedule analyzed", time: "9:27 PM", color: colors.accentCyan },
    { id: "goals", icon: "target", title: "Goals reviewed", time: "9:27 PM", color: colors.accent },
    { id: "weather", icon: "cloud.sun.fill", title: "Weather updated", time: "9:27 PM", color: colors.accentCyan },
    { id: "more", icon: "sparkles", title: "+3 more systems", time: "9:27 PM", color: colors.success },
  ];

  const opportunities = [
    {
      id: "study-window",
      icon: "clock.fill",
      color: colors.accent,
      title: "You have a 2-hour uninterrupted study window tonight.",
      subtitle: "Focus score: 94%",
    },
    {
      id: "graduation",
      icon: "graduationcap.fill",
      color: colors.success,
      title: "Completing D278 tonight keeps your graduation timeline on track.",
      subtitle: "On schedule",
    },
    {
      id: "development",
      icon: "sparkles",
      color: colors.accentCyan,
      title: "No meetings tomorrow morning.",
      subtitle: "Ideal time for HELIOS development.",
    },
  ];

  const predictions = [
    { id: "course", icon: "graduationcap.fill", color: colors.accent, title: "If you complete D278 tonight", detail: "Projected completion: Tomorrow" },
    { id: "milestone", icon: "chart.line.uptrend.xyaxis", color: colors.success, title: "Current pace predicts", detail: "SE milestone remains on schedule." },
    { id: "free-time", icon: "clock.fill", color: colors.accentCyan, title: "Estimated free time tomorrow", detail: "2h 45m" },
    { id: "battery", icon: "battery.100percent", color: colors.warning, title: "Battery should last until", detail: "11:48 PM" },
  ];

  const smartPlans = [
    {
      id: "study-sprint",
      icon: "book.fill",
      title: "Study Sprint",
      duration: "2h 15m",
      focus: "High",
      accent: colors.accentCyan,
    },
    {
      id: "creative-session",
      icon: "paintbrush.pointed.fill",
      title: "Creative Session",
      duration: "1h 30m",
      focus: "Medium",
      accent: colors.accent,
    },
    {
      id: "software-block",
      icon: "chevron.left.forwardslash.chevron.right",
      title: "Software Sprint",
      duration: "2h 30m",
      focus: "High",
      accent: colors.success,
    },
    {
      id: "recovery-evening",
      icon: "leaf.fill",
      title: "Recovery Evening",
      duration: "1h 00m",
      focus: "Low",
      accent: colors.textMuted,
    },
  ];

  const watchlist = [
    { id: "calendar", label: "Calendar", status: "Healthy", color: colors.success },
    { id: "wgu", label: "WGU", status: "Healthy", color: colors.success },
    { id: "goals", label: "Goals", status: "Healthy", color: colors.success },
    { id: "deadlines", label: "Deadlines", status: "Healthy", color: colors.success },
    { id: "email", label: "Email", status: "Healthy", color: colors.success },
    { id: "internet", label: "Internet", status: "Healthy", color: colors.success },
    { id: "storage", label: "Storage", status: "Healthy", color: colors.success },
    { id: "weather", label: "Weather", status: "Healthy", color: colors.success },
  ];

  const waitingItems = [
    "Approve tomorrow’s study schedule",
    "Approve suggested calendar changes",
  ];

  const memoryInsights = [
    "You study best after 7 PM.",
    "You complete programming tasks faster at night.",
    "Tuesdays are usually your longest work sessions.",
    "You prefer shorter, focused work blocks.",
  ];

  const intelligenceFeed = [
    { id: "sync", time: "9:26 PM", title: "Calendar synchronized" },
    { id: "window", time: "9:27 PM", title: "Found 2-hour study window" },
    { id: "schedule", time: "9:27 PM", title: "Updated tomorrow’s schedule" },
    { id: "sprint", time: "9:28 PM", title: "Generated Software Sprint plan" },
    { id: "monitor", time: "9:28 PM", title: "Monitoring remaining tasks" },
  ];

  return (
    <ScrollView
      ref={scrollRef}
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.md, paddingBottom: insets.bottom + 132 }]}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={isRefreshing} onRefresh={loadAll} tintColor={colors.accentCyan} />
      }
    >
      <View style={styles.topActions}>
        <TouchableOpacity style={styles.topActionButton} activeOpacity={0.78}>
          <SymbolView name="bell" size={20} tintColor={colors.textPrimary} resizeMode="scaleAspectFit" />
          <View style={styles.topActionBadge}>
            <Text style={styles.topActionBadgeText}>9+</Text>
          </View>
        </TouchableOpacity>
        <TouchableOpacity style={styles.topActionButton} activeOpacity={0.78}>
          <SymbolView name="gearshape" size={20} tintColor={colors.textPrimary} resizeMode="scaleAspectFit" />
        </TouchableOpacity>
      </View>

      {/* ── Hero ────────────────────────────────────────────────────────── */}
      <Animated.View style={slideStyle(0)}>
        <View style={styles.referenceHero}>
          <Text style={styles.brainHeroKicker}>HELIOS AUTONOMY</Text>
          <Text style={styles.brainHeroTitle}>HELIOS is thinking for you.</Text>
          <Text style={styles.brainHeroSubtitle}>Analyzing, predicting, and preparing so you can focus on what matters most.</Text>
          <View style={styles.brainHeroStatus}>
            <Animated.View style={[styles.brainHeroStatusHalo, pulseStyle, { backgroundColor: assistantStatus.dotColor }]} />
            <View style={[styles.brainHeroStatusDot, { backgroundColor: assistantStatus.dotColor }]} />
            <Text style={styles.brainHeroStatusText}>{assistantStatus.text.toUpperCase()}</Text>
          </View>
        </View>
      </Animated.View>

      {/* ── Live Analysis ───────────────────────────────────────────────── */}
      <Animated.View style={slideStyle(1)}>
        <View style={styles.liveHeaderRow}>
          <View style={styles.sectionTitleWithIcon}>
            <SymbolView name="waveform.path" size={15} tintColor={colors.accent} resizeMode="scaleAspectFit" />
            <Text style={styles.brainSectionLabel}>LIVE ANALYSIS</Text>
          </View>
          <View style={styles.operationalPill}>
            <Text style={styles.operationalText}>All systems operational</Text>
            <View style={styles.operationalDot} />
          </View>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.analysisRail}>
          {analysisItems.map((item) => (
            <View key={item.id} style={styles.analysisCard}>
              <View style={styles.analysisCheck}>
                <SymbolView name="checkmark" size={8} tintColor={colors.background} resizeMode="scaleAspectFit" />
              </View>
              <View style={[styles.analysisIconWrap, { backgroundColor: `${item.color}18` }]}>
                <SymbolView name={item.icon as any} size={14} tintColor={item.color} resizeMode="scaleAspectFit" />
              </View>
              <View style={styles.analysisCopy}>
                <Text style={styles.analysisTitle} numberOfLines={2}>{item.title}</Text>
                <View style={styles.analysisMetaRow}>
                  <Animated.View style={[styles.analysisPulse, pulseStyle, { backgroundColor: item.color }]} />
                  <Text style={styles.analysisUpdated}>{item.time}</Text>
                </View>
              </View>
            </View>
          ))}
        </ScrollView>
      </Animated.View>

      {/* ── Opportunities ───────────────────────────────────────────────── */}
      <Animated.View style={slideStyle(2)}>
        <View style={styles.opportunitiesCard}>
          <View style={styles.cardHeaderRow}>
            <View style={styles.sectionTitleWithIcon}>
              <SymbolView name="lightbulb" size={15} tintColor={colors.accent} resizeMode="scaleAspectFit" />
              <Text style={styles.cardSectionLabel}>OPPORTUNITIES</Text>
            </View>
            <Text style={styles.viewAllText}>View all ›</Text>
          </View>
          {opportunities.map((item) => (
            <View key={item.id} style={styles.opportunityRow}>
              <View style={[styles.rowIconCircle, { backgroundColor: `${item.color}18` }]}>
                <SymbolView name={item.icon as any} size={16} tintColor={item.color} resizeMode="scaleAspectFit" />
              </View>
              <View style={styles.opportunityCopy}>
                <Text style={styles.opportunityTitle}>{item.title}</Text>
                <Text style={[styles.opportunitySubtitle, { color: item.color }]}>{item.subtitle}</Text>
              </View>
              <SymbolView name="chevron.right" size={12} tintColor={colors.textMuted} resizeMode="scaleAspectFit" />
            </View>
          ))}
        </View>
      </Animated.View>

      <Animated.View style={slideStyle(3)} onLayout={(e) => { planY.current = e.nativeEvent.layout.y; }}>
        <View style={styles.twoColumnRow}>
          <View style={styles.halfPanel}>
            <View style={styles.cardHeaderRow}>
              <View style={styles.sectionTitleWithIcon}>
                <SymbolView name="chart.bar.xaxis" size={14} tintColor={colors.accent} resizeMode="scaleAspectFit" />
                <Text style={styles.cardSectionLabel}>PREDICTIONS</Text>
              </View>
              <Text style={styles.viewAllText}>View all ›</Text>
            </View>
            {predictions.map((item) => (
              <View key={item.id} style={styles.compactInsightRow}>
                <View style={[styles.compactIconCircle, { backgroundColor: `${item.color}18` }]}>
                  <SymbolView name={item.icon as any} size={13} tintColor={item.color} resizeMode="scaleAspectFit" />
                </View>
                <View style={styles.predictionCopy}>
                  <Text style={styles.predictionTitle}>{item.title}</Text>
                  <Text style={[styles.predictionDetail, { color: item.color }]}>{item.detail}</Text>
                </View>
              </View>
            ))}
          </View>

          <View style={styles.halfPanel}>
            <View style={styles.cardHeaderRow}>
              <View style={styles.sectionTitleWithIcon}>
                <SymbolView name="sparkles" size={14} tintColor={colors.accent} resizeMode="scaleAspectFit" />
                <Text style={styles.cardSectionLabel}>SMART PLANS</Text>
              </View>
              <Text style={styles.viewAllText}>View all ›</Text>
            </View>
            {smartPlans.map((plan) => (
              <TouchableOpacity
                key={plan.id}
                style={styles.compactPlanRow}
                activeOpacity={0.82}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  handleGenerateDailyPlan();
                }}
              >
                <View style={[styles.compactIconCircle, { backgroundColor: `${plan.accent}18` }]}>
                  <SymbolView name={plan.icon as any} size={13} tintColor={plan.accent} resizeMode="scaleAspectFit" />
                </View>
                <View style={styles.smartPlanBody}>
                  <Text style={styles.smartPlanTitle}>{plan.title}</Text>
                  <Text style={styles.smartPlanMetaLine}>{plan.duration} • {plan.focus} focus</Text>
                </View>
                <SymbolView name="chevron.right" size={10} tintColor={colors.textMuted} resizeMode="scaleAspectFit" />
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </Animated.View>

      <Animated.View style={slideStyle(4)}>
        <View style={styles.twoColumnRow}>
          <View style={styles.halfPanel}>
            <View style={styles.cardHeaderRow}>
              <View style={styles.sectionTitleWithIcon}>
                <SymbolView name="eye.fill" size={14} tintColor={colors.accent} resizeMode="scaleAspectFit" />
                <Text style={styles.cardSectionLabel}>WATCHLIST</Text>
              </View>
            </View>
            <View style={styles.watchlistColumns}>
              {watchlist.map((item) => (
                <View key={item.id} style={styles.watchlistItem}>
                  <View style={[styles.watchlistDot, { backgroundColor: item.color }]} />
                  <Text style={styles.watchlistLabel}>{item.label}</Text>
                  <Text style={[styles.watchlistStatus, { color: item.color }]}>Healthy</Text>
                </View>
              ))}
            </View>
            <Text style={styles.watchlistFooter}>Everything is running smoothly.</Text>
          </View>

          <View style={styles.halfPanel}>
            <View style={styles.cardHeaderRow}>
              <View style={styles.sectionTitleWithIcon}>
                <SymbolView name="hand.raised.fill" size={14} tintColor={colors.accent} resizeMode="scaleAspectFit" />
                <Text style={styles.cardSectionLabel}>WAITING FOR YOU</Text>
              </View>
              <View style={styles.waitingCountBadge}><Text style={styles.waitingCountText}>2</Text></View>
            </View>
            {waitingItems.map((item) => (
              <View key={item} style={styles.waitingCard}>
                <View style={[styles.compactIconCircle, { backgroundColor: `${colors.accent}18` }]}>
                  <SymbolView name="slider.horizontal.3" size={13} tintColor={colors.accent} resizeMode="scaleAspectFit" />
                </View>
                <Text style={styles.waitingTitle} numberOfLines={3}>{item}</Text>
                <SymbolView name="chevron.right" size={10} tintColor={colors.textMuted} resizeMode="scaleAspectFit" />
              </View>
            ))}
          </View>
        </View>
      </Animated.View>

      <Animated.View style={slideStyle(4)}>
        <View style={styles.twoColumnRow}>
          <View style={styles.halfPanel}>
            <View style={styles.cardHeaderRow}>
              <View style={styles.sectionTitleWithIcon}>
                <SymbolView name="brain.head.profile" size={14} tintColor={colors.accent} resizeMode="scaleAspectFit" />
                <Text style={styles.cardSectionLabel}>MEMORY</Text>
              </View>
              <Text style={styles.memoryHeaderText}>Recently learned</Text>
            </View>
            {memoryInsights.map((insight) => (
              <View key={insight} style={styles.memoryRow}>
                <View style={styles.memoryBullet} />
                <Text style={styles.memoryText}>{insight}</Text>
              </View>
            ))}
            <Text style={styles.viewAllText}>View all insights ›</Text>
          </View>

          <View style={styles.halfPanel}>
            <View style={styles.cardHeaderRow}>
              <View style={styles.sectionTitleWithIcon}>
                <SymbolView name="waveform.path" size={14} tintColor={colors.accent} resizeMode="scaleAspectFit" />
                <Text style={styles.cardSectionLabel}>INTELLIGENCE FEED</Text>
              </View>
              <Text style={styles.liveText}>Live</Text>
            </View>
            {intelligenceFeed.map((entry, index) => (
              <View key={entry.id} style={styles.feedRow}>
                <Text style={styles.feedTime}>{entry.time}</Text>
                <View style={styles.feedTimeline}>
                  <View style={[styles.feedDot, index === intelligenceFeed.length - 1 && { backgroundColor: colors.accentCyan }]} />
                  {index < intelligenceFeed.length - 1 ? <View style={styles.feedLine} /> : null}
                </View>
                <Text style={styles.feedTitle}>{entry.title}</Text>
              </View>
            ))}
            <Text style={styles.viewAllText}>View full feed ›</Text>
          </View>
        </View>
        {(error || suggestionsError || dailyPlanError) ? (
          <Text style={styles.brainFooterNote}>Some live signals are temporarily unavailable.</Text>
        ) : null}
        {isLoading && items.length === 0 ? (
          <ActivityIndicator color={colors.accent} style={{ marginTop: spacing.lg }} />
        ) : null}
      </Animated.View>
    </ScrollView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content:   { paddingHorizontal: spacing.lg },

  // ── HELIOS brain experience ───────────────────────────────────────────────
  topActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  topActionButton: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: `${colors.card}B8`,
    alignItems: "center",
    justifyContent: "center",
  },
  topActionBadge: {
    position: "absolute",
    top: -4,
    right: -2,
    minWidth: 27,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 5,
  },
  topActionBadgeText: {
    fontSize: 11,
    lineHeight: 14,
    color: colors.textPrimary,
    fontWeight: "900" as const,
  },
  referenceHero: {
    paddingTop: spacing.sm,
    paddingBottom: spacing.xl,
  },
  brainHeroCard: {
    minHeight: 248,
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: `${colors.accent}40`,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    overflow: "hidden",
  },
  brainHeroGlow: {
    position: "absolute",
    width: 220,
    height: 220,
    borderRadius: 110,
    right: -70,
    top: -75,
    backgroundColor: `${colors.accent}18`,
  },
  brainHeroTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.lg,
  },
  brainHeroKicker: {
    ...typography.caption,
    color: colors.accent,
    letterSpacing: 2.4,
    marginBottom: spacing.sm,
  },
  brainHeroStatus: {
    minHeight: 30,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: `${colors.card}CC`,
    paddingHorizontal: spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    overflow: "hidden",
    alignSelf: "flex-start",
    marginTop: spacing.md,
  },
  brainHeroStatusHalo: {
    position: "absolute",
    left: 9,
    width: 16,
    height: 16,
    borderRadius: 8,
  },
  brainHeroStatusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  brainHeroStatusText: {
    fontSize: 10,
    lineHeight: 13,
    fontWeight: "800" as const,
    color: colors.textSecondary,
    letterSpacing: 1.1,
  },
  brainHeroTitle: {
    fontSize: 40,
    lineHeight: 47,
    fontWeight: "900" as const,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
    maxWidth: 310,
  },
  brainHeroSubtitle: {
    fontSize: 15,
    lineHeight: 22,
    color: colors.textSecondary,
    maxWidth: 310,
  },
  brainSectionLabel: {
    ...typography.caption,
    color: colors.textPrimary,
    letterSpacing: 2.2,
    marginBottom: 0,
    marginTop: 0,
  },
  cardSectionLabel: {
    ...typography.caption,
    color: colors.textPrimary,
    letterSpacing: 1.8,
  },
  liveHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.md,
  },
  sectionTitleWithIcon: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    flexShrink: 1,
  },
  operationalPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  operationalText: {
    fontSize: 12,
    color: colors.textSecondary,
    fontWeight: "600" as const,
  },
  operationalDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.success,
  },
  analysisRail: {
    gap: spacing.sm,
    paddingRight: spacing.lg,
    marginBottom: spacing.lg,
  },
  analysisCard: {
    width: 145,
    minHeight: 148,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    justifyContent: "space-between",
    alignItems: "center",
  },
  analysisCheck: {
    position: "absolute",
    top: 10,
    right: 10,
    width: 15,
    height: 15,
    borderRadius: 8,
    backgroundColor: colors.success,
    alignItems: "center",
    justifyContent: "center",
  },
  analysisIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  analysisCopy: { gap: spacing.sm, alignItems: "center" },
  analysisTitle: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "800" as const,
    color: colors.textPrimary,
    textAlign: "center",
  },
  analysisMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  analysisPulse: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  analysisUpdated: {
    fontSize: 12,
    lineHeight: 15,
    color: colors.textMuted,
  },
  opportunitiesCard: {
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  opportunityRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  opportunityCopy: { flex: 1, gap: 4 },
  opportunityRail: {
    gap: spacing.md,
    paddingRight: spacing.lg,
    marginBottom: spacing.lg,
  },
  opportunityCard: {
    width: 285,
    minHeight: 205,
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    justifyContent: "space-between",
  },
  opportunityEyebrow: {
    fontSize: 10,
    lineHeight: 13,
    color: colors.accentCyan,
    fontWeight: "800" as const,
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  opportunityTitle: {
    fontSize: 15,
    lineHeight: 21,
    fontWeight: "700" as const,
    color: colors.textPrimary,
  },
  opportunitySubtitle: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "800" as const,
  },
  opportunityDetail: {
    fontSize: 13,
    lineHeight: 19,
    color: colors.textSecondary,
    marginTop: spacing.sm,
  },
  opportunitySignal: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  opportunitySignalLabel: {
    fontSize: 11,
    color: colors.textMuted,
    fontWeight: "700" as const,
  },
  opportunitySignalValue: {
    fontSize: 14,
    color: colors.accentCyan,
    fontWeight: "900" as const,
    maxWidth: 150,
    textAlign: "right",
  },
  cardHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  viewAllText: {
    fontSize: 12,
    lineHeight: 16,
    color: colors.accent,
    fontWeight: "900" as const,
  },
  rowIconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },
  twoColumnRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  halfPanel: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    minWidth: 0,
  },
  predictionCard: {
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.sm,
    marginBottom: spacing.lg,
    overflow: "hidden",
  },
  predictionRow: {
    minHeight: 66,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  predictionDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.accent,
  },
  predictionCopy: { flex: 1, gap: 3 },
  predictionTitle: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "800" as const,
    color: colors.textPrimary,
  },
  predictionDetail: {
    fontSize: 11,
    lineHeight: 15,
    color: colors.textSecondary,
    fontWeight: "800" as const,
  },
  predictionDivider: {
    position: "absolute",
    left: spacing.lg,
    right: spacing.lg,
    bottom: 0,
    height: 1,
    backgroundColor: colors.border,
  },
  smartPlansStack: {
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  compactInsightRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  compactPlanRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingBottom: spacing.sm,
    marginBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: `${colors.border}88`,
  },
  compactIconCircle: {
    width: 31,
    height: 31,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  smartPlanCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm,
    overflow: "hidden",
  },
  smartPlanAccent: {
    width: 4,
    alignSelf: "stretch",
    borderRadius: 99,
  },
  smartPlanBody: {
    flex: 1,
    gap: 7,
  },
  smartPlanTitle: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "900" as const,
    color: colors.textPrimary,
  },
  smartPlanMetaLine: {
    fontSize: 11,
    lineHeight: 15,
    color: colors.textSecondary,
    fontWeight: "600" as const,
  },
  smartPlanMeta: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  smartPlanMetaText: {
    fontSize: 10,
    lineHeight: 13,
    color: colors.textMuted,
    fontWeight: "800" as const,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  watchlistColumns: {
    flexDirection: "row",
    flexWrap: "wrap",
    rowGap: spacing.sm,
    columnGap: spacing.sm,
  },
  watchlistItem: {
    width: "47%",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  watchlistDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  watchlistLabel: {
    fontSize: 11,
    lineHeight: 15,
    color: colors.textPrimary,
    fontWeight: "800" as const,
  },
  watchlistStatus: {
    fontSize: 10,
    lineHeight: 15,
    fontWeight: "700" as const,
  },
  watchlistFooter: {
    textAlign: "center",
    fontSize: 12,
    lineHeight: 17,
    color: colors.textSecondary,
    marginTop: spacing.md,
  },
  waitingCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: `${colors.border}88`,
  },
  waitingTitle: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "700" as const,
    color: colors.textPrimary,
  },
  waitingText: {
    fontSize: 12,
    lineHeight: 17,
    color: colors.textSecondary,
  },
  waitingButton: {
    borderRadius: 999,
    backgroundColor: colors.accent,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  waitingButtonText: {
    fontSize: 12,
    fontWeight: "800" as const,
    color: colors.background,
  },
  waitingCountBadge: {
    minWidth: 25,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 7,
  },
  waitingCountText: {
    fontSize: 12,
    fontWeight: "900" as const,
    color: colors.textPrimary,
  },
  memoryCard: {
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  memoryKicker: {
    fontSize: 10,
    lineHeight: 13,
    fontWeight: "900" as const,
    color: colors.accent,
    letterSpacing: 1.3,
  },
  memoryHeaderText: {
    fontSize: 10,
    color: colors.accent,
    fontWeight: "800" as const,
  },
  memoryRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  memoryBullet: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.accent,
    marginTop: 7,
  },
  memoryText: {
    flex: 1,
    fontSize: 11,
    lineHeight: 17,
    color: colors.textSecondary,
  },
  feedCard: {
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  feedRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    minHeight: 25,
  },
  feedTime: {
    width: 50,
    fontSize: 10,
    lineHeight: 16,
    color: colors.textMuted,
    fontWeight: "800" as const,
  },
  feedTimeline: {
    width: 16,
    alignItems: "center",
    minHeight: 38,
  },
  feedDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.accentCyan,
    marginTop: 4,
  },
  feedLine: {
    flex: 1,
    width: 1,
    backgroundColor: colors.border,
    marginTop: 4,
  },
  feedTitle: {
    flex: 1,
    fontSize: 10,
    lineHeight: 15,
    color: colors.textPrimary,
    fontWeight: "700" as const,
  },
  liveText: {
    fontSize: 11,
    lineHeight: 15,
    color: colors.success,
    fontWeight: "900" as const,
  },
  brainFooterNote: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: spacing.md,
  },

  // ── Hero ───────────────────────────────────────────────────────────────────
  heroCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
    overflow: "hidden",
  },
  heroAccentBar: {
    height: 3,
    backgroundColor: colors.accent,
  },
  heroInner: {
    padding: spacing.md,
    gap: spacing.xs,
  },
  heroTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: spacing.xs,
  },
  heroLabel: {
    ...typography.caption,
    color: colors.accent,
    letterSpacing: 2,
    marginBottom: spacing.xs,
  },
  heroTitle: {
    fontSize: 30,
    lineHeight: 36,
    fontWeight: "900" as const,
    color: colors.textPrimary,
  },
  heroSubtitle: { ...typography.body, color: colors.textSecondary },
  heroReadyPill: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    marginTop: spacing.xs,
    borderWidth: 1,
    borderColor: `${colors.success}35`,
    backgroundColor: `${colors.success}12`,
    borderRadius: 999,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
  },
  heroReadyDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  heroReadyText: {
    fontSize: 11,
    fontWeight: "700" as const,
    color: colors.textSecondary,
  },
  heroStatusDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.surfaceDark,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  heroPulseDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },

  // ── Today's Mission ────────────────────────────────────────────────────────
  missionCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: `${colors.accent}40`,
    marginBottom: spacing.md,
    overflow: "hidden",
  },
  missionAccentBar: {
    height: 3,
    backgroundColor: colors.accent,
  },
  missionContent: {
    padding: spacing.lg,
    gap: spacing.sm,
  },
  missionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  missionHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  missionLabel: {
    fontSize: 9,
    fontWeight: "700" as const,
    letterSpacing: 2,
    color: colors.accent,
  },
  missionPriorityBadge: {
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  missionPriorityText: {
    fontSize: 8,
    fontWeight: "700" as const,
    letterSpacing: 0.8,
  },
  missionTitle: {
    fontSize: 18,
    fontWeight: "700" as const,
    color: colors.textPrimary,
    lineHeight: 24,
  },
  missionDescription: {
    ...typography.body,
    color: colors.textSecondary,
    lineHeight: 21,
  },
  missionFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: spacing.xs,
  },
  missionMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    flex: 1,
  },
  missionMetaText: {
    fontSize: 11,
    color: colors.textMuted,
    fontWeight: "500" as const,
  },
  missionMetaDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: colors.textMuted,
    opacity: 0.5,
  },
  missionStartBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  missionStartBtnText: {
    fontSize: 12,
    fontWeight: "700" as const,
    color: colors.background,
    letterSpacing: 0.3,
  },

  // ── Section labels ─────────────────────────────────────────────────────────
  sectionLabel: {
    ...typography.caption,
    color: colors.textMuted,
    letterSpacing: 2,
    marginBottom: spacing.sm,
    marginTop: spacing.sm,
  },
  sectionDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.lg,
    opacity: 0.75,
  },

  // ── Assistant overview ───────────────────────────────────────────────────
  overviewGrid: {
    flexDirection: "row",
    gap: 7,
  },
  overviewCard: {
    flex: 1,
    minHeight: 80,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 10,
    gap: 5,
  },
  overviewIconWrap: {
    width: 26,
    height: 26,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },
  overviewLabel: {
    fontSize: 8,
    lineHeight: 11,
    fontWeight: "700" as const,
    color: colors.textMuted,
  },
  overviewValue: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: "800" as const,
  },

  // ── Suggested next steps ─────────────────────────────────────────────────
  inlineMutedText: {
    ...typography.caption,
    color: colors.textMuted,
    marginBottom: spacing.sm,
  },
  nextStepsCard: {
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
  },
  nextStepRow: {
    minHeight: 76,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  nextStepContent: {
    flex: 1,
    gap: 3,
  },
  nextStepCategory: {
    fontSize: 9,
    lineHeight: 12,
    color: colors.accentCyan,
    fontWeight: "800" as const,
    textTransform: "uppercase",
    letterSpacing: 1.1,
  },
  nextStepTitle: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "800" as const,
    color: colors.textPrimary,
  },
  nextStepSubtitle: {
    fontSize: 12,
    lineHeight: 17,
    color: colors.textSecondary,
  },
  nextStepDivider: {
    position: "absolute",
    left: spacing.lg,
    right: spacing.lg,
    bottom: 0,
    height: 1,
    backgroundColor: colors.border,
  },

  // ── Compact approvals ────────────────────────────────────────────────────
  approvalEmptyCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  approvalEmptyTitle: {
    fontSize: 14,
    lineHeight: 19,
    fontWeight: "800" as const,
    color: colors.textPrimary,
  },
  approvalEmptyText: {
    fontSize: 12,
    lineHeight: 17,
    color: colors.textSecondary,
    marginTop: 2,
  },
  approvalCompactCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  approvalCompactTitle: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "800" as const,
    color: colors.textPrimary,
  },
  approvalCompactText: {
    fontSize: 12,
    lineHeight: 17,
    color: colors.textSecondary,
  },
  approvalCompactButton: {
    borderRadius: 999,
    backgroundColor: colors.accent,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
  },
  approvalCompactButtonText: {
    fontSize: 12,
    fontWeight: "800" as const,
    color: colors.background,
  },

  // ── Premium execution plan ────────────────────────────────────────────────
  executionSectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.md,
    marginTop: spacing.sm,
  },
  executionEyebrow: {
    fontSize: 9,
    fontWeight: "700" as const,
    letterSpacing: 1.8,
    color: colors.accent,
    marginBottom: spacing.xs,
  },
  executionTitle: {
    fontSize: 24,
    lineHeight: 30,
    fontWeight: "800" as const,
    color: colors.textPrimary,
    letterSpacing: -0.5,
  },
  rebuildBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  planEmptyCard: {
    alignItems: "center",
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: `${colors.accent}38`,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xl,
    overflow: "hidden",
  },
  planEmptyIcon: {
    width: 62,
    height: 62,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: `${colors.accent}16`,
    borderWidth: 1,
    borderColor: `${colors.accent}35`,
    marginBottom: spacing.lg,
  },
  planEmptyTitle: {
    fontSize: 19,
    lineHeight: 26,
    fontWeight: "700" as const,
    color: colors.textPrimary,
    textAlign: "center",
    maxWidth: 310,
  },
  planEmptyBody: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: "center",
    lineHeight: 22,
    marginTop: spacing.sm,
    maxWidth: 340,
  },
  recommendationSignal: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    backgroundColor: `${colors.accentCyan}10`,
    borderWidth: 1,
    borderColor: `${colors.accentCyan}30`,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginTop: spacing.lg,
  },
  recommendationSignalText: {
    fontSize: 12,
    fontWeight: "600" as const,
    color: colors.accentCyan,
    flexShrink: 1,
  },
  estimateRow: {
    alignItems: "center",
    marginTop: spacing.lg,
    marginBottom: spacing.md,
    gap: 3,
  },
  estimateLabel: {
    fontSize: 11,
    color: colors.textMuted,
  },
  estimateValue: {
    fontSize: 13,
    fontWeight: "700" as const,
    color: colors.textSecondary,
  },
  primaryPlanCta: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: colors.accent,
    shadowColor: colors.accent,
    shadowOpacity: 0.32,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  primaryPlanCtaText: {
    fontSize: 15,
    fontWeight: "800" as const,
    color: colors.background,
    letterSpacing: 0.1,
  },
  planLoadingCard: {
    alignItems: "center",
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: `${colors.accent}45`,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xl,
  },
  orbitWrap: {
    width: 64,
    height: 64,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.lg,
  },
  orbitCore: {
    position: "absolute",
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceDark,
  },
  planLoadingTitle: {
    fontSize: 18,
    fontWeight: "700" as const,
    color: colors.textPrimary,
  },
  planLoadingSubtext: {
    ...typography.caption,
    color: colors.textMuted,
    textAlign: "center",
    marginTop: spacing.xs,
  },
  generationProgress: {
    alignSelf: "stretch",
    flexDirection: "row",
    gap: spacing.xs,
    marginTop: spacing.lg,
  },
  generationProgressSegment: {
    flex: 1,
    height: 3,
    borderRadius: 2,
    backgroundColor: colors.border,
  },
  generationProgressSegmentActive: {
    backgroundColor: colors.accent,
  },
  missionSummaryCard: {
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: `${colors.accent}40`,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  missionSummaryTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  livePlanPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: radius.sm,
    backgroundColor: `${colors.success}14`,
    borderWidth: 1,
    borderColor: `${colors.success}35`,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  livePlanDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.success,
  },
  livePlanText: {
    fontSize: 8,
    fontWeight: "800" as const,
    letterSpacing: 1,
    color: colors.success,
  },
  missionSummaryLabel: {
    fontSize: 11,
    fontWeight: "700" as const,
    letterSpacing: 1,
    color: colors.accent,
    textTransform: "uppercase",
    marginBottom: spacing.xs,
  },
  planAtGlance: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  planMetric: {
    flex: 1,
    alignItems: "center",
    gap: 2,
  },
  planMetricValue: {
    fontSize: 20,
    fontWeight: "800" as const,
    color: colors.textPrimary,
  },
  planMetricLabel: {
    fontSize: 10,
    color: colors.textMuted,
  },
  planMetricDivider: {
    width: 1,
    height: 28,
    backgroundColor: colors.border,
  },
  timelineCard: {
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
  },
  timelineRow: {
    flexDirection: "row",
    alignItems: "stretch",
    minHeight: 78,
  },
  timelineTime: {
    width: 54,
    paddingTop: 1,
    fontSize: 12,
    fontWeight: "700" as const,
    color: colors.accentCyan,
    fontVariant: ["tabular-nums"],
  },
  timelineRail: {
    width: 24,
    alignItems: "center",
  },
  timelineDot: {
    width: 13,
    height: 13,
    borderRadius: 7,
    borderWidth: 3,
    backgroundColor: colors.surfaceDark,
    zIndex: 1,
  },
  timelineLine: {
    width: 1,
    flex: 1,
    backgroundColor: colors.border,
    marginTop: 3,
  },
  timelineContent: {
    flex: 1,
    paddingLeft: spacing.sm,
    paddingBottom: spacing.lg,
  },
  timelineActivity: {
    fontSize: 16,
    lineHeight: 20,
    fontWeight: "700" as const,
    color: colors.textPrimary,
  },
  timelineTask: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 3,
  },
  timelineRange: {
    fontSize: 10,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  attentionCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    backgroundColor: `${colors.warning}0F`,
    borderWidth: 1,
    borderColor: `${colors.warning}35`,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  attentionTitle: {
    fontSize: 12,
    fontWeight: "700" as const,
    color: colors.warning,
    marginBottom: 3,
  },
  attentionText: {
    ...typography.caption,
    color: colors.textSecondary,
    lineHeight: 18,
  },

  // ── Recommended next actions ──────────────────────────────────────────────
  recommendationsHeading: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  recommendationsTitle: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: "800" as const,
    color: colors.textPrimary,
    letterSpacing: -0.35,
  },
  recommendationsSubtitle: {
    ...typography.caption,
    color: colors.textMuted,
    lineHeight: 18,
    marginTop: spacing.xs,
    maxWidth: 300,
  },
  recommendationCountPill: {
    minWidth: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: `${colors.accent}18`,
    borderWidth: 1,
    borderColor: `${colors.accent}40`,
  },
  recommendationCountText: {
    fontSize: 12,
    fontWeight: "800" as const,
    color: colors.accent,
  },
  recommendationCard: {
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.md,
    overflow: "hidden",
  },
  recommendationGlow: {
    position: "absolute",
    width: 120,
    height: 120,
    borderRadius: 60,
    right: -52,
    top: -58,
    backgroundColor: `${colors.accent}0D`,
  },
  recommendationHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.md,
  },
  priorityPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  priorityDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  priorityPillText: {
    fontSize: 9,
    fontWeight: "800" as const,
    letterSpacing: 1,
  },
  confidenceWrap: {
    alignItems: "flex-end",
    gap: 1,
  },
  recommendationMetaLabel: {
    fontSize: 10,
    color: colors.textMuted,
  },
  confidenceValue: {
    fontSize: 16,
    fontWeight: "800" as const,
    color: colors.accentCyan,
  },
  recommendationTitle: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: "700" as const,
    color: colors.textPrimary,
  },
  recommendationDescription: {
    ...typography.body,
    color: colors.textSecondary,
    lineHeight: 21,
    marginTop: spacing.xs,
  },
  recommendationDetails: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  benefitBlock: {
    flex: 1,
    backgroundColor: colors.surfaceDark,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderDark,
    padding: spacing.sm,
    gap: 4,
  },
  benefitText: {
    fontSize: 12,
    lineHeight: 17,
    color: colors.textSecondary,
  },
  durationBlock: {
    width: 108,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    backgroundColor: colors.surfaceDark,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderDark,
    padding: spacing.sm,
  },
  durationValue: {
    fontSize: 12,
    fontWeight: "700" as const,
    color: colors.textPrimary,
    marginTop: 2,
  },
  recommendationActions: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  secondaryActionBtn: {
    flex: 1,
    minHeight: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceDark,
  },
  secondaryActionText: {
    fontSize: 12,
    fontWeight: "700" as const,
    color: colors.textSecondary,
  },
  runNowBtn: {
    flex: 1.25,
    minHeight: 42,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: radius.md,
    backgroundColor: colors.accent,
  },
  runNowText: {
    fontSize: 12,
    fontWeight: "800" as const,
    color: colors.background,
  },
  recommendationsClearCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: `${colors.success}0C`,
    borderWidth: 1,
    borderColor: `${colors.success}30`,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  recommendationsClearTitle: {
    fontSize: 14,
    fontWeight: "700" as const,
    color: colors.textPrimary,
  },
  recommendationsClearText: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: 2,
  },

  // ── Loading row ────────────────────────────────────────────────────────────
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.md,
  },
  loadingText: { ...typography.caption, color: colors.textMuted },

  // ── Error ──────────────────────────────────────────────────────────────────
  errorBox: {
    backgroundColor: `${colors.danger}1a`,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: `${colors.danger}4d`,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  errorText: { ...typography.body, color: colors.danger },

  // ── Empty state ────────────────────────────────────────────────────────────
  emptyState: {
    alignItems: "center",
    paddingVertical: spacing.xl,
    gap: spacing.sm,
  },
  emptyText: {
    ...typography.body,
    color: colors.textSecondary,
    marginTop: spacing.xs,
    textAlign: "center",
  },
  emptySubtext: {
    ...typography.caption,
    color: colors.textMuted,
    textAlign: "center",
    paddingHorizontal: spacing.lg,
    lineHeight: 18,
  },

  // ── Cards (shared base) ────────────────────────────────────────────────────
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
  cardMeta:        { flexDirection: "row", gap: spacing.xs },
  cardAgent:       { ...typography.caption, color: colors.textMuted, letterSpacing: 1 },
  cardTitle:       { ...typography.title, color: colors.textPrimary },
  cardActionType:  { ...typography.caption, color: colors.accentCyan, letterSpacing: 1 },
  cardDescription: { ...typography.body, color: colors.textSecondary, marginTop: spacing.xs },
  cardTimestamp:   { ...typography.caption, color: colors.textMuted, marginTop: spacing.xs },

  // ── Reason box ─────────────────────────────────────────────────────────────
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

  // ── Payload preview ────────────────────────────────────────────────────────
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
  payloadKey:  { color: colors.textMuted },
  payloadVal:  { color: colors.textSecondary },

  // ── Badges ─────────────────────────────────────────────────────────────────
  badge: {
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  badgeText: { fontSize: 9, fontWeight: "700" as const, letterSpacing: 0.8 },

  // ── Action buttons ─────────────────────────────────────────────────────────
  actionRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm },
  actionBtn: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    alignItems: "center",
    borderWidth: 1,
  },
  btnDisabled: { opacity: 0.5 },

  approveBtn:     { backgroundColor: `${colors.success}1a`, borderColor: colors.success },
  approveBtnText: { ...typography.caption, color: colors.success, fontWeight: "700" as const, letterSpacing: 1 },

  rejectBtn:      { backgroundColor: `${colors.danger}1a`, borderColor: colors.danger },
  rejectBtnText:  { ...typography.caption, color: colors.danger, fontWeight: "700" as const, letterSpacing: 1 },

  executeBtn:     { backgroundColor: `${colors.accent}26`, borderColor: colors.accent, marginTop: spacing.sm },
  executeBtnText: { ...typography.caption, color: colors.accent, fontWeight: "700" as const, letterSpacing: 1 },

  addToQueueBtn:     { backgroundColor: `${colors.accentCyan}1a`, borderColor: colors.accentCyan, marginTop: spacing.sm },
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

  // ── Daily plan ─────────────────────────────────────────────────────────────
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
  planDate:     { ...typography.caption, color: colors.accent, letterSpacing: 1.5, marginBottom: spacing.xs },
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
  energyDot: { width: 8, height: 8, borderRadius: 4, marginLeft: spacing.sm },
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
  priorityRank:      { ...typography.caption, color: colors.textMuted, fontWeight: "700" as const, minWidth: 20 },
  priorityDuration:  { ...typography.caption, color: colors.textMuted, marginLeft: "auto" },
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
  planBullet:   { color: colors.textMuted },

  // ── Blocked by rule ────────────────────────────────────────────────────────
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
  blockedText: { ...typography.caption, color: colors.danger, letterSpacing: 0.5, flex: 1 },

  // ── Rules section ──────────────────────────────────────────────────────────
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
  ruleIndicatorText: { ...typography.caption, color: colors.textMuted, marginTop: 2, lineHeight: 16 },

  // ── Add rule form ──────────────────────────────────────────────────────────
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
  formOptionGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  formOptionRow:  { flexDirection: "row", gap: spacing.xs },
  formOption: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceDark,
  },
  formOptionActive:  { borderColor: colors.accentCyan, backgroundColor: `${colors.accentCyan}1a` },
  formOptionAllowed: { borderColor: colors.success, backgroundColor: `${colors.success}1a` },
  formOptionBlocked: { borderColor: colors.danger, backgroundColor: `${colors.danger}1a` },
  formOptionText:       { fontSize: 9, fontWeight: "700" as const, letterSpacing: 0.8, color: colors.textMuted },
  formOptionActiveText: { color: colors.accentCyan },

  // ── Audit log ──────────────────────────────────────────────────────────────
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
  auditDot:       { width: 8, height: 8, borderRadius: 4, marginTop: 5, flexShrink: 0 },
  auditRowContent: { flex: 1, gap: 2 },
  auditRowHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: spacing.xs,
  },
  auditEventLabel: { fontSize: 9, fontWeight: "700" as const, letterSpacing: 1.2, flex: 1 },
  auditTimestamp:  { ...typography.caption, color: colors.textMuted },
  auditMessage:    { ...typography.body, color: colors.textSecondary, lineHeight: 20 },
  auditActionType: {
    fontSize: 9,
    fontWeight: "700" as const,
    letterSpacing: 0.8,
    color: colors.textMuted,
    marginTop: 2,
  },
  auditDivider: { height: 1, backgroundColor: colors.border, marginHorizontal: spacing.md },

  // ── Stats row ──────────────────────────────────────────────────────────────
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
    gap: 2,
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
  ccDivider: { width: 1, backgroundColor: colors.border, marginVertical: spacing.sm },

  // ── Job cards ──────────────────────────────────────────────────────────────
  bgJobsCard: {
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  jobCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  jobCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  jobCardHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    flex: 1,
  },
  jobIconWrap: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  jobCardInfo: { flex: 1, gap: 2 },
  jobName:     { ...typography.body, color: colors.textPrimary, fontWeight: "600" as const, fontSize: 14 },
  jobSchedule: { ...typography.caption, color: colors.textMuted, marginTop: 1 },
  jobHealthBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  jobHealthDot: { width: 5, height: 5, borderRadius: 2.5 },
  jobHealthText: { fontSize: 8, fontWeight: "700" as const, letterSpacing: 0.8 },
  jobMetaRow: {
    flexDirection: "row",
    backgroundColor: colors.surfaceDark,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.borderDark,
    overflow: "hidden",
  },
  jobMetaItem:    { flex: 1, padding: spacing.sm, gap: 3 },
  jobMetaDivider: { width: 1, backgroundColor: colors.borderDark },
  jobMetaLabel:   { fontSize: 8, fontWeight: "700" as const, letterSpacing: 1, color: colors.textMuted },
  jobMetaValue:   { fontSize: 11, fontWeight: "600" as const, color: colors.textSecondary },
  jobRunBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.success,
    backgroundColor: `${colors.success}14`,
  },
  jobRunBtnRunning: { borderColor: colors.warning, backgroundColor: `${colors.warning}14` },
  jobRunBtnDone:    { borderColor: colors.success,  backgroundColor: `${colors.success}26` },
  jobRunBtnText:    { fontSize: 10, fontWeight: "700" as const, letterSpacing: 1, color: colors.success },
  jobDisabledRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    paddingVertical: spacing.sm,
  },
  jobDisabledText: {
    fontSize: 9,
    fontWeight: "700" as const,
    letterSpacing: 0.8,
    color: colors.textMuted,
    opacity: 0.6,
  },

  // ── Job error row ──────────────────────────────────────────────────────────
  jobErrorRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.xs,
    backgroundColor: `${colors.danger}0f`,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: `${colors.danger}35`,
    padding: spacing.sm,
  },
  jobErrorText: {
    fontSize: 11,
    color: colors.danger,
    flex: 1,
    lineHeight: 16,
  },
  jobRunBtnError: {
    borderColor: colors.danger,
    backgroundColor: `${colors.danger}14`,
  },

  // ── Error card ─────────────────────────────────────────────────────────────
  errorCard: {
    backgroundColor: `${colors.danger}0f`,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: `${colors.danger}35`,
    padding: spacing.md,
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  errorCardTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
  },
  errorCardIconWrap: {
    marginTop: 2,
    flexShrink: 0,
  },
  errorCardBody: {
    flex: 1,
    gap: 3,
  },
  errorCardTitle: {
    fontSize: 13,
    fontWeight: "700" as const,
    color: colors.danger,
  },
  errorCardMessage: {
    ...typography.caption,
    color: colors.textSecondary,
    lineHeight: 17,
  },
  errorRetryBtn: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.danger,
    backgroundColor: `${colors.danger}1a`,
    flexShrink: 0,
  },
  errorRetryText: {
    fontSize: 10,
    fontWeight: "700" as const,
    color: colors.danger,
    letterSpacing: 0.5,
  },
  errorDetailsToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 2,
    alignSelf: "flex-start",
  },
  errorDetailsToggleText: {
    fontSize: 10,
    color: colors.textMuted,
    textDecorationLine: "underline" as const,
  },
  errorDetailsBox: {
    backgroundColor: colors.surfaceDark,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.borderDark,
    padding: spacing.sm,
    gap: 4,
  },
  errorDetailRow: {
    fontSize: 10,
    color: colors.textMuted,
    lineHeight: 16,
  },
  errorDetailKey: {
    fontWeight: "700" as const,
    color: colors.textSecondary,
  },

  // ── Compact plan card ──────────────────────────────────────────────────────
  compactPlanCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  compactPlanHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.sm,
  },
  compactPlanRefreshBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  compactPlanRefreshText: {
    fontSize: 11,
    color: colors.textMuted,
    fontWeight: "500" as const,
  },
  compactPlanLoadingCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  compactPlanLoadingLabel: {
    fontSize: 13,
    fontWeight: "600" as const,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  compactPlanBody: { gap: spacing.md },
  compactPlanTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  compactPlanGenTime: {
    fontSize: 11,
    color: colors.textMuted,
    fontWeight: "500" as const,
  },
  compactPlanOverview: {
    ...typography.body,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  compactPlanMetrics: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surfaceDark,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
  },
  compactPlanMetric: {
    flex: 1,
    alignItems: "center",
    paddingVertical: spacing.sm,
    gap: 1,
  },
  compactPlanMetricValue: {
    fontSize: 18,
    fontWeight: "700" as const,
    color: colors.textPrimary,
  },
  compactPlanMetricLabel: {
    fontSize: 9,
    color: colors.textMuted,
    letterSpacing: 0.5,
  },
  compactPlanMetricDivider: {
    width: 1,
    height: 28,
    backgroundColor: colors.border,
  },
  compactPlanConflict: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.xs,
    backgroundColor: `${colors.warning}10`,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: `${colors.warning}30`,
    padding: spacing.sm,
  },
  compactPlanConflictText: {
    flex: 1,
    fontSize: 11,
    color: colors.warning,
    lineHeight: 16,
  },
  compactPlanEmpty: {
    gap: spacing.sm,
  },
  compactPlanEmptyCopy: { gap: spacing.xs },
  compactPlanEmptyTitle: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "800" as const,
    color: colors.textPrimary,
  },
  compactPlanEmptyBody: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 19,
  },
  compactPlanGenBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    alignSelf: "flex-start",
  },
  compactPlanGenBtnText: {
    fontSize: 11,
    fontWeight: "700" as const,
    color: colors.background,
    letterSpacing: 0.2,
  },

  // ── System status card ─────────────────────────────────────────────────────
  systemStatusCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.lg,
    overflow: "hidden",
  },
  serviceRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingVertical: 13,
  },
  serviceRowLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  serviceLabel: {
    fontSize: 13,
    fontWeight: "500" as const,
    color: colors.textPrimary,
  },
  serviceStatusWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  serviceStatusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  serviceStatusText: {
    fontSize: 12,
    fontWeight: "600" as const,
  },
  serviceDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginHorizontal: spacing.lg,
    opacity: 0.6,
  },

  // ── Recommendation list ────────────────────────────────────────────────────
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.sm,
    marginTop: spacing.sm,
  },
  countPill: {
    backgroundColor: `${colors.accent}20`,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: `${colors.accent}40`,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  countPillText: {
    fontSize: 10,
    fontWeight: "700" as const,
    color: colors.accent,
    letterSpacing: 0.5,
  },
  recommendationListCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
  },
  recommendationListRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: 13,
    gap: spacing.sm,
  },
  recommendationListDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    flexShrink: 0,
  },
  recommendationListName: {
    flex: 1,
    fontSize: 13,
    fontWeight: "500" as const,
    color: colors.textPrimary,
  },
  recommendationListMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    flexShrink: 0,
  },
  recommendationListAgent: {
    fontSize: 10,
    fontWeight: "600" as const,
    color: colors.textMuted,
    letterSpacing: 0.5,
  },
  recommendationListDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginHorizontal: spacing.lg,
    opacity: 0.6,
  },

  // ── Recent activity ────────────────────────────────────────────────────────
  activityCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
  },
  activityRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
    gap: spacing.sm,
  },
  activityDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    flexShrink: 0,
  },
  activityLabel: {
    flex: 1,
    fontSize: 13,
    fontWeight: "500" as const,
    color: colors.textPrimary,
  },
  activityTime: {
    fontSize: 11,
    color: colors.textMuted,
    fontWeight: "500" as const,
    flexShrink: 0,
  },
  activityDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginHorizontal: spacing.lg,
    opacity: 0.6,
  },

  // ── AI confidence card ─────────────────────────────────────────────────────
  confidenceCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
  },
  confidenceHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  confidenceTitle: {
    ...typography.caption,
    color: colors.textMuted,
    letterSpacing: 2,
  },
  confidenceBody: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  confidenceScore: {
    fontSize: 28,
    fontWeight: "800" as const,
    letterSpacing: -0.5,
    minWidth: 60,
  },
  confidenceTrackWrap: {
    flex: 1,
    gap: spacing.xs,
  },
  confidenceTrack: {
    flexDirection: "row",
    height: 5,
    borderRadius: 3,
    overflow: "hidden",
    backgroundColor: colors.surfaceDark,
  },
  confidenceScoreLabel: {
    fontSize: 11,
    color: colors.textMuted,
    fontWeight: "500" as const,
  },
  confidenceSources: {
    fontSize: 11,
    color: colors.textMuted,
    lineHeight: 16,
  },

  // ── Quick actions ──────────────────────────────────────────────────────────
  quickActionsRow: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
    flexDirection: "row",
  },
  quickActionChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: spacing.md,
    paddingVertical: 9,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    flexShrink: 0,
  },
  quickActionLabel: {
    fontSize: 12,
    fontWeight: "600" as const,
    color: colors.textPrimary,
    letterSpacing: 0.1,
  },
  quickActionBadge: {
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
  },
  quickActionBadgeText: {
    fontSize: 9,
    fontWeight: "700" as const,
    color: colors.background,
  },

  // ── Activity icon wrap ─────────────────────────────────────────────────────
  activityIconWrap: {
    width: 26,
    height: 26,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },

  // ── Recommendation error notice ────────────────────────────────────────────
  recommendationErrorNotice: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.surfaceDark,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm,
    marginBottom: spacing.sm,
  },
  recommendationErrorText: {
    flex: 1,
    fontSize: 11,
    color: colors.textMuted,
    lineHeight: 16,
  },
  recommendationErrorRetry: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  recommendationErrorRetryText: {
    fontSize: 10,
    fontWeight: "700" as const,
    color: colors.textSecondary,
    letterSpacing: 0.3,
  },
  recommendationListSubtitle: {
    fontSize: 11,
    color: colors.textMuted,
    lineHeight: 15,
  },

  // ── Legacy admin divider styles ────────────────────────────────────────────
  governanceDivider: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    marginVertical: spacing.xl,
  },
  governanceLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.border,
    opacity: 0.6,
  },
  governanceLabel: {
    ...typography.caption,
    color: colors.textMuted,
    letterSpacing: 3,
    fontSize: 9,
  },
});
}
