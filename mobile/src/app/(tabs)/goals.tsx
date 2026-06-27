import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Animated,
  Easing,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { Swipeable } from "react-native-gesture-handler";
import { useRouter } from "expo-router";
import { SymbolView } from "expo-symbols";
import type { SFSymbol } from "sf-symbols-typescript";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle } from "react-native-svg";
import * as Haptics from "expo-haptics";

import Input from "../../components/ui/Input";
import Button from "../../components/ui/Button";
import DateTimeField from "../../components/ui/DateTimeField";
import { spacing, radius, typography, type ThemeColors } from "../../theme/theme";
import { useTheme } from "../../theme/ThemeContext";
import { useAuthStore, useGoalsStore, useTasksStore } from "../../store";
import type { Goal } from "../../services/goalsService";
import type { Task } from "../../services/tasksService";
import { formatBackendDate, parseDateTimeInput } from "../../utils/dateInput";
import { isActiveGoalStatus } from "../../utils/homeFormatting";
import { LIFE_AREAS, assignLifeArea, type LifeAreaId, type LifeAreaDef } from "../../utils/lifeAreas";

// ── Sort ──────────────────────────────────────────────────────────────────────

type SortMode = "Newest" | "Oldest" | "Most Progress" | "Least Progress" | "Alphabetical";
const SORTS: SortMode[] = ["Newest", "Oldest", "Most Progress", "Least Progress", "Alphabetical"];

// ── Form ──────────────────────────────────────────────────────────────────────

type FormState = { title: string; description: string; target_date: string; };
const EMPTY_FORM: FormState = { title: "", description: "", target_date: "" };

// ── Utility ───────────────────────────────────────────────────────────────────

type GoalTone = "active" | "completed" | "upcoming" | "archived";
type GoalMeta = {
  tone: GoalTone;
  statusLabel: string;
  progress: number;
  dueLabel: string;
  linkedTasks: number;
};

function normaliseStatus(status: string | null | undefined): string {
  return status?.trim().toLowerCase().replace(/[\s-]+/g, "_") ?? "";
}

function isCompletedGoal(goal: Goal): boolean {
  return normaliseStatus(goal.status) === "completed";
}

function isArchivedGoal(goal: Goal): boolean {
  const s = normaliseStatus(goal.status);
  return s === "archived" || s === "paused";
}

function parseDate(value: string | null): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function daysRemaining(goal: Goal): number | null {
  const target = parseDate(goal.target_date);
  if (!target) return null;
  const today = new Date();
  target.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - today.getTime()) / 86400000);
}

