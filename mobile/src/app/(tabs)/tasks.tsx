import { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  ActivityIndicator,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Modal,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Keyboard,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SymbolView } from "expo-symbols";

import TaskCard from "../../components/TaskCard";
import Input from "../../components/ui/Input";
import Button from "../../components/ui/Button";
import { colors, spacing, radius, typography } from "../../theme/theme";
import { useTasksStore, useGoalsStore, useAuthStore } from "../../store";

const PRIORITIES = ["low", "medium", "high", "critical"] as const;
type Priority = (typeof PRIORITIES)[number];

const PRIORITY_COLOR: Record<Priority, string> = {
  critical: "#ef4444",
  high:     "#f97316",
  medium:   "#f59e0b",
  low:      colors.textMuted,
};

type FormState = {
  title: string;
  description: string;
  priority: Priority;
  due_date: string;
  linked_goal_id: string;
};

const EMPTY_FORM: FormState = {
  title: "",
  description: "",
  priority: "medium",
  due_date: "",
  linked_goal_id: "",
};

export default function TasksScreen() {
  const insets = useSafeAreaInsets();
  const accessToken = useAuthStore((s) => s.accessToken);
  const { tasks, isLoading, isMutating, error, fetchTasks, createTask, updateTask, deleteTask } =
    useTasksStore();
  const { goals } = useGoalsStore();

  const [modalVisible, setModalVisible] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);

  const onRefresh = useCallback(() => {
    if (accessToken) fetchTasks(accessToken);
  }, [accessToken, fetchTasks]);

  useEffect(() => {
    if (accessToken) fetchTasks(accessToken);
  }, [accessToken, fetchTasks]);

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

  const open = tasks.filter((t) => t.status !== "done");
  const done = tasks.filter((t) => t.status === "done");

  return (
    <>
      <ScrollView
        style={{ backgroundColor: colors.background }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.container,
          { paddingTop: insets.top + spacing.md },
        ]}
        refreshControl={
          <RefreshControl
            refreshing={isLoading}
            onRefresh={onRefresh}
            tintColor={colors.accentCyan}
          />
        }
      >
        <View style={styles.heroCard}>
          <Text style={styles.heroLabel}>HELIOS TASKS</Text>
          <Text style={styles.heroTitle}>Execution Queue</Text>
          <Text style={styles.heroSubtitle}>
            {tasks.length === 0
              ? "No tasks yet. Add your first action item."
              : `${open.length} open · ${done.length} done`}
          </Text>
        </View>

        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionLabel}>OPEN</Text>
          <View style={styles.headerRight}>
            {(isLoading || isMutating) ? (
              <ActivityIndicator size="small" color={colors.accentCyan} />
            ) : null}
            <TouchableOpacity style={styles.addButton} onPress={openModal}>
              <Text style={styles.addButtonText}>+ NEW TASK</Text>
            </TouchableOpacity>
          </View>
        </View>

        {error ? (
          <Text style={styles.errorText}>{error}</Text>
        ) : null}

        {tasks.length === 0 && !isLoading ? (
          <View style={styles.emptyState}>
            <SymbolView name="checklist" size={36} tintColor={colors.textMuted} resizeMode="scaleAspectFit" />
            <Text style={styles.emptyText}>
              Your action items will appear here once you create them.
            </Text>
          </View>
        ) : null}

        {open.map((task) => (
          <TaskCard
            key={task.id}
            task={task}
            onStatusChange={(next) => handleStatusChange(task.id, next)}
            onDelete={() => handleDelete(task.id)}
          />
        ))}

        {done.length > 0 ? (
          <>
            <Text style={[styles.sectionLabel, styles.sectionLabelSpaced]}>
              COMPLETED
            </Text>
            {done.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                onStatusChange={(next) => handleStatusChange(task.id, next)}
                onDelete={() => handleDelete(task.id)}
              />
            ))}
          </>
        ) : null}
      </ScrollView>

      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent
        onRequestClose={closeModal}
      >
        <TouchableWithoutFeedback onPress={closeModal}>
          <View style={styles.overlay} />
        </TouchableWithoutFeedback>

        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.modalWrapper}
        >
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
                  <Text
                    style={[
                      styles.priorityChipText,
                      form.priority === p && styles.priorityChipTextActive,
                    ]}
                  >
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
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={styles.goalScroll}
                  contentContainerStyle={styles.goalScrollContent}
                >
                  <TouchableOpacity
                    style={[
                      styles.goalChip,
                      !form.linked_goal_id && styles.goalChipActive,
                    ]}
                    onPress={() => setForm((f) => ({ ...f, linked_goal_id: "" }))}
                  >
                    <Text style={[styles.goalChipText, !form.linked_goal_id && styles.goalChipTextActive]}>
                      None
                    </Text>
                  </TouchableOpacity>
                  {goals.filter((g) => g.status === "active").map((g) => (
                    <TouchableOpacity
                      key={g.id}
                      style={[
                        styles.goalChip,
                        form.linked_goal_id === g.id && styles.goalChipActive,
                      ]}
                      onPress={() => setForm((f) => ({ ...f, linked_goal_id: g.id }))}
                    >
                      <Text
                        style={[
                          styles.goalChipText,
                          form.linked_goal_id === g.id && styles.goalChipTextActive,
                        ]}
                        numberOfLines={1}
                      >
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

  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },

  sectionLabel: {
    ...typography.label,
    color: colors.textMuted,
  },

  sectionLabelSpaced: {
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },

  addButton: {
    backgroundColor: colors.accent,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
  },

  addButtonText: {
    ...typography.label,
    color: colors.textPrimary,
  },

  errorText: {
    ...typography.caption,
    color: "#ef4444",
    marginBottom: spacing.sm,
  },

  emptyState: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
    alignItems: "center",
    gap: spacing.md,
  },

  emptyText: {
    ...typography.body,
    color: colors.textMuted,
    textAlign: "center",
  },

  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
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
    fontWeight: "700" as const,
    letterSpacing: 1,
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
    backgroundColor: "rgba(124,58,237,0.15)",
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
});
