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
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Keyboard,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SymbolView } from "expo-symbols";

import { colors, spacing, radius, typography } from "../../theme/theme";
import { useAuthStore, useMemoryStore } from "../../store";
import type { Memory, MemoryType } from "../../store";

// ── Constants ─────────────────────────────────────────────────────────────────

const MEMORY_TYPES: MemoryType[] = ["preference", "important_fact", "goal_context", "recurring_interest"];

const TYPE_LABELS: Record<MemoryType, string> = {
  preference: "PREFERENCE",
  important_fact: "IMPORTANT FACT",
  goal_context: "GOAL CONTEXT",
  recurring_interest: "INTEREST",
};

const TYPE_COLORS: Record<MemoryType, string> = {
  preference: colors.accent,
  important_fact: colors.accentCyan,
  goal_context: "#f59e0b",
  recurring_interest: "#10b981",
};

// ── Sub-components ────────────────────────────────────────────────────────────

type FilterChipProps = {
  label: string;
  active: boolean;
  color?: string;
  onPress: () => void;
};

function FilterChip({ label, active, color, onPress }: FilterChipProps) {
  return (
    <TouchableOpacity
      style={[
        styles.chip,
        active && { backgroundColor: color ?? colors.accent, borderColor: color ?? colors.accent },
      ]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

type MemoryCardProps = {
  memory: Memory;
  onDelete: () => void;
};

function MemoryCard({ memory, onDelete }: MemoryCardProps) {
  const typeColor = TYPE_COLORS[memory.memory_type as MemoryType] ?? colors.textMuted;
  const typeLabel = TYPE_LABELS[memory.memory_type as MemoryType] ?? memory.memory_type.toUpperCase();

  const formattedDate = (() => {
    const d = new Date(memory.created_at);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  })();

  return (
    <View style={styles.memoryCard}>
      <View style={styles.memoryCardTop}>
        <View style={[styles.typeBadge, { borderColor: typeColor }]}>
          <Text style={[styles.typeBadgeText, { color: typeColor }]}>{typeLabel}</Text>
        </View>
        <TouchableOpacity
          onPress={onDelete}
          style={styles.deleteButton}
          activeOpacity={0.7}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={styles.deleteIcon}>✕</Text>
        </TouchableOpacity>
      </View>
      <Text style={styles.memoryContent}>{memory.content}</Text>
      {formattedDate ? (
        <Text style={styles.memoryDate}>{formattedDate}</Text>
      ) : null}
    </View>
  );
}

// ── Add Memory Modal ──────────────────────────────────────────────────────────

type AddMemoryModalProps = {
  visible: boolean;
  onClose: () => void;
  onSubmit: (type: MemoryType, content: string) => void;
  isMutating: boolean;
};

function AddMemoryModal({ visible, onClose, onSubmit, isMutating }: AddMemoryModalProps) {
  const [selectedType, setSelectedType] = useState<MemoryType>("preference");
  const [content, setContent] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  function resetAndClose() {
    setSelectedType("preference");
    setContent("");
    setFormError(null);
    Keyboard.dismiss();
    onClose();
  }

  function handleSubmit() {
    if (!content.trim()) {
      setFormError("Memory content is required.");
      return;
    }
    if (content.trim().length > 2000) {
      setFormError("Memory must be 2000 characters or fewer.");
      return;
    }
    setFormError(null);
    onSubmit(selectedType, content.trim());
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={resetAndClose}>
      <TouchableWithoutFeedback onPress={resetAndClose}>
        <View style={styles.overlay} />
      </TouchableWithoutFeedback>

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.modalWrapper}
      >
        <View style={styles.sheet}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>NEW MEMORY</Text>

          <Text style={styles.fieldLabel}>MEMORY TYPE</Text>
          <View style={styles.typeGrid}>
            {MEMORY_TYPES.map((t) => (
              <TouchableOpacity
                key={t}
                style={[
                  styles.typeOption,
                  selectedType === t && {
                    borderColor: TYPE_COLORS[t],
                    backgroundColor: `${TYPE_COLORS[t]}18`,
                  },
                ]}
                onPress={() => setSelectedType(t)}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.typeOptionText,
                    selectedType === t && { color: TYPE_COLORS[t] },
                  ]}
                >
                  {TYPE_LABELS[t]}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.fieldLabel}>CONTENT</Text>
          <TextInput
            style={[styles.input, styles.inputMultiline]}
            value={content}
            onChangeText={setContent}
            placeholder={
              selectedType === "preference"
                ? "e.g. I prefer concise, direct responses"
                : selectedType === "important_fact"
                ? "e.g. I am a software engineer at a startup"
                : selectedType === "goal_context"
                ? "e.g. My career goal is to become an engineering manager"
                : "e.g. I am interested in stoic philosophy and productivity systems"
            }
            placeholderTextColor={colors.textMuted}
            multiline
            maxLength={2000}
            autoFocus
          />
          <Text style={styles.charCount}>{content.length} / 2000</Text>

          {formError ? <Text style={styles.formError}>{formError}</Text> : null}

          <View style={styles.sheetActions}>
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={resetAndClose}
              activeOpacity={0.7}
            >
              <Text style={styles.cancelButtonText}>CANCEL</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.createButton, isMutating && { opacity: 0.5 }]}
              onPress={handleSubmit}
              disabled={isMutating}
              activeOpacity={0.8}
            >
              {isMutating ? (
                <ActivityIndicator size="small" color={colors.background} />
              ) : (
                <Text style={styles.createButtonText}>SAVE</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function MemoryScreen() {
  const insets = useSafeAreaInsets();
  const accessToken = useAuthStore((s) => s.accessToken);
  const { memories, isLoading, isMutating, error, fetchMemories, createMemory, deleteMemory } =
    useMemoryStore();

  const [activeFilter, setActiveFilter] = useState<MemoryType | null>(null);
  const [modalVisible, setModalVisible] = useState(false);

  // Always fetch all memories so the type summary counts are accurate.
  // Filtering is applied client-side via the `displayed` variable below.
  const loadMemories = useCallback(() => {
    if (accessToken) fetchMemories(accessToken);
  }, [accessToken, fetchMemories]);

  useEffect(() => {
    loadMemories();
  }, [loadMemories]);

  async function handleCreate(type: MemoryType, content: string) {
    if (!accessToken) return;
    await createMemory(accessToken, { memory_type: type, content });
    setModalVisible(false);
  }

  function handleDelete(id: string) {
    if (!accessToken) return;
    Alert.alert("Delete Memory", "This memory will be permanently removed from your AI context.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => deleteMemory(accessToken, id),
      },
    ]);
  }

  const displayed = activeFilter
    ? memories.filter((m) => m.memory_type === activeFilter)
    : memories;

  const countByType = MEMORY_TYPES.reduce<Record<string, number>>((acc, t) => {
    acc[t] = memories.filter((m) => m.memory_type === t).length;
    return acc;
  }, {});

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
            onRefresh={loadMemories}
            tintColor={colors.accentCyan}
          />
        }
      >
        {/* Hero */}
        <View style={styles.heroCard}>
          <Text style={styles.heroLabel}>HELIOS MEMORY</Text>
          <Text style={styles.heroTitle}>AI Context Layer</Text>
          <Text style={styles.heroSubtitle}>
            {memories.length === 0
              ? "No memories stored. Add context to personalise your AI."
              : `${memories.length} memor${memories.length === 1 ? "y" : "ies"} · used in every AI response`}
          </Text>
        </View>

        {/* Type summary strip */}
        {memories.length > 0 ? (
          <View style={styles.summaryStrip}>
            {MEMORY_TYPES.map((t) => (
              <View key={t} style={styles.summaryCell}>
                <Text style={[styles.summaryCount, { color: TYPE_COLORS[t] }]}>
                  {countByType[t] ?? 0}
                </Text>
                <Text style={styles.summaryLabel}>{TYPE_LABELS[t]}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {/* Section header with filter + add button */}
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionLabel}>MEMORIES</Text>
          <View style={styles.headerRight}>
            {(isLoading || isMutating) ? (
              <ActivityIndicator size="small" color={colors.accentCyan} />
            ) : null}
            <TouchableOpacity
              style={styles.addButton}
              onPress={() => setModalVisible(true)}
              activeOpacity={0.8}
            >
              <Text style={styles.addButtonText}>+ ADD</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Filter chips */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRow}
        >
          <FilterChip
            label="ALL"
            active={activeFilter === null}
            color={colors.textMuted}
            onPress={() => setActiveFilter(null)}
          />
          {MEMORY_TYPES.map((t) => (
            <FilterChip
              key={t}
              label={TYPE_LABELS[t]}
              active={activeFilter === t}
              color={TYPE_COLORS[t]}
              onPress={() => setActiveFilter(activeFilter === t ? null : t)}
            />
          ))}
        </ScrollView>

        {error ? (
          <Text style={styles.errorText}>{error}</Text>
        ) : null}

        {/* Empty state */}
        {displayed.length === 0 && !isLoading ? (
          <View style={styles.emptyState}>
            <SymbolView
              name="brain.head.profile"
              size={36}
              tintColor={colors.textMuted}
              resizeMode="scaleAspectFit"
            />
            <Text style={styles.emptyTitle}>
              {activeFilter ? `No ${TYPE_LABELS[activeFilter].toLowerCase()} memories` : "No memories yet"}
            </Text>
            <Text style={styles.emptySubtitle}>
              Memories are injected into every AI conversation, briefing, and plan to give HELIOS
              context about who you are and how you work.
            </Text>
            {!activeFilter ? (
              <TouchableOpacity
                style={styles.emptyAction}
                onPress={() => setModalVisible(true)}
                activeOpacity={0.8}
              >
                <Text style={styles.emptyActionText}>+ ADD FIRST MEMORY</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : null}

        {/* Memory list */}
        {displayed.map((mem) => (
          <MemoryCard
            key={mem.id}
            memory={mem}
            onDelete={() => handleDelete(mem.id)}
          />
        ))}
      </ScrollView>

      <AddMemoryModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        onSubmit={handleCreate}
        isMutating={isMutating}
      />
    </>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl * 2,
  },

  // Hero
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

  // Type summary strip
  summaryStrip: {
    flexDirection: "row",
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.lg,
    overflow: "hidden",
  },

  summaryCell: {
    flex: 1,
    alignItems: "center",
    paddingVertical: spacing.md,
    gap: 3,
  },

  summaryCount: {
    fontSize: 22,
    fontWeight: "800" as const,
    letterSpacing: -0.5,
  },

  summaryLabel: {
    ...typography.label,
    fontSize: 8,
    color: colors.textMuted,
    textAlign: "center",
  },

  // Section header
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

  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
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

  // Filter chips
  filterRow: {
    flexDirection: "row",
    gap: spacing.sm,
    paddingBottom: spacing.md,
  },

  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "transparent",
  },

  chipText: {
    ...typography.label,
    fontSize: 9,
    color: colors.textMuted,
  },

  chipTextActive: {
    color: colors.textPrimary,
  },

  // Error
  errorText: {
    ...typography.caption,
    color: "#ef4444",
    marginBottom: spacing.sm,
  },

  // Empty state
  emptyState: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
    alignItems: "center",
    gap: spacing.md,
  },

  emptyTitle: {
    ...typography.title,
    color: colors.textPrimary,
    fontSize: 16,
    textAlign: "center",
  },

  emptySubtitle: {
    ...typography.body,
    color: colors.textMuted,
    textAlign: "center",
    fontSize: 13,
  },

  emptyAction: {
    backgroundColor: colors.accent,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    marginTop: spacing.xs,
  },

  emptyActionText: {
    ...typography.label,
    color: colors.textPrimary,
  },

  // Memory card
  memoryCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },

  memoryCardTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.sm,
  },

  typeBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.sm,
    borderWidth: 1,
  },

  typeBadgeText: {
    ...typography.label,
    fontSize: 9,
  },

  deleteButton: {
    padding: spacing.xs,
  },

  deleteIcon: {
    color: colors.textMuted,
    fontSize: 13,
  },

  memoryContent: {
    ...typography.body,
    color: colors.textPrimary,
    lineHeight: 22,
  },

  memoryDate: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: spacing.sm,
    fontSize: 11,
  },

  // Modal
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
    paddingBottom: spacing.xxl,
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

  fieldLabel: {
    ...typography.label,
    color: colors.textMuted,
    marginBottom: spacing.sm,
  },

  typeGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },

  typeOption: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },

  typeOptionText: {
    ...typography.label,
    fontSize: 9,
    color: colors.textMuted,
  },

  input: {
    backgroundColor: colors.surfaceDark,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.borderDark,
    color: colors.textPrimary,
    ...typography.body,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.xs,
  },

  inputMultiline: {
    height: 100,
    textAlignVertical: "top",
  },

  charCount: {
    ...typography.caption,
    color: colors.textMuted,
    fontSize: 10,
    textAlign: "right",
    marginBottom: spacing.md,
    opacity: 0.7,
  },

  formError: {
    ...typography.caption,
    color: "#ef4444",
    marginBottom: spacing.sm,
  },

  sheetActions: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.xs,
  },

  cancelButton: {
    flex: 1,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.sm,
    alignItems: "center",
  },

  cancelButtonText: {
    ...typography.label,
    color: colors.textMuted,
    fontSize: 12,
  },

  createButton: {
    flex: 1,
    backgroundColor: colors.accent,
    borderRadius: radius.sm,
    paddingVertical: spacing.sm,
    alignItems: "center",
  },

  createButtonText: {
    ...typography.label,
    color: colors.textPrimary,
    fontSize: 12,
    fontWeight: "700" as const,
  },
});