function formatDate(value: string | null): string {
  const d = parseDate(value);
  if (!d) return "No target date";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatUpdated(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "Updated recently";
  const today = new Date();
  if (d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth() && d.getDate() === today.getDate()) return "Updated today";
  return `Updated ${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
}

function goalProgress(goal: Goal, tasks: Task[]): number {
  if (isCompletedGoal(goal)) return 100;
  if (isArchivedGoal(goal)) return 0;
  const related = tasks.filter((t) => t.linked_goal_id === goal.id);
  if (related.length > 0) {
    return Math.round((related.filter((t) => t.status === "done").length / related.length) * 100);
  }
  const remaining = daysRemaining(goal);
  if (remaining === null) return 25;
  if (remaining < 0) return 10;
  if (remaining <= 7) return 70;
  if (remaining <= 30) return 45;
  return 20;
}

function goalMeta(goal: Goal, tasks: Task[]): GoalMeta {
  const archived  = isArchivedGoal(goal);
  const completed = isCompletedGoal(goal);
  const active    = isActiveGoalStatus(goal.status);
  const tone: GoalTone = completed ? "completed" : archived ? "archived" : active ? "active" : "upcoming";
  return {
    tone,
    statusLabel: completed ? "Completed" : archived ? "Archived" : active ? "Active" : "Upcoming",
    progress: goalProgress(goal, tasks),
    dueLabel: formatDate(goal.target_date),
    linkedTasks: tasks.filter((t) => t.linked_goal_id === goal.id).length,
  };
}

function toneColor(tone: GoalTone, colors: ThemeColors): string {
  if (tone === "completed") return colors.success;
  if (tone === "archived")  return colors.textMuted;
  if (tone === "upcoming")  return colors.warning;
  return colors.accentCyan;
}

function sortGoals(a: Goal, b: Goal, sort: SortMode, tasks: Task[]): number {
  if (sort === "Oldest")        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
  if (sort === "Most Progress")  return goalProgress(b, tasks) - goalProgress(a, tasks);
  if (sort === "Least Progress") return goalProgress(a, tasks) - goalProgress(b, tasks);
  if (sort === "Alphabetical")   return a.title.localeCompare(b.title);
  return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function GoalsScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const accessToken = useAuthStore((s) => s.accessToken);
  const {
    goals,
    selectedGoal,
    selectedGoalTasks,
    goalProgressById,
    isLoading,
    isMutating,
    error,
    fetchGoals,
    fetchGoalDetail,
    createGoal,
    updateGoal,
    deleteGoal,
  } = useGoalsStore();
  const tasks     = useTasksStore((s) => s.tasks);
  const fetchTasks = useTasksStore((s) => s.fetchTasks);

  const router = useRouter();
  const [sortMode, setSortMode]         = useState<SortMode>("Newest");
  const [sortVisible, setSortVisible]   = useState(false);
  const [detailGoal, setDetailGoal]     = useState<Goal | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingGoal, setEditingGoal]   = useState<Goal | null>(null);
  const [form, setForm]                 = useState<FormState>(EMPTY_FORM);
  const [formError, setFormError]       = useState<string | null>(null);

  const onRefresh = useCallback(() => {
    if (!accessToken) return;
    fetchGoals(accessToken);
    fetchTasks(accessToken).catch(() => {});
  }, [accessToken, fetchGoals, fetchTasks]);

  useEffect(() => {
    if (!accessToken) return;
    fetchGoals(accessToken);
    fetchTasks(accessToken).catch(() => {});
  }, [accessToken, fetchGoals, fetchTasks]);

  const visibleGoals = useMemo(() => {
    return [...goals].sort((a, b) => sortGoals(a, b, sortMode, tasks));
  }, [goals, sortMode, tasks]);

  const activeGoals = useMemo(() => goals.filter((g) => isActiveGoalStatus(g.status)), [goals]);

  const recommended = useMemo(() =>
    [...activeGoals].sort((a, b) => goalProgress(a, tasks) - goalProgress(b, tasks)).slice(0, 3),
    [activeGoals, tasks],
  );

  // ── CRUD ──

  function openCreate() {
    setEditingGoal(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setModalVisible(true);
  }

  function openEdit(goal: Goal) {
    setEditingGoal(goal);
    setForm({ title: goal.title, description: goal.description ?? "", target_date: goal.target_date ?? "" });
    setFormError(null);
    setModalVisible(true);
  }

  function openGoal(goal: Goal) {
    setDetailGoal(goal);
    if (accessToken) {
      fetchGoalDetail(accessToken, goal.id).catch(() => {});
    }
  }

  function closeModal() {
    Keyboard.dismiss();
    setModalVisible(false);
  }

  async function handleSubmit() {
    if (!accessToken) return;
    if (!form.title.trim()) { setFormError("Goal title is required."); return; }
    setFormError(null);
    const payload = { title: form.title.trim(), description: form.description.trim() || undefined, target_date: form.target_date.trim() || undefined };
    if (editingGoal) {
      await updateGoal(accessToken, editingGoal.id, payload);
    } else {
      await createGoal(accessToken, payload);
    }
    closeModal();
  }

  function handleComplete(goal: Goal) {
    if (!accessToken) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    updateGoal(accessToken, goal.id, { status: "completed" });
  }

  function handleArchive(goal: Goal) {
    if (!accessToken) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    updateGoal(accessToken, goal.id, { status: "paused" });
  }

  function handleDelete(goal: Goal) {
    if (!accessToken) return;
    Alert.alert("Delete Goal", `Delete "${goal.title}"?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => deleteGoal(accessToken, goal.id) },
    ]);
  }

  // ── Header ──

  function renderHeader() {
    return (
      <View style={styles.headerWrap}>
        <JourneyHero goals={goals} tasks={tasks} />

        {recommended.length > 0 && (
          <RecommendedSection goals={recommended} tasks={tasks} onOpen={openGoal} />
        )}

        <LifeAreasSection
          goals={goals}
          tasks={tasks}
          onNavigateToArea={(id) =>
            router.push({ pathname: "/(tabs)/life-area", params: { id } } as Parameters<typeof router.push>[0])
          }
          onNewGoal={openCreate}
        />

        <View style={styles.goalsSectionHeader}>
          <Text style={styles.sectionLabel}>ALL GOALS</Text>
          <TouchableOpacity style={styles.sortButton} onPress={() => setSortVisible(true)} activeOpacity={0.78}>
            <SymbolView name="arrow.up.arrow.down" size={12} tintColor={colors.accentCyan} resizeMode="scaleAspectFit" />
            <Text style={styles.sortText}>Sort</Text>
          </TouchableOpacity>
        </View>

        {error ? <Text style={styles.errorText}>{error}</Text> : null}
      </View>
    );
  }

  return (
    <>
      <FlatList
        style={{ backgroundColor: colors.background }}
        contentContainerStyle={[styles.container, { paddingTop: insets.top + spacing.md, paddingBottom: insets.bottom + 160 }]}
        data={visibleGoals}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <GoalCard
            goal={item}
            meta={goalMeta(item, tasks)}
            areaId={assignLifeArea(item)}
            onOpen={() => openGoal(item)}
            onEdit={() => openEdit(item)}
            onComplete={() => handleComplete(item)}
            onArchive={() => handleArchive(item)}
            onDelete={() => handleDelete(item)}
          />
        )}
        ListHeaderComponent={renderHeader}
        ListEmptyComponent={
          !isLoading ? (
            <View style={styles.emptyState}>
              <View style={styles.emptyIconWrap}>
                <SymbolView name="target" size={28} tintColor={colors.accentCyan} resizeMode="scaleAspectFit" />
              </View>
              <Text style={styles.emptyTitle}>Start your journey</Text>
              <Text style={styles.emptyText}>
                Create your first goal. Every great achievement starts with a clear intention.
              </Text>
              <TouchableOpacity style={styles.emptyButton} onPress={openCreate} activeOpacity={0.82}>
                <Text style={styles.emptyButtonText}>New Goal</Text>
              </TouchableOpacity>
            </View>
          ) : null
        }
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={onRefresh} tintColor={colors.accentCyan} />}
        initialNumToRender={8}
        maxToRenderPerBatch={8}
        windowSize={7}
        removeClippedSubviews
        showsVerticalScrollIndicator={false}
      />

      <SortSheet
        visible={sortVisible}
        selected={sortMode}
        onSelect={(m) => { setSortMode(m); setSortVisible(false); }}
        onClose={() => setSortVisible(false)}
      />

      <GoalDetailSheet
        goal={selectedGoal?.id === detailGoal?.id ? selectedGoal : detailGoal}
        meta={detailGoal ? {
          ...goalMeta(detailGoal, tasks),
          ...(goalProgressById[detailGoal.id]
            ? {
                progress: Math.round(goalProgressById[detailGoal.id].effective_progress * 100),
                linkedTasks: goalProgressById[detailGoal.id].total_tasks,
              }
            : {}),
        } : null}
        tasks={selectedGoal?.id === detailGoal?.id && selectedGoalTasks.length > 0 ? selectedGoalTasks : tasks}
        onClose={() => setDetailGoal(null)}
        onEdit={openEdit}
        onComplete={handleComplete}
        onArchive={handleArchive}
      />

      <Modal visible={modalVisible} animationType="slide" transparent onRequestClose={closeModal}>
        <TouchableWithoutFeedback onPress={closeModal}>
          <View style={styles.overlay} />
        </TouchableWithoutFeedback>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.modalWrapper}>
          <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>{editingGoal ? "EDIT GOAL" : "NEW GOAL"}</Text>
            <Input label="GOAL TITLE" placeholder="e.g. Launch HELIOS" value={form.title} onChangeText={(t) => setForm((f) => ({ ...f, title: t }))} error={formError ?? undefined} autoFocus />
            <Input label="DESCRIPTION" placeholder="What does success look like?" value={form.description} onChangeText={(t) => setForm((f) => ({ ...f, description: t }))} multiline style={styles.multiline} autoCapitalize="sentences" />
            <DateTimeField
              label="TARGET DATE"
              mode="date"
              placeholder="Select target date"
              value={form.target_date ? parseDateTimeInput(form.target_date) : null}
              onChange={(date) => setForm((f) => ({ ...f, target_date: date ? formatBackendDate(date) : "" }))}
            />
            <View style={styles.sheetActions}>
              <Button label="CANCEL" variant="secondary" onPress={closeModal} />
              <Button label={editingGoal ? "SAVE" : "CREATE"} onPress={handleSubmit} loading={isMutating} />
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

