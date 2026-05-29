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

import GoalCard from "../../components/GoalCard";
import Input from "../../components/ui/Input";
import Button from "../../components/ui/Button";
import { colors, spacing, radius, typography } from "../../theme/theme";
import { useGoalsStore, useAuthStore } from "../../store";

type FormState = {
  title: string;
  description: string;
  target_date: string;
};

const EMPTY_FORM: FormState = { title: "", description: "", target_date: "" };

export default function GoalsScreen() {
  const insets = useSafeAreaInsets();
  const accessToken = useAuthStore((s) => s.accessToken);
  const { goals, isLoading, isMutating, error, fetchGoals, createGoal, updateGoal, deleteGoal } =
    useGoalsStore();

  const [modalVisible, setModalVisible] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);

  const onRefresh = useCallback(() => {
    if (accessToken) fetchGoals(accessToken);
  }, [accessToken, fetchGoals]);

  useEffect(() => {
    if (accessToken) fetchGoals(accessToken);
  }, [accessToken, fetchGoals]);

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
      setFormError("Goal title is required.");
      return;
    }
    setFormError(null);
    await createGoal(accessToken, {
      title: form.title.trim(),
      description: form.description.trim() || undefined,
      target_date: form.target_date.trim() || undefined,
    });
    closeModal();
  }

  function handleStatusChange(goalId: string, nextStatus: string) {
    if (!accessToken) return;
    updateGoal(accessToken, goalId, { status: nextStatus });
  }

  function handleDelete(goalId: string) {
    if (!accessToken) return;
    deleteGoal(accessToken, goalId);
  }

  const active = goals.filter((g) => g.status === "active");
  const other = goals.filter((g) => g.status !== "active");

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
          <Text style={styles.heroLabel}>HELIOS GOALS</Text>
          <Text style={styles.heroTitle}>Mission Objectives</Text>
          <Text style={styles.heroSubtitle}>
            {goals.length === 0
              ? "No goals yet. Add your first objective."
              : `${active.length} active · ${goals.filter((g) => g.status === "completed").length} completed`}
          </Text>
        </View>

        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionLabel}>OBJECTIVES</Text>
          <View style={styles.headerRight}>
            {(isLoading || isMutating) ? (
              <ActivityIndicator size="small" color={colors.accentCyan} />
            ) : null}
            <TouchableOpacity style={styles.addButton} onPress={openModal}>
              <Text style={styles.addButtonText}>+ NEW GOAL</Text>
            </TouchableOpacity>
          </View>
        </View>

        {error ? (
          <Text style={styles.errorText}>{error}</Text>
        ) : null}

        {goals.length === 0 && !isLoading ? (
          <View style={styles.emptyState}>
            <SymbolView name="target" size={36} tintColor={colors.textMuted} resizeMode="scaleAspectFit" />
            <Text style={styles.emptyText}>
              Your objectives will appear here once you create them.
            </Text>
          </View>
        ) : null}

        {active.map((goal) => (
          <GoalCard
            key={goal.id}
            goal={goal}
            onStatusChange={(next) => handleStatusChange(goal.id, next)}
            onDelete={() => handleDelete(goal.id)}
          />
        ))}

        {other.length > 0 ? (
          <>
            <Text style={[styles.sectionLabel, styles.sectionLabelSpaced]}>
              COMPLETED / PAUSED
            </Text>
            {other.map((goal) => (
              <GoalCard
                key={goal.id}
                goal={goal}
                onStatusChange={(next) => handleStatusChange(goal.id, next)}
                onDelete={() => handleDelete(goal.id)}
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

            <Text style={styles.sheetTitle}>NEW OBJECTIVE</Text>

            <Input
              label="GOAL TITLE"
              placeholder="e.g. Launch HELIOS v1"
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
              label="TARGET DATE"
              placeholder="e.g. 2026-12-31"
              value={form.target_date}
              onChangeText={(t) => setForm((f) => ({ ...f, target_date: t }))}
            />

            <View style={styles.sheetActions}>
              <Button
                label="CANCEL"
                variant="secondary"
                onPress={closeModal}
              />
              <Button
                label="CREATE"
                onPress={handleCreate}
                loading={isMutating}
              />
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
    height: 80,
    textAlignVertical: "top",
  },

  sheetActions: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.md,
  },
});
