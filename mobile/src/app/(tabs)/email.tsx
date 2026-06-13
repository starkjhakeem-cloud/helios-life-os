import { useCallback, useEffect, useState, useMemo } from 'react';
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

import EmailCard from "../../components/EmailCard";
import Input from "../../components/ui/Input";
import Button from "../../components/ui/Button";
import { spacing, radius, typography , type ThemeColors } from "../../theme/theme";
import { useTheme } from "../../theme/ThemeContext";
import { useEmailStore, useAuthStore } from "../../store";
import type { EmailMessage, EmailMessageCreate, MessageImportance } from "../../store";

// ── Filter ────────────────────────────────────────────────────────────────────

type Filter = "ALL" | "UNREAD" | "IMPORTANT" | "ARCHIVED";
const FILTERS: Filter[] = ["ALL", "UNREAD", "IMPORTANT", "ARCHIVED"];

function applyFilter(messages: EmailMessage[], filter: Filter): EmailMessage[] {
  switch (filter) {
    case "UNREAD":    return messages.filter((m) => m.status === "unread");
    case "IMPORTANT": return messages.filter((m) => m.importance === "high" || m.importance === "urgent");
    case "ARCHIVED":  return messages.filter((m) => m.status === "archived");
    default:          return messages;
  }
}

// ── Form ──────────────────────────────────────────────────────────────────────

type FormState = {
  sender: string;
  subject: string;
  snippet: string;
  received_at: string;
  importance: MessageImportance;
};

function nowIso(): string {
  return new Date().toISOString().slice(0, 19) + "Z";
}

const EMPTY_FORM = (): FormState => ({
  sender: "",
  subject: "",
  snippet: "",
  received_at: nowIso(),
  importance: "normal",
});

const IMPORTANCE_OPTIONS: MessageImportance[] = ["low", "normal", "high", "urgent"];
const IMPORTANCE_COLOR: Record<string, string> = {
  low:    "#8490ab",
  normal: "#22d3ee",
  high:   "#f59e0b",
  urgent: "#ef4444",
};

// ── Screen ────────────────────────────────────────────────────────────────────