// ── Journey hero ──────────────────────────────────────────────────────────────

function JourneyHero({ goals, tasks }: { goals: Goal[]; tasks: Task[] }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const overallProgress = useMemo(() => {
    if (goals.length === 0) return 0;
    return Math.round(goals.reduce((sum, g) => sum + goalProgress(g, tasks), 0) / goals.length);
  }, [goals, tasks]);

  const activeGoals    = goals.filter((g) => isActiveGoalStatus(g.status));
  const completedGoals = goals.filter(isCompletedGoal);

  const areasInUse = useMemo(() => {
    const ids = new Set(goals.map(assignLifeArea));
    return ids.size;
  }, [goals]);

  const focusAreaId = useMemo(() => {
    if (activeGoals.length === 0) return null;
    const counts: Partial<Record<LifeAreaId, number>> = {};
    activeGoals.forEach((g) => {
      const id = assignLifeArea(g);
      counts[id] = (counts[id] ?? 0) + 1;
    });
    return Object.entries(counts).sort((a, b) => (b[1] as number) - (a[1] as number))[0]?.[0] as LifeAreaId | null;
  }, [activeGoals]);

  const focusArea = focusAreaId ? LIFE_AREAS.find((a) => a.id === focusAreaId) : null;

  const nextGoal = useMemo(() =>
    [...activeGoals].filter((g) => g.target_date).sort((a, b) => new Date(a.target_date!).getTime() - new Date(b.target_date!).getTime())[0] ?? null,
    [activeGoals],
  );

  return (
    <View style={styles.heroCard}>
      <Text style={styles.heroLabel}>YOUR JOURNEY</Text>

      <View style={styles.heroBody}>
        <LargeProgressRing value={overallProgress} />

        <View style={styles.heroStats}>
          <View style={styles.heroStat}>
            <Text style={styles.heroStatNum}>{activeGoals.length}</Text>
            <Text style={styles.heroStatLabel}>ACTIVE</Text>
          </View>
          <View style={[styles.heroStat, styles.heroStatMiddle]}>
            <Text style={styles.heroStatNum}>{completedGoals.length}</Text>
            <Text style={styles.heroStatLabel}>DONE</Text>
          </View>
          <View style={styles.heroStat}>
            <Text style={styles.heroStatNum}>{areasInUse}</Text>
            <Text style={styles.heroStatLabel}>AREAS</Text>
          </View>
        </View>
      </View>

      {(focusArea || nextGoal) ? (
        <View style={styles.heroFooter}>
          {focusArea && (
            <View style={styles.heroFooterBlock}>
              <Text style={styles.heroFooterLabel}>CURRENT FOCUS</Text>
              <View style={styles.heroFooterValueRow}>
                <View style={[styles.heroFooterDot, { backgroundColor: focusArea.accent }]} />
                <Text style={styles.heroFooterValue}>{focusArea.label}</Text>
              </View>
            </View>
          )}
          {nextGoal && (
            <View style={[styles.heroFooterBlock, styles.heroFooterBlockRight]}>
              <Text style={styles.heroFooterLabel}>NEXT MILESTONE</Text>
              <Text style={styles.heroFooterValue} numberOfLines={1}>{nextGoal.title}</Text>
            </View>
          )}
        </View>
      ) : null}
    </View>
  );
}

