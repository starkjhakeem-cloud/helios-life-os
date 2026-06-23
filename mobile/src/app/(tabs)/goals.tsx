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
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { Swipeable } from "react-native-gesture-handler";
import { useFocusEffect, useLocalSearchParams } from "expo-router";
import { SymbolView } from "expo-symbols";
import type { SFSymbol } from "sf-symbols-typescript";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle } from "react-native-svg";
import * as Haptics from "expo-haptics";

import Input from "../../components/ui/Input";
import Button from "../../components/ui/Button";
import { spacing, radius, typography, type ThemeColors } from "../../theme/theme";
import { useTheme } from "../../theme/ThemeContext";
import { useAuthStore, useGoalsStore, useTasksStore } from "../../store";
import type { Goal } from "../../services/goalsService";
import type { Task } from "../../services/tasksService";
import { isActiveGoalStatus } from "../../utils/homeFormatting";

type Filter = "All" | "Active" | "Upcoming" | "Completed" | "Archived";
type SortMode = "Newest" | "Oldest" | "Due Date" | "Recently Updated" | "Alphabetical" | "Priority";
type GoalTone = "active" | "completed" | "upcoming" | "archived";

type FormState = {
  title: string;
  description: string;
  target_date: string;
};

type GoalMeta = {
  tone: GoalTone;
  statusLabel: string;
  priority: "Low" | "Medium" | "High";
  progress: number;
  dueLabel: string;
  daysRemainingLabel: string;
  linkedTasks: number;
  updatedLabel: string;
};

const EMPTY_FORM: FormState = { title: "", description: "", target_date: "" };
const FILTERS: Filter[] = ["All", "Active", "Upcoming", "Completed", "Archived"];
const SORTS: SortMode[] = ["Newest", "Oldest", "Due Date", "Recently Updated", "Alphabetical", "Priority"];

function normaliseStatus(status: string | null | undefined): string {
  return status?.trim().toLowerCase().replace(/[\s-]+/g, "_") ?? "";
}

function isCompletedGoal(goal: Goal): boolean {
  return normaliseStatus(goal.status) === "completed";
}

function isArchivedGoal(goal: Goal): boolean {
  const status = normaliseStatus(goal.status);
  return status === "archived" || status === "paused";
}

