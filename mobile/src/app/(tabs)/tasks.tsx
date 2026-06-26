import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocalSearchParams } from "expo-router";
import {
  Alert,
  Animated,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { Swipeable } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SymbolView } from "expo-symbols";
import type { SFSymbol } from "sf-symbols-typescript";
import * as Haptics from "expo-haptics";

import Input from "../../components/ui/Input";
import Button from "../../components/ui/Button";
import DateTimeField from "../../components/ui/DateTimeField";
import { spacing, radius, typography, type ThemeColors } from "../../theme/theme";
import { useTheme } from "../../theme/ThemeContext";
import { useTasksStore, useGoalsStore, useAuthStore, useTaskEngineStore } from "../../store";
import type { Task } from "../../services/tasksService";
import type { TaskSuggestion } from "../../services/taskEngineService";
import {
  type SuggestionSourceFilter,
  prepareSuggestions,
  sourceBreakdown,
  sourceFilterForSuggestion,
  suggestionReason,
} from "../../utils/taskSuggestionRanking";

// ── Context grouping ──────────────────────────────────────────────────────────

type ContextId = "development" | "school" | "creative" | "health" | "admin" | "personal";
type Priority  = "low" | "medium" | "high" | "critical";
type SortMode  = "Priority" | "Due Date" | "Newest";
type FilterKey = "all" | "today" | "high" | "helios" | "overdue";

type ContextDef = {
  id: ContextId;
  label: string;
  icon: SFSymbol;
  accent: string;
  keywords: string[];
};

type FormState = {
  title: string;
  description: string;
  priority: Priority;
  due_date: Date | null;
  linked_goal_id: string;
};

const PRIORITIES: Priority[] = ["low", "medium", "high", "critical"];

const EMPTY_FORM: FormState = {
  title: "", description: "", priority: "medium", due_date: null, linked_goal_id: "",
};

const CONTEXTS: ContextDef[] = [
  { id: "development", label: "Development",    icon: "hammer.fill",           accent: "#a855f7", keywords: ["helios", "code", "build", "launch", "dev", "app", "api", "test", "deploy", "software", "engineer", "bug", "fix", "feature"] },
  { id: "school",      label: "School",          icon: "book.fill",             accent: "#3b82f6", keywords: ["wgu", "study", "class", "course", "degree", "d278", "c174", "d280", "assignment", "exam", "lecture", "homework", "school"] },
  { id: "creative",    label: "Creative",        icon: "paintbrush.fill",       accent: "#f97316", keywords: ["write", "design", "art", "music", "publish", "gravewood", "create", "draw", "photo", "video", "content"] },
  { id: "health",      label: "Health",          icon: "heart.fill",            accent: "#22c55e", keywords: ["workout", "exercise", "gym", "run", "health", "fitness", "diet", "sleep", "meditat", "walk", "stretch"] },
  { id: "admin",       label: "Administration",  icon: "tray.full.fill",        accent: "#f59e0b", keywords: ["email", "invoice", "meeting", "schedule", "budget", "finance", "document", "plan", "call", "bill", "tax", "form"] },
  { id: "personal",    label: "Personal",        icon: "person.fill",           accent: "#22d3ee", keywords: [] },
];