function LargeProgressRing({ value }: { value: number }) {
  const { colors } = useTheme();
  const SIZE   = 110;
  const R      = 44;
  const STROKE = 8;
  const circ   = 2 * Math.PI * R;
  const clipped = Math.max(0, Math.min(100, value));
  const offset  = circ - (clipped / 100) * circ;

  const accent = value >= 75 ? colors.success : value >= 40 ? colors.accentCyan : colors.accent;

  return (
    <View style={{ width: SIZE, height: SIZE, alignItems: "center", justifyContent: "center" }}>
      <Svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
        <Circle
          cx={SIZE / 2} cy={SIZE / 2} r={R}
          stroke={`${colors.textMuted}20`} strokeWidth={STROKE} fill="none"
        />
        <Circle
          cx={SIZE / 2} cy={SIZE / 2} r={R}
          stroke={accent} strokeWidth={STROKE} fill="none"
          strokeLinecap="round"
          strokeDasharray={`${circ} ${circ}`}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
        />
      </Svg>
      <View style={{ position: "absolute", alignItems: "center" }}>
        <Text style={{ fontSize: 24, fontWeight: "900", color: colors.textPrimary, letterSpacing: -1 }}>{value}%</Text>
        <Text style={{ fontSize: 9, fontWeight: "700", color: colors.textMuted, letterSpacing: 1.5 }}>OVERALL</Text>
      </View>
    </View>
  );
}

// ── Recommended focus ─────────────────────────────────────────────────────────

function RecommendedSection({ goals, tasks, onOpen }: { goals: Goal[]; tasks: Task[]; onOpen: (g: Goal) => void }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.recommendedSection}>
      <View style={styles.sectionHeaderRow}>
        <Text style={styles.sectionLabel}>RECOMMENDED FOCUS</Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.recommendedScroll}>
        {goals.map((goal) => (
          <RecommendedCard key={goal.id} goal={goal} tasks={tasks} onOpen={onOpen} />
        ))}
      </ScrollView>
    </View>
  );
}

