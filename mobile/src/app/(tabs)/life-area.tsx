import React, { useMemo } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SymbolView } from "expo-symbols";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle } from "react-native-svg";

import { spacing, radius, typography, type ThemeColors } from "../../theme/theme";
import { useTheme } from "../../theme/ThemeContext";
import { useGoalsStore, useTasksStore } from "../../store";
import type { Goal } from "../../services/goalsService";
import type { Task } from "../../services/tasksService";
import { isActiveGoalStatus } from "../../utils/homeFormatting";
import { LIFE_AREAS, assignLifeArea } from "../../utils/lifeAreas";

// ── Helpers ───────────────────────────────────────────────────────────────────

function isCompletedGoal(goal: Goal) {
  const s = goal.status?.trim().toLowerCase().replace(/[\s-]+/g, "_");
  return s === "completed" || s === "done";
}

function isArchivedGoal(goal: Goal) {
  return goal.status?.trim().toLowerCase() === "archived";
}

function daysRemaining(goal: Goal): number | null {
  if (!goal.target_date) return null;
  const d = new Date(goal.target_date);
  if (isNaN(d.getTime())) return null;
  return Math.round((d.getTime() - Date.now()) / 86400000);
}

function goalProgress(goal: Goal, tasks: Task[]): number {
  if (isCompletedGoal(goal)) return 100;
  if (isArchivedGoal(goal)) return 0;
  const linked = tasks.filter((t) => t.linked_goal_id === goal.id);
  if (linked.length > 0) {
    return Math.round((linked.filter((t) => t.status === "done").length / linked.length) * 100);
  }
  const rem = daysRemaining(goal);
  if (rem === null) return 25;
  if (rem < 0)  return 10;
  if (rem <= 7) return 70;
  if (rem <= 30) return 45;
  return 20;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function priorityDotColor(priority: string): string {
  const p = priority?.toLowerCase();
  if (p === "urgent" || p === "high") return "#ef4444";
  if (p === "medium") return "#f59e0b";
  return "#6b7280";
}

// ── Progress Ring ─────────────────────────────────────────────────────────────

function ProgressRing({ progress, size, stroke, accent }: {
  progress: number;
  size: number;
  stroke: number;
  accent: string;
}) {
  const r    = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const fill = circ * (1 - Math.max(0, Math.min(100, progress)) / 100);
  return (
    <Svg width={size} height={size} style={{ transform: [{ rotate: "-90deg" }] }}>
      <Circle cx={size / 2} cy={size / 2} r={r} stroke={`${accent}22`} strokeWidth={stroke} fill="none" />
      <Circle
        cx={size / 2} cy={size / 2} r={r}
        stroke={accent}
        strokeWidth={stroke}
        fill="none"
        strokeDasharray={`${circ}`}
        strokeDashoffset={fill}
        strokeLinecap="round"
      />
    </Svg>
  );
}

// ── GoalRow ───────────────────────────────────────────────────────────────────

function GoalRow({ goal, tasks, accent, colors, styles, dimmed = false }: {
  goal: Goal;
  tasks: Task[];
  accent: string;
  colors: ThemeColors;
  styles: ReturnType<typeof createStyles>;
  dimmed?: boolean;
}) {
  const progress  = goalProgress(goal, tasks);
  const linked    = tasks.filter((t) => t.linked_goal_id === goal.id);
  const openCount = linked.filter((t) => t.status !== "done").length;
  const dateStr   = formatDate(goal.target_date);

  return (
    <View style={[styles.goalCard, dimmed && { opacity: 0.55 }]}>
      <View style={styles.goalCardTop}>
        <Text style={styles.goalCardTitle} numberOfLines={2}>{goal.title}</Text>
        {isCompletedGoal(goal) && (
          <SymbolView name="checkmark.seal.fill" size={16} tintColor={accent} resizeMode="scaleAspectFit" />
        )}
      </View>

      <View style={styles.goalCardMeta}>
        {dateStr ? (
          <Text style={styles.goalCardDate}>
            <SymbolView name="calendar" size={10} tintColor={colors.textMuted} resizeMode="scaleAspectFit" />
            {" "}{dateStr}
          </Text>
        ) : null}
        {linked.length > 0 && (
          <Text style={styles.goalCardTaskCount}>
            {linked.length - openCount}/{linked.length} tasks
          </Text>
        )}
      </View>

      <View style={styles.goalProgressTrack}>
        <View style={[styles.goalProgressFill, { width: `${progress}%`, backgroundColor: accent }]} />
      </View>
      <Text style={[styles.goalProgressPct, { color: `${accent}cc` }]}>{progress}%</Text>
    </View>
  );
}

// ── TaskRow ───────────────────────────────────────────────────────────────────

function TaskRow({ task, accent, colors, styles, onPress }: {
  task: Task;
  accent: string;
  colors: ThemeColors;
  styles: ReturnType<typeof createStyles>;
  onPress: () => void;
}) {
  const dateStr = formatDate(task.due_date);
  const isDone  = task.status === "done";

  return (
    <TouchableOpacity
      style={styles.taskRow}
      onPress={onPress}
      activeOpacity={0.78}
    >
      <View style={[styles.taskCheck, isDone && { backgroundColor: `${accent}30`, borderColor: accent }]}>
        {isDone && <SymbolView name="checkmark" size={8} tintColor={accent} resizeMode="scaleAspectFit" />}
      </View>

      <View style={styles.taskBody}>
        <Text
          style={[styles.taskTitle, isDone && { textDecorationLine: "line-through", color: colors.textMuted }]}
          numberOfLines={1}
        >
          {task.title}
        </Text>
        {dateStr ? <Text style={styles.taskDate}>{dateStr}</Text> : null}
      </View>

      <View style={[styles.taskPriorityDot, { backgroundColor: priorityDotColor(task.priority) }]} />
    </TouchableOpacity>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function LifeAreaScreen() {
  const { colors }  = useTheme();
  const insets      = useSafeAreaInsets();
  const router      = useRouter();
  const { id }      = useLocalSearchParams<{ id?: string }>();

  const goals = useGoalsStore((s) => s.goals);
  const tasks = useTasksStore((s) => s.tasks);

  const area = useMemo(() => LIFE_AREAS.find((a) => a.id === id), [id]);

  const areaGoals = useMemo(
    () => goals.filter((g) => assignLifeArea(g) === id),
    [goals, id],
  );

  const activeGoals    = useMemo(() => areaGoals.filter((g) => isActiveGoalStatus(g.status)), [areaGoals]);
  const completedGoals = useMemo(() => areaGoals.filter(isCompletedGoal), [areaGoals]);
  const archivedGoals  = useMemo(() => areaGoals.filter(isArchivedGoal), [areaGoals]);

  const areaGoalIds = useMemo(() => new Set(areaGoals.map((g) => g.id)), [areaGoals]);

  const openTasks = useMemo(
    () => tasks.filter((t) => t.linked_goal_id && areaGoalIds.has(t.linked_goal_id) && t.status !== "done"),
    [tasks, areaGoalIds],
  );

  const overallProgress = useMemo(() => {
    if (areaGoals.length === 0) return 0;
    return Math.round(areaGoals.reduce((s, g) => s + goalProgress(g, tasks), 0) / areaGoals.length);
  }, [areaGoals, tasks]);

  const styles = useMemo(() => createStyles(colors), [colors]);

  if (!area) {
    return (
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()} activeOpacity={0.75}>
          <SymbolView name="chevron.left" size={15} tintColor={colors.textPrimary} resizeMode="scaleAspectFit" />
          <Text style={styles.backLabel}>Goals</Text>
        </TouchableOpacity>
        <View style={styles.notFoundState}>
          <Text style={styles.notFoundText}>Life area not found.</Text>
        </View>
      </View>
    );
  }

  const { accent, label: areaLabel, icon: areaIcon, description, starters } = area;
  const isEmpty = areaGoals.length === 0;

  const navigateToTasks = () =>
    router.push("/(tabs)/tasks" as Parameters<typeof router.push>[0]);

  const navigateToGoals = () =>
    router.push("/(tabs)/goals" as Parameters<typeof router.push>[0]);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* ── Top bar ───────────────────────────────────────────────────────── */}
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()} activeOpacity={0.75}>
          <SymbolView name="chevron.left" size={15} tintColor={colors.textPrimary} resizeMode="scaleAspectFit" />
          <Text style={styles.backLabel}>Goals</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.newGoalBtn, { backgroundColor: `${accent}18`, borderColor: `${accent}38` }]}
          onPress={navigateToGoals}
          activeOpacity={0.78}
        >
          <SymbolView name="plus" size={12} tintColor={accent} resizeMode="scaleAspectFit" />
          <Text style={[styles.newGoalBtnText, { color: accent }]}>New Goal</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 160 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Hero ──────────────────────────────────────────────────────── */}
        <View style={styles.hero}>
          <View style={[styles.heroIconWrap, { backgroundColor: `${accent}16`, borderColor: `${accent}28` }]}>
            <SymbolView name={areaIcon} size={38} tintColor={accent} resizeMode="scaleAspectFit" />
          </View>
          <Text style={styles.heroTitle}>{areaLabel}</Text>
          <Text style={styles.heroDescription}>{description}</Text>
        </View>

        {/* ── Stats ─────────────────────────────────────────────────────── */}
        <View style={[styles.statsCard, { borderColor: `${accent}20` }]}>
          <View style={styles.statItem}>
            <Text style={[styles.statValue, { color: accent }]}>{activeGoals.length}</Text>
            <Text style={styles.statLabel}>Active</Text>
          </View>

          <View style={styles.statDivider} />

          <View style={styles.statItem}>
            <Text style={[styles.statValue, { color: colors.textSecondary }]}>{completedGoals.length}</Text>
            <Text style={styles.statLabel}>Done</Text>
          </View>

          <View style={styles.statDivider} />

          <View style={styles.statItem}>
            <View style={styles.ringWrap}>
              <ProgressRing progress={overallProgress} size={52} stroke={5} accent={accent} />
              <Text style={[styles.ringPct, { color: accent }]}>{overallProgress}%</Text>
            </View>
            <Text style={styles.statLabel}>Progress</Text>
          </View>

          {openTasks.length > 0 && (
            <>
              <View style={styles.statDivider} />
              <TouchableOpacity style={styles.statItem} onPress={navigateToTasks} activeOpacity={0.75}>
                <Text style={[styles.statValue, { color: colors.accentCyan }]}>{openTasks.length}</Text>
                <Text style={styles.statLabel}>Tasks</Text>
              </TouchableOpacity>
            </>
          )}
        </View>

        {isEmpty ? (
          /* ── Empty state ──────────────────────────────────────────────── */
          <View style={styles.emptyState}>
            <View style={[styles.emptyIconWrap, { backgroundColor: `${accent}10` }]}>
              <SymbolView name={areaIcon} size={44} tintColor={`${accent}55`} resizeMode="scaleAspectFit" />
            </View>

            <Text style={styles.emptyTitle}>No {areaLabel} goals yet</Text>
            <Text style={styles.emptyDescription}>
              Start by creating a goal in this area and HELIOS will help you track every step.
            </Text>

            <Text style={styles.starterHeader}>STARTER IDEAS</Text>

            <View style={styles.starterList}>
              {starters.map((s, i) => (
                <View key={i} style={[styles.starterItem, { borderColor: `${accent}22` }]}>
                  <View style={[styles.starterDot, { backgroundColor: accent }]} />
                  <Text style={styles.starterText}>{s}</Text>
                </View>
              ))}
            </View>

            <TouchableOpacity
              style={[styles.createBtn, { backgroundColor: accent }]}
              onPress={navigateToGoals}
              activeOpacity={0.82}
            >
              <SymbolView name="plus" size={14} tintColor="#ffffff" resizeMode="scaleAspectFit" />
              <Text style={styles.createBtnText}>Create a Goal</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {/* ── Active Goals ─────────────────────────────────────────── */}
            {activeGoals.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>ACTIVE GOALS</Text>
                {activeGoals.map((goal) => (
                  <GoalRow
                    key={goal.id}
                    goal={goal}
                    tasks={tasks}
                    accent={accent}
                    colors={colors}
                    styles={styles}
                  />
                ))}
              </View>
            )}

            {/* ── Open Tasks ───────────────────────────────────────────── */}
            {openTasks.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>RELATED TASKS</Text>
                {openTasks.map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    accent={accent}
                    colors={colors}
                    styles={styles}
                    onPress={navigateToTasks}
                  />
                ))}
              </View>
            )}

            {/* ── Completed Goals ──────────────────────────────────────── */}
            {completedGoals.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>COMPLETED</Text>
                {completedGoals.map((goal) => (
                  <GoalRow
                    key={goal.id}
                    goal={goal}
                    tasks={tasks}
                    accent={accent}
                    colors={colors}
                    styles={styles}
                    dimmed
                  />
                ))}
              </View>
            )}

            {/* ── Archived Goals ───────────────────────────────────────── */}
            {archivedGoals.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>ARCHIVED</Text>
                {archivedGoals.map((goal) => (
                  <GoalRow
                    key={goal.id}
                    goal={goal}
                    tasks={tasks}
                    accent={accent}
                    colors={colors}
                    styles={styles}
                    dimmed
                  />
                ))}
              </View>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: colors.background,
    },

    // ── Top bar ──────────────────────────────────────────────────────────────
    topBar: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderBottomWidth: 1,
      borderBottomColor: colors.primaryBorder,
    },
    backButton: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      paddingVertical: 4,
      paddingRight: 8,
    },
    backLabel: {
      ...typography.body,
      color: colors.textPrimary,
      fontWeight: "600",
    },
    newGoalBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: radius.sm,
      borderWidth: 1,
    },
    newGoalBtnText: {
      ...typography.caption,
      fontWeight: "700",
    },

    // ── Scroll ───────────────────────────────────────────────────────────────
    scroll: {
      flex: 1,
    },
    scrollContent: {
      paddingHorizontal: spacing.md,
      paddingTop: spacing.lg,
      gap: spacing.lg,
    },

    // ── Hero ─────────────────────────────────────────────────────────────────
    hero: {
      alignItems: "center",
      paddingHorizontal: spacing.sm,
      gap: spacing.sm,
    },
    heroIconWrap: {
      width: 72,
      height: 72,
      borderRadius: 20,
      borderWidth: 1,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 4,
    },
    heroTitle: {
      ...typography.displaySmall,
      color: colors.textPrimary,
      textAlign: "center",
    },
    heroDescription: {
      ...typography.body,
      color: colors.textSecondary,
      textAlign: "center",
      lineHeight: 22,
    },

    // ── Stats ─────────────────────────────────────────────────────────────────
    statsCard: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.card,
      borderRadius: radius.md,
      borderWidth: 1,
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.sm,
    },
    statItem: {
      flex: 1,
      alignItems: "center",
      gap: 6,
    },
    statValue: {
      fontSize: 26,
      fontWeight: "800",
      letterSpacing: -0.5,
    },
    statLabel: {
      ...typography.label,
      color: colors.textMuted,
    },
    statDivider: {
      width: 1,
      height: 40,
      backgroundColor: colors.primaryBorder,
    },
    ringWrap: {
      width: 52,
      height: 52,
      alignItems: "center",
      justifyContent: "center",
    },
    ringPct: {
      position: "absolute",
      fontSize: 13,
      fontWeight: "800",
    },

    // ── Section ───────────────────────────────────────────────────────────────
    section: {
      gap: spacing.sm,
    },
    sectionLabel: {
      ...typography.label,
      color: colors.textMuted,
      marginBottom: 2,
    },

    // ── Goal card ─────────────────────────────────────────────────────────────
    goalCard: {
      backgroundColor: colors.card,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.primaryBorder,
      padding: spacing.md,
      gap: 8,
    },
    goalCardTop: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: spacing.sm,
    },
    goalCardTitle: {
      ...typography.body,
      color: colors.textPrimary,
      fontWeight: "600",
      flex: 1,
    },
    goalCardMeta: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
    },
    goalCardDate: {
      ...typography.caption,
      color: colors.textMuted,
    },
    goalCardTaskCount: {
      ...typography.caption,
      color: colors.textMuted,
    },
    goalProgressTrack: {
      height: 3,
      backgroundColor: colors.primaryBorder,
      borderRadius: 2,
      overflow: "hidden",
    },
    goalProgressFill: {
      height: "100%",
      borderRadius: 2,
    },
    goalProgressPct: {
      ...typography.label,
      fontSize: 10,
      alignSelf: "flex-end",
    },

    // ── Task row ──────────────────────────────────────────────────────────────
    taskRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      paddingVertical: 10,
      paddingHorizontal: spacing.md,
      backgroundColor: colors.card,
      borderRadius: radius.sm,
      borderWidth: 1,
      borderColor: colors.primaryBorder,
    },
    taskCheck: {
      width: 20,
      height: 20,
      borderRadius: 10,
      borderWidth: 1.5,
      borderColor: colors.textMuted,
      alignItems: "center",
      justifyContent: "center",
    },
    taskBody: {
      flex: 1,
      gap: 2,
    },
    taskTitle: {
      ...typography.body,
      color: colors.textPrimary,
      fontSize: 14,
    },
    taskDate: {
      ...typography.caption,
      color: colors.textMuted,
    },
    taskPriorityDot: {
      width: 7,
      height: 7,
      borderRadius: 3.5,
    },

    // ── Empty state ───────────────────────────────────────────────────────────
    emptyState: {
      alignItems: "center",
      paddingTop: spacing.sm,
      gap: spacing.md,
    },
    emptyIconWrap: {
      width: 88,
      height: 88,
      borderRadius: 24,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: spacing.xs,
    },
    emptyTitle: {
      ...typography.title,
      color: colors.textPrimary,
      textAlign: "center",
    },
    emptyDescription: {
      ...typography.body,
      color: colors.textSecondary,
      textAlign: "center",
      lineHeight: 22,
      paddingHorizontal: spacing.md,
    },
    starterHeader: {
      ...typography.label,
      color: colors.textMuted,
      alignSelf: "flex-start",
      marginTop: spacing.xs,
    },
    starterList: {
      alignSelf: "stretch",
      gap: spacing.xs,
    },
    starterItem: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      paddingVertical: 12,
      paddingHorizontal: spacing.md,
      backgroundColor: colors.card,
      borderRadius: radius.sm,
      borderWidth: 1,
    },
    starterDot: {
      width: 7,
      height: 7,
      borderRadius: 3.5,
    },
    starterText: {
      ...typography.body,
      color: colors.textSecondary,
      flex: 1,
    },
    createBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.xs,
      paddingHorizontal: spacing.lg,
      paddingVertical: 14,
      borderRadius: radius.md,
      marginTop: spacing.sm,
    },
    createBtnText: {
      ...typography.body,
      color: "#ffffff",
      fontWeight: "700",
    },

    // ── Not found ─────────────────────────────────────────────────────────────
    notFoundState: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
    },
    notFoundText: {
      ...typography.body,
      color: colors.textMuted,
    },
  });
}