export default function EmailScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const accessToken = useAuthStore((s) => s.accessToken);
  const { messages, isLoading, isMutating, error, fetchMessages, createMessage, updateMessage, deleteMessage } =
    useEmailStore();

  const [filter, setFilter] = useState<Filter>("ALL");
  const [modalVisible, setModalVisible] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM());
  const [formError, setFormError] = useState<string | null>(null);

  const onRefresh = useCallback(() => {
    if (accessToken) fetchMessages(accessToken);
  }, [accessToken, fetchMessages]);

  useEffect(() => {
    if (accessToken) fetchMessages(accessToken);
  }, [accessToken, fetchMessages]);

  // ── Modal helpers ──

  function openCreate() {
    setForm(EMPTY_FORM());
    setFormError(null);
    setModalVisible(true);
  }

  function closeModal() {
    Keyboard.dismiss();
    setModalVisible(false);
  }

  // ── Submit ──

  async function handleSubmit() {
    if (!accessToken) return;

    if (!form.sender.trim()) {
      setFormError("Sender is required.");
      return;
    }
    if (!form.subject.trim()) {
      setFormError("Subject is required.");
      return;
    }
    if (!form.received_at.trim()) {
      setFormError("Received date is required (e.g. 2026-06-11T09:30:00Z).");
      return;
    }

    setFormError(null);

    const body: EmailMessageCreate = {
      sender:     form.sender.trim(),
      subject:    form.subject.trim(),
      snippet:    form.snippet.trim() || undefined,
      received_at: form.received_at.trim(),
      importance: form.importance,
    };

    await createMessage(accessToken, body);
    closeModal();
  }

  // ── Quick actions ──

  function handleToggleRead(message: EmailMessage) {
    if (!accessToken) return;
    const nextStatus = message.status === "unread" ? "read" : "unread";
    updateMessage(accessToken, message.id, { status: nextStatus });
  }

  function handleArchive(messageId: string) {
    if (!accessToken) return;
    updateMessage(accessToken, messageId, { status: "archived" });
  }

  function handleDelete(messageId: string) {
    if (accessToken) deleteMessage(accessToken, messageId);
  }

  // ── Filtered list ──

  const filtered = applyFilter(messages, filter);

  const unreadCount    = messages.filter((m) => m.status === "unread").length;
  const importantCount = messages.filter((m) => m.importance === "high" || m.importance === "urgent").length;

  return (
    <>
      <ScrollView
        style={{ backgroundColor: "#020617" }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.container, { paddingTop: insets.top + spacing.md }]}
        refreshControl={
          <RefreshControl
            refreshing={isLoading}
            onRefresh={onRefresh}
            tintColor={"#22d3ee"}
          />
        }
      >
        {/* ── Hero ── */}
        <View style={styles.heroCard}>
          <Text style={styles.heroLabel}>HELIOS INBOX</Text>
          <Text style={styles.heroTitle}>Messages</Text>
          <Text style={styles.heroSubtitle}>
            {messages.length === 0
              ? "No messages yet. Add your first message."
              : `${unreadCount} unread · ${importantCount} important · ${messages.length} total`}
          </Text>
        </View>

        {/* ── Toolbar: filter chips + add button ── */}
        <View style={styles.toolbarRow}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
            {FILTERS.map((f) => (
              <TouchableOpacity
                key={f}
                style={[styles.chip, filter === f && styles.chipActive]}
                onPress={() => setFilter(f)}
              >
                <Text style={[styles.chipText, filter === f && styles.chipTextActive]}>{f}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <View style={styles.toolbarRight}>
            {(isLoading || isMutating) ? (
              <ActivityIndicator size="small" color={"#22d3ee"} />
            ) : null}
            <TouchableOpacity style={styles.addButton} onPress={openCreate}>
              <Text style={styles.addButtonText}>+ NEW</Text>
            </TouchableOpacity>
          </View>
        </View>

        {error ? (
          <Text style={styles.errorText}>{error}</Text>
        ) : null}

        {/* ── Empty state ── */}
        {messages.length === 0 && !isLoading ? (
          <View style={styles.emptyState}>
            <SymbolView
              name="envelope"
              size={36}
              tintColor={"#8490ab"}
              resizeMode="scaleAspectFit"
            />
            <Text style={styles.emptyTitle}>No messages</Text>
            <Text style={styles.emptyText}>
              Manually log important messages here. HELIOS will surface urgent and high-priority messages in your daily briefing.
            </Text>
            <TouchableOpacity style={styles.emptyAddButton} onPress={openCreate}>
              <Text style={styles.emptyAddText}>+ ADD FIRST MESSAGE</Text>
            </TouchableOpacity>
          </View>
        ) : filtered.length === 0 ? (
          <View style={styles.emptyFilter}>
            <Text style={styles.emptyFilterText}>No {filter.toLowerCase()} messages.</Text>
          </View>
        ) : null}

        {/* ── Message list ── */}
        {filtered.map((message) => (
          <EmailCard
            key={message.id}
            message={message}
            onToggleRead={handleToggleRead}
            onArchive={handleArchive}
            onDelete={handleDelete}
          />
        ))}
      </ScrollView>

      {/* ── Create modal ── */}
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
            <Text style={styles.sheetTitle}>NEW MESSAGE</Text>

            <Input
              label="FROM (SENDER)"
              placeholder="e.g. alice@example.com"
              value={form.sender}
              onChangeText={(t) => setForm((f) => ({ ...f, sender: t }))}
              error={formError ?? undefined}
              autoFocus
            />

            <Input
              label="SUBJECT"
              placeholder="e.g. Q3 Review — Action Required"
              value={form.subject}
              onChangeText={(t) => setForm((f) => ({ ...f, subject: t }))}
            />

            <Input
              label="SNIPPET (PREVIEW)"
              placeholder="Optional brief preview of the message body"
              value={form.snippet}
              onChangeText={(t) => setForm((f) => ({ ...f, snippet: t }))}
              multiline
              style={styles.multiline}
            />

            <Input
              label="RECEIVED AT (ISO 8601)"
              placeholder="e.g. 2026-06-11T09:30:00Z"
              value={form.received_at}
              onChangeText={(t) => setForm((f) => ({ ...f, received_at: t }))}
            />

            {/* Importance picker */}
            <Text style={styles.pickerLabel}>IMPORTANCE</Text>
            <View style={styles.importanceRow}>
              {IMPORTANCE_OPTIONS.map((opt) => (
                <TouchableOpacity
                  key={opt}
                  style={[
                    styles.importanceChip,
                    { borderColor: IMPORTANCE_COLOR[opt] },
                    form.importance === opt && { backgroundColor: `${IMPORTANCE_COLOR[opt]}20` },
                  ]}
                  onPress={() => setForm((f) => ({ ...f, importance: opt }))}
                >
                  <Text
                    style={[
                      styles.importanceChipText,
                      { color: IMPORTANCE_COLOR[opt] },
                    ]}
                  >
                    {opt.toUpperCase()}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.sheetActions}>
              <Button label="CANCEL" variant="secondary" onPress={closeModal} />
              <Button label="ADD" onPress={handleSubmit} loading={isMutating} />
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
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

  toolbarRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: spacing.md,
    gap: spacing.sm,
  },

  chipScroll: {
    flex: 1,
  },

  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    marginRight: spacing.xs,
  },

  chipActive: {
    backgroundColor: `${colors.accent}20`,
    borderColor: colors.accent,
  },

  chipText: {
    ...typography.label,
    color: colors.textMuted,
    fontSize: 11,
  },

  chipTextActive: {
    color: colors.accent,
  },

  toolbarRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    flexShrink: 0,
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

  emptyTitle: {
    ...typography.title,
    color: colors.textPrimary,
    fontSize: 17,
  },

  emptyText: {
    ...typography.body,
    color: colors.textMuted,
    textAlign: "center",
  },

  emptyAddButton: {
    backgroundColor: colors.accent,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    marginTop: spacing.xs,
  },

  emptyAddText: {
    ...typography.label,
    color: colors.textPrimary,
  },

  emptyFilter: {
    padding: spacing.xl,
    alignItems: "center",
  },

  emptyFilterText: {
    ...typography.body,
    color: colors.textMuted,
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
    height: 56,
    textAlignVertical: "top",
  },

  pickerLabel: {
    ...typography.label,
    color: colors.textMuted,
    fontSize: 10,
    marginBottom: spacing.xs,
    marginTop: spacing.xs,
  },

  importanceRow: {
    flexDirection: "row",
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },

  importanceChip: {
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    flex: 1,
    alignItems: "center",
  },

  importanceChipText: {
    ...typography.label,
    fontSize: 9,
  },

  sheetActions: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.md,
  },
});
}
