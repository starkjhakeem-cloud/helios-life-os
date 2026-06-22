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

import EventCard from "../../components/EventCard";
import Input from "../../components/ui/Input";
import Button from "../../components/ui/Button";
import { spacing, radius, typography , type ThemeColors } from "../../theme/theme";
import { useTheme } from "../../theme/ThemeContext";
import { useCalendarStore, useAuthStore } from "../../store";
import type { CalendarEvent, CalendarEventCreate } from "../../store";

// ── Form ──────────────────────────────────────────────────────────────────────

type FormState = {
  title: string;
  description: string;
  start_time: string;
  end_time: string;
  location: string;
};

const EMPTY_FORM: FormState = {
  title: "",
  description: "",
  start_time: "",
  end_time: "",
  location: "",
};

// Pre-format "now + 1h" and "now + 2h" as a helpful default for new events.
function defaultTimes(): Pick<FormState, "start_time" | "end_time"> {
  const now = new Date();
  now.setMinutes(0, 0, 0);
  const start = new Date(now.getTime() + 60 * 60 * 1000);
  const end   = new Date(now.getTime() + 2 * 60 * 60 * 1000);
  const fmt = (d: Date) => d.toISOString().slice(0, 16); // "2026-06-11T10:00"
  return { start_time: fmt(start), end_time: fmt(end) };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function nowIso(): string {
  return new Date().toISOString();
}

function isUpcoming(event: CalendarEvent): boolean {
  return event.start_time >= nowIso().slice(0, 19);
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function CalendarScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const accessToken = useAuthStore((s) => s.accessToken);
  const { events, isLoading, isMutating, error, fetchEvents, createEvent, updateEvent, deleteEvent } =
    useCalendarStore();

  const [modalVisible, setModalVisible] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);

  const onRefresh = useCallback(() => {
    if (accessToken) fetchEvents(accessToken);
  }, [accessToken, fetchEvents]);

  useEffect(() => {
    if (accessToken) fetchEvents(accessToken);
  }, [accessToken, fetchEvents]);

  // ── Modal helpers ──

  function openCreate() {
    setEditingEvent(null);
    setForm({ ...EMPTY_FORM, ...defaultTimes() });
    setFormError(null);
    setModalVisible(true);
  }

  function openEdit(event: CalendarEvent) {
    setEditingEvent(event);
    setForm({
      title:       event.title,
      description: event.description ?? "",
      start_time:  event.start_time.slice(0, 16),  // trim seconds+Z for input
      end_time:    event.end_time.slice(0, 16),
      location:    event.location ?? "",
    });
    setFormError(null);
    setModalVisible(true);
  }

  function closeModal() {
    Keyboard.dismiss();
    setModalVisible(false);
    setEditingEvent(null);
  }

  // ── Submit ──

  async function handleSubmit() {
    if (!accessToken) return;

    if (!form.title.trim()) {
      setFormError("Event title is required.");
      return;
    }
    if (!form.start_time.trim() || !form.end_time.trim()) {
      setFormError("Start and end time are required (e.g. 2026-06-11T10:00).");
      return;
    }

    setFormError(null);

    // Append ":00Z" if user typed a bare "YYYY-MM-DDTHH:MM" without seconds/tz.
    const normalise = (t: string) => {
      const s = t.trim();
      if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s)) return `${s}:00Z`;
      return s;
    };

    const body: CalendarEventCreate = {
      title:       form.title.trim(),
      description: form.description.trim() || undefined,
      start_time:  normalise(form.start_time),
      end_time:    normalise(form.end_time),
      location:    form.location.trim() || undefined,
    };

    if (editingEvent) {
      await updateEvent(accessToken, editingEvent.id, body);
    } else {
      await createEvent(accessToken, body);
    }

    closeModal();
  }

  function handleDelete(eventId: string) {
    if (accessToken) deleteEvent(accessToken, eventId);
  }

  // ── Partition into upcoming / past ──

  const upcoming = events.filter(isUpcoming);
  const past     = events.filter((e) => !isUpcoming(e));

  return (
    <>
      <ScrollView
        style={{ backgroundColor: colors.background }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.container, { paddingTop: insets.top + spacing.md }]}
        refreshControl={
          <RefreshControl
            refreshing={isLoading}
            onRefresh={onRefresh}
            tintColor={colors.accentCyan}
          />
        }
      >
        {/* ── Hero ── */}
        <View style={styles.heroCard}>
          <Text style={styles.heroLabel}>HELIOS CALENDAR</Text>
          <Text style={styles.heroTitle}>Event Timeline</Text>
          <Text style={styles.heroSubtitle}>
            {events.length === 0
              ? "No events yet. Add your first calendar event."
              : `${upcoming.length} upcoming · ${past.length} past`}
          </Text>
        </View>

        {/* ── Upcoming header ── */}
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionLabel}>UPCOMING</Text>
          <View style={styles.headerRight}>
            {(isLoading || isMutating) ? (
              <ActivityIndicator size="small" color={colors.accentCyan} />
            ) : null}
            <TouchableOpacity style={styles.addButton} onPress={openCreate}>
              <Text style={styles.addButtonText}>+ NEW EVENT</Text>
            </TouchableOpacity>
          </View>
        </View>

        {error ? (
          <Text style={styles.errorText}>{error}</Text>
        ) : null}

        {/* Empty state */}
        {events.length === 0 && !isLoading ? (
          <View style={styles.emptyState}>
            <SymbolView
              name="calendar"
              size={36}
              tintColor={colors.textMuted}
              resizeMode="scaleAspectFit"
            />
            <Text style={styles.emptyTitle}>No events scheduled</Text>
            <Text style={styles.emptyText}>
              Add upcoming meetings, deadlines, or milestones to keep HELIOS briefings context-aware.
            </Text>
            <TouchableOpacity style={styles.emptyAddButton} onPress={openCreate}>
              <Text style={styles.emptyAddText}>+ ADD FIRST EVENT</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {upcoming.map((event) => (
          <EventCard
            key={event.id}
            event={event}
            onEdit={openEdit}
            onDelete={handleDelete}
          />
        ))}

        {/* Past events */}
        {past.length > 0 ? (
          <>
            <Text style={[styles.sectionLabel, styles.sectionLabelSpaced]}>PAST</Text>
            {past.map((event) => (
              <EventCard
                key={event.id}
                event={event}
                onDelete={handleDelete}
              />
            ))}
          </>
        ) : null}
      </ScrollView>

      {/* ── Create / Edit modal ── */}
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
            <Text style={styles.sheetTitle}>
              {editingEvent ? "EDIT EVENT" : "NEW EVENT"}
            </Text>

            <Input
              label="TITLE"
              placeholder="e.g. Team standup"
              value={form.title}
              onChangeText={(t) => setForm((f) => ({ ...f, title: t }))}
              error={formError ?? undefined}
              autoFocus
            />

            <Input
              label="START TIME"
              placeholder="e.g. 2026-06-11T10:00"
              value={form.start_time}
              onChangeText={(t) => setForm((f) => ({ ...f, start_time: t }))}
            />

            <Input
              label="END TIME"
              placeholder="e.g. 2026-06-11T11:00"
              value={form.end_time}
              onChangeText={(t) => setForm((f) => ({ ...f, end_time: t }))}
            />

            <Input
              label="LOCATION"
              placeholder="e.g. Conference Room B (optional)"
              value={form.location}
              onChangeText={(t) => setForm((f) => ({ ...f, location: t }))}
            />

            <Input
              label="DESCRIPTION"
              placeholder="Optional notes or agenda"
              value={form.description}
              onChangeText={(t) => setForm((f) => ({ ...f, description: t }))}
              multiline
              style={styles.multiline}
            />

            <View style={styles.sheetActions}>
              <Button label="CANCEL" variant="secondary" onPress={closeModal} />
              <Button
                label={editingEvent ? "SAVE" : "CREATE"}
                onPress={handleSubmit}
                loading={isMutating}
              />
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
    marginTop: spacing.lg,
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
    color: colors.danger,
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

  // Modal
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
    height: 64,
    textAlignVertical: "top",
  },

  sheetActions: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.md,
  },
});
}