function parseDate(value: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
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
  const date = parseDate(value);
  if (!date) return "No due date";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatUpdated(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Updated recently";
  const today = new Date();
  if (
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate()
  ) {
    return "Updated today";
  }
  return `Updated ${date.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
}

function goalPriority(goal: Goal): GoalMeta["priority"] {
  const remaining = daysRemaining(goal);
  if (isCompletedGoal(goal) || isArchivedGoal(goal)) return "Low";
  if (remaining !== null && remaining <= 7) return "High";
  if (remaining !== null && remaining <= 30) return "Medium";
  return "Low";
}

function goalProgress(goal: Goal, linkedTasks: Task[]): number {
  if (isCompletedGoal(goal)) return 100;
  if (isArchivedGoal(goal)) return 0;
  const related = linkedTasks.filter((task) => task.linked_goal_id === goal.id);
  if (related.length > 0) {
    const complete = related.filter((task) => task.status === "done").length;
    return Math.round((complete / related.length) * 100);
  }
  const remaining = daysRemaining(goal);
  if (remaining === null) return 25;
  if (remaining < 0) return 10;
  if (remaining <= 7) return 70;
  if (remaining <= 30) return 45;
  return 20;
}

function goalMeta(goal: Goal, tasks: Task[]): GoalMeta {
  const remaining = daysRemaining(goal);
  const linkedTasks = tasks.filter((task) => task.linked_goal_id === goal.id).length;
  const archived = isArchivedGoal(goal);
  const completed = isCompletedGoal(goal);
  const active = isActiveGoalStatus(goal.status);
  const tone: GoalTone = completed ? "completed" : archived ? "archived" : active ? "active" : "upcoming";

  return {
    tone,
    statusLabel: completed ? "Completed" : archived ? "Archived" : active ? "Active" : "Upcoming",
    priority: goalPriority(goal),
    progress: goalProgress(goal, tasks),
    dueLabel: formatDate(goal.target_date),
    daysRemainingLabel:
      remaining === null
        ? "No deadline"
        : remaining < 0
          ? `${Math.abs(remaining)} days overdue`
          : remaining === 0
            ? "Due today"
            : `${remaining} days remaining`,
    linkedTasks,
    updatedLabel: formatUpdated(goal.updated_at),
  };
}

function summaryCounts(goals: Goal[]) {
  const active = goals.filter((goal) => isActiveGoalStatus(goal.status)).length;
  const completed = goals.filter(isCompletedGoal).length;
  const archived = goals.filter(isArchivedGoal).length;
  const upcoming = goals.filter((goal) => !isActiveGoalStatus(goal.status) && !isCompletedGoal(goal) && !isArchivedGoal(goal)).length;
  return { active, completed, upcoming, archived };
}

function matchesGoal(goal: Goal, meta: GoalMeta, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [
    goal.title,
    goal.description ?? "",
    goal.status,
    meta.statusLabel,
    meta.priority,
    meta.tone,
  ].join(" ").toLowerCase().includes(q);
}

function filterGoal(goal: Goal, filter: Filter, meta: GoalMeta): boolean {
  if (filter === "All") return true;
  if (filter === "Active") return isActiveGoalStatus(goal.status);
  if (filter === "Upcoming") return meta.tone === "upcoming";
  if (filter === "Completed") return isCompletedGoal(goal);
  return isArchivedGoal(goal);
}

function sortGoals(a: Goal, b: Goal, sort: SortMode, tasks: Task[]): number {
  if (sort === "Oldest") return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
  if (sort === "Due Date") {
    const aTime = parseDate(a.target_date)?.getTime() ?? Number.MAX_SAFE_INTEGER;
    const bTime = parseDate(b.target_date)?.getTime() ?? Number.MAX_SAFE_INTEGER;
    return aTime - bTime;
  }
  if (sort === "Recently Updated") return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
  if (sort === "Alphabetical") return a.title.localeCompare(b.title);
  if (sort === "Priority") {
    const rank = { High: 3, Medium: 2, Low: 1 };
    return rank[goalPriority(b)] - rank[goalPriority(a)];
  }
  return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
}

function toneColor(tone: GoalTone, colors: ThemeColors): string {
  if (tone === "completed") return colors.success;
  if (tone === "archived") return colors.textMuted;
  if (tone === "upcoming") return colors.warning;
  return colors.accentCyan;
}

function priorityColor(priority: GoalMeta["priority"], colors: ThemeColors): string {
  if (priority === "High") return colors.warning;
  if (priority === "Medium") return colors.accent;
  return colors.accentCyan;
}

export default function GoalsScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ focus?: string }>();
  const accessToken = useAuthStore((s) => s.accessToken);
  const { goals, isLoading, isMutating, error, fetchGoals, createGoal, updateGoal, deleteGoal } = useGoalsStore();
  const tasks = useTasksStore((s) => s.tasks);
  const fetchTasks = useTasksStore((s) => s.fetchTasks);

  const [modalVisible, setModalVisible] = useState(false);
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null);
  const [detailGoal, setDetailGoal] = useState<Goal | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("All");
  const [sortMode, setSortMode] = useState<SortMode>("Newest");
  const [sortVisible, setSortVisible] = useState(false);
  const listOpacity = useRef(new Animated.Value(0)).current;

  const counts = useMemo(() => summaryCounts(goals), [goals]);

  const visibleGoals = useMemo(() => {
    return [...goals]
      .filter((goal) => {
        const meta = goalMeta(goal, tasks);
        return matchesGoal(goal, meta, query) && filterGoal(goal, filter, meta);
      })
      .sort((a, b) => sortGoals(a, b, sortMode, tasks));
  }, [filter, goals, query, sortMode, tasks]);

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

  useEffect(() => {
    Animated.timing(listOpacity, {
      toValue: 1,
      duration: 320,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [listOpacity]);

  useFocusEffect(
    useCallback(() => {
      if (params.focus === "active") setFilter("Active");
      if (params.focus === "empty") setFilter("All");
    }, [params.focus]),
  );

  function openCreate() {
    setEditingGoal(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setModalVisible(true);
  }

  function openEdit(goal: Goal) {
    setEditingGoal(goal);
    setForm({
      title: goal.title,
      description: goal.description ?? "",
      target_date: goal.target_date ?? "",
    });
    setFormError(null);
    setModalVisible(true);
  }

  function closeModal() {
    Keyboard.dismiss();
    setModalVisible(false);
  }

  async function handleSubmit() {
    if (!accessToken) return;
    if (!form.title.trim()) {
      setFormError("Goal title is required.");
      return;
    }
    setFormError(null);

    const payload = {
      title: form.title.trim(),
      description: form.description.trim() || undefined,
      target_date: form.target_date.trim() || undefined,
    };

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

  function renderHeader() {
    return (
      <View style={styles.headerWrap}>
        <View style={styles.heroCard}>
          <View style={styles.heroTop}>
            <View style={styles.heroTitleBlock}>
              <Text style={styles.heroLabel}>GOALS</Text>
              <Text style={styles.heroTitle}>Goals</Text>
              <Text style={styles.heroSubtitle}>{"Everything you're working toward, organized in one place."}</Text>
            </View>
            <TouchableOpacity style={styles.newButton} onPress={openCreate} activeOpacity={0.82} accessibilityRole="button" accessibilityLabel="Create new goal">
              <SymbolView name="plus" size={14} tintColor="#ffffff" resizeMode="scaleAspectFit" />
              <Text style={styles.newButtonText}>New Goal</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.summaryGrid}>
            <SummaryChip label="Active" value={counts.active} icon="circle.fill" color={colors.accentCyan} />
            <SummaryChip label="Completed" value={counts.completed} icon="checkmark.circle.fill" color={colors.success} />
            <SummaryChip label="Upcoming" value={counts.upcoming} icon="calendar" color={colors.warning} />
            <SummaryChip label="Archived" value={counts.archived} icon="archivebox.fill" color={colors.textMuted} />
          </View>
        </View>

        <View style={styles.searchBar}>
          <SymbolView name="magnifyingglass" size={15} tintColor={colors.textMuted} resizeMode="scaleAspectFit" />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search goals…"
            placeholderTextColor={colors.textMuted}
            style={styles.searchInput}
            autoCorrect={false}
            clearButtonMode="while-editing"
            accessibilityLabel="Search goals"
          />
        </View>

        <View style={styles.controlsRow}>
          <View style={styles.filterWrap}>
            {FILTERS.map((item) => (
              <FilterChip key={item} label={item} selected={filter === item} onPress={() => setFilter(item)} />
            ))}
          </View>
          <TouchableOpacity style={styles.sortButton} onPress={() => setSortVisible(true)} activeOpacity={0.78} accessibilityRole="button" accessibilityLabel={`Sort goals. Current sort ${sortMode}`}>
            <SymbolView name="arrow.up.arrow.down" size={13} tintColor={colors.accentCyan} resizeMode="scaleAspectFit" />
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
        contentContainerStyle={[styles.container, { paddingTop: insets.top + spacing.md }]}
        data={visibleGoals}
        keyExtractor={(item) => item.id}
        renderItem={({ item, index }) => (
          <Animated.View style={{ opacity: listOpacity, transform: [{ translateY: listOpacity.interpolate({ inputRange: [0, 1], outputRange: [10 + index * 2, 0] }) }] }}>
            <GoalCardPremium
              goal={item}
              meta={goalMeta(item, tasks)}
              onOpen={() => setDetailGoal(item)}
              onEdit={() => openEdit(item)}
              onComplete={() => handleComplete(item)}
              onArchive={() => handleArchive(item)}
              onDelete={() => handleDelete(item)}
            />
          </Animated.View>
        )}
        ListHeaderComponent={renderHeader}
        ListEmptyComponent={
          !isLoading ? (
            <View style={styles.emptyState}>
              <View style={styles.emptyIcon}>
                <SymbolView name="target" size={30} tintColor={colors.accentCyan} resizeMode="scaleAspectFit" />
              </View>
              <Text style={styles.emptyTitle}>No goals yet</Text>
              <Text style={styles.emptyText}>Create your first goal and HELIOS will help organize the work needed to achieve it.</Text>
              <View style={styles.emptyActions}>
                <TouchableOpacity style={styles.primaryEmptyButton} onPress={openCreate} activeOpacity={0.82}>
                  <Text style={styles.primaryEmptyText}>New Goal</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.secondaryEmptyButton} activeOpacity={0.82}>
                  <Text style={styles.secondaryEmptyText}>Ask HELIOS</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : null
        }
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={onRefresh} tintColor={colors.accentCyan} />}
        initialNumToRender={8}
        maxToRenderPerBatch={8}
        windowSize={7}
        removeClippedSubviews
        showsVerticalScrollIndicator={false}
        ListFooterComponent={<View style={{ height: spacing.xxl }} />}
      />

      <SortSheet
        visible={sortVisible}
        selected={sortMode}
        onSelect={(mode) => {
          setSortMode(mode);
          setSortVisible(false);
        }}
        onClose={() => setSortVisible(false)}
      />

      <GoalDetailSheet
        goal={detailGoal}
        meta={detailGoal ? goalMeta(detailGoal, tasks) : null}
        tasks={tasks}
        onClose={() => setDetailGoal(null)}
        onEdit={(goal) => openEdit(goal)}
        onComplete={(goal) => handleComplete(goal)}
        onArchive={(goal) => handleArchive(goal)}
      />

      <Modal visible={modalVisible} animationType="slide" transparent onRequestClose={closeModal}>
        <TouchableWithoutFeedback onPress={closeModal}>
          <View style={styles.overlay} />
        </TouchableWithoutFeedback>

        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.modalWrapper}>
          <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>{editingGoal ? "EDIT GOAL" : "NEW GOAL"}</Text>

            <Input
              label="GOAL TITLE"
              placeholder="e.g. Launch HELIOS"
              value={form.title}
              onChangeText={(t) => setForm((f) => ({ ...f, title: t }))}
              error={formError ?? undefined}
              autoFocus
            />

            <Input
              label="DESCRIPTION"
              placeholder="What does success look like?"
              value={form.description}
              onChangeText={(t) => setForm((f) => ({ ...f, description: t }))}
              multiline
              style={styles.multiline}
            />

            <Input
              label="DUE DATE"
              placeholder="e.g. 2026-07-17"
              value={form.target_date}
              onChangeText={(t) => setForm((f) => ({ ...f, target_date: t }))}
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

function SummaryChip({ label, value, icon, color }: { label: string; value: number; icon: SFSymbol; color: string }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.summaryChip} accessible accessibilityLabel={`${value} ${label}`}>
      <SymbolView name={icon} size={11} tintColor={color} resizeMode="scaleAspectFit" />
      <Text style={styles.summaryValue}>{value}</Text>
      <Text style={styles.summaryLabel}>{label}</Text>
    </View>
  );
}

function FilterChip({ label, selected, onPress }: { label: Filter; selected: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const scale = useRef(new Animated.Value(selected ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(scale, {
      toValue: selected ? 1 : 0,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [scale, selected]);

  const backgroundColor = scale.interpolate({
    inputRange: [0, 1],
    outputRange: [colors.surfaceDark, `${colors.accent}26`],
  });

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.76} accessibilityRole="button" accessibilityState={{ selected }} accessibilityLabel={`Filter ${label}`}>
      <Animated.View style={[styles.filterChip, { backgroundColor }, selected && styles.filterChipSelected]}>
        <Text style={[styles.filterText, selected && styles.filterTextSelected]}>{label}</Text>
      </Animated.View>
    </TouchableOpacity>
  );
}

const GoalCardPremium = memo(function GoalCardPremium({
  goal,
  meta,
  onOpen,
  onEdit,
  onComplete,
  onArchive,
  onDelete,
}: {
  goal: Goal;
  meta: GoalMeta;
  onOpen: () => void;
  onEdit: () => void;
  onComplete: () => void;
  onArchive: () => void;
  onDelete: () => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const pressScale = useRef(new Animated.Value(1)).current;
  const progress = useRef(new Animated.Value(0)).current;
  const accent = toneColor(meta.tone, colors);
  const pColor = priorityColor(meta.priority, colors);

  useEffect(() => {
    Animated.timing(progress, {
      toValue: meta.progress,
      duration: 520,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [meta.progress, progress]);

  const progressWidth = progress.interpolate({ inputRange: [0, 100], outputRange: ["0%", "100%"] });

  function animatePress(toValue: number) {
    Animated.spring(pressScale, { toValue, useNativeDriver: true, speed: 24, bounciness: 6 }).start();
  }

  const leftActions = () => (
    <View style={styles.swipeRight}>
      <SwipeAction label="Complete" icon="checkmark.circle.fill" color={colors.success} onPress={onComplete} />
    </View>
  );

  const rightActions = () => (
    <View style={styles.swipeLeft}>
      <SwipeAction label="Archive" icon="archivebox.fill" color={colors.textMuted} onPress={onArchive} />
      <SwipeAction label="Delete" icon="trash.fill" color={colors.danger} onPress={onDelete} />
    </View>
  );

  return (
    <Swipeable renderLeftActions={leftActions} renderRightActions={rightActions} overshootLeft={false} overshootRight={false}>
      <Animated.View style={{ transform: [{ scale: pressScale }] }}>
        <TouchableOpacity
          style={styles.goalCard}
          onPress={onOpen}
          onPressIn={() => animatePress(0.985)}
          onPressOut={() => animatePress(1)}
          activeOpacity={0.88}
          accessibilityRole="button"
          accessibilityLabel={`${goal.title}. ${meta.statusLabel}. ${meta.progress} percent complete. ${meta.daysRemainingLabel}.`}
        >
          <View style={styles.cardTopRow}>
            <ProgressRing value={meta.progress} color={accent} />
            <View style={styles.cardTitleBlock}>
              <Text style={styles.cardTitle} numberOfLines={2}>{goal.title}</Text>
              <View style={styles.badgeRow}>
                <Badge label={meta.statusLabel} color={accent} />
                <Badge label={`${meta.priority} Priority`} color={pColor} />
              </View>
            </View>
            <TouchableOpacity style={styles.overflowButton} onPress={onEdit} activeOpacity={0.72} accessibilityRole="button" accessibilityLabel={`Edit ${goal.title}`}>
              <SymbolView name="ellipsis" size={18} tintColor={colors.textMuted} resizeMode="scaleAspectFit" />
            </TouchableOpacity>
          </View>

          {goal.description ? <Text style={styles.cardDescription} numberOfLines={2}>{goal.description}</Text> : null}

          <View style={styles.progressHeader}>
            <Text style={styles.progressLabel}>Progress</Text>
            <Text style={styles.progressPercent}>{meta.progress}%</Text>
          </View>
          <View style={styles.progressTrack}>
            <Animated.View style={[styles.progressFill, { width: progressWidth, backgroundColor: accent }]} />
          </View>

          <View style={styles.metaGrid}>
            <MetaPill icon="calendar" label={`Due ${meta.dueLabel}`} />
            <MetaPill icon="hourglass" label={meta.daysRemainingLabel} />
            <MetaPill icon="checklist" label={`${meta.linkedTasks} linked task${meta.linkedTasks === 1 ? "" : "s"}`} />
            <MetaPill icon="clock" label={meta.updatedLabel} />
          </View>
        </TouchableOpacity>
      </Animated.View>
    </Swipeable>
  );
});

function SwipeAction({ label, icon, color, onPress }: { label: string; icon: SFSymbol; color: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={[actionStyles.swipeAction, { backgroundColor: color }]} onPress={onPress} activeOpacity={0.84}>
      <SymbolView name={icon} size={15} tintColor="#ffffff" resizeMode="scaleAspectFit" />
      <Text style={actionStyles.swipeText}>{label}</Text>
    </TouchableOpacity>
  );
}

const actionStyles = StyleSheet.create({
  swipeAction: {
    width: 92,
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
  },
  swipeText: {
    color: "#ffffff",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0,
  },
});

function ProgressRing({ value, color }: { value: number; color: string }) {
  const { colors } = useTheme();
  const radiusValue = 18;
  const stroke = 4;
  const circumference = 2 * Math.PI * radiusValue;
  const dashOffset = circumference - (Math.max(0, Math.min(100, value)) / 100) * circumference;
  return (
    <View style={{ width: 48, height: 48 }}>
      <Svg width={48} height={48} viewBox="0 0 48 48">
        <Circle cx="24" cy="24" r={radiusValue} stroke={`${colors.textMuted}28`} strokeWidth={stroke} fill="none" />
        <Circle
          cx="24"
          cy="24"
          r={radiusValue}
          stroke={color}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={dashOffset}
          transform="rotate(-90 24 24)"
        />
      </Svg>
      <Text style={{ position: "absolute", top: 16, left: 0, right: 0, textAlign: "center", color: colors.textPrimary, fontSize: 10, fontWeight: "900" }}>{value}</Text>
    </View>
  );
}

function Badge({ label, color }: { label: string; color: string }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={[styles.badge, { borderColor: `${color}55`, backgroundColor: `${color}14` }]}>
      <Text style={[styles.badgeText, { color }]}>{label.toUpperCase()}</Text>
    </View>
  );
}

function MetaPill({ icon, label }: { icon: SFSymbol; label: string }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.metaPill}>
      <SymbolView name={icon} size={11} tintColor={colors.textMuted} resizeMode="scaleAspectFit" />
      <Text style={styles.metaText} numberOfLines={1}>{label}</Text>
    </View>
  );
}

function SortSheet({ visible, selected, onSelect, onClose }: { visible: boolean; selected: SortMode; onSelect: (mode: SortMode) => void; onClose: () => void }) {
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
            <TouchableOpacity key={mode} style={styles.sortOption} onPress={() => onSelect(mode)} activeOpacity={0.78} accessibilityRole="button">
              <Text style={[styles.sortOptionText, selected === mode && styles.sortOptionTextSelected]}>{mode}</Text>
              {selected === mode ? <SymbolView name="checkmark" size={14} tintColor={colors.accentCyan} resizeMode="scaleAspectFit" /> : null}
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </Modal>
  );
}

function GoalDetailSheet({
  goal,
  meta,
  tasks,
  onClose,
  onEdit,
  onComplete,
  onArchive,
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
  const linked = tasks.filter((task) => task.linked_goal_id === goal.id);

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
              ["Description", goal.description || "No description yet."],
              ["Progress", `${meta.progress}% complete. ${meta.daysRemainingLabel}.`],
              ["Milestones", "No milestones yet."],
              ["Linked Tasks", linked.length > 0 ? linked.map((task) => task.title).join("\n") : "No linked tasks."],
              ["Notes", "No notes captured."],
              ["Timeline", `${formatUpdated(goal.created_at)}\n${meta.updatedLabel}`],
              ["Attachments", "Future support."],
              ["Suggestions", "Break this goal into milestones\nGenerate related tasks\nCreate a completion plan\nReview progress\nSuggest next step\nSet reminders"],
            ] as [string, string][]}
            keyExtractor={(item) => item[0]}
            ListHeaderComponent={
              <View style={styles.detailHeader}>
                <View style={styles.detailIcon}>
                  <ProgressRing value={meta.progress} color={toneColor(meta.tone, colors)} />
                </View>
                <View style={styles.detailTitleBlock}>
                  <Text style={styles.detailLabel}>OVERVIEW</Text>
                  <Text style={styles.detailTitle}>{goal.title}</Text>
                  <Text style={styles.detailSubtitle}>{meta.statusLabel} • {meta.priority} Priority • {meta.dueLabel}</Text>
                </View>
              </View>
            }
            renderItem={({ item }) => (
              <View style={styles.detailSection}>
                <Text style={styles.detailSectionTitle}>{item[0].toUpperCase()}</Text>
                <Text style={styles.detailSectionText}>{item[1]}</Text>
              </View>
            )}
            ListFooterComponent={
              <View style={styles.detailActions}>
                <TouchableOpacity style={styles.detailPrimaryAction} onPress={() => onEdit(goal)} activeOpacity={0.82}>
                  <Text style={styles.detailPrimaryText}>Edit</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.detailSecondaryAction} onPress={() => onComplete(goal)} activeOpacity={0.82}>
                  <Text style={styles.detailSecondaryText}>Complete</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.detailSecondaryAction} onPress={() => onArchive(goal)} activeOpacity={0.82}>
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

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      paddingHorizontal: spacing.md,
      paddingBottom: spacing.xxl * 2,
    },
    headerWrap: {
      gap: spacing.md,
      marginBottom: spacing.md,
    },
    heroCard: {
      backgroundColor: colors.card,
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: `${colors.accent}38`,
      padding: spacing.lg,
      gap: spacing.lg,
      shadowColor: colors.accent,
      shadowOpacity: 0.1,
      shadowRadius: 20,
      shadowOffset: { width: 0, height: 12 },
    },
    heroTop: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: spacing.md,
    },
    heroTitleBlock: {
      flex: 1,
      minWidth: 0,
    },
    heroLabel: {
      ...typography.label,
      color: colors.accent,
      marginBottom: spacing.sm,
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
    newButton: {
      minHeight: 40,
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.xs,
      borderRadius: radius.sm,
      backgroundColor: colors.accent,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
    newButtonText: {
      fontSize: 12,
      fontWeight: "900",
      color: "#ffffff",
      letterSpacing: 0,
    },
    summaryGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: spacing.sm,
    },
    summaryChip: {
      minHeight: 38,
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      borderRadius: radius.sm,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceDark,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs,
    },
    summaryValue: {
      fontSize: 14,
      fontWeight: "900",
      color: colors.textPrimary,
      letterSpacing: 0,
    },
    summaryLabel: {
      fontSize: 11,
      fontWeight: "700",
      color: colors.textMuted,
      letterSpacing: 0,
    },
    searchBar: {
      minHeight: 46,
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
      paddingHorizontal: spacing.md,
    },
    searchInput: {
      flex: 1,
      color: colors.textPrimary,
      fontSize: 15,
      paddingVertical: spacing.sm,
    },
    controlsRow: {
      flexDirection: "row",
      alignItems: "center",
      flexWrap: "wrap",
      gap: spacing.sm,
    },
    filterWrap: {
      flex: 1,
      minWidth: 240,
      flexDirection: "row",
      flexWrap: "wrap",
      gap: spacing.sm,
    },
    filterChip: {
      minHeight: 36,
      justifyContent: "center",
      borderRadius: radius.sm,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: spacing.md,
    },
    filterChipSelected: {
      borderColor: colors.accent,
    },
    filterText: {
      fontSize: 12,
      fontWeight: "800",
      color: colors.textMuted,
      letterSpacing: 0,
    },
    filterTextSelected: {
      color: colors.accent,
    },
    sortButton: {
      minHeight: 36,
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.xs,
      borderRadius: radius.sm,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
      paddingHorizontal: spacing.md,
    },
    sortText: {
      fontSize: 12,
      fontWeight: "900",
      color: colors.accentCyan,
      letterSpacing: 0,
    },
    errorText: {
      ...typography.caption,
      color: colors.danger,
    },
    goalCard: {
      backgroundColor: colors.card,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.md,
      marginBottom: spacing.md,
      shadowColor: "#000",
      shadowOpacity: 0.14,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 10 },
    },
    cardTopRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: spacing.md,
    },
    cardTitleBlock: {
      flex: 1,
      minWidth: 0,
    },
    cardTitle: {
      fontSize: 19,
      lineHeight: 24,
      fontWeight: "900",
      color: colors.textPrimary,
      letterSpacing: 0,
      marginBottom: spacing.sm,
    },
    badgeRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: spacing.xs,
    },
    badge: {
      borderWidth: 1,
      borderRadius: 9,
      paddingHorizontal: 7,
      paddingVertical: 3,
    },
    badgeText: {
      fontSize: 9,
      fontWeight: "900",
      letterSpacing: 0,
    },
    overflowButton: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: "center",
      justifyContent: "center",
    },
    cardDescription: {
      ...typography.body,
      color: colors.textSecondary,
      marginTop: spacing.md,
    },
    progressHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      marginTop: spacing.md,
      marginBottom: spacing.xs,
    },
    progressLabel: {
      fontSize: 12,
      fontWeight: "800",
      color: colors.textMuted,
      letterSpacing: 0,
    },
    progressPercent: {
      fontSize: 12,
      fontWeight: "900",
      color: colors.textPrimary,
      letterSpacing: 0,
    },
    progressTrack: {
      height: 7,
      borderRadius: 4,
      backgroundColor: colors.surfaceDark,
      overflow: "hidden",
      marginBottom: spacing.md,
    },
    progressFill: {
      height: "100%",
      borderRadius: 4,
    },
    metaGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: spacing.xs,
    },
    metaPill: {
      maxWidth: "48%",
      minHeight: 30,
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.borderDark,
      backgroundColor: colors.surfaceDark,
      paddingHorizontal: spacing.sm,
    },
    metaText: {
      fontSize: 11,
      fontWeight: "700",
      color: colors.textMuted,
      letterSpacing: 0,
    },
    swipeRight: {
      flexDirection: "row",
      marginBottom: spacing.md,
      borderRadius: radius.lg,
      overflow: "hidden",
    },
    swipeLeft: {
      flexDirection: "row",
      justifyContent: "flex-end",
      marginBottom: spacing.md,
      borderRadius: radius.lg,
      overflow: "hidden",
    },
    emptyState: {
      backgroundColor: colors.card,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.xl,
      alignItems: "center",
      gap: spacing.md,
    },
    emptyIcon: {
      width: 58,
      height: 58,
      borderRadius: 19,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: `${colors.accentCyan}16`,
      borderWidth: 1,
      borderColor: `${colors.accentCyan}35`,
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
    emptyActions: {
      flexDirection: "row",
      gap: spacing.sm,
    },
    primaryEmptyButton: {
      borderRadius: radius.sm,
      backgroundColor: colors.accent,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm,
    },
    primaryEmptyText: {
      fontSize: 12,
      fontWeight: "900",
      color: "#ffffff",
    },
    secondaryEmptyButton: {
      borderRadius: radius.sm,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm,
    },
    secondaryEmptyText: {
      fontSize: 12,
      fontWeight: "900",
      color: colors.accentCyan,
    },
    overlay: {
      flex: 1,
      backgroundColor: colors.overlay,
    },
    modalWrapper: {
      flex: 1,
      justifyContent: "flex-end",
    },
    sheet: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: radius.xl,
      borderTopRightRadius: radius.xl,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.lg,
      paddingTop: spacing.md,
    },
    sheetHandle: {
      width: 40,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.border,
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
      fontWeight: "700",
    },
    sortOptionTextSelected: {
      color: colors.accentCyan,
    },
    detailWrapper: {
      flex: 1,
      justifyContent: "flex-end",
    },
    detailSheet: {
      maxHeight: "88%",
      backgroundColor: colors.surface,
      borderTopLeftRadius: radius.xl,
      borderTopRightRadius: radius.xl,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.lg,
      paddingTop: spacing.md,
    },
    detailHeader: {
      flexDirection: "row",
      gap: spacing.md,
      marginBottom: spacing.lg,
    },
    detailIcon: {
      width: 54,
      height: 54,
      alignItems: "center",
      justifyContent: "center",
    },
    detailTitleBlock: {
      flex: 1,
      minWidth: 0,
    },
    detailLabel: {
      ...typography.label,
      color: colors.accent,
      marginBottom: spacing.xs,
    },
    detailTitle: {
      ...typography.title,
      color: colors.textPrimary,
      marginBottom: spacing.xs,
    },
    detailSubtitle: {
      ...typography.caption,
      color: colors.textMuted,
    },
    detailSection: {
      backgroundColor: colors.card,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.md,
      marginBottom: spacing.sm,
    },
    detailSectionTitle: {
      ...typography.label,
      color: colors.textMuted,
      marginBottom: spacing.xs,
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
    detailPrimaryAction: {
      flex: 1,
      borderRadius: radius.sm,
      backgroundColor: colors.accent,
      alignItems: "center",
      paddingVertical: spacing.md,
    },
    detailPrimaryText: {
      fontSize: 12,
      fontWeight: "900",
      color: "#ffffff",
    },
    detailSecondaryAction: {
      flex: 1,
      borderRadius: radius.sm,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: "center",
      paddingVertical: spacing.md,
    },
    detailSecondaryText: {
      fontSize: 12,
      fontWeight: "900",
      color: colors.accentCyan,
    },
  });
}
