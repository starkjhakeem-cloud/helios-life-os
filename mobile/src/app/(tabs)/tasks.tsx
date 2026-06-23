import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
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
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SymbolView } from "expo-symbols";
import type { SFSymbol } from "sf-symbols-typescript";
import * as Haptics from "expo-haptics";

import TaskCard, { type TaskDisplayMeta } from "../../components/TaskCard";
import Input from "../../components/ui/Input";
import Button from "../../components/ui/Button";
import { spacing, radius, typography, type ThemeColors } from "../../theme/theme";
import { useTheme } from "../../theme/ThemeContext";
import { useTasksStore, useGoalsStore, useAuthStore } from "../../store";
import type { Task } from "../../services/tasksService";

const PRIORITIES = ["low", "medium", "high", "critical"] as const;
const FILTERS = ["All", "Today", "Upcoming", "AI Suggested", "High Priority", "Completed", "Pinned"] as const;
const SORTS = ["Priority", "Due Date", "Updated"] as const;

type Priority = (typeof PRIORITIES)[number];
type Filter = (typeof FILTERS)[number];
type SortMode = (typeof SORTS)[number];

type FormState = {
  title: string;
  description: string;
  priority: Priority;
  due_date: string;
  linked_goal_id: string;
};

type GroupedTasks = {
  title: string;
  icon: SFSymbol;
  tasks: Task[];
};

const EMPTY_FORM: FormState = {
  title: "",
  description: "",
  priority: "medium",
  due_date: "",
  linked_goal_id: "",
};

