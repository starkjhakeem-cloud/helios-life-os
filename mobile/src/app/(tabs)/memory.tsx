import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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

import { radius, spacing, typography, type ThemeColors } from "../../theme/theme";
import { useTheme } from "../../theme/ThemeContext";
import { useAuthStore, useMemoryStore } from "../../store";
import type { Memory, MemoryType } from "../../store";

type MemoryCategory = Exclude<MemoryType, "recurring_interest">;
type MemoryImportance = "standard" | "high";
type Feedback = { tone: "success" | "error"; message: string } | null;

type MemoryTypeOption = {
  value: MemoryCategory;
  label: string;
  description: string;
  example: string;
  icon: SFSymbol;
};

const DEFAULT_MEMORY_TYPE: MemoryCategory = "preference";
const DEFAULT_IMPORTANCE: MemoryImportance = "standard";
const MAX_MEMORY_LENGTH = 2000;

const MEMORY_TYPE_OPTIONS: MemoryTypeOption[] = [
  {
    value: "preference",
    label: "Preference",
    description: "How you like things done.",
    example: "I prefer direct recommendations with clear next steps.",
    icon: "slider.horizontal.3",
  },
  {
    value: "goal_context",
    label: "Goal Context",
    description: "Something connected to your long-term goals.",
    example: "I am focused on finishing my Software Engineering degree.",
    icon: "target",
  },
  {
    value: "important_fact",
    label: "Important Fact",
    description: "Something HELIOS should remember about your life.",
    example: "WGU Software Engineering is my top education priority.",
    icon: "info.circle",
  },
  {
    value: "relationship",
    label: "Relationship",
    description: "People, roles, and relationship context.",
    example: "My family calendar matters when planning evening work.",
    icon: "person.2",
  },
  {
    value: "project",
    label: "Project",
    description: "Important projects HELIOS should understand.",
    example: "HELIOS is my flagship software project.",
    icon: "folder",
  },
  {
    value: "routine",
    label: "Routine",
    description: "Patterns that shape your day.",
    example: "I usually study best in the morning.",
    icon: "clock.arrow.circlepath",
  },
  {
    value: "interest",
    label: "Interest",
    description: "Topics and interests worth remembering.",
    example: "I am interested in practical AI systems and productivity.",
    icon: "star",
  },
  {
    value: "constraint",
    label: "Constraint",
    description: "Boundaries HELIOS should respect.",
    example: "Do not schedule deep work during school pickup times.",
    icon: "exclamationmark.triangle",
  },
];

const MEMORY_TYPE_DETAILS: Record<MemoryType, MemoryTypeOption> = {
  preference: MEMORY_TYPE_OPTIONS[0],
  goal_context: MEMORY_TYPE_OPTIONS[1],
  important_fact: MEMORY_TYPE_OPTIONS[2],
  relationship: MEMORY_TYPE_OPTIONS[3],
  project: MEMORY_TYPE_OPTIONS[4],
  routine: MEMORY_TYPE_OPTIONS[5],
  interest: MEMORY_TYPE_OPTIONS[6],
  constraint: MEMORY_TYPE_OPTIONS[7],
  recurring_interest: MEMORY_TYPE_OPTIONS[6],
};

const IMPORTANCE_OPTIONS: { value: MemoryImportance; label: string; description: string }[] = [
  { value: "standard", label: "Standard", description: "Helpful context" },
  { value: "high", label: "High", description: "Strongly guide HELIOS" },
];

function getTypeColors(colors: ThemeColors): Record<MemoryCategory, string> {
  return {
    preference: colors.accent,
    goal_context: colors.warning,
    important_fact: colors.accentCyan,
    relationship: colors.info,
    project: colors.success,
    routine: colors.accentCyan,
    interest: colors.accent,
    constraint: colors.danger,
  };
}