function assignContext(task: Task): ContextId {
  const text = `${task.title} ${task.description ?? ""}`.toLowerCase();
  for (const ctx of CONTEXTS) {
    if (ctx.id === "personal") continue;
    if (ctx.keywords.some((kw) => text.includes(kw))) return ctx.id;
  }
  return "personal";
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function parseDate(value: string | null): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function isHeliosTask(task: Task): boolean {
  const text = `${task.title} ${task.description ?? ""}`.toLowerCase();
  return !task.linked_goal_id && (text.includes("helios") || text.includes("memory") || text.includes("review") || text.includes("brief") || text.includes("optimiz"));
}

function priorityRank(p: string): number {
  return p === "critical" ? 4 : p === "high" ? 3 : p === "medium" ? 2 : 1;
}

function priorityColor(priority: string, colors: ThemeColors): string {
  switch (priority) {
    case "critical": return colors.danger;
    case "high":     return "#f97316";
    case "medium":   return colors.accent;
    default:         return "#3b82f6";
  }
}

function estimateDuration(task: Task): string {
  if (task.priority === "critical") return "45m";
  if (task.priority === "high")     return "30m";
  if (isHeliosTask(task))           return "15m";
  return "20m";
}

function estimateMins(task: Task): number {
  if (task.priority === "critical") return 45;
  if (task.priority === "high")     return 30;
  if (isHeliosTask(task))           return 15;
  return 20;
}

function displayTitle(task: Task): string {
  if (isHeliosTask(task) && task.title.toLowerCase().includes("memory")) return "Memory Optimization";
  return task.title;
}

function formatDueCompact(task: Task): { label: string; urgent: boolean } | null {
  const due = parseDate(task.due_date);
  if (!due) return null;
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const dueDay = new Date(due);
  dueDay.setHours(0, 0, 0, 0);
  const todayDay = new Date(today);
  todayDay.setHours(0, 0, 0, 0);
  if (dueDay < todayDay) return { label: "Overdue", urgent: true };
  if (isSameDay(due, today))    return { label: "Today", urgent: true };
  if (isSameDay(due, tomorrow)) return { label: "Tomorrow", urgent: false };
  return {
    label: due.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    urgent: false,
  };
}

function sortedTasks(tasks: Task[], sort: SortMode): Task[] {
  return [...tasks].sort((a, b) => {
    if (sort === "Due Date") {
      const aT = parseDate(a.due_date)?.getTime() ?? Number.MAX_SAFE_INTEGER;
      const bT = parseDate(b.due_date)?.getTime() ?? Number.MAX_SAFE_INTEGER;
      return aT !== bT ? aT - bT : priorityRank(b.priority) - priorityRank(a.priority);
    }
    if (sort === "Newest") return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    return priorityRank(b.priority) - priorityRank(a.priority);
  });
}

function matchesFilter(task: Task, filter: FilterKey): boolean {
  if (filter === "all") return true;
  if (filter === "today") {
    const d = parseDate(task.due_date);
    return !!d && isSameDay(d, new Date());
  }
  if (filter === "high") return task.priority === "high" || task.priority === "critical";
  if (filter === "helios") return isHeliosTask(task);
  if (filter === "overdue") {
    const d = parseDate(task.due_date);
    return !!d && d < new Date() && !isSameDay(d, new Date());
  }
  return true;
}

function matchesSearch(task: Task, query: string, goalTitle: string | undefined): boolean {
  if (!query.trim()) return true;
  const q = query.toLowerCase();
  const ctx = CONTEXTS.find(c => c.id === assignContext(task))?.label ?? "";
  return `${task.title} ${task.description ?? ""} ${ctx} ${goalTitle ?? ""}`.toLowerCase().includes(q);
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function TasksScreen() {
  const { colors } = useTheme();
  const styles     = useMemo(() => createStyles(colors), [colors]);
  const insets     = useSafeAreaInsets();
  const accessToken = useAuthStore((s) => s.accessToken);
  const { tasks, isLoading, isMutating, error, fetchTasks, createTask, updateTask, deleteTask } = useTasksStore();
  const { goals } = useGoalsStore();
  const {
    suggestions,
    isLoading: isSuggestionsLoading,
    isGenerating: isSuggestionsGenerating,
    error: suggestionsError,
    fetchSuggestions,
    generateSuggestions,
    acceptSuggestion,
    rejectSuggestion,
    scheduleTask,
    completeTaskViaEngine,
  } = useTaskEngineStore();

  const { filter: routeFilter } = useLocalSearchParams<{ filter?: string }>();

  const [focusModeOn, setFocusModeOn] = useState(false);
  const [expandedId, setExpandedId]   = useState<string | null>(null);
  const [sortMode, setSortMode]       = useState<SortMode>("Priority");
  const [filter, setFilter]           = useState<FilterKey>("all");

  const VALID_FILTERS: FilterKey[] = ["all", "today", "high", "helios", "overdue"];
  useEffect(() => {
    if (routeFilter && VALID_FILTERS.includes(routeFilter as FilterKey)) {
      setFilter(routeFilter as FilterKey);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeFilter]);
  const [query, setQuery]             = useState("");
  const [sortVisible, setSortVisible] = useState(false);
  const [filterVisible, setFilterVisible] = useState(false);
  const [modalVisible, setModalVisible]   = useState(false);
  const [form, setForm]             = useState<FormState>(EMPTY_FORM);
  const [formError, setFormError]   = useState<string | null>(null);
  const [showCompleted, setShowCompleted] = useState(false);

  const onRefresh = useCallback(() => {
    if (!accessToken) return;
    fetchTasks(accessToken);
    fetchSuggestions(accessToken);
  }, [accessToken, fetchTasks, fetchSuggestions]);

  useEffect(() => {
    if (!accessToken) return;
    fetchTasks(accessToken);
    fetchSuggestions(accessToken);
  }, [accessToken, fetchTasks, fetchSuggestions]);

  const goalMap = useMemo(() => {
    const m: Record<string, string> = {};
    goals.forEach(g => { m[g.id] = g.title; });
    return m;
  }, [goals]);

  const openTasks = useMemo(() => tasks.filter(t => t.status !== "done"), [tasks]);
  const doneTasks = useMemo(() => tasks.filter(t => t.status === "done"), [tasks]);

  const filteredOpen = useMemo(() => {
    return openTasks.filter(t =>
      matchesFilter(t, filter) &&
      matchesSearch(t, query, t.linked_goal_id ? goalMap[t.linked_goal_id] : undefined)
    );
  }, [openTasks, filter, query, goalMap]);

  const contextGroups = useMemo(() => {
    const sorted = sortedTasks(filteredOpen, sortMode);
    return CONTEXTS
      .map(ctx => ({
        ctx,
        tasks: sorted.filter(t => assignContext(t) === ctx.id).slice(0, focusModeOn ? 1 : 100),
      }))
      .filter(g => g.tasks.length > 0);
  }, [filteredOpen, sortMode, focusModeOn]);

  // The highest-priority open task for Focus button
  const topTask = useMemo(() =>
    sortedTasks(openTasks, "Priority")[0] ?? null,
    [openTasks],
  );

  // Total session time for the focus button tooltip
  const focusSessionMins = useMemo(() =>
    sortedTasks(openTasks, "Priority").slice(0, 4).reduce((s, t) => s + estimateMins(t), 0),
    [openTasks],
  );

  function openModal()  { setForm(EMPTY_FORM); setFormError(null); setModalVisible(true); }
  function closeModal() { Keyboard.dismiss(); setModalVisible(false); }

  async function handleCreate() {
    if (!accessToken) return;
    if (!form.title.trim()) { setFormError("Task title is required."); return; }
    setFormError(null);
    await createTask(accessToken, {
      title: form.title.trim(),
      description: form.description.trim() || undefined,
      priority: form.priority,
      due_date: form.due_date ? form.due_date.toISOString() : undefined,
      linked_goal_id: form.linked_goal_id || undefined,
    });
    closeModal();
  }

  function handleComplete(taskId: string) {
    if (!accessToken) return;
    updateTask(accessToken, taskId, { status: "done" });
    // Fire-and-forget enhanced completion so history + goal progress are tracked
    completeTaskViaEngine(accessToken, taskId).catch(() => {});
    if (expandedId === taskId) setExpandedId(null);
  }

  async function handleSchedule(taskId: string) {
    if (!accessToken) return;
    Haptics.selectionAsync().catch(() => {});
    const today = new Date().toISOString().slice(0, 10);
    const result = await scheduleTask(accessToken, taskId, { date: today });
    if (result.calendarEvent) {
      fetchTasks(accessToken).catch(() => {});
    }
  }

  function handleDelete(task: Task) {
    Alert.alert("Delete Task", `Delete "${displayTitle(task)}"?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => {
        if (accessToken) deleteTask(accessToken, task.id);
        if (expandedId === task.id) setExpandedId(null);
      }},
    ]);
  }

  function handleExpand(id: string) {
    Haptics.selectionAsync().catch(() => {});
    setExpandedId(cur => cur === id ? null : id);
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.container, { paddingTop: insets.top + spacing.md, paddingBottom: insets.bottom + 128 }]}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={onRefresh} tintColor={colors.accentCyan} />}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Workspace header ── */}
        <View style={styles.wsHeader}>
          <View>
            <Text style={styles.wsLabel}>TASK CENTER</Text>
            <Text style={styles.wsTitle}>{focusModeOn ? "Focus Mode" : "Your Workspace"}</Text>
          </View>
          {focusModeOn && (
            <View style={styles.focusBadge}>
              <View style={[styles.focusBadgeDot, { backgroundColor: colors.accent }]} />
              <Text style={styles.focusBadgeText}>Active</Text>
            </View>
          )}
        </View>

        {/* ── Search ── */}
        <View style={styles.searchRow}>
          <SymbolView name="magnifyingglass" size={14} tintColor={colors.textMuted} resizeMode="scaleAspectFit" />
          <TextInput
            style={styles.searchInput}
            value={query}
            onChangeText={setQuery}
            placeholder="Search tasks, goals, contexts…"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            spellCheck={false}
            clearButtonMode="while-editing"
          />
        </View>

        {/* ── Toolbar ── */}
        <View style={styles.toolbar}>
          <TouchableOpacity style={styles.toolbarPrimary} onPress={openModal} activeOpacity={0.82}>
            <SymbolView name="plus" size={12} tintColor="#fff" resizeMode="scaleAspectFit" />
            <Text style={styles.toolbarPrimaryText}>New Task</Text>
          </TouchableOpacity>

          <View style={styles.toolbarRight}>
            <TouchableOpacity style={styles.toolBtn} onPress={() => setSortVisible(true)} activeOpacity={0.78}>
              <SymbolView name="arrow.up.arrow.down" size={12} tintColor={colors.textMuted} resizeMode="scaleAspectFit" />
              <Text style={styles.toolBtnText}>Sort</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.toolBtn, filter !== "all" && styles.toolBtnActive]} onPress={() => setFilterVisible(true)} activeOpacity={0.78}>
              <SymbolView name="line.3.horizontal.decrease" size={12} tintColor={filter !== "all" ? colors.accent : colors.textMuted} resizeMode="scaleAspectFit" />
              <Text style={[styles.toolBtnText, filter !== "all" && { color: colors.accent }]}>Filter</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.toolBtn, focusModeOn && styles.toolBtnFocus]} onPress={() => setFocusModeOn(f => !f)} activeOpacity={0.78}>
              <SymbolView name="scope" size={12} tintColor={focusModeOn ? colors.accent : colors.textMuted} resizeMode="scaleAspectFit" />
              <Text style={[styles.toolBtnText, focusModeOn && { color: colors.accent }]}>Focus</Text>
            </TouchableOpacity>
          </View>
        </View>

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        {/* ── Compact HELIOS suggestions panel ── */}
        <SuggestionsSection
          suggestions={suggestions}
          isLoading={isSuggestionsLoading || isSuggestionsGenerating}
          error={suggestionsError}
          onAccept={(id) => accessToken && acceptSuggestion(accessToken, id)}
          onReject={(id) => accessToken && rejectSuggestion(accessToken, id)}
          onRejectAll={(ids) => accessToken && ids.forEach((id) => rejectSuggestion(accessToken, id))}
          onGenerate={() => accessToken && generateSuggestions(accessToken)}
        />

        {/* ── Context sections ── */}
        {contextGroups.length === 0 && !isLoading ? (
          <EmptyWorkspace query={query} filter={filter} onNewTask={openModal} />
        ) : null}

        {contextGroups.map(({ ctx, tasks: ctxTasks }, groupIdx) => (
          <View key={ctx.id} style={styles.contextSection}>
            <View style={styles.contextHeader}>
              <View style={styles.contextHeaderLeft}>
                <View style={[styles.contextDot, { backgroundColor: ctx.accent }]} />
                <Text style={[styles.contextLabel, { color: ctx.accent }]}>{ctx.label.toUpperCase()}</Text>
              </View>
              <Text style={styles.contextCount}>{ctxTasks.length}</Text>
            </View>

            <View style={styles.contextRows}>
              {ctxTasks.map((task, taskIdx) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  contextAccent={ctx.accent}
                  isExpanded={expandedId === task.id}
                  isLast={taskIdx === ctxTasks.length - 1}
                  goalTitle={task.linked_goal_id ? goalMap[task.linked_goal_id] : undefined}
                  onExpand={() => handleExpand(task.id)}
                  onComplete={() => handleComplete(task.id)}
                  onSchedule={() => handleSchedule(task.id)}
                  onDelete={() => handleDelete(task)}
                />
              ))}
            </View>

            {/* Inline HELIOS suggestion after second section */}
            {groupIdx === 1 && ctxTasks.some(t => estimateMins(t) <= 20) && (
              <InlineAISuggestion
                task={ctxTasks.find(t => estimateMins(t) <= 20)!}
                onSchedule={() => handleSchedule(ctxTasks.find(t => estimateMins(t) <= 20)!.id)}
              />
            )}
          </View>
        ))}

        {/* ── Completed footer ── */}
        {doneTasks.length > 0 && (
          <View style={styles.completedFooter}>
            <TouchableOpacity style={styles.completedToggle} onPress={() => setShowCompleted(v => !v)} activeOpacity={0.78}>
              <SymbolView name={showCompleted ? "chevron.down" : "chevron.right"} size={11} tintColor={colors.textMuted} resizeMode="scaleAspectFit" />
              <Text style={styles.completedToggleText}>{doneTasks.length} completed</Text>
            </TouchableOpacity>

            {showCompleted && (
              <View style={styles.contextRows}>
                {doneTasks.map((task, taskIdx) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    contextAccent={colors.success}
                    isExpanded={expandedId === task.id}
                    isLast={taskIdx === doneTasks.length - 1}
                    goalTitle={task.linked_goal_id ? goalMap[task.linked_goal_id] : undefined}
                    onExpand={() => handleExpand(task.id)}
                    onComplete={() => handleComplete(task.id)}
                    onSchedule={() => handleSchedule(task.id)}
                    onDelete={() => handleDelete(task)}
                    isDone
                  />
                ))}
              </View>
            )}
          </View>
        )}
      </ScrollView>

      {/* ── Floating focus button ── */}
      {topTask && !focusModeOn && (
        <TouchableOpacity
          style={[styles.focusFloatBtn, { bottom: insets.bottom + 120 }]}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
            setFocusModeOn(true);
          }}
          activeOpacity={0.88}
        >
          <SymbolView name="timer" size={16} tintColor="#fff" resizeMode="scaleAspectFit" />
          <View>
            <Text style={styles.focusFloatLabel}>Focus</Text>
            <Text style={styles.focusFloatSub}>{focusSessionMins}m session</Text>
          </View>
        </TouchableOpacity>
      )}

      {focusModeOn && (
        <TouchableOpacity
          style={[styles.focusFloatBtn, styles.focusFloatBtnActive, { bottom: insets.bottom + 120 }]}
          onPress={() => setFocusModeOn(false)}
          activeOpacity={0.88}
        >
          <SymbolView name="xmark.circle.fill" size={16} tintColor="#fff" resizeMode="scaleAspectFit" />
          <Text style={styles.focusFloatLabel}>Exit Focus</Text>
        </TouchableOpacity>
      )}

      {/* ── Sort sheet ── */}
      <SortSheet
        visible={sortVisible}
        selected={sortMode}
        onSelect={m => { setSortMode(m); setSortVisible(false); }}
        onClose={() => setSortVisible(false)}
      />

      {/* ── Filter sheet ── */}
      <FilterSheet
        visible={filterVisible}
        selected={filter}
        onSelect={f => { setFilter(f); setFilterVisible(false); }}
        onClose={() => setFilterVisible(false)}
      />

      {/* ── Create task modal ── */}
      <Modal visible={modalVisible} animationType="slide" transparent onRequestClose={closeModal}>
        <TouchableWithoutFeedback onPress={closeModal}>
          <View style={styles.overlay} />
        </TouchableWithoutFeedback>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.sheetWrapper}>
          <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>NEW TASK</Text>

            <Input label="TASK TITLE" placeholder="What needs to get done?" value={form.title}
              onChangeText={t => setForm(f => ({ ...f, title: t }))} error={formError ?? undefined} autoFocus />
            <Input label="DESCRIPTION" placeholder="Optional context" value={form.description}
              onChangeText={t => setForm(f => ({ ...f, description: t }))} multiline style={{ height: 68, textAlignVertical: "top" }} autoCapitalize="sentences" />

            <Text style={styles.fieldLabel}>PRIORITY</Text>
            <View style={styles.priorityRow}>
              {PRIORITIES.map(p => {
                const pc  = priorityColor(p, colors);
                const sel = form.priority === p;
                return (
                  <TouchableOpacity key={p}
                    style={[styles.priorityBtn, sel && { backgroundColor: `${pc}22`, borderColor: pc }]}
                    onPress={() => setForm(f => ({ ...f, priority: p }))}
                  >
                    <View style={[styles.priorityBtnDot, { backgroundColor: pc }]} />
                    <Text style={[styles.priorityBtnText, { color: sel ? pc : colors.textMuted }]}>
                      {p[0].toUpperCase()}{p.slice(1)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <DateTimeField
              label="DUE DATE"
              value={form.due_date}
              onChange={date => setForm(f => ({ ...f, due_date: date }))}
              mode="date"
              placeholder="Select due date"
            />

            {goals.filter(g => g.status === "active").length > 0 && (
              <>
                <Text style={styles.fieldLabel}>LINK TO GOAL</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: spacing.md }}
                  contentContainerStyle={{ gap: spacing.sm, paddingRight: spacing.sm }}>
                  <TouchableOpacity style={[styles.goalChip, !form.linked_goal_id && styles.goalChipSel]}
                    onPress={() => setForm(f => ({ ...f, linked_goal_id: "" }))}>
                    <Text style={[styles.goalChipTxt, !form.linked_goal_id && { color: colors.accent }]}>None</Text>
                  </TouchableOpacity>
                  {goals.filter(g => g.status === "active").map(g => (
                    <TouchableOpacity key={g.id}
                      style={[styles.goalChip, form.linked_goal_id === g.id && styles.goalChipSel]}
                      onPress={() => setForm(f => ({ ...f, linked_goal_id: g.id }))}>
                      <Text style={[styles.goalChipTxt, form.linked_goal_id === g.id && { color: colors.accent }]} numberOfLines={1}>{g.title}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </>
            )}

            <View style={styles.sheetActions}>
              <Button label="CANCEL" variant="secondary" onPress={closeModal} />
              <Button label="CREATE" onPress={handleCreate} loading={isMutating} />
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

// ── Task row ──────────────────────────────────────────────────────────────────

type TaskRowProps = {
  task: Task;
  contextAccent: string;
  isExpanded: boolean;
  isLast: boolean;
  goalTitle?: string;
  onExpand: () => void;
  onComplete: () => void;
  onSchedule: () => void;
  onDelete: () => void;
  isDone?: boolean;
};

function TaskRow({ task, contextAccent, isExpanded, isLast, goalTitle, onExpand, onComplete, onSchedule, onDelete, isDone = false }: TaskRowProps) {
  const { colors } = useTheme();
  const styles     = useMemo(() => createStyles(colors), [colors]);
  const pColor     = priorityColor(task.priority, colors);
  const due        = formatDueCompact(task);

  // Completion animation
  const circleAnim = useRef(new Animated.Value(isDone ? 1 : 0)).current;
  const rowOpacity = useRef(new Animated.Value(1)).current;
  const rowGlow    = useRef(new Animated.Value(0)).current;

  function handleComplete() {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    Animated.sequence([
      Animated.spring(circleAnim, { toValue: 1, useNativeDriver: true, damping: 12, stiffness: 180 }),
      Animated.timing(rowGlow, { toValue: 1, duration: 160, useNativeDriver: true }),
      Animated.parallel([
        Animated.timing(rowOpacity, { toValue: 0, duration: 260, useNativeDriver: true }),
        Animated.timing(rowGlow, { toValue: 0, duration: 260, useNativeDriver: true }),
      ]),
    ]).start(() => onComplete());
  }

  const emptyOpacity  = circleAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });
  const filledOpacity = circleAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });
  const circleScale   = circleAnim.interpolate({ inputRange: [0, 0.6, 1], outputRange: [1, 1.25, 1] });
  const glowOpacity   = rowGlow.interpolate({ inputRange: [0, 1], outputRange: [0, 0.12] });

  const expandFade = useRef(new Animated.Value(isExpanded ? 1 : 0)).current;
  useEffect(() => {
    Animated.timing(expandFade, {
      toValue: isExpanded ? 1 : 0,
      duration: isExpanded ? 180 : 120,
      useNativeDriver: true,
    }).start();
  }, [isExpanded, expandFade]);

  const leftActions = () => (
    <View style={styles.swipeLeft}>
      <SwipeBtn label="Focus" icon="scope" color={colors.accent} onPress={() => Haptics.selectionAsync().catch(() => {})} />
      <SwipeBtn label="Schedule" icon="calendar.badge.plus" color="#3b82f6" onPress={onSchedule} />
    </View>
  );

  const rightActions = () => (
    <View style={styles.swipeRight}>
      <SwipeBtn label="Complete" icon="checkmark.circle.fill" color={colors.success} onPress={handleComplete} />
      <SwipeBtn label="Snooze" icon="clock.arrow.circlepath" color={colors.warning} onPress={() => Haptics.selectionAsync().catch(() => {})} />
      <SwipeBtn label="Delete" icon="trash.fill" color={colors.danger} onPress={onDelete} />
    </View>
  );

  return (
    <Swipeable renderLeftActions={leftActions} renderRightActions={rightActions} overshootLeft={false} overshootRight={false} friction={2}>
      <Animated.View style={{ opacity: rowOpacity }}>
        {/* Purple glow overlay on completion */}
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: colors.accent, opacity: glowOpacity, borderRadius: 0 }]} pointerEvents="none" />

        <TouchableOpacity
          style={[styles.taskRow, !isLast && styles.taskRowBorder, isDone && styles.taskRowDone]}
          onPress={onExpand}
          activeOpacity={0.82}
        >
          {/* Completion circle */}
          <TouchableOpacity
            style={styles.circleWrap}
            onPress={isDone ? undefined : handleComplete}
            activeOpacity={0.7}
            hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
          >
            <Animated.View style={{ transform: [{ scale: circleScale }] }}>
              <View style={{ width: 24, height: 24, alignItems: "center", justifyContent: "center" }}>
                <Animated.View style={[StyleSheet.absoluteFill, { alignItems: "center", justifyContent: "center", opacity: emptyOpacity }]}>
                  <SymbolView name="circle" size={22} tintColor={isDone ? colors.success : colors.border} resizeMode="scaleAspectFit" />
                </Animated.View>
                <Animated.View style={[StyleSheet.absoluteFill, { alignItems: "center", justifyContent: "center", opacity: filledOpacity }]}>
                  <SymbolView name="checkmark.circle.fill" size={22} tintColor={colors.success} resizeMode="scaleAspectFit" />
                </Animated.View>
              </View>
            </Animated.View>
          </TouchableOpacity>

          {/* Content */}
          <View style={styles.taskContent}>
            {/* Row 1: title + priority + duration */}
            <View style={styles.taskRow1}>
              <Text style={[styles.taskTitle, isDone && styles.taskTitleDone]} numberOfLines={isExpanded ? 0 : 2}>
                {displayTitle(task)}
              </Text>
              <View style={styles.taskMeta}>
                <View style={[styles.priBubble, { backgroundColor: pColor }]} />
                <Text style={styles.taskDur}>{estimateDuration(task)}</Text>
              </View>
            </View>

            {/* Row 2: context tag + due date */}
            {due || isHeliosTask(task) ? (
              <View style={styles.taskRow2}>
                {due && (
                  <Text style={[styles.taskDue, due.urgent && { color: colors.danger }]}>{due.label}</Text>
                )}
                {isHeliosTask(task) && (
                  <View style={styles.heliosChip}>
                    <SymbolView name="sparkles" size={9} tintColor={colors.accent} resizeMode="scaleAspectFit" />
                    <Text style={styles.heliosChipText}>HELIOS</Text>
                  </View>
                )}
              </View>
            ) : null}

            {/* Expanded content */}
            {isExpanded && (
              <Animated.View style={{ opacity: expandFade, marginTop: spacing.sm }}>
                <View style={styles.expandDivider} />

                {task.description ? (
                  <Text style={styles.expandDesc}>{task.description}</Text>
                ) : null}

                {goalTitle && (
                  <View style={styles.expandGoal}>
                    <SymbolView name="target" size={11} tintColor={colors.accent} resizeMode="scaleAspectFit" />
                    <Text style={styles.expandGoalText} numberOfLines={1}>{goalTitle}</Text>
                  </View>
                )}

                <View style={styles.expandActions}>
                  {!isDone && (
                    <TouchableOpacity style={[styles.expandBtn, { backgroundColor: colors.success }]}
                      onPress={handleComplete} activeOpacity={0.82}>
                      <SymbolView name="checkmark" size={12} tintColor="#fff" resizeMode="scaleAspectFit" />
                      <Text style={styles.expandBtnText}>Complete</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity style={styles.expandBtnDanger} onPress={onDelete} activeOpacity={0.82}>
                    <SymbolView name="trash" size={12} tintColor={colors.danger} resizeMode="scaleAspectFit" />
                  </TouchableOpacity>
                </View>
              </Animated.View>
            )}
          </View>
        </TouchableOpacity>
      </Animated.View>
    </Swipeable>
  );
}

function SwipeBtn({ label, icon, color, onPress }: { label: string; icon: SFSymbol; color: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={[swipeBtnStyles.btn, { backgroundColor: color }]} onPress={onPress} activeOpacity={0.84}>
      <SymbolView name={icon} size={15} tintColor="#fff" resizeMode="scaleAspectFit" />
      <Text style={swipeBtnStyles.label}>{label}</Text>
    </TouchableOpacity>
  );
}

const swipeBtnStyles = StyleSheet.create({
  btn:   { width: 72, alignItems: "center", justifyContent: "center", gap: 4 },
  label: { color: "#fff", fontSize: 10, fontWeight: "700" as const },
});

// ── Backend task engine suggestions ──────────────────────────────────────────

function priorityColorForSuggestion(priority: string, colors: ThemeColors): string {
  if (priority === "critical") return colors.danger;
  if (priority === "high")     return colors.warning;
  if (priority === "medium")   return colors.accent;
  return colors.textMuted;
}

function SuggestionsSection({
  error,
  isLoading,
  onAccept,
  onGenerate,
  onReject,
  onRejectAll,
  suggestions,
}: {
  error: string | null;
  isLoading: boolean;
  onAccept: (id: string) => void;
  onGenerate: () => void;
  onReject: (id: string) => void;
  onRejectAll: (ids: string[]) => void;
  suggestions: TaskSuggestion[];
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const [isExpanded, setIsExpanded] = useState(false);
  const [reviewVisible, setReviewVisible] = useState(false);
  const [sourceFilter, setSourceFilter] = useState<SuggestionSourceFilter>("all");

  const prepared = useMemo(() => prepareSuggestions(suggestions), [suggestions]);
  const topSuggestions = prepared.slice(0, 3);
  const visibleReviewSuggestions = useMemo(() => {
    if (sourceFilter === "all") return prepared;
    return prepared.filter((suggestion) => sourceFilterForSuggestion(suggestion) === sourceFilter);
  }, [prepared, sourceFilter]);
  const count = prepared.length;
  const summary = error
    ? "HELIOS Suggestions unavailable right now."
    : count > 0
      ? `HELIOS found ${count} suggestion${count === 1 ? "" : "s"} from ${sourceBreakdown(prepared)}.`
      : isLoading
        ? "Scanning Gmail, Calendar, and Goals."
        : "No suggestions right now. Your workspace is clear.";

  function handleAccept(id: string) {
    Haptics.selectionAsync().catch(() => {});
    onAccept(id);
  }

  function handleReject(id: string) {
    Haptics.selectionAsync().catch(() => {});
    onReject(id);
  }

  function handleDismissAll() {
    if (visibleReviewSuggestions.length === 0) return;
    Alert.alert("Dismiss Suggestions", `Dismiss ${visibleReviewSuggestions.length} suggestion${visibleReviewSuggestions.length === 1 ? "" : "s"}?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Dismiss",
        style: "destructive",
        onPress: () => onRejectAll(visibleReviewSuggestions.map((suggestion) => suggestion.id)),
      },
    ]);
  }

  return (
    <View style={styles.suggestSection}>
      <TouchableOpacity style={styles.suggestPanel} onPress={() => setIsExpanded(v => !v)} activeOpacity={0.84}>
        <View style={styles.suggestHeader}>
          <View style={styles.suggestHeaderLeft}>
            <SymbolView name="sparkles" size={12} tintColor={colors.accent} resizeMode="scaleAspectFit" />
            <Text style={styles.suggestHeaderText}>HELIOS SUGGESTS</Text>
          </View>
          <View style={styles.suggestHeaderRight}>
            <Text style={styles.suggestCount}>{isLoading && count === 0 ? "..." : count}</Text>
            <SymbolView name={isExpanded ? "chevron.down" : "chevron.right"} size={11} tintColor={colors.textMuted} resizeMode="scaleAspectFit" />
          </View>
        </View>

        <Text style={styles.suggestSummary}>{summary}</Text>

        <View style={styles.suggestPanelActions}>
          <TouchableOpacity
            style={styles.suggestReviewBtn}
            onPress={(event) => {
              event.stopPropagation();
              if (count > 0) setReviewVisible(true);
              else onGenerate();
            }}
            activeOpacity={0.78}
          >
            <Text style={styles.suggestReviewText}>{count > 0 ? "Review Suggestions" : "Refresh Suggestions"}</Text>
            <SymbolView name={count > 0 ? "chevron.right" : "arrow.clockwise"} size={10} tintColor={colors.accent} resizeMode="scaleAspectFit" />
          </TouchableOpacity>
          {count > 0 && (
            <TouchableOpacity
              onPress={(event) => {
                event.stopPropagation();
                onGenerate();
              }}
              activeOpacity={0.78}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={styles.suggestRefreshText}>Refresh</Text>
            </TouchableOpacity>
          )}
        </View>
      </TouchableOpacity>

      {isExpanded && count > 0 && (
        <View style={styles.suggestTopWrap}>
          <Text style={styles.suggestTopLabel}>TOP SUGGESTIONS</Text>
          {topSuggestions.map((suggestion, index) => (
            <SuggestionCard
              key={suggestion.id}
              index={index + 1}
              suggestion={suggestion}
              onAccept={() => handleAccept(suggestion.id)}
              onReject={() => handleReject(suggestion.id)}
            />
          ))}
          <TouchableOpacity style={styles.suggestViewAllBtn} onPress={() => setReviewVisible(true)} activeOpacity={0.82}>
            <Text style={styles.suggestViewAllText}>View All Suggestions</Text>
            <SymbolView name="arrow.up.right" size={10} tintColor={colors.accentCyan} resizeMode="scaleAspectFit" />
          </TouchableOpacity>
        </View>
      )}

      <Modal visible={reviewVisible} animationType="slide" transparent onRequestClose={() => setReviewVisible(false)}>
        <TouchableWithoutFeedback onPress={() => setReviewVisible(false)}><View style={styles.overlay} /></TouchableWithoutFeedback>
        <View style={styles.sheetWrapper}>
          <View style={[styles.sheet, styles.suggestReviewSheet, { paddingBottom: insets.bottom + spacing.md }]}>
            <View style={styles.sheetHandle} />
            <View style={styles.suggestReviewHeader}>
              <View>
                <Text style={styles.sheetTitle}>REVIEW SUGGESTIONS</Text>
                <Text style={styles.suggestReviewSub}>{visibleReviewSuggestions.length} visible • sorted by priority</Text>
              </View>
              <TouchableOpacity onPress={() => setReviewVisible(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <SymbolView name="xmark" size={14} tintColor={colors.textMuted} resizeMode="scaleAspectFit" />
              </TouchableOpacity>
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.suggestFilterRow}>
              {(["all", "gmail", "calendar", "goals", "assistant"] as SuggestionSourceFilter[]).map((source) => (
                <TouchableOpacity
                  key={source}
                  style={[styles.suggestFilterChip, sourceFilter === source && styles.suggestFilterChipActive]}
                  onPress={() => setSourceFilter(source)}
                  activeOpacity={0.78}
                >
                  <Text style={[styles.suggestFilterText, sourceFilter === source && { color: colors.accent }]}>
                    {source === "all" ? "All" : source[0].toUpperCase() + source.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <ScrollView style={styles.suggestReviewList} showsVerticalScrollIndicator={false}>
              {visibleReviewSuggestions.length === 0 ? (
                <Text style={styles.suggestLoadingText}>No suggestions match this filter.</Text>
              ) : (
                visibleReviewSuggestions.map((suggestion, index) => (
                  <SuggestionCard
                    key={suggestion.id}
                    index={index + 1}
                    suggestion={suggestion}
                    onAccept={() => handleAccept(suggestion.id)}
                    onReject={() => handleReject(suggestion.id)}
                  />
                ))
              )}
            </ScrollView>

            {visibleReviewSuggestions.length > 0 && (
              <TouchableOpacity style={styles.suggestDismissAllBtn} onPress={handleDismissAll} activeOpacity={0.78}>
                <Text style={styles.suggestDismissAllText}>Dismiss All</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

function SuggestionCard({
  index,
  onAccept,
  onReject,
  suggestion,
}: {
  index: number;
  onAccept: () => void;
  onReject: () => void;
  suggestion: TaskSuggestion;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.suggestCard}>
      <View style={styles.suggestCardTop}>
        <Text style={styles.suggestIndex}>{index}.</Text>
        <View style={[styles.suggestPriDot, { backgroundColor: priorityColorForSuggestion(suggestion.priority, colors) }]} />
        <Text style={styles.suggestTitle} numberOfLines={2}>{suggestion.title}</Text>
      </View>
      <Text style={styles.suggestReason} numberOfLines={1}>{suggestionReason(suggestion)}</Text>
      <View style={styles.suggestActions}>
        <TouchableOpacity style={styles.suggestAcceptBtn} onPress={onAccept} activeOpacity={0.82}>
          <SymbolView name="plus" size={11} tintColor="#fff" resizeMode="scaleAspectFit" />
          <Text style={styles.suggestAcceptText}>Add to Tasks</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.suggestDismissBtn} onPress={onReject} activeOpacity={0.78}>
          <Text style={styles.suggestDismissText}>Dismiss</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ── Inline AI suggestion ──────────────────────────────────────────────────────

function InlineAISuggestion({ task, onSchedule }: { task: Task; onSchedule: () => void }) {
  const { colors } = useTheme();
  const styles     = useMemo(() => createStyles(colors), [colors]);
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  return (
    <View style={styles.aiSuggestion}>
      <SymbolView name="sparkles" size={12} tintColor={colors.accent} resizeMode="scaleAspectFit" />
      <View style={styles.aiSuggestionBody}>
        <Text style={styles.aiSuggestionText} numberOfLines={1}>
          {displayTitle(task)} fits your next free {estimateDuration(task)} block.
        </Text>
      </View>
      <TouchableOpacity style={styles.aiScheduleBtn} onPress={onSchedule} activeOpacity={0.78}>
        <Text style={styles.aiScheduleBtnText}>Schedule</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={() => setDismissed(true)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <SymbolView name="xmark" size={10} tintColor={colors.textMuted} resizeMode="scaleAspectFit" />
      </TouchableOpacity>
    </View>
  );
}

// ── Empty workspace ───────────────────────────────────────────────────────────

function EmptyWorkspace({ query, filter, onNewTask }: { query: string; filter: FilterKey; onNewTask: () => void }) {
  const { colors } = useTheme();
  const styles     = useMemo(() => createStyles(colors), [colors]);
  const isFiltered = query.trim().length > 0 || filter !== "all";

  return (
    <View style={styles.emptyWrap}>
      <View style={styles.emptyIcon}>
        <SymbolView name={isFiltered ? "magnifyingglass" : "checkmark.seal.fill"} size={26} tintColor={colors.accentCyan} resizeMode="scaleAspectFit" />
      </View>
      <Text style={styles.emptyTitle}>{isFiltered ? "No matching tasks." : "Workspace is clear."}</Text>
      <Text style={styles.emptyText}>{isFiltered ? "Try adjusting your search or filter." : "Add a task to start building momentum."}</Text>
      {!isFiltered && (
        <TouchableOpacity style={styles.emptyBtn} onPress={onNewTask} activeOpacity={0.82}>
          <Text style={styles.emptyBtnText}>New Task</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// ── Sort sheet ────────────────────────────────────────────────────────────────

function SortSheet({ visible, selected, onSelect, onClose }: { visible: boolean; selected: SortMode; onSelect: (m: SortMode) => void; onClose: () => void }) {
  const { colors } = useTheme();
  const styles     = useMemo(() => createStyles(colors), [colors]);
  const insets     = useSafeAreaInsets();
  const SORTS: SortMode[] = ["Priority", "Due Date", "Newest"];

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}><View style={styles.overlay} /></TouchableWithoutFeedback>
      <View style={styles.sheetWrapper}>
        <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.md }]}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>SORT BY</Text>
          {SORTS.map(mode => (
            <TouchableOpacity key={mode} style={styles.sheetOption} onPress={() => onSelect(mode)} activeOpacity={0.78}>
              <Text style={[styles.sheetOptionText, selected === mode && { color: colors.accentCyan }]}>{mode}</Text>
              {selected === mode ? <SymbolView name="checkmark" size={13} tintColor={colors.accentCyan} resizeMode="scaleAspectFit" /> : null}
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </Modal>
  );
}

// ── Filter sheet ──────────────────────────────────────────────────────────────

function FilterSheet({ visible, selected, onSelect, onClose }: { visible: boolean; selected: FilterKey; onSelect: (f: FilterKey) => void; onClose: () => void }) {
  const { colors } = useTheme();
  const styles     = useMemo(() => createStyles(colors), [colors]);
  const insets     = useSafeAreaInsets();

  const OPTIONS: { id: FilterKey; label: string; icon: SFSymbol }[] = [
    { id: "all",     label: "All Tasks",         icon: "square.grid.2x2" },
    { id: "today",   label: "Due Today",         icon: "sun.max.fill" },
    { id: "overdue", label: "Overdue",           icon: "exclamationmark.triangle.fill" },
    { id: "high",    label: "High Priority",     icon: "exclamationmark.circle.fill" },
    { id: "helios",  label: "HELIOS Suggested",  icon: "sparkles" },
  ];

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}><View style={styles.overlay} /></TouchableWithoutFeedback>
      <View style={styles.sheetWrapper}>
        <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.md }]}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>FILTER</Text>
          {OPTIONS.map(opt => (
            <TouchableOpacity key={opt.id} style={styles.sheetOption} onPress={() => onSelect(opt.id)} activeOpacity={0.78}>
              <View style={styles.sheetOptionLeft}>
                <SymbolView name={opt.icon} size={14} tintColor={selected === opt.id ? colors.accentCyan : colors.textMuted} resizeMode="scaleAspectFit" />
                <Text style={[styles.sheetOptionText, selected === opt.id && { color: colors.accentCyan }]}>{opt.label}</Text>
              </View>
              {selected === opt.id ? <SymbolView name="checkmark" size={13} tintColor={colors.accentCyan} resizeMode="scaleAspectFit" /> : null}
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </Modal>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { paddingHorizontal: spacing.md },

    // ── Workspace header ──────────────────────────────────────────────────────
    wsHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: spacing.md,
    },
    wsLabel: { ...typography.label, color: colors.accent },
    wsTitle: {
      fontSize: 22,
      fontWeight: "800" as const,
      color: colors.textPrimary,
      marginTop: 2,
      letterSpacing: -0.3,
    },
    focusBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      backgroundColor: `${colors.accent}18`,
      borderWidth: 1,
      borderColor: `${colors.accent}40`,
      borderRadius: 10,
      paddingHorizontal: 8,
      paddingVertical: 4,
    },
    focusBadgeDot: { width: 6, height: 6, borderRadius: 3 },
    focusBadgeText: { fontSize: 11, fontWeight: "700" as const, color: colors.accent },

    // ── Search ────────────────────────────────────────────────────────────────
    searchRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      marginBottom: spacing.sm,
      minHeight: 42,
    },
    searchInput: {
      flex: 1,
      color: colors.textPrimary,
      fontSize: 14,
      paddingVertical: 0,
    },

    // ── Toolbar ───────────────────────────────────────────────────────────────
    toolbar: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      marginBottom: spacing.lg,
    },
    toolbarPrimary: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      backgroundColor: colors.accent,
      borderRadius: radius.sm,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      minHeight: 34,
    },
    toolbarPrimaryText: { fontSize: 13, fontWeight: "700" as const, color: "#fff" },
    toolbarRight: { flexDirection: "row", gap: spacing.xs, marginLeft: "auto" },
    toolBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.sm,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs,
      minHeight: 34,
    },
    toolBtnActive: { borderColor: `${colors.accent}60`, backgroundColor: `${colors.accent}10` },
    toolBtnFocus:  { borderColor: `${colors.accent}60`, backgroundColor: `${colors.accent}10` },
    toolBtnText: { fontSize: 11, fontWeight: "700" as const, color: colors.textMuted },
    errorText: { ...typography.caption, color: colors.danger, marginBottom: spacing.sm },

    // ── Context section ───────────────────────────────────────────────────────
    contextSection: { marginBottom: spacing.xl },
    contextHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: spacing.sm,
    },
    contextHeaderLeft: { flexDirection: "row", alignItems: "center", gap: 7 },
    contextDot: { width: 6, height: 6, borderRadius: 3 },
    contextLabel: { ...typography.label, fontSize: 10 },
    contextCount: { ...typography.label, color: colors.textMuted, fontSize: 10 },
    contextRows: {
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: "hidden",
    },

    // ── Task row ──────────────────────────────────────────────────────────────
    taskRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      paddingHorizontal: spacing.md,
      paddingVertical: 12,
      gap: spacing.sm,
      backgroundColor: colors.surface,
    },
    taskRowBorder: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.borderDark,
    },
    taskRowDone: { opacity: 0.55 },
    circleWrap: {
      width: 30,
      height: 30,
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
      marginTop: 1,
    },
    taskContent: { flex: 1, minWidth: 0, gap: 4 },
    taskRow1: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
    taskTitle: {
      flex: 1,
      fontSize: 15,
      fontWeight: "600" as const,
      color: colors.textPrimary,
      lineHeight: 21,
    },
    taskTitleDone: { color: colors.textMuted, textDecorationLine: "line-through" },
    taskMeta: { flexDirection: "row", alignItems: "center", gap: 5, flexShrink: 0 },
    priBubble: { width: 7, height: 7, borderRadius: 4 },
    taskDur: { fontSize: 11, fontWeight: "500" as const, color: colors.textMuted },
    taskRow2: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
    taskDue: { fontSize: 11, fontWeight: "500" as const, color: colors.textMuted },
    heliosChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 3,
      backgroundColor: `${colors.accent}14`,
      borderRadius: 5,
      paddingHorizontal: 5,
      paddingVertical: 2,
    },
    heliosChipText: { fontSize: 9, fontWeight: "700" as const, color: colors.accent },

    // ── Expand ────────────────────────────────────────────────────────────────
    expandDivider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.borderDark,
      marginBottom: spacing.sm,
    },
    expandDesc: {
      ...typography.body,
      color: colors.textSecondary,
      fontSize: 13,
      lineHeight: 19,
      marginBottom: spacing.sm,
    },
    expandGoal: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      marginBottom: spacing.sm,
    },
    expandGoalText: {
      fontSize: 12,
      fontWeight: "600" as const,
      color: colors.accent,
      flex: 1,
    },
    expandActions: {
      flexDirection: "row",
      gap: spacing.sm,
      alignItems: "center",
    },
    expandBtn: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 5,
      borderRadius: radius.sm,
      paddingVertical: 7,
    },
    expandBtnText: { fontSize: 12, fontWeight: "700" as const, color: "#fff" },
    expandBtnDanger: {
      width: 34,
      height: 34,
      borderRadius: radius.sm,
      borderWidth: 1,
      borderColor: `${colors.danger}40`,
      alignItems: "center",
      justifyContent: "center",
    },

    // ── Swipe ─────────────────────────────────────────────────────────────────
    swipeLeft: {
      flexDirection: "row",
      overflow: "hidden",
      borderTopLeftRadius: radius.md,
      borderBottomLeftRadius: radius.md,
    },
    swipeRight: {
      flexDirection: "row",
      justifyContent: "flex-end",
      overflow: "hidden",
      borderTopRightRadius: radius.md,
      borderBottomRightRadius: radius.md,
    },

    // ── Backend suggestions section ───────────────────────────────────────────
    suggestSection: { marginBottom: spacing.lg },
    suggestPanel: {
      backgroundColor: `${colors.accent}08`,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: `${colors.accent}24`,
      padding: spacing.md,
    },
    suggestHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 6,
    },
    suggestHeaderLeft: { flexDirection: "row", alignItems: "center", gap: 6 },
    suggestHeaderRight: { flexDirection: "row", alignItems: "center", gap: 8 },
    suggestHeaderText: { ...typography.label, fontSize: 10, color: colors.accent },
    suggestCount: { ...typography.label, color: colors.textPrimary, fontSize: 11 },
    suggestSummary: { fontSize: 13, color: colors.textSecondary, lineHeight: 18 },
    suggestPanelActions: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: spacing.md,
      marginTop: spacing.sm,
    },
    suggestReviewBtn: { flexDirection: "row", alignItems: "center", gap: 5 },
    suggestReviewText: { fontSize: 12, fontWeight: "700" as const, color: colors.accent },
    suggestRefreshText: { fontSize: 11, fontWeight: "600" as const, color: colors.textMuted },
    suggestTopWrap: {
      marginTop: spacing.sm,
      gap: spacing.sm,
    },
    suggestTopLabel: { ...typography.label, color: colors.textMuted, fontSize: 10 },
    suggestCard: {
      backgroundColor: `${colors.accent}08`,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: `${colors.accent}20`,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
    suggestCardTop: { flexDirection: "row", alignItems: "flex-start", gap: 7, marginBottom: 4 },
    suggestIndex: { fontSize: 12, fontWeight: "700" as const, color: colors.textMuted, lineHeight: 18 },
    suggestPriDot: { width: 7, height: 7, borderRadius: 4, marginTop: 5, flexShrink: 0 },
    suggestTitle: { flex: 1, fontSize: 13, fontWeight: "600" as const, color: colors.textPrimary, lineHeight: 18 },
    suggestReason: { fontSize: 11, color: colors.textMuted, lineHeight: 15 },
    suggestLoadingText: { fontSize: 13, color: colors.textMuted, textAlign: "center", paddingVertical: spacing.sm },
    suggestActions: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.sm },
    suggestAcceptBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      backgroundColor: colors.accent,
      borderRadius: 7,
      paddingHorizontal: spacing.sm,
      paddingVertical: 6,
    },
    suggestAcceptText: { fontSize: 11, fontWeight: "700" as const, color: "#fff" },
    suggestDismissBtn: {
      paddingHorizontal: spacing.sm,
      paddingVertical: 6,
    },
    suggestDismissText: { fontSize: 11, fontWeight: "600" as const, color: colors.textMuted },
    suggestViewAllBtn: {
      minHeight: 36,
      borderRadius: radius.sm,
      borderWidth: 1,
      borderColor: `${colors.accentCyan}28`,
      backgroundColor: `${colors.accentCyan}08`,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
    },
    suggestViewAllText: { fontSize: 12, fontWeight: "700" as const, color: colors.accentCyan },
    suggestReviewSheet: { maxHeight: 640 },
    suggestReviewHeader: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
      marginBottom: spacing.md,
    },
    suggestReviewSub: { fontSize: 12, color: colors.textMuted, marginTop: -spacing.sm },
    suggestFilterRow: { gap: spacing.sm, paddingBottom: spacing.md },
    suggestFilterChip: {
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceDark,
      borderRadius: radius.sm,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
    suggestFilterChipActive: {
      borderColor: `${colors.accent}60`,
      backgroundColor: `${colors.accent}12`,
    },
    suggestFilterText: { fontSize: 12, fontWeight: "700" as const, color: colors.textMuted },
    suggestReviewList: { maxHeight: 420 },
    suggestDismissAllBtn: {
      alignSelf: "center",
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      marginTop: spacing.sm,
    },
    suggestDismissAllText: { fontSize: 12, fontWeight: "700" as const, color: colors.danger },

    // ── Inline AI suggestion ──────────────────────────────────────────────────
    aiSuggestion: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      backgroundColor: `${colors.accent}0c`,
      borderRadius: radius.sm,
      borderWidth: 1,
      borderColor: `${colors.accent}28`,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      marginTop: spacing.sm,
    },
    aiSuggestionBody: { flex: 1 },
    aiSuggestionText: { fontSize: 12, fontWeight: "500" as const, color: colors.textSecondary },
    aiScheduleBtn: {
      backgroundColor: `${colors.accent}22`,
      borderRadius: 6,
      paddingHorizontal: 8,
      paddingVertical: 4,
    },
    aiScheduleBtnText: { fontSize: 11, fontWeight: "700" as const, color: colors.accent },

    // ── Completed footer ──────────────────────────────────────────────────────
    completedFooter: { marginTop: spacing.sm },
    completedToggle: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingVertical: spacing.sm,
    },
    completedToggleText: { ...typography.label, color: colors.textMuted },

    // ── Empty ─────────────────────────────────────────────────────────────────
    emptyWrap: {
      alignItems: "center",
      gap: spacing.md,
      paddingVertical: spacing.xxl,
    },
    emptyIcon: {
      width: 52,
      height: 52,
      borderRadius: 16,
      backgroundColor: `${colors.accentCyan}14`,
      borderWidth: 1,
      borderColor: `${colors.accentCyan}30`,
      alignItems: "center",
      justifyContent: "center",
    },
    emptyTitle: { ...typography.title, color: colors.textPrimary, textAlign: "center" },
    emptyText:  { ...typography.body, color: colors.textMuted, textAlign: "center" },
    emptyBtn: {
      backgroundColor: colors.accent,
      borderRadius: radius.sm,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm,
    },
    emptyBtnText: { fontSize: 13, fontWeight: "700" as const, color: "#fff" },

    // ── Floating focus button ─────────────────────────────────────────────────
    focusFloatBtn: {
      position: "absolute",
      right: 16,
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      backgroundColor: colors.accent,
      borderRadius: 20,
      paddingHorizontal: spacing.md,
      paddingVertical: 10,
      shadowColor: colors.accent,
      shadowOpacity: 0.55,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 6 },
      elevation: 12,
    },
    focusFloatBtnActive: {
      backgroundColor: `${colors.accent}bb`,
    },
    focusFloatLabel: { fontSize: 13, fontWeight: "700" as const, color: "#fff" },
    focusFloatSub:   { fontSize: 10, fontWeight: "500" as const, color: "rgba(255,255,255,0.7)" },

    // ── Modals ────────────────────────────────────────────────────────────────
    overlay:      { flex: 1, backgroundColor: colors.overlay },
    sheetWrapper: { ...StyleSheet.absoluteFillObject, justifyContent: "flex-end" },
    sheet: {
      backgroundColor: colors.glassStrong,
      borderTopLeftRadius:  radius.xl,
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
      width: 40, height: 4, borderRadius: 2,
      backgroundColor: colors.secondaryBorder,
      alignSelf: "center",
      marginBottom: spacing.lg,
    },
    sheetTitle: { ...typography.label, color: colors.accent, marginBottom: spacing.lg + 2 },
    sheetOption: {
      minHeight: 46,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.borderDark,
    },
    sheetOptionLeft: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
    sheetOptionText: { ...typography.body, color: colors.textSecondary, fontWeight: "600" as const },

    // ── Create form ───────────────────────────────────────────────────────────
    fieldLabel: { ...typography.label, color: colors.textMuted, marginBottom: spacing.sm, marginTop: spacing.md },
    priorityRow: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.md },
    priorityBtn: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 5,
      paddingVertical: spacing.sm,
      borderRadius: radius.sm,
      borderWidth: 1,
      borderColor: colors.border,
    },
    priorityBtnDot: { width: 6, height: 6, borderRadius: 3 },
    priorityBtnText: { fontSize: 10, fontWeight: "700" as const },
    goalChip: {
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: radius.sm,
      borderWidth: 1,
      borderColor: colors.secondaryBorder,
      backgroundColor: colors.glassSubtle,
      maxWidth: 180,
    },
    goalChipSel: { borderColor: colors.accent, backgroundColor: `${colors.accent}1a` },
    goalChipTxt: { ...typography.caption, color: colors.textMuted },
    sheetActions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md },
  });
}