function parseDate(value: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function isHeliosTask(task: Task): boolean {
  const text = `${task.title} ${task.description ?? ""}`.toLowerCase();
  return Boolean(
    task.linked_goal_id === null &&
      (text.includes("helios") ||
        text.includes("memory") ||
        text.includes("review") ||
        text.includes("brief") ||
        text.includes("optimiz")),
  );
}

function priorityRank(priority: string): number {
  switch (priority) {
    case "critical": return 4;
    case "high": return 3;
    case "medium": return 2;
    default: return 1;
  }
}

function estimateDuration(task: Task): string {
  if (task.priority === "critical") return "45 min";
  if (task.priority === "high") return "30 min";
  if (isHeliosTask(task)) return "15 min";
  return "20 min";
}

function inferCategory(task: Task): string {
  const text = `${task.title} ${task.description ?? ""}`.toLowerCase();
  if (task.linked_goal_id) return "Goal";
  if (text.includes("memory") || text.includes("preference")) return "Knowledge";
  if (text.includes("brief") || text.includes("review")) return "Planning";
  if (text.includes("inbox") || text.includes("email")) return "Inbox";
  if (text.includes("calendar") || text.includes("schedule")) return "Calendar";
  return "Execution";
}

function formatDueLabel(task: Task): string {
  const due = parseDate(task.due_date);
  if (!due) return "No due date";
  const today = new Date();
  const tomorrow = new Date();
  tomorrow.setDate(today.getDate() + 1);
  if (isSameDay(due, today)) return "Due Today";
  if (isSameDay(due, tomorrow)) return "Due Tomorrow";
  return due.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function taskMeta(task: Task, pinned: Set<string>, archived: Set<string>): TaskDisplayMeta {
  const progress = task.status === "done" ? 100 : task.status === "in_progress" ? 50 : 0;
  const origin = isHeliosTask(task) ? "HELIOS" : "User";
  return {
    statusLabel: progress === 100 ? "Complete" : progress > 0 ? `${progress}%` : "Not Started",
    progress,
    priorityLabel: `${task.priority[0]?.toUpperCase() ?? ""}${task.priority.slice(1)} Priority`,
    dueLabel: formatDueLabel(task),
    durationLabel: estimateDuration(task),
    category: inferCategory(task),
    origin,
    originLabel: origin === "HELIOS" ? "Suggested by HELIOS" : "User",
    recommendation: origin === "HELIOS"
      ? task.description || "HELIOS recommends refreshing stored preferences."
      : undefined,
    isPinned: pinned.has(task.id),
    isArchived: archived.has(task.id),
  };
}

function displayTitle(task: Task): string {
  if (isHeliosTask(task) && task.title.toLowerCase().includes("memory")) return "Memory Optimization";
  return task.title;
}

export default function TasksScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const PRIORITY_COLOR: Record<Priority, string> = {
    critical: colors.danger,
    high: "#f97316",
    medium: colors.warning,
    low: colors.textMuted,
  };
  const insets = useSafeAreaInsets();
  const accessToken = useAuthStore((s) => s.accessToken);
  const { tasks, isLoading, isMutating, error, fetchTasks, createTask, updateTask, deleteTask } = useTasksStore();
  const { goals } = useGoalsStore();

  const entrance = useRef(new Animated.Value(0)).current;
  const [modalVisible, setModalVisible] = useState(false);
  const [detailTask, setDetailTask] = useState<Task | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("All");
  const [sortMode, setSortMode] = useState<SortMode>("Priority");
  const [archived, setArchived] = useState<Set<string>>(new Set());
  const [pinned, setPinned] = useState<Set<string>>(new Set());
  const [snoozed, setSnoozed] = useState<Set<string>>(new Set());

  const onRefresh = useCallback(() => {
    if (accessToken) fetchTasks(accessToken);
  }, [accessToken, fetchTasks]);

  useEffect(() => {
    if (accessToken) fetchTasks(accessToken);
  }, [accessToken, fetchTasks]);

  useEffect(() => {
    Animated.timing(entrance, {
      toValue: 1,
      duration: 320,
      useNativeDriver: true,
    }).start();
  }, [entrance]);

  function openModal() {
    setForm(EMPTY_FORM);
    setFormError(null);
    setModalVisible(true);
  }

  function closeModal() {
    Keyboard.dismiss();
    setModalVisible(false);
  }

  async function handleCreate() {
    if (!accessToken) return;
    if (!form.title.trim()) {
      setFormError("Task title is required.");
      return;
    }
    setFormError(null);
    await createTask(accessToken, {
      title: form.title.trim(),
      description: form.description.trim() || undefined,
      priority: form.priority,
      due_date: form.due_date.trim() || undefined,
      linked_goal_id: form.linked_goal_id || undefined,
    });
    closeModal();
  }

  function handleStatusChange(taskId: string, nextStatus: string) {
    if (!accessToken) return;
    updateTask(accessToken, taskId, { status: nextStatus });
  }

  function handleDelete(taskId: string) {
    if (!accessToken) return;
    deleteTask(accessToken, taskId);
  }

  const open = tasks.filter((t) => t.status !== "done" && !archived.has(t.id));
  const done = tasks.filter((t) => t.status === "done");

  const filteredTasks = useMemo(() => {
    const today = new Date();
    const base = tasks.filter((task) => {
      const meta = taskMeta(task, pinned, archived);
      const text = `${displayTitle(task)} ${task.description ?? ""} ${meta.category} ${meta.originLabel}`.toLowerCase();
      const due = parseDate(task.due_date);
      const matchesQuery = query.trim().length === 0 || text.includes(query.trim().toLowerCase());

      if (!matchesQuery) return false;
      if (filter !== "Completed" && archived.has(task.id)) return false;
      if (filter === "All") return task.status !== "done";
      if (filter === "Today") return task.status !== "done" && due !== null && isSameDay(due, today);
      if (filter === "Upcoming") return task.status !== "done" && (due === null || due > today);
      if (filter === "AI Suggested") return task.status !== "done" && isHeliosTask(task);
      if (filter === "High Priority") return task.status !== "done" && (task.priority === "critical" || task.priority === "high");
      if (filter === "Completed") return task.status === "done";
      if (filter === "Pinned") return pinned.has(task.id);
      return true;
    });

    return [...base].sort((a, b) => {
      if (pinned.has(a.id) !== pinned.has(b.id)) return pinned.has(a.id) ? -1 : 1;
      if (sortMode === "Priority") return priorityRank(b.priority) - priorityRank(a.priority);
      if (sortMode === "Due Date") {
        const aDate = parseDate(a.due_date)?.getTime() ?? Number.MAX_SAFE_INTEGER;
        const bDate = parseDate(b.due_date)?.getTime() ?? Number.MAX_SAFE_INTEGER;
        return aDate - bDate;
      }
      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
    });
  }, [archived, filter, pinned, query, sortMode, tasks]);

  const groupedTasks = useMemo<GroupedTasks[]>(() => {
    const today = new Date();
    const todayTasks: Task[] = [];
    const upcomingTasks: Task[] = [];
    const suggestedTasks: Task[] = [];
    const completedTasks: Task[] = [];

    filteredTasks.forEach((task) => {
      const due = parseDate(task.due_date);
      if (task.status === "done") {
        completedTasks.push(task);
      } else if (isHeliosTask(task)) {
        suggestedTasks.push(task);
      } else if (due && isSameDay(due, today)) {
        todayTasks.push(task);
      } else {
        upcomingTasks.push(task);
      }
    });

    return [
      { title: "Today", icon: "sun.max.fill" as SFSymbol, tasks: todayTasks },
      { title: "Upcoming", icon: "calendar" as SFSymbol, tasks: upcomingTasks },
      { title: "HELIOS Suggested", icon: "sparkles" as SFSymbol, tasks: suggestedTasks },
      { title: "Completed", icon: "checkmark.seal.fill" as SFSymbol, tasks: completedTasks },
    ].filter((group) => group.tasks.length > 0);
  }, [filteredTasks]);

  function handleArchive(taskId: string) {
    setArchived((current) => new Set(current).add(taskId));
  }

  function handleSnooze(taskId: string) {
    setSnoozed((current) => new Set(current).add(taskId));
  }

  function handlePin(taskId: string) {
    setPinned((current) => {
      const next = new Set(current);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  }

  function handleSuggest() {
    setFilter("AI Suggested");
    Haptics.selectionAsync().catch(() => {});
  }

  function handleSort() {
    const next = SORTS[(SORTS.indexOf(sortMode) + 1) % SORTS.length];
    setSortMode(next);
  }

  function handleTaskDelete(task: Task) {
    Alert.alert("Delete Task", `Delete "${displayTitle(task)}"?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => handleDelete(task.id) },
    ]);
  }

  function connectedGoal(task: Task) {
    return task.linked_goal_id ? goals.find((goal) => goal.id === task.linked_goal_id) : undefined;
  }

  return (
    <>
      <ScrollView
        style={{ backgroundColor: colors.background }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.container, { paddingTop: insets.top + spacing.md }]}
        stickyHeaderIndices={[1]}
        refreshControl={
          <RefreshControl refreshing={isLoading} onRefresh={onRefresh} tintColor={colors.accentCyan} />
        }
      >
        <Animated.View
          style={{
            opacity: entrance,
            transform: [{ translateY: entrance.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }],
          }}
        >
          <View style={styles.heroCard}>
            <View style={styles.heroGlow} />
            <View style={styles.heroTop}>
              <View>
                <Text style={styles.heroLabel}>TASK CENTER</Text>
                <Text style={styles.heroTitle}>Task Center</Text>
              </View>
              <TouchableOpacity style={styles.heroButton} onPress={openModal} activeOpacity={0.82}>
                <SymbolView name="plus" size={14} tintColor="#ffffff" resizeMode="scaleAspectFit" />
                <Text style={styles.heroButtonText}>New Task</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.heroCount}>{open.length} Open • {done.length} Completed</Text>
            <Text style={styles.heroSubtitle}>Your active work, organized by priority.</Text>
          </View>
        </Animated.View>

        <View style={styles.commandDock}>
          <View style={styles.commandRow}>
            <CommandButton label="New Task" icon="plus" active onPress={openModal} />
            <CommandButton label="AI Suggest" icon="sparkles" onPress={handleSuggest} />
            <CommandButton label="Filter" icon="line.3.horizontal.decrease.circle" onPress={() => setFilter(filter === "All" ? "Today" : "All")} />
            <CommandButton label={sortMode} icon="arrow.up.arrow.down" onPress={handleSort} />
          </View>
          <View style={styles.searchBar}>
            <SymbolView name="magnifyingglass" size={15} tintColor={colors.textMuted} resizeMode="scaleAspectFit" />
            <TextInput
              style={styles.searchInput}
              value={query}
              onChangeText={setQuery}
              placeholder="Search tasks"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              clearButtonMode="while-editing"
            />
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterContent}>
            {FILTERS.map((option) => (
              <TouchableOpacity
                key={option}
                style={[styles.filterChip, filter === option && styles.filterChipActive]}
                onPress={() => setFilter(option)}
                activeOpacity={0.75}
              >
                <Text style={[styles.filterChipText, filter === option && styles.filterChipTextActive]}>{option}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        <Animated.View
          style={{
            opacity: entrance,
            transform: [{ translateY: entrance.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }],
          }}
        >
          <View style={styles.listHeader}>
            <View>
              <Text style={styles.sectionLabel}>TASK CENTER</Text>
              <Text style={styles.listTitle}>{filteredTasks.length} visible tasks</Text>
            </View>
            {(isLoading || isMutating) ? <ActivityIndicator size="small" color={colors.accentCyan} /> : null}
          </View>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          {filteredTasks.length === 0 && !isLoading ? (
            <View style={styles.emptyState}>
              <View style={styles.emptyIcon}>
                <SymbolView name="checkmark.seal.fill" size={30} tintColor={colors.accentCyan} resizeMode="scaleAspectFit" />
              </View>
              <Text style={styles.emptyTitle}>{"You're all caught up."}</Text>
              <Text style={styles.emptyText}>{"HELIOS hasn't identified any outstanding work."}</Text>
              <View style={styles.emptyActions}>
                <TouchableOpacity style={styles.primaryEmptyButton} onPress={openModal} activeOpacity={0.82}>
                  <Text style={styles.primaryEmptyText}>New Task</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.secondaryEmptyButton} onPress={handleSuggest} activeOpacity={0.82}>
                  <Text style={styles.secondaryEmptyText}>Ask HELIOS</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : null}

          {groupedTasks.map((group) => (
            <View key={group.title} style={styles.taskSection}>
              <View style={styles.taskSectionHeader}>
                <View style={styles.taskSectionTitleWrap}>
                  <SymbolView name={group.icon} size={14} tintColor={group.title === "HELIOS Suggested" ? colors.accent : colors.accentCyan} resizeMode="scaleAspectFit" />
                  <Text style={styles.taskSectionTitle}>{group.title}</Text>
                </View>
                <Text style={styles.taskSectionCount}>{group.tasks.length}</Text>
              </View>
              {group.tasks.map((task) => {
                const meta = taskMeta(task, pinned, archived);
                const presentationTask = { ...task, title: displayTitle(task) };
                return (
                  <TaskCard
                    key={task.id}
                    task={presentationTask}
                    meta={meta}
                    onOpen={() => setDetailTask(task)}
                    onComplete={() => handleStatusChange(task.id, "done")}
                    onArchive={() => handleArchive(task.id)}
                    onDelete={() => handleTaskDelete(task)}
                    onSnooze={() => handleSnooze(task.id)}
                    onPin={() => handlePin(task.id)}
                  />
                );
              })}
            </View>
          ))}

          <View style={{ height: spacing.xxl }} />
        </Animated.View>
      </ScrollView>

      <TaskDetailSheet
        task={detailTask}
        goalTitle={detailTask ? connectedGoal(detailTask)?.title : undefined}
        meta={detailTask ? taskMeta(detailTask, pinned, archived) : undefined}
        snoozed={detailTask ? snoozed.has(detailTask.id) : false}
        onClose={() => setDetailTask(null)}
        onComplete={(task) => handleStatusChange(task.id, "done")}
        onDelete={(task) => handleTaskDelete(task)}
      />

      <Modal visible={modalVisible} animationType="slide" transparent onRequestClose={closeModal}>
        <TouchableWithoutFeedback onPress={closeModal}>
          <View style={styles.overlay} />
        </TouchableWithoutFeedback>

        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.modalWrapper}>
          <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>NEW TASK</Text>

            <Input
              label="TASK TITLE"
              placeholder="e.g. Write unit tests for auth"
              value={form.title}
              onChangeText={(t) => setForm((f) => ({ ...f, title: t }))}
              error={formError ?? undefined}
              autoFocus
            />

            <Input
              label="DESCRIPTION"
              placeholder="Optional context or acceptance criteria"
              value={form.description}
              onChangeText={(t) => setForm((f) => ({ ...f, description: t }))}
              multiline
              style={styles.multiline}
            />

            <Text style={styles.fieldLabel}>PRIORITY</Text>
            <View style={styles.priorityRow}>
              {PRIORITIES.map((p) => (
                <TouchableOpacity
                  key={p}
                  style={[
                    styles.priorityChip,
                    form.priority === p && {
                      backgroundColor: PRIORITY_COLOR[p],
                      borderColor: PRIORITY_COLOR[p],
                    },
                  ]}
                  onPress={() => setForm((f) => ({ ...f, priority: p }))}
                >
                  <Text style={[styles.priorityChipText, form.priority === p && styles.priorityChipTextActive]}>
                    {p.toUpperCase()}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Input
              label="DUE DATE"
              placeholder="e.g. 2026-12-31"
              value={form.due_date}
              onChangeText={(t) => setForm((f) => ({ ...f, due_date: t }))}
            />

            {goals.length > 0 ? (
              <>
                <Text style={styles.fieldLabel}>LINK TO GOAL</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.goalScroll} contentContainerStyle={styles.goalScrollContent}>
                  <TouchableOpacity style={[styles.goalChip, !form.linked_goal_id && styles.goalChipActive]} onPress={() => setForm((f) => ({ ...f, linked_goal_id: "" }))}>
                    <Text style={[styles.goalChipText, !form.linked_goal_id && styles.goalChipTextActive]}>None</Text>
                  </TouchableOpacity>
                  {goals.filter((g) => g.status === "active").map((g) => (
                    <TouchableOpacity
                      key={g.id}
                      style={[styles.goalChip, form.linked_goal_id === g.id && styles.goalChipActive]}
                      onPress={() => setForm((f) => ({ ...f, linked_goal_id: g.id }))}
                    >
                      <Text style={[styles.goalChipText, form.linked_goal_id === g.id && styles.goalChipTextActive]} numberOfLines={1}>
                        {g.title}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </>
            ) : null}

            <View style={styles.sheetActions}>
              <Button label="CANCEL" variant="secondary" onPress={closeModal} />
              <Button label="CREATE" onPress={handleCreate} loading={isMutating} />
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

function CommandButton({
  label,
  icon,
  active,
  onPress,
}: {
  label: string;
  icon: SFSymbol;
  active?: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <TouchableOpacity style={[styles.commandButton, active && styles.commandButtonActive]} onPress={onPress} activeOpacity={0.78}>
      <SymbolView name={icon} size={14} tintColor={active ? "#ffffff" : colors.accentCyan} resizeMode="scaleAspectFit" />
      <Text style={[styles.commandText, active && styles.commandTextActive]} numberOfLines={1}>{label}</Text>
    </TouchableOpacity>
  );
}

function TaskDetailSheet({
  task,
  goalTitle,
  meta,
  snoozed,
  onClose,
  onComplete,
  onDelete,
}: {
  task: Task | null;
  goalTitle?: string;
  meta?: TaskDisplayMeta;
  snoozed: boolean;
  onClose: () => void;
  onComplete: (task: Task) => void;
  onDelete: (task: Task) => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  if (!task || !meta) return null;

  const connections = [
    { label: "Related Goal", value: goalTitle ?? "Launch HELIOS", icon: "target" as SFSymbol },
    { label: "Related Calendar", value: "Sprint Planning", icon: "calendar" as SFSymbol },
    { label: "Related Brief", value: "Daily Brief", icon: "doc.text.fill" as SFSymbol },
    { label: "Related AI Suggestion", value: "Weekly Review", icon: "sparkles" as SFSymbol },
  ];

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.overlay} />
      </TouchableWithoutFeedback>
      <View style={styles.detailWrapper}>
        <View style={[styles.detailSheet, { paddingBottom: insets.bottom + spacing.md }]}>
          <View style={styles.sheetHandle} />
          <ScrollView showsVerticalScrollIndicator={false}>
            <View style={styles.detailHeader}>
              <View style={styles.detailIcon}>
                <SymbolView name={meta.origin === "HELIOS" ? "brain.head.profile" : "checkmark.circle"} size={24} tintColor={meta.origin === "HELIOS" ? colors.accent : colors.accentCyan} resizeMode="scaleAspectFit" />
              </View>
              <View style={styles.detailTitleBlock}>
                <Text style={styles.detailEyebrow}>{meta.originLabel}</Text>
                <Text style={styles.detailTitle}>{displayTitle(task)}</Text>
                <Text style={styles.detailSubtitle}>{meta.statusLabel} • {meta.priorityLabel} • {meta.durationLabel}</Text>
              </View>
            </View>

            <DetailSection title="Description" value={task.description || meta.recommendation || "No description has been added yet."} />
            <DetailSection title="Notes" value={snoozed ? "Snoozed from the Task Center command lane." : "No notes captured."} />
            <DetailSection title="Subtasks" value="Define next action\nConfirm dependencies\nMark complete" />
            <DetailSection title="Attachments" value="No attachments linked." />

            <View style={styles.connectionPanel}>
              <Text style={styles.detailSectionTitle}>SMART CONNECTIONS</Text>
              {connections.map((item) => (
                <TouchableOpacity
                  key={item.label}
                  style={styles.connectionRow}
                  activeOpacity={0.78}
                  onPress={() => Haptics.selectionAsync().catch(() => {})}
                >
                  <View style={styles.connectionIcon}>
                    <SymbolView name={item.icon} size={14} tintColor={colors.accentCyan} resizeMode="scaleAspectFit" />
                  </View>
                  <View style={styles.connectionTextWrap}>
                    <Text style={styles.connectionLabel}>{item.label}</Text>
                    <Text style={styles.connectionValue}>{item.value}</Text>
                  </View>
                  <SymbolView name="chevron.right" size={12} tintColor={colors.textMuted} resizeMode="scaleAspectFit" />
                </TouchableOpacity>
              ))}
            </View>

            <DetailSection
              title="AI Reasoning"
              value={meta.origin === "HELIOS"
                ? meta.recommendation || "HELIOS surfaced this because it appears connected to active system context."
                : "Created by the user. HELIOS will monitor for goal, calendar, and brief connections."}
            />
            <DetailSection
              title="Activity History"
              value={`Created ${new Date(task.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}\nUpdated ${new Date(task.updated_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`}
            />

            <View style={styles.detailActions}>
              <TouchableOpacity style={styles.detailPrimaryAction} onPress={() => onComplete(task)} activeOpacity={0.82}>
                <Text style={styles.detailPrimaryText}>Complete</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.detailDangerAction} onPress={() => onDelete(task)} activeOpacity={0.82}>
                <Text style={styles.detailDangerText}>Delete</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function DetailSection({ title, value }: { title: string; value: string }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.detailSection}>
      <Text style={styles.detailSectionTitle}>{title.toUpperCase()}</Text>
      <Text style={styles.detailSectionText}>{value}</Text>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      paddingHorizontal: spacing.md,
      paddingBottom: spacing.xxl * 2,
    },
    heroCard: {
      backgroundColor: colors.card,
      borderRadius: radius.xl,
      padding: spacing.lg,
      borderWidth: 1,
      borderColor: `${colors.accent}40`,
      marginBottom: spacing.md,
      overflow: "hidden",
    },
    heroGlow: {
      position: "absolute",
      right: -70,
      top: -70,
      width: 150,
      height: 150,
      borderRadius: 75,
      backgroundColor: `${colors.accent}18`,
    },
    heroTop: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: spacing.md,
    },
    heroLabel: {
      ...typography.label,
      color: colors.accent,
      marginBottom: spacing.sm,
    },
    heroTitle: {
      ...typography.displaySmall,
      color: colors.textPrimary,
    },
    heroButton: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.xs,
      backgroundColor: colors.accent,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: radius.sm,
    },
    heroButtonText: {
      fontSize: 12,
      fontWeight: "800",
      color: "#ffffff",
      letterSpacing: 0,
    },
    heroCount: {
      fontSize: 22,
      fontWeight: "900",
      color: colors.textPrimary,
      marginTop: spacing.md,
      letterSpacing: 0,
    },
    heroSubtitle: {
      ...typography.body,
      color: colors.textMuted,
      marginTop: spacing.xs,
    },
    commandDock: {
      backgroundColor: `${colors.background}f2`,
      paddingBottom: spacing.sm,
      marginHorizontal: -spacing.md,
      paddingHorizontal: spacing.md,
    },
    commandRow: {
      flexDirection: "row",
      gap: spacing.sm,
      marginBottom: spacing.sm,
    },
    commandButton: {
      flex: 1,
      minHeight: 42,
      borderRadius: radius.sm,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
      alignItems: "center",
      justifyContent: "center",
      gap: 3,
      paddingHorizontal: spacing.xs,
    },
    commandButtonActive: {
      backgroundColor: colors.accent,
      borderColor: colors.accent,
    },
    commandText: {
      fontSize: 10,
      fontWeight: "800",
      color: colors.textSecondary,
      letterSpacing: 0,
    },
    commandTextActive: {
      color: "#ffffff",
    },
    searchBar: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      backgroundColor: colors.card,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: spacing.md,
      marginBottom: spacing.sm,
      minHeight: 44,
    },
    searchInput: {
      flex: 1,
      color: colors.textPrimary,
      fontSize: 14,
      paddingVertical: spacing.sm,
    },
    filterContent: {
      gap: spacing.sm,
      paddingRight: spacing.md,
    },
    filterChip: {
      borderRadius: radius.sm,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceDark,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
    filterChipActive: {
      borderColor: colors.accent,
      backgroundColor: `${colors.accent}24`,
    },
    filterChipText: {
      fontSize: 12,
      fontWeight: "800",
      color: colors.textMuted,
      letterSpacing: 0,
    },
    filterChipTextActive: {
      color: colors.accent,
    },
    listHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginTop: spacing.md,
      marginBottom: spacing.sm,
    },
    sectionLabel: {
      ...typography.label,
      color: colors.accent,
      marginBottom: 2,
    },
    listTitle: {
      ...typography.caption,
      color: colors.textMuted,
    },
    errorText: {
      ...typography.caption,
      color: colors.danger,
      marginBottom: spacing.sm,
    },
    taskSection: {
      marginBottom: spacing.md,
    },
    taskSectionHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: spacing.sm,
    },
    taskSectionTitleWrap: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.xs,
    },
    taskSectionTitle: {
      fontSize: 13,
      fontWeight: "900",
      color: colors.textPrimary,
      letterSpacing: 0,
    },
    taskSectionCount: {
      ...typography.label,
      color: colors.textMuted,
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
      width: 56,
      height: 56,
      borderRadius: 18,
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
      backgroundColor: colors.accent,
      borderRadius: radius.sm,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm,
    },
    primaryEmptyText: {
      fontSize: 12,
      fontWeight: "900",
      color: "#ffffff",
      letterSpacing: 0,
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
      letterSpacing: 0,
    },
    overlay: {
      flex: 1,
      backgroundColor: colors.overlay,
    },
    modalWrapper: {
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
      height: 72,
      textAlignVertical: "top",
    },
    fieldLabel: {
      ...typography.label,
      color: colors.textMuted,
      marginBottom: spacing.sm,
      marginTop: spacing.xs,
    },
    priorityRow: {
      flexDirection: "row",
      gap: spacing.sm,
      marginBottom: spacing.md,
    },
    priorityChip: {
      flex: 1,
      paddingVertical: spacing.sm,
      borderRadius: radius.sm,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: "center",
    },
    priorityChipText: {
      fontSize: 9,
      fontWeight: "800",
      letterSpacing: 0,
      color: colors.textMuted,
    },
    priorityChipTextActive: {
      color: colors.textPrimary,
    },
    goalScroll: {
      marginBottom: spacing.md,
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
      backgroundColor: `${colors.accent}26`,
    },
    goalChipText: {
      ...typography.caption,
      color: colors.textMuted,
    },
    goalChipTextActive: {
      color: colors.accent,
    },
    sheetActions: {
      flexDirection: "row",
      gap: spacing.sm,
      marginTop: spacing.md,
    },
    detailWrapper: {
      justifyContent: "flex-end",
      flex: 1,
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
      width: 48,
      height: 48,
      borderRadius: 16,
      backgroundColor: `${colors.accent}14`,
      borderWidth: 1,
      borderColor: `${colors.accent}35`,
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
    },
    detailTitleBlock: {
      flex: 1,
      minWidth: 0,
    },
    detailEyebrow: {
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
    connectionPanel: {
      backgroundColor: colors.card,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: `${colors.accentCyan}35`,
      padding: spacing.md,
      marginBottom: spacing.sm,
    },
    connectionRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      paddingVertical: spacing.sm,
      borderTopWidth: 1,
      borderTopColor: colors.borderDark,
    },
    connectionIcon: {
      width: 30,
      height: 30,
      borderRadius: 10,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: `${colors.accentCyan}14`,
    },
    connectionTextWrap: {
      flex: 1,
      minWidth: 0,
    },
    connectionLabel: {
      fontSize: 11,
      fontWeight: "800",
      color: colors.textMuted,
      letterSpacing: 0,
    },
    connectionValue: {
      ...typography.caption,
      color: colors.textPrimary,
    },
    detailActions: {
      flexDirection: "row",
      gap: spacing.sm,
      marginTop: spacing.sm,
      marginBottom: spacing.md,
    },
    detailPrimaryAction: {
      flex: 1,
      backgroundColor: colors.accent,
      borderRadius: radius.sm,
      alignItems: "center",
      paddingVertical: spacing.md,
    },
    detailPrimaryText: {
      fontSize: 12,
      fontWeight: "900",
      color: "#ffffff",
      letterSpacing: 0,
    },
    detailDangerAction: {
      flex: 1,
      borderRadius: radius.sm,
      borderWidth: 1,
      borderColor: `${colors.danger}55`,
      alignItems: "center",
      paddingVertical: spacing.md,
    },
    detailDangerText: {
      fontSize: 12,
      fontWeight: "900",
      color: colors.danger,
      letterSpacing: 0,
    },
  });
}