function RecommendedCard({ goal, tasks, onOpen }: { goal: Goal; tasks: Task[]; onOpen: (g: Goal) => void }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const area    = LIFE_AREAS.find((a) => a.id === assignLifeArea(goal))!;
  const progress = goalProgress(goal, tasks);

  return (
    <TouchableOpacity style={[styles.recommendedCard, { borderColor: `${area.accent}40` }]} onPress={() => onOpen(goal)} activeOpacity={0.82}>
      <View style={[styles.recommendedAccentBar, { backgroundColor: area.accent }]} />
      <View style={styles.recommendedCardBody}>
        <SmallProgressRing value={progress} color={area.accent} />
        <View style={styles.recommendedCardText}>
          <Text style={styles.recommendedCardTitle} numberOfLines={2}>{goal.title}</Text>
          <View style={[styles.areaChip, { backgroundColor: `${area.accent}18`, borderColor: `${area.accent}35` }]}>
            <Text style={[styles.areaChipText, { color: area.accent }]}>{area.label}</Text>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}

function SmallProgressRing({ value, color }: { value: number; color: string }) {
  const { colors } = useTheme();
  const SIZE = 44;
  const R    = 17;
  const SW   = 4;
  const circ = 2 * Math.PI * R;
  const off  = circ - (Math.max(0, Math.min(100, value)) / 100) * circ;

  return (
    <View style={{ width: SIZE, height: SIZE, alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
      <Svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
        <Circle cx={SIZE / 2} cy={SIZE / 2} r={R} stroke={`${colors.textMuted}22`} strokeWidth={SW} fill="none" />
        <Circle cx={SIZE / 2} cy={SIZE / 2} r={R} stroke={color} strokeWidth={SW} fill="none" strokeLinecap="round"
          strokeDasharray={`${circ} ${circ}`} strokeDashoffset={off} transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`} />
      </Svg>
      <Text style={{ position: "absolute", fontSize: 10, fontWeight: "900", color: colors.textPrimary }}>{value}</Text>
    </View>
  );
}

// ── Life areas ────────────────────────────────────────────────────────────────

function LifeAreasSection({
  goals, tasks, onNavigateToArea, onNewGoal,
}: {
  goals: Goal[];
  tasks: Task[];
  onNavigateToArea: (id: LifeAreaId) => void;
  onNewGoal: () => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.lifeAreasSection}>
      <View style={styles.sectionHeaderRow}>
        <Text style={styles.sectionLabel}>YOUR LIFE</Text>
        <TouchableOpacity style={styles.newGoalButton} onPress={onNewGoal} activeOpacity={0.82}>
          <SymbolView name="plus" size={11} tintColor="#ffffff" resizeMode="scaleAspectFit" />
          <Text style={styles.newGoalButtonText}>New Goal</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.lifeAreasList}>
        {LIFE_AREAS.map((area, i) => {
          const areaGoals    = goals.filter((g) => assignLifeArea(g) === area.id);
          const areaActive   = areaGoals.filter((g) => isActiveGoalStatus(g.status)).length;
          const areaProgress = areaGoals.length === 0 ? 0 : Math.round(
            areaGoals.reduce((sum, g) => sum + goalProgress(g, tasks), 0) / areaGoals.length,
          );
          const hasGoals = areaGoals.length > 0;
          const isLast   = i === LIFE_AREAS.length - 1;

          return (
            <LifeAreaRow
              key={area.id}
              area={area}
              goalCount={areaGoals.length}
              activeCount={areaActive}
              progress={areaProgress}
              hasGoals={hasGoals}
              isLast={isLast}
              onPress={() => onNavigateToArea(area.id)}
            />
          );
        })}
      </View>
    </View>
  );
}

function LifeAreaRow({
  area, goalCount, activeCount, progress, hasGoals, isLast, onPress,
}: {
  area: LifeAreaDef;
  goalCount: number;
  activeCount: number;
  progress: number;
  hasGoals: boolean;
  isLast: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { accent } = area;

  return (
    <TouchableOpacity
      style={[styles.areaRow, !isLast && styles.areaRowBorder]}
      onPress={onPress}
      activeOpacity={0.78}
      accessibilityRole="button"
      accessibilityLabel={`${area.label} life area, ${goalCount} goals`}
    >
      <View style={[styles.areaIconWrap, { backgroundColor: `${accent}18`, borderColor: `${accent}30` }]}>
        <SymbolView name={area.icon} size={17} tintColor={accent} resizeMode="scaleAspectFit" />
      </View>

      <View style={styles.areaRowBody}>
        <View style={styles.areaRowTop}>
          <Text style={styles.areaRowLabel}>{area.label}</Text>
          <Text style={[styles.areaRowCount, { color: hasGoals ? accent : colors.textMuted }]}>
            {goalCount === 0 ? "No goals" : goalCount === 1 ? "1 goal" : `${goalCount} goals`}
            {activeCount > 0 ? ` · ${activeCount} active` : ""}
          </Text>
        </View>
        <View style={[styles.areaProgressTrack, !hasGoals && { opacity: 0.25 }]}>
          {hasGoals && (
            <View style={[styles.areaProgressFill, { width: `${progress}%`, backgroundColor: accent }]} />
          )}
        </View>
      </View>

      <SymbolView name="chevron.right" size={11} tintColor={colors.textMuted} resizeMode="scaleAspectFit" />
    </TouchableOpacity>
  );
}

// ── Goal card v2 ──────────────────────────────────────────────────────────────

const GoalCard = memo(function GoalCard({
  goal, meta, areaId, onOpen, onEdit, onComplete, onArchive, onDelete,
}: {
  goal: Goal;
  meta: GoalMeta;
  areaId: LifeAreaId;
  onOpen: () => void;
  onEdit: () => void;
  onComplete: () => void;
  onArchive: () => void;
  onDelete: () => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const area        = LIFE_AREAS.find((a) => a.id === areaId)!;
  const accent      = area.accent;
  const toneAccent  = toneColor(meta.tone, colors);
  const progressAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(progressAnim, {
      toValue: meta.progress,
      duration: 480,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [meta.progress, progressAnim]);

  const progressWidth = progressAnim.interpolate({ inputRange: [0, 100], outputRange: ["0%", "100%"] });

  const leftActions = () => (
    <View style={styles.swipeRight}>
      <SwipeAction label="Complete" icon="checkmark.circle.fill" color={colors.success} onPress={onComplete} />
    </View>
  );

  const rightActions = () => (
    <View style={styles.swipeLeft}>
      <SwipeAction label="Edit" icon="pencil" color={colors.accent} onPress={onEdit} />
      <SwipeAction label="Archive" icon="archivebox.fill" color={colors.textMuted} onPress={onArchive} />
      <SwipeAction label="Delete" icon="trash.fill" color={colors.danger} onPress={onDelete} />
    </View>
  );

  return (
    <Swipeable renderLeftActions={leftActions} renderRightActions={rightActions} overshootLeft={false} overshootRight={false}>
      <TouchableOpacity
        style={styles.goalCard}
        onPress={onOpen}
        activeOpacity={0.88}
        accessibilityRole="button"
        accessibilityLabel={`${goal.title}. ${meta.statusLabel}. ${meta.progress}% complete.`}
      >
        <View style={[styles.goalCardAccent, { backgroundColor: accent }]} />

        <View style={styles.goalCardBody}>
          <View style={styles.goalCardTop}>
            <Text style={styles.goalCardTitle} numberOfLines={2}>{goal.title}</Text>
            <View style={[styles.statusBadge, { borderColor: `${toneAccent}45`, backgroundColor: `${toneAccent}14` }]}>
              <View style={[styles.statusDot, { backgroundColor: toneAccent }]} />
              <Text style={[styles.statusText, { color: toneAccent }]}>{meta.statusLabel}</Text>
            </View>
          </View>

          <View style={styles.goalCardProgressRow}>
            <View style={styles.goalCardTrack}>
              <Animated.View style={[styles.goalCardFill, { width: progressWidth, backgroundColor: accent }]} />
            </View>
            <Text style={styles.goalCardPercent}>{meta.progress}%</Text>
          </View>

          <View style={styles.goalCardFooter}>
            <View style={[styles.areaChip, { backgroundColor: `${accent}18`, borderColor: `${accent}30` }]}>
              <SymbolView name={area.icon} size={9} tintColor={accent} resizeMode="scaleAspectFit" />
              <Text style={[styles.areaChipText, { color: accent }]}>{area.label}</Text>
            </View>
            {meta.linkedTasks > 0 && (
              <Text style={styles.goalCardMeta}>{meta.linkedTasks} task{meta.linkedTasks === 1 ? "" : "s"}</Text>
            )}
          </View>
        </View>
      </TouchableOpacity>
    </Swipeable>
  );
});

// ── Swipe action ──────────────────────────────────────────────────────────────

function SwipeAction({ label, icon, color, onPress }: { label: string; icon: SFSymbol; color: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={[swipeStyles.action, { backgroundColor: color }]} onPress={onPress} activeOpacity={0.84}>
      <SymbolView name={icon} size={14} tintColor="#ffffff" resizeMode="scaleAspectFit" />
      <Text style={swipeStyles.text}>{label}</Text>
    </TouchableOpacity>
  );
}

const swipeStyles = StyleSheet.create({
  action: { width: 80, alignItems: "center", justifyContent: "center", gap: 4 },
  text:   { color: "#ffffff", fontSize: 10, fontWeight: "800" },
});

// ── Sort sheet ────────────────────────────────────────────────────────────────

function SortSheet({ visible, selected, onSelect, onClose }: { visible: boolean; selected: SortMode; onSelect: (m: SortMode) => void; onClose: () => void }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.overlay} />
      </TouchableWithoutFeedback>
      <View style={styles.modalWrapper}>
        <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.md }]}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>SORT GOALS</Text>
          {SORTS.map((mode) => (
            <TouchableOpacity key={mode} style={styles.sortOption} onPress={() => onSelect(mode)} activeOpacity={0.78}>
              <Text style={[styles.sortOptionText, selected === mode && styles.sortOptionTextSelected]}>{mode}</Text>
              {selected === mode ? <SymbolView name="checkmark" size={13} tintColor={colors.accentCyan} resizeMode="scaleAspectFit" /> : null}
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </Modal>
  );
}

// ── Goal detail sheet ─────────────────────────────────────────────────────────

function GoalDetailSheet({
  goal, meta, tasks, onClose, onEdit, onComplete, onArchive,
}: {
  goal: Goal | null;
  meta: GoalMeta | null;
  tasks: Task[];
  onClose: () => void;
  onEdit: (goal: Goal) => void;
  onComplete: (goal: Goal) => void;
  onArchive: (goal: Goal) => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  if (!goal || !meta) return null;

  const area    = LIFE_AREAS.find((a) => a.id === assignLifeArea(goal))!;
  const linked  = tasks.filter((t) => t.linked_goal_id === goal.id);
  const remaining = daysRemaining(goal);
  const daysLabel = remaining === null ? "No deadline set" : remaining < 0 ? `${Math.abs(remaining)} days overdue` : remaining === 0 ? "Due today" : `${remaining} days remaining`;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.overlay} />
      </TouchableWithoutFeedback>
      <View style={styles.detailWrapper}>
        <View style={[styles.detailSheet, { paddingBottom: insets.bottom + spacing.md }]}>
          <View style={styles.sheetHandle} />

          <FlatList
            data={[
              { key: "description", title: "ABOUT", text: goal.description || "No description yet." },
              { key: "progress",    title: "PROGRESS", text: `${meta.progress}% complete. ${daysLabel}.` },
              { key: "tasks",       title: "LINKED TASKS", text: linked.length > 0 ? linked.map((t) => `• ${t.title}`).join("\n") : "No linked tasks yet." },
              { key: "timeline",    title: "TIMELINE", text: `Created: ${formatDate(goal.created_at)}\n${formatUpdated(goal.updated_at)}` },
            ]}
            keyExtractor={(item) => item.key}
            ListHeaderComponent={
              <View style={styles.detailHeader}>
                <SmallProgressRing value={meta.progress} color={area.accent} />
                <View style={styles.detailTitleBlock}>
                  <View style={[styles.areaChip, { backgroundColor: `${area.accent}18`, borderColor: `${area.accent}35`, alignSelf: "flex-start", marginBottom: spacing.xs }]}>
                    <SymbolView name={area.icon} size={9} tintColor={area.accent} resizeMode="scaleAspectFit" />
                    <Text style={[styles.areaChipText, { color: area.accent }]}>{area.label}</Text>
                  </View>
                  <Text style={styles.detailTitle}>{goal.title}</Text>
                  <Text style={styles.detailSubtitle}>{meta.statusLabel} · {formatDate(goal.target_date)}</Text>
                </View>
              </View>
            }
            renderItem={({ item }) => (
              <View style={styles.detailSection}>
                <Text style={styles.detailSectionTitle}>{item.title}</Text>
                <Text style={styles.detailSectionText}>{item.text}</Text>
              </View>
            )}
            ListFooterComponent={
              <View style={styles.detailActions}>
                <TouchableOpacity style={styles.detailPrimary} onPress={() => onEdit(goal)} activeOpacity={0.82}>
                  <Text style={styles.detailPrimaryText}>Edit</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.detailSecondary} onPress={() => onComplete(goal)} activeOpacity={0.82}>
                  <Text style={styles.detailSecondaryText}>Complete</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.detailSecondary} onPress={() => onArchive(goal)} activeOpacity={0.82}>
                  <Text style={styles.detailSecondaryText}>Archive</Text>
                </TouchableOpacity>
              </View>
            }
            showsVerticalScrollIndicator={false}
          />
        </View>
      </View>
    </Modal>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({

    container: {
      paddingHorizontal: spacing.md,
    },

    headerWrap: {
      gap: spacing.md,
      marginBottom: spacing.md,
    },

    // ── Hero ──────────────────────────────────────────────────────────────────

    heroCard: {
      backgroundColor: colors.card,
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: `${colors.accent}28`,
      padding: spacing.lg,
      gap: spacing.md,
      shadowColor: colors.accent,
      shadowOpacity: 0.08,
      shadowRadius: 24,
      shadowOffset: { width: 0, height: 12 },
    },

    heroLabel: {
      ...typography.label,
      color: colors.accent,
    },

    heroBody: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.lg,
    },

    heroStats: {
      flex: 1,
      flexDirection: "row",
      justifyContent: "space-around",
    },

    heroStat: {
      alignItems: "center",
      gap: 3,
    },

    heroStatMiddle: {
      borderLeftWidth: 1,
      borderRightWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: spacing.md,
    },

    heroStatNum: {
      fontSize: 26,
      fontWeight: "900" as const,
      color: colors.textPrimary,
      letterSpacing: -1,
    },

    heroStatLabel: {
      ...typography.label,
      color: colors.textMuted,
      fontSize: 9,
    },

    heroFooter: {
      flexDirection: "row",
      borderTopWidth: 1,
      borderTopColor: colors.borderDark,
      paddingTop: spacing.md,
      gap: spacing.md,
    },

    heroFooterBlock: {
      flex: 1,
      gap: 4,
    },

    heroFooterBlockRight: {
      borderLeftWidth: 1,
      borderLeftColor: colors.borderDark,
      paddingLeft: spacing.md,
    },

    heroFooterLabel: {
      ...typography.label,
      color: colors.textMuted,
      fontSize: 9,
    },

    heroFooterValue: {
      fontSize: 13,
      fontWeight: "700" as const,
      color: colors.textPrimary,
    },

    heroFooterValueRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },

    heroFooterDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
    },

    // ── Section headers ───────────────────────────────────────────────────────

    sectionHeaderRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },

    sectionLabel: {
      ...typography.label,
      color: colors.textMuted,
    },

    // ── Recommended ───────────────────────────────────────────────────────────

    recommendedSection: {
      gap: spacing.sm,
    },

    recommendedScroll: {
      paddingRight: spacing.md,
      gap: spacing.sm,
    },

    recommendedCard: {
      width: 172,
      backgroundColor: colors.card,
      borderRadius: radius.md,
      borderWidth: 1,
      overflow: "hidden",
    },

    recommendedAccentBar: {
      height: 3,
    },

    recommendedCardBody: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      padding: spacing.md,
    },

    recommendedCardText: {
      flex: 1,
      gap: 6,
    },

    recommendedCardTitle: {
      fontSize: 13,
      fontWeight: "700" as const,
      color: colors.textPrimary,
      lineHeight: 18,
    },

    // ── Life areas ────────────────────────────────────────────────────────────

    lifeAreasSection: {
      gap: spacing.sm,
    },

    newGoalButton: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      backgroundColor: colors.accent,
      borderRadius: radius.sm,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
    },

    newGoalButtonText: {
      fontSize: 11,
      fontWeight: "700" as const,
      color: "#ffffff",
    },

    lifeAreasList: {
      backgroundColor: colors.card,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: "hidden",
    },

    areaRow: {
      minHeight: 58,
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      gap: spacing.md,
    },

    areaRowBorder: {
      borderBottomWidth: 1,
      borderBottomColor: colors.borderDark,
    },

    areaIconWrap: {
      width: 36,
      height: 36,
      borderRadius: 12,
      borderWidth: 1,
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
    },

    areaRowBody: {
      flex: 1,
      gap: 5,
    },

    areaRowTop: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },

    areaRowLabel: {
      fontSize: 14,
      fontWeight: "700" as const,
      color: colors.textPrimary,
    },

    areaRowCount: {
      fontSize: 11,
      fontWeight: "600" as const,
    },

    areaProgressTrack: {
      height: 3,
      borderRadius: 2,
      backgroundColor: colors.borderDark,
      overflow: "hidden",
    },

    areaProgressFill: {
      height: "100%",
      borderRadius: 2,
    },

    // ── Goal section header ───────────────────────────────────────────────────

    goalsSectionHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },

    sortButton: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      borderRadius: radius.sm,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
      minHeight: 32,
    },

    sortText: {
      fontSize: 11,
      fontWeight: "800" as const,
      color: colors.accentCyan,
    },

    errorText: {
      ...typography.caption,
      color: colors.danger,
    },

    // ── Goal card v2 ──────────────────────────────────────────────────────────

    goalCard: {
      flexDirection: "row",
      backgroundColor: colors.card,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom: spacing.sm,
      overflow: "hidden",
      shadowColor: "#000",
      shadowOpacity: 0.1,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 6 },
    },

    goalCardAccent: {
      width: 4,
      flexShrink: 0,
    },

    goalCardBody: {
      flex: 1,
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
      flex: 1,
      fontSize: 15,
      fontWeight: "700" as const,
      color: colors.textPrimary,
      lineHeight: 21,
    },

    statusBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      borderRadius: 6,
      borderWidth: 1,
      paddingHorizontal: 7,
      paddingVertical: 3,
      flexShrink: 0,
    },

    statusDot: {
      width: 5,
      height: 5,
      borderRadius: 3,
    },

    statusText: {
      fontSize: 9,
      fontWeight: "700" as const,
      letterSpacing: 0.3,
    },

    goalCardProgressRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
    },

    goalCardTrack: {
      flex: 1,
      height: 5,
      borderRadius: 3,
      backgroundColor: colors.surfaceDark,
      overflow: "hidden",
    },

    goalCardFill: {
      height: "100%",
      borderRadius: 3,
    },

    goalCardPercent: {
      fontSize: 11,
      fontWeight: "800" as const,
      color: colors.textSecondary,
      minWidth: 30,
      textAlign: "right",
    },

    goalCardFooter: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },

    goalCardMeta: {
      fontSize: 11,
      fontWeight: "500" as const,
      color: colors.textMuted,
    },

    // ── Area chip (shared) ────────────────────────────────────────────────────

    areaChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      borderRadius: 6,
      borderWidth: 1,
      paddingHorizontal: 7,
      paddingVertical: 3,
      alignSelf: "flex-start",
    },

    areaChipText: {
      fontSize: 10,
      fontWeight: "600" as const,
    },

    // ── Swipe containers ──────────────────────────────────────────────────────

    swipeRight: {
      flexDirection: "row",
      marginBottom: spacing.sm,
      borderRadius: radius.md,
      overflow: "hidden",
    },

    swipeLeft: {
      flexDirection: "row",
      justifyContent: "flex-end",
      marginBottom: spacing.sm,
      borderRadius: radius.md,
      overflow: "hidden",
    },

    // ── Empty state ───────────────────────────────────────────────────────────

    emptyState: {
      backgroundColor: colors.card,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.xl,
      alignItems: "center",
      gap: spacing.md,
    },

    emptyIconWrap: {
      width: 56,
      height: 56,
      borderRadius: 18,
      backgroundColor: `${colors.accentCyan}14`,
      borderWidth: 1,
      borderColor: `${colors.accentCyan}30`,
      alignItems: "center",
      justifyContent: "center",
    },

    emptyTitle: {
      ...typography.title,
      color: colors.textPrimary,
      textAlign: "center",
    },

    emptyText: {
      ...typography.body,
      color: colors.textMuted,
      textAlign: "center",
    },

    emptyButton: {
      borderRadius: radius.sm,
      backgroundColor: colors.accent,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm,
      marginTop: spacing.xs,
    },

    emptyButtonText: {
      fontSize: 13,
      fontWeight: "700" as const,
      color: "#ffffff",
    },

    // ── Modals ────────────────────────────────────────────────────────────────

    overlay: {
      flex: 1,
      backgroundColor: colors.overlay,
    },

    modalWrapper: {
      ...StyleSheet.absoluteFillObject,
      justifyContent: "flex-end",
    },

    sheet: {
      backgroundColor: colors.glassStrong,
      borderTopLeftRadius: radius.xl,
      borderTopRightRadius: radius.xl,
      borderWidth: 1,
      borderColor: colors.primaryBorder,
      padding: spacing.lg + 2,
      paddingTop: spacing.md,
      shadowColor: colors.shadow,
      shadowOpacity: 0.18,
      shadowRadius: 28,
      shadowOffset: { width: 0, height: -12 },
      elevation: 18,
    },

    sheetHandle: {
      width: 40,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.secondaryBorder,
      alignSelf: "center",
      marginBottom: spacing.lg,
    },

    sheetTitle: {
      ...typography.label,
      color: colors.accent,
      marginBottom: spacing.lg,
    },

    multiline: {
      height: 80,
      textAlignVertical: "top",
    },

    sheetActions: {
      flexDirection: "row",
      gap: spacing.sm,
      marginTop: spacing.md,
    },

    sortOption: {
      minHeight: 46,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      borderTopWidth: 1,
      borderTopColor: colors.borderDark,
    },

    sortOptionText: {
      ...typography.body,
      color: colors.textSecondary,
      fontWeight: "700" as const,
    },

    sortOptionTextSelected: {
      color: colors.accentCyan,
    },

    // ── Goal detail sheet ─────────────────────────────────────────────────────

    detailWrapper: {
      ...StyleSheet.absoluteFillObject,
      justifyContent: "flex-end",
    },

    detailSheet: {
      maxHeight: "88%",
      backgroundColor: colors.glassStrong,
      borderTopLeftRadius: radius.xl,
      borderTopRightRadius: radius.xl,
      borderWidth: 1,
      borderColor: colors.primaryBorder,
      padding: spacing.lg + 2,
      paddingTop: spacing.md,
      shadowColor: colors.shadow,
      shadowOpacity: 0.18,
      shadowRadius: 28,
      shadowOffset: { width: 0, height: -12 },
      elevation: 18,
    },

    detailHeader: {
      flexDirection: "row",
      gap: spacing.md,
      marginBottom: spacing.lg,
      alignItems: "flex-start",
    },

    detailTitleBlock: {
      flex: 1,
      minWidth: 0,
    },

    detailTitle: {
      ...typography.title,
      color: colors.textPrimary,
      marginBottom: 4,
    },

    detailSubtitle: {
      ...typography.caption,
      color: colors.textMuted,
    },

    detailSection: {
      backgroundColor: colors.glassSubtle,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.secondaryBorder,
      padding: spacing.md,
      marginBottom: spacing.sm,
      gap: spacing.xs,
    },

    detailSectionTitle: {
      ...typography.label,
      color: colors.textMuted,
    },

    detailSectionText: {
      ...typography.body,
      color: colors.textSecondary,
    },

    detailActions: {
      flexDirection: "row",
      gap: spacing.sm,
      marginTop: spacing.sm,
      marginBottom: spacing.md,
    },

    detailPrimary: {
      flex: 1,
      borderRadius: radius.sm,
      backgroundColor: colors.accent,
      alignItems: "center",
      paddingVertical: spacing.md,
    },

    detailPrimaryText: {
      fontSize: 12,
      fontWeight: "900" as const,
      color: "#ffffff",
    },

    detailSecondary: {
      flex: 1,
      borderRadius: radius.sm,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: "center",
      paddingVertical: spacing.md,
    },

    detailSecondaryText: {
      fontSize: 12,
      fontWeight: "900" as const,
      color: colors.accentCyan,
    },

  });
}