function normalizeType(type: MemoryType): MemoryCategory {
  return type === "recurring_interest" ? "interest" : type;
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recently added";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function readStringExtra(memory: Memory, key: string): string | null {
  const value = memory.extra_data?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function humanize(value: string): string {
  return value
    .split(/[_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function sourceLabel(source: string | null): string | null {
  if (!source) return null;
  if (source === "manual" || source === "user") return "Manual";
  return humanize(source);
}

function importanceLabel(importance: string | null): string | null {
  if (!importance) return null;
  if (importance === "standard") return "Standard importance";
  if (importance === "high") return "High importance";
  return humanize(importance);
}

type FilterChipProps = {
  active: boolean;
  color: string;
  count?: number;
  label: string;
  onPress: () => void;
};

function FilterChip({ active, color, count, label, onPress }: FilterChipProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      activeOpacity={0.78}
      onPress={onPress}
      style={[
        styles.filterChip,
        active && { backgroundColor: `${color}18`, borderColor: color },
      ]}
    >
      <Text style={[styles.filterChipText, active && { color }]}>{label}</Text>
      {typeof count === "number" ? <Text style={styles.filterChipCount}>{count}</Text> : null}
    </TouchableOpacity>
  );
}

type MemoryCardProps = {
  memory: Memory;
  onDelete: () => void;
};

function MemoryCard({ memory, onDelete }: MemoryCardProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const typeColors = useMemo(() => getTypeColors(colors), [colors]);
  const type = normalizeType(memory.memory_type);
  const detail = MEMORY_TYPE_DETAILS[memory.memory_type] ?? MEMORY_TYPE_DETAILS.important_fact;
  const color = typeColors[type];
  const importance = importanceLabel(readStringExtra(memory, "importance"));
  const source = sourceLabel(readStringExtra(memory, "source"));

  return (
    <View style={styles.memoryCard}>
      <View style={styles.memoryTop}>
        <View style={[styles.typeBadge, { borderColor: `${color}44`, backgroundColor: `${color}12` }]}>
          <SymbolView name={detail.icon} size={13} tintColor={color} resizeMode="scaleAspectFit" />
          <Text style={[styles.typeBadgeText, { color }]}>{detail.label}</Text>
        </View>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Delete memory"
          activeOpacity={0.72}
          hitSlop={10}
          onPress={onDelete}
          style={styles.deleteButton}
        >
          <SymbolView name="trash" size={15} tintColor={colors.danger} resizeMode="scaleAspectFit" />
        </TouchableOpacity>
      </View>

      <Text numberOfLines={5} style={styles.memoryContent}>{memory.content}</Text>

      <View style={styles.memoryMetaRow}>
        <Text style={styles.memoryMeta}>Added {formatDate(memory.created_at)}</Text>
        {importance ? <Text style={styles.memoryMeta}>{importance}</Text> : null}
        {source ? <Text style={styles.memoryMeta}>Source: {source}</Text> : null}
      </View>
    </View>
  );
}

type AddMemoryModalProps = {
  isMutating: boolean;
  onClose: () => void;
  onSubmit: (type: MemoryCategory, content: string, importance: MemoryImportance) => Promise<boolean>;
  visible: boolean;
};

function AddMemoryModal({ isMutating, onClose, onSubmit, visible }: AddMemoryModalProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const typeColors = useMemo(() => getTypeColors(colors), [colors]);
  const [selectedType, setSelectedType] = useState<MemoryCategory>(DEFAULT_MEMORY_TYPE);
  const [importance, setImportance] = useState<MemoryImportance>(DEFAULT_IMPORTANCE);
  const [content, setContent] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [saved, setSaved] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const selected = MEMORY_TYPE_DETAILS[selectedType];
  const selectedColor = typeColors[selectedType];
  const disableSave = isSubmitting || isMutating || saved || content.trim().length === 0;

  useEffect(() => () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
  }, []);

  useEffect(() => {
    if (!visible) {
      setFormError(null);
      setIsSubmitting(false);
      setSaved(false);
    }
  }, [visible]);

  function resetForm() {
    setSelectedType(DEFAULT_MEMORY_TYPE);
    setImportance(DEFAULT_IMPORTANCE);
    setContent("");
    setFormError(null);
    setSaved(false);
    setIsSubmitting(false);
  }

  function handleClose() {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    Keyboard.dismiss();
    resetForm();
    onClose();
  }

  async function handleSubmit() {
    if (disableSave) return;
    const trimmed = content.trim();

    if (!trimmed) {
      setFormError("Tell HELIOS what to remember.");
      return;
    }
    if (trimmed.length > MAX_MEMORY_LENGTH) {
      setFormError(`Keep this memory under ${MAX_MEMORY_LENGTH.toLocaleString()} characters.`);
      return;
    }

    setFormError(null);
    setIsSubmitting(true);
    Keyboard.dismiss();

    const success = await onSubmit(selectedType, trimmed, importance);
    if (success) {
      setContent("");
      setSelectedType(DEFAULT_MEMORY_TYPE);
      setImportance(DEFAULT_IMPORTANCE);
      setSaved(true);
      closeTimer.current = setTimeout(() => {
        setSaved(false);
        onClose();
      }, 650);
    } else {
      setFormError("That memory could not be saved. Try again in a moment.");
    }
    setIsSubmitting(false);
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <TouchableWithoutFeedback onPress={handleClose}>
        <View style={styles.overlay} />
      </TouchableWithoutFeedback>

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.modalWrapper}
      >
        <View style={styles.sheet}>
          <View style={styles.sheetHandle} />
          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.sheetContent}
          >
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetEyebrow}>Teach HELIOS</Text>
              <Text style={styles.sheetTitle}>What should HELIOS remember?</Text>
              <Text style={styles.sheetSubtitle}>
                Only save information you want HELIOS to use when helping you. You can delete memories anytime.
              </Text>
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Memory Type</Text>
              <View style={styles.typeGrid}>
                {MEMORY_TYPE_OPTIONS.map((option) => {
                  const color = typeColors[option.value];
                  const active = selectedType === option.value;
                  return (
                    <TouchableOpacity
                      key={option.value}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                      activeOpacity={0.78}
                      onPress={() => {
                        setSelectedType(option.value);
                        setFormError(null);
                      }}
                      style={[
                        styles.typeOption,
                        active && { borderColor: color, backgroundColor: `${color}12` },
                      ]}
                    >
                      <View style={styles.typeOptionTop}>
                        <SymbolView name={option.icon} size={15} tintColor={active ? color : colors.textMuted} resizeMode="scaleAspectFit" />
                        <Text style={[styles.typeOptionTitle, active && { color }]}>{option.label}</Text>
                      </View>
                      <Text style={styles.typeOptionDescription}>{option.description}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Suggested Example</Text>
              <TouchableOpacity
                accessibilityRole="button"
                activeOpacity={0.78}
                onPress={() => setContent(selected.example)}
                style={[styles.exampleCard, { borderColor: `${selectedColor}36` }]}
              >
                <SymbolView name="quote.opening" size={15} tintColor={selectedColor} resizeMode="scaleAspectFit" />
                <Text style={styles.exampleText}>{selected.example}</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Memory</Text>
              <TextInput
                accessibilityLabel="Memory content"
                autoCapitalize="sentences"
                autoCorrect
                maxLength={MAX_MEMORY_LENGTH}
                multiline
                onChangeText={(value) => {
                  setContent(value);
                  setFormError(null);
                  setSaved(false);
                }}
                placeholder="Save a preference, goal, routine, constraint, or important fact."
                placeholderTextColor={colors.textMuted}
                returnKeyType="default"
                spellCheck
                style={styles.input}
                textAlignVertical="top"
                value={content}
              />
              <Text style={styles.charCount}>{content.length} / {MAX_MEMORY_LENGTH}</Text>
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Importance</Text>
              <View style={styles.importanceRow}>
                {IMPORTANCE_OPTIONS.map((option) => {
                  const active = importance === option.value;
                  return (
                    <TouchableOpacity
                      key={option.value}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                      activeOpacity={0.78}
                      onPress={() => setImportance(option.value)}
                      style={[styles.importanceOption, active && styles.importanceOptionActive]}
                    >
                      <Text style={[styles.importanceTitle, active && styles.importanceTitleActive]}>{option.label}</Text>
                      <Text style={styles.importanceDescription}>{option.description}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {saved ? (
              <View style={styles.successBox}>
                <SymbolView name="checkmark.circle.fill" size={18} tintColor={colors.success} resizeMode="scaleAspectFit" />
                <Text style={styles.successText}>Saved to memory.</Text>
              </View>
            ) : null}

            {formError ? (
              <View style={styles.formErrorBox}>
                <SymbolView name="exclamationmark.triangle" size={16} tintColor={colors.danger} resizeMode="scaleAspectFit" />
                <Text style={styles.formErrorText}>{formError}</Text>
              </View>
            ) : null}

            <View style={styles.sheetActions}>
              <TouchableOpacity
                accessibilityRole="button"
                activeOpacity={0.78}
                disabled={isSubmitting || isMutating}
                onPress={handleClose}
                style={styles.cancelButton}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                accessibilityRole="button"
                activeOpacity={0.84}
                disabled={disableSave}
                onPress={handleSubmit}
                style={[styles.saveButton, disableSave && styles.disabled]}
              >
                {isSubmitting || isMutating ? (
                  <ActivityIndicator size="small" color={colors.background} />
                ) : (
                  <SymbolView name="plus" size={15} tintColor={colors.background} resizeMode="scaleAspectFit" />
                )}
                <Text style={styles.saveButtonText}>{isSubmitting || isMutating ? "Saving" : "Save this to memory"}</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export default function MemoryScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const typeColors = useMemo(() => getTypeColors(colors), [colors]);
  const insets = useSafeAreaInsets();
  const accessToken = useAuthStore((s) => s.accessToken);
  const { memories, isLoading, isMutating, error, fetchMemories, createMemory, deleteMemory } =
    useMemoryStore();

  const [activeFilter, setActiveFilter] = useState<MemoryCategory | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);

  const loadMemories = useCallback(() => {
    if (accessToken) fetchMemories(accessToken);
  }, [accessToken, fetchMemories]);

  useEffect(() => {
    loadMemories();
  }, [loadMemories]);

  useEffect(() => {
    if (error) setFeedback({ tone: "error", message: error });
  }, [error]);

  async function handleCreate(
    type: MemoryCategory,
    content: string,
    importance: MemoryImportance,
  ): Promise<boolean> {
    if (!accessToken) {
      setFeedback({ tone: "error", message: "Please sign in before saving memories." });
      return false;
    }

    const success = await createMemory(accessToken, {
      memory_type: type,
      content,
      extra_data: { importance, source: "manual" },
    });

    if (success) {
      setFeedback({
        tone: "success",
        message: "Memory saved. HELIOS can use it when building context for help, planning, and recommendations.",
      });
      return true;
    }

    setFeedback({ tone: "error", message: "That memory could not be saved. Try again in a moment." });
    return false;
  }

  function handleDelete(memory: Memory) {
    if (!accessToken) return;
    Alert.alert(
      "Delete memory?",
      "HELIOS will stop using this memory when helping you. This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => deleteMemory(accessToken, memory.id),
        },
      ],
    );
  }

  const displayed = activeFilter
    ? memories.filter((memory) => normalizeType(memory.memory_type) === activeFilter)
    : memories;

  const countByType = MEMORY_TYPE_OPTIONS.reduce<Record<MemoryCategory, number>>((acc, option) => {
    acc[option.value] = memories.filter((memory) => normalizeType(memory.memory_type) === option.value).length;
    return acc;
  }, {
    preference: 0,
    goal_context: 0,
    important_fact: 0,
    relationship: 0,
    project: 0,
    routine: 0,
    interest: 0,
    constraint: 0,
  });

  const activeTypeLabel = activeFilter ? MEMORY_TYPE_DETAILS[activeFilter].label : null;

  return (
    <>
      <ScrollView
        style={{ backgroundColor: colors.background }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.container,
          { paddingTop: insets.top + spacing.lg, paddingBottom: insets.bottom + spacing.xxl * 2 },
        ]}
        refreshControl={
          <RefreshControl
            refreshing={isLoading}
            onRefresh={loadMemories}
            tintColor={colors.accentCyan}
          />
        }
      >
        <View style={styles.heroCard}>
          <View style={styles.heroTop}>
            <View>
              <Text style={styles.heroLabel}>HELIOS MEMORY</Text>
              <Text style={styles.heroTitle}>Teach HELIOS about you</Text>
            </View>
            <View style={styles.memoryCountBadge}>
              <Text style={styles.memoryCount}>{memories.length}</Text>
              <Text style={styles.memoryCountLabel}>{memories.length === 1 ? "Memory" : "Memories"}</Text>
            </View>
          </View>
          <Text style={styles.heroSubtitle}>
            Save preferences, goals, routines, constraints, projects, and facts you want HELIOS to remember.
          </Text>
          <View style={styles.trustCard}>
            <SymbolView name="lock.shield" size={17} tintColor={colors.accentCyan} resizeMode="scaleAspectFit" />
            <Text style={styles.trustText}>
              Only save information you want HELIOS to use when helping you. You can delete memories anytime.
            </Text>
          </View>
        </View>

        {feedback ? (
          <TouchableOpacity
            accessibilityRole="button"
            activeOpacity={0.82}
            onPress={() => setFeedback(null)}
            style={[
              styles.feedbackCard,
              feedback.tone === "success" ? styles.feedbackSuccess : styles.feedbackError,
            ]}
          >
            <SymbolView
              name={feedback.tone === "success" ? "checkmark.circle.fill" : "exclamationmark.triangle"}
              size={18}
              tintColor={feedback.tone === "success" ? colors.success : colors.danger}
              resizeMode="scaleAspectFit"
            />
            <Text style={styles.feedbackText}>{feedback.message}</Text>
          </TouchableOpacity>
        ) : null}

        <View style={styles.sectionHeaderRow}>
          <View>
            <Text style={styles.sectionTitle}>Memory Library</Text>
            <Text style={styles.sectionSubtitle}>
              {activeTypeLabel ? `${activeTypeLabel} memories` : "Context HELIOS can reference naturally."}
            </Text>
          </View>
          <TouchableOpacity
            accessibilityRole="button"
            activeOpacity={0.84}
            onPress={() => {
              setFeedback(null);
              setModalVisible(true);
            }}
            style={styles.addButton}
          >
            <SymbolView name="plus" size={15} tintColor={colors.background} resizeMode="scaleAspectFit" />
            <Text style={styles.addButtonText}>Add Memory</Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRow}
        >
          <FilterChip
            active={activeFilter === null}
            color={colors.accentCyan}
            count={memories.length}
            label="All"
            onPress={() => setActiveFilter(null)}
          />
          {MEMORY_TYPE_OPTIONS.map((option) => (
            <FilterChip
              key={option.value}
              active={activeFilter === option.value}
              color={typeColors[option.value]}
              count={countByType[option.value]}
              label={option.label}
              onPress={() => setActiveFilter(activeFilter === option.value ? null : option.value)}
            />
          ))}
        </ScrollView>

        {isLoading && memories.length === 0 ? (
          <View style={styles.loadingCard}>
            <ActivityIndicator size="small" color={colors.accentCyan} />
            <Text style={styles.loadingText}>Loading memories</Text>
          </View>
        ) : null}

        {displayed.length === 0 && !isLoading ? (
          <View style={styles.emptyState}>
            <View style={styles.emptyIcon}>
              <SymbolView name="brain.head.profile" size={30} tintColor={colors.accentCyan} resizeMode="scaleAspectFit" />
            </View>
            <Text style={styles.emptyTitle}>
              {activeFilter ? `No ${MEMORY_TYPE_DETAILS[activeFilter].label} memories yet.` : "HELIOS doesn't have any memories yet."}
            </Text>
            <Text style={styles.emptyText}>
              {activeFilter
                ? "Try another type or teach HELIOS something new for this category."
                : "Start by teaching HELIOS your preferences, goals, routines, constraints, projects, or important facts."}
            </Text>
            <TouchableOpacity
              accessibilityRole="button"
              activeOpacity={0.84}
              onPress={() => setModalVisible(true)}
              style={styles.emptyButton}
            >
              <Text style={styles.emptyButtonText}>{activeFilter ? "Add Memory" : "Add First Memory"}</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {displayed.map((memory) => (
          <MemoryCard
            key={memory.id}
            memory={memory}
            onDelete={() => handleDelete(memory)}
          />
        ))}
      </ScrollView>

      <AddMemoryModal
        isMutating={isMutating}
        onClose={() => setModalVisible(false)}
        onSubmit={handleCreate}
        visible={modalVisible}
      />
    </>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      paddingHorizontal: spacing.md,
      gap: spacing.lg,
    },
    heroCard: {
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      padding: spacing.lg,
      gap: spacing.md,
    },
    heroTop: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: spacing.md,
    },
    heroLabel: {
      ...typography.label,
      color: colors.accentCyan,
      letterSpacing: 0,
      marginBottom: spacing.xs,
    },
    heroTitle: {
      ...typography.displaySmall,
      color: colors.textPrimary,
      lineHeight: 32,
    },
    heroSubtitle: {
      ...typography.body,
      color: colors.textSecondary,
      lineHeight: 22,
    },
    memoryCountBadge: {
      minWidth: 72,
      alignItems: "center",
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceDark,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.sm,
      flexShrink: 0,
    },
    memoryCount: {
      fontSize: 22,
      fontWeight: "900",
      color: colors.textPrimary,
    },
    memoryCountLabel: {
      fontSize: 10,
      color: colors.textMuted,
      fontWeight: "800",
    },
    trustCard: {
      minHeight: 48,
      flexDirection: "row",
      alignItems: "flex-start",
      gap: spacing.sm,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: "rgba(34,211,238,0.22)",
      backgroundColor: "rgba(34,211,238,0.07)",
      padding: spacing.md,
    },
    trustText: {
      ...typography.caption,
      flex: 1,
      color: colors.textSecondary,
      lineHeight: 18,
    },
    feedbackCard: {
      minHeight: 52,
      flexDirection: "row",
      alignItems: "flex-start",
      gap: spacing.sm,
      borderRadius: radius.md,
      borderWidth: 1,
      padding: spacing.md,
    },
    feedbackSuccess: {
      borderColor: "rgba(34,197,94,0.30)",
      backgroundColor: "rgba(34,197,94,0.10)",
    },
    feedbackError: {
      borderColor: "rgba(239,68,68,0.30)",
      backgroundColor: "rgba(239,68,68,0.10)",
    },
    feedbackText: {
      ...typography.caption,
      flex: 1,
      color: colors.textSecondary,
      lineHeight: 18,
    },
    sectionHeaderRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: spacing.md,
    },
    sectionTitle: {
      ...typography.title,
      color: colors.textPrimary,
      fontSize: 18,
    },
    sectionSubtitle: {
      ...typography.caption,
      color: colors.textMuted,
      lineHeight: 18,
      marginTop: 2,
    },
    addButton: {
      minHeight: 42,
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.xs,
      borderRadius: radius.sm,
      backgroundColor: colors.accent,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      flexShrink: 0,
    },
    addButtonText: {
      ...typography.label,
      color: colors.background,
      letterSpacing: 0,
    },
    filterRow: {
      flexDirection: "row",
      gap: spacing.sm,
      paddingRight: spacing.md,
    },
    filterChip: {
      minHeight: 38,
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.xs,
      borderRadius: radius.sm,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
    filterChipText: {
      ...typography.caption,
      color: colors.textSecondary,
      fontWeight: "800",
    },
    filterChipCount: {
      fontSize: 10,
      color: colors.textMuted,
      fontWeight: "900",
    },
    loadingCard: {
      minHeight: 82,
      alignItems: "center",
      justifyContent: "center",
      gap: spacing.sm,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    loadingText: {
      ...typography.caption,
      color: colors.textMuted,
      fontWeight: "700",
    },
    emptyState: {
      alignItems: "center",
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      padding: spacing.xl,
      gap: spacing.md,
    },
    emptyIcon: {
      width: 58,
      height: 58,
      borderRadius: 29,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: "rgba(34,211,238,0.26)",
      backgroundColor: "rgba(34,211,238,0.08)",
    },
    emptyTitle: {
      ...typography.title,
      color: colors.textPrimary,
      fontSize: 18,
      textAlign: "center",
      lineHeight: 23,
    },
    emptyText: {
      ...typography.body,
      color: colors.textSecondary,
      textAlign: "center",
      lineHeight: 22,
    },
    emptyButton: {
      minHeight: 42,
      justifyContent: "center",
      borderRadius: radius.sm,
      backgroundColor: colors.accent,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm,
    },
    emptyButtonText: {
      ...typography.label,
      color: colors.background,
      letterSpacing: 0,
    },
    memoryCard: {
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      padding: spacing.lg,
      gap: spacing.md,
    },
    memoryTop: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: spacing.md,
    },
    typeBadge: {
      minHeight: 30,
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.xs,
      borderRadius: radius.sm,
      borderWidth: 1,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs,
    },
    typeBadgeText: {
      ...typography.label,
      fontSize: 10,
      letterSpacing: 0,
    },
    deleteButton: {
      width: 36,
      height: 36,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 18,
      borderWidth: 1,
      borderColor: "rgba(239,68,68,0.22)",
      backgroundColor: "rgba(239,68,68,0.08)",
      flexShrink: 0,
    },
    memoryContent: {
      ...typography.body,
      color: colors.textPrimary,
      lineHeight: 23,
    },
    memoryMetaRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: spacing.sm,
    },
    memoryMeta: {
      ...typography.caption,
      color: colors.textMuted,
      fontSize: 11,
      lineHeight: 16,
    },
    overlay: {
      flex: 1,
      backgroundColor: colors.overlay,
    },
    modalWrapper: {
      ...StyleSheet.absoluteFillObject,
      justifyContent: "flex-end",
    },
    sheet: {
      maxHeight: "92%",
      borderTopLeftRadius: radius.xl,
      borderTopRightRadius: radius.xl,
      borderWidth: 1,
      borderColor: colors.primaryBorder,
      backgroundColor: colors.glassStrong,
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
      marginBottom: spacing.md,
    },
    sheetContent: {
      paddingHorizontal: spacing.lg,
      paddingBottom: spacing.xxl,
      gap: spacing.lg,
    },
    sheetHeader: {
      gap: spacing.xs,
    },
    sheetEyebrow: {
      ...typography.label,
      color: colors.accentCyan,
      letterSpacing: 0,
    },
    sheetTitle: {
      ...typography.title,
      color: colors.textPrimary,
      fontSize: 21,
      lineHeight: 26,
    },
    sheetSubtitle: {
      ...typography.body,
      color: colors.textSecondary,
      lineHeight: 22,
    },
    fieldGroup: {
      gap: spacing.sm,
    },
    fieldLabel: {
      ...typography.label,
      color: colors.textMuted,
      letterSpacing: 0,
    },
    typeGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: spacing.sm,
    },
    typeOption: {
      width: "48%",
      minHeight: 94,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      padding: spacing.md,
      gap: spacing.xs,
    },
    typeOptionTop: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.xs,
    },
    typeOptionTitle: {
      ...typography.caption,
      color: colors.textPrimary,
      fontWeight: "900",
      lineHeight: 18,
    },
    typeOptionDescription: {
      ...typography.caption,
      color: colors.textMuted,
      lineHeight: 17,
    },
    exampleCard: {
      minHeight: 58,
      flexDirection: "row",
      alignItems: "flex-start",
      gap: spacing.sm,
      borderRadius: radius.md,
      borderWidth: 1,
      backgroundColor: colors.surface,
      padding: spacing.md,
    },
    exampleText: {
      ...typography.caption,
      flex: 1,
      color: colors.textSecondary,
      lineHeight: 19,
      fontWeight: "600",
    },
    input: {
      minHeight: 118,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      color: colors.textPrimary,
      ...typography.body,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.md,
    },
    charCount: {
      ...typography.caption,
      color: colors.textMuted,
      fontSize: 11,
      textAlign: "right",
    },
    importanceRow: {
      flexDirection: "row",
      gap: spacing.sm,
    },
    importanceOption: {
      flex: 1,
      minHeight: 68,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      padding: spacing.md,
      gap: 3,
    },
    importanceOptionActive: {
      borderColor: colors.accentCyan,
      backgroundColor: "rgba(34,211,238,0.08)",
    },
    importanceTitle: {
      ...typography.caption,
      color: colors.textPrimary,
      fontWeight: "900",
    },
    importanceTitleActive: {
      color: colors.accentCyan,
    },
    importanceDescription: {
      ...typography.caption,
      color: colors.textMuted,
      lineHeight: 17,
    },
    successBox: {
      minHeight: 44,
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: "rgba(34,197,94,0.30)",
      backgroundColor: "rgba(34,197,94,0.10)",
      padding: spacing.md,
    },
    successText: {
      ...typography.caption,
      color: colors.textSecondary,
      fontWeight: "800",
    },
    formErrorBox: {
      minHeight: 44,
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: "rgba(239,68,68,0.30)",
      backgroundColor: "rgba(239,68,68,0.10)",
      padding: spacing.md,
    },
    formErrorText: {
      ...typography.caption,
      flex: 1,
      color: colors.textSecondary,
      lineHeight: 18,
    },
    sheetActions: {
      flexDirection: "row",
      gap: spacing.sm,
    },
    cancelButton: {
      flex: 1,
      minHeight: 46,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: radius.sm,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
    cancelButtonText: {
      ...typography.label,
      color: colors.textSecondary,
      letterSpacing: 0,
    },
    saveButton: {
      flex: 1.4,
      minHeight: 46,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: spacing.xs,
      borderRadius: radius.sm,
      backgroundColor: colors.accent,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
    saveButtonText: {
      ...typography.label,
      color: colors.background,
      letterSpacing: 0,
    },
    disabled: {
      opacity: 0.5,
    },
  });
}
