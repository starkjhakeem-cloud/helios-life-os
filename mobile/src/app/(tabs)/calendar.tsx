import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
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
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SymbolView } from "expo-symbols";

import Button from "../../components/ui/Button";
import Input from "../../components/ui/Input";
import { radius, spacing, typography, type ThemeColors } from "../../theme/theme";
import { useTheme } from "../../theme/ThemeContext";
import { useAuthStore, useCalendarStore, useTasksStore } from "../../store";
import type { CalendarEvent, CalendarEventCreate } from "../../store";
import type { Task } from "../../services/tasksService";

type FormState = {
  title: string;
  description: string;
  start_time: string;
  end_time: string;
  location: string;
};

type TimelineItem =
  | { type: "event"; event: CalendarEvent }
  | { type: "task"; task: Task; time: Date }
  | { type: "free"; start: Date; end: Date; minutes: number };

type Insight = {
  label: string;
  value: string;
  note: string;
  tone: "amber" | "cyan" | "green" | "purple";
};

type WeekDay = {
  count: number;
  date: Date;
  isToday: boolean;
  workload: number;
};

const EMPTY_FORM: FormState = {
  title: "",
  description: "",
  start_time: "",
  end_time: "",
  location: "",
};

function defaultTimes(): Pick<FormState, "start_time" | "end_time"> {
  const now = new Date();
  now.setMinutes(0, 0, 0);
  const start = new Date(now.getTime() + 60 * 60 * 1000);
  const end = new Date(now.getTime() + 2 * 60 * 60 * 1000);
  const fmt = (d: Date) => d.toISOString().slice(0, 16);
  return { start_time: fmt(start), end_time: fmt(end) };
}

function startOfLocalDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfLocalDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

function isSameLocalDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}

function minutesBetween(start: Date, end: Date): number {
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000));
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
}

function formatDuration(minutes: number): string {
  const safe = Math.max(0, minutes);
  const h = Math.floor(safe / 60);
  const m = safe % 60;
  if (h <= 0) return `${m} min`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function formatLongDuration(minutes: number): string {
  const safe = Math.max(0, minutes);
  const h = Math.floor(safe / 60);
  const m = safe % 60;
  if (h <= 0) return `${m} minutes`;
  if (m === 0) return `${h} ${h === 1 ? "hour" : "hours"}`;
  return `${h} ${h === 1 ? "hour" : "hours"} ${m} minutes`;
}

function getGreeting(date: Date): string {
  const hour = date.getHours();
  if (hour < 12) return "Good morning, Mr. Stark.";
  if (hour < 17) return "Good afternoon, Mr. Stark.";
  return "Good evening, Mr. Stark.";
}

function sourceLabel(source: CalendarEvent["source"]): string {
  if (source === "google") return "Google Calendar";
  if (source === "outlook") return "Outlook";
  if (source === "ical") return "Apple Calendar";
  return "Calendar";
}

function isTaskOpen(task: Task): boolean {
  return !["done", "completed", "archived", "deleted", "cancelled"].includes(task.status.toLowerCase());
}

function isTaskPlannedToday(task: Task, today: Date): boolean {
  if (!isTaskOpen(task) || !task.due_date) return false;
  return isSameLocalDay(new Date(task.due_date), today);
}

function toneColor(tone: Insight["tone"], colors: ThemeColors): string {
  if (tone === "cyan") return colors.accentCyan;
  if (tone === "green") return colors.success;
  if (tone === "amber") return colors.warning;
  return colors.accent;
}

export default function CalendarScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const accessToken = useAuthStore((s) => s.accessToken);
  const { events, isLoading, isMutating, error, fetchEvents, createEvent, updateEvent, deleteEvent } = useCalendarStore();
  const { tasks, fetchTasks } = useTasksStore();

  const [modalVisible, setModalVisible] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);

  const onRefresh = useCallback(() => {
    if (!accessToken) return;
    fetchEvents(accessToken);
    fetchTasks(accessToken);
  }, [accessToken, fetchEvents, fetchTasks]);

  useEffect(() => {
    if (!accessToken) return;
    fetchEvents(accessToken);
    fetchTasks(accessToken);
  }, [accessToken, fetchEvents, fetchTasks]);

  function openCreate() {
    setEditingEvent(null);
    setForm({ ...EMPTY_FORM, ...defaultTimes() });
    setFormError(null);
    setModalVisible(true);
  }

  function openEdit(event: CalendarEvent) {
    setEditingEvent(event);
    setForm({
      title: event.title,
      description: event.description ?? "",
      start_time: event.start_time.slice(0, 16),
      end_time: event.end_time.slice(0, 16),
      location: event.location ?? "",
    });
    setFormError(null);
    setModalVisible(true);
  }

  function closeModal() {
    Keyboard.dismiss();
    setModalVisible(false);
    setEditingEvent(null);
  }

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
    const normalise = (t: string) => {
      const s = t.trim();
      if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s)) return `${s}:00Z`;
      return s;
    };

    const body: CalendarEventCreate = {
      title: form.title.trim(),
      description: form.description.trim() || undefined,
      start_time: normalise(form.start_time),
      end_time: normalise(form.end_time),
      location: form.location.trim() || undefined,
    };

    if (editingEvent) await updateEvent(accessToken, editingEvent.id, body);
    else await createEvent(accessToken, body);
    closeModal();
  }

  function handleDelete(eventId: string) {
    if (accessToken) deleteEvent(accessToken, eventId);
  }

  const today = useMemo(() => new Date(), []);
  const dayStart = useMemo(() => startOfLocalDay(today), [today]);
  const dayEnd = useMemo(() => endOfLocalDay(today), [today]);

  const todayEvents = useMemo(() => (
    events
      .filter((event) => isSameLocalDay(new Date(event.start_time), today))
      .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())
  ), [events, today]);

  const todayTasks = useMemo(() => tasks.filter((task) => isTaskPlannedToday(task, today)), [tasks, today]);

  const freeBlocks = useMemo(() => {
    const blocks: { start: Date; end: Date; minutes: number }[] = [];
    let cursor = new Date(Math.max(dayStart.getTime(), new Date().getTime()));

    todayEvents.forEach((event) => {
      const start = new Date(event.start_time);
      const end = new Date(event.end_time);
      const gap = minutesBetween(cursor, start);
      if (gap >= 45) blocks.push({ start: cursor, end: start, minutes: gap });
      if (end > cursor) cursor = end;
    });

    const finalGap = minutesBetween(cursor, dayEnd);
    if (finalGap >= 45) blocks.push({ start: cursor, end: dayEnd, minutes: finalGap });
    return blocks;
  }, [dayEnd, dayStart, todayEvents]);

  const totalScheduledMinutes = todayEvents.reduce(
    (sum, event) => sum + minutesBetween(new Date(event.start_time), new Date(event.end_time)),
    0,
  );
  const focusBlocks = freeBlocks.filter((block) => block.minutes >= 90);
  const totalFreeMinutes = freeBlocks.reduce((sum, block) => sum + block.minutes, 0);
  const focusMinutes = focusBlocks.reduce((sum, block) => sum + Math.min(block.minutes, 150), 0);
  const meetingMinutes = Math.max(0, totalScheduledMinutes - focusMinutes);
  const personalMinutes = Math.min(180, Math.max(60, 24 * 60 - totalScheduledMinutes - totalFreeMinutes));
  const longestFreeBlock = freeBlocks.reduce(
    (best, block) => block.minutes > best.minutes ? block : best,
    { start: dayStart, end: dayStart, minutes: 0 },
  );

  const weekDays = useMemo<WeekDay[]>(() => {
    const start = new Date(dayStart);
    start.setDate(dayStart.getDate() - ((dayStart.getDay() + 6) % 7));
    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      const count = events.filter((event) => isSameLocalDay(new Date(event.start_time), date)).length;
      return { date, count, workload: Math.min(3, Math.max(1, count)), isToday: isSameLocalDay(date, today) };
    });
  }, [dayStart, events, today]);

  const timelineItems = useMemo<TimelineItem[]>(() => {
    const items: TimelineItem[] = [];
    const primaryTask = todayTasks[0];
    let taskInserted = false;

    todayEvents.forEach((event, index) => {
      items.push({ type: "event", event });
      const nextEvent = todayEvents[index + 1];
      const start = new Date(event.end_time);
      const end = nextEvent ? new Date(nextEvent.start_time) : dayEnd;
      const gap = minutesBetween(start, end);
      if (gap >= 45) {
        items.push({ type: "free", start, end, minutes: gap });
        if (primaryTask && !taskInserted) {
          items.push({ type: "task", task: primaryTask, time: new Date(start.getTime() + 15 * 60000) });
          taskInserted = true;
        }
      }
    });

    if (todayEvents.length === 0) {
      if (primaryTask) {
        const taskTime = new Date(today);
        taskTime.setHours(11, 0, 0, 0);
        items.push({ type: "task", task: primaryTask, time: taskTime });
      }
      const remaining = minutesBetween(new Date(), dayEnd);
      if (remaining > 0) items.push({ type: "free", start: new Date(), end: dayEnd, minutes: remaining });
    }

    return items;
  }, [dayEnd, today, todayEvents, todayTasks]);

  const insights: Insight[] = [
    {
      label: "Best Focus Window",
      value: longestFreeBlock.minutes > 0 ? `${formatTime(longestFreeBlock.start)} – ${formatTime(longestFreeBlock.end)}` : "After your next reset",
      note: longestFreeBlock.minutes > 0 ? "Best available deep-work window." : "HELIOS will look for a quieter block.",
      tone: "cyan",
    },
    {
      label: "Longest Free Block",
      value: longestFreeBlock.minutes > 0 ? formatLongDuration(longestFreeBlock.minutes) : "None detected",
      note: longestFreeBlock.minutes >= 90 ? "Enough time for meaningful progress." : "Keep transitions lightweight.",
      tone: "purple",
    },
    {
      label: "Busy Period",
      value: todayEvents.length > 0
        ? `${formatTime(new Date(todayEvents[0].start_time))} – ${formatTime(new Date(todayEvents[todayEvents.length - 1].end_time))}`
        : "Open day",
      note: todayEvents.length > 0 ? "Protect your energy between commitments." : "No event pressure detected.",
      tone: "amber",
    },
    {
      label: "Energy Recommendation",
      value: longestFreeBlock.minutes >= 90 ? "Deep work" : "Light planning",
      note: longestFreeBlock.minutes >= 90 ? "Great time for HELIOS development." : "Use the day to organize next actions.",
      tone: "green",
    },
  ];

  return (
    <>
      <ScrollView
        style={{ backgroundColor: colors.background }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.container,
          { paddingTop: insets.top + spacing.md, paddingBottom: insets.bottom + 116 },
        ]}
        refreshControl={
          <RefreshControl refreshing={isLoading} onRefresh={onRefresh} tintColor={colors.accentCyan} />
        }
      >
        <View style={styles.heroCard}>
          <View style={styles.heroTopRow}>
            <Text style={styles.heroLabel}>TODAY</Text>
            {(isLoading || isMutating) ? <ActivityIndicator size="small" color={colors.accentCyan} /> : null}
          </View>
          <Text style={styles.heroDate}>
            {today.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
          </Text>
          <Text style={styles.heroGreeting}>{getGreeting(today)}</Text>
          <Text style={styles.summaryTitle}>{"Today's Summary"}</Text>
          <View style={styles.summaryGrid}>
            <SummaryDot label={`${todayEvents.length} scheduled ${todayEvents.length === 1 ? "event" : "events"}`} colors={colors} />
            <SummaryDot label={`${focusBlocks.length} focus ${focusBlocks.length === 1 ? "block" : "blocks"}`} colors={colors} />
            <SummaryDot label={`${todayTasks.length} ${todayTasks.length === 1 ? "task" : "tasks"} planned`} colors={colors} />
            <SummaryDot label={`${formatLongDuration(totalFreeMinutes)} of free time`} colors={colors} />
          </View>
          <AllocationBar
            colors={colors}
            segments={[
              { label: "Meetings", value: meetingMinutes, color: colors.accent },
              { label: "Focus", value: focusMinutes, color: colors.accentCyan },
              { label: "Personal", value: personalMinutes, color: colors.info },
              { label: "Free", value: Math.max(0, totalFreeMinutes - focusMinutes), color: colors.success },
            ]}
          />
        </View>

        <WeekStrip days={weekDays} colors={colors} />

        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionLabel}>{"TODAY'S TIMELINE"}</Text>
          <TouchableOpacity style={styles.addButton} onPress={openCreate}>
            <Text style={styles.addButtonText}>+ ADD</Text>
          </TouchableOpacity>
        </View>

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        {todayEvents.length === 0 && !isLoading ? (
          <OpenDayState onCreate={openCreate} colors={colors} styles={styles} />
        ) : null}

        {timelineItems.map((item, index) => (
          <TimelineBlock
            key={`${item.type}-${index}`}
            item={item}
            colors={colors}
            styles={styles}
            onEdit={openEdit}
            onDelete={handleDelete}
          />
        ))}

        <View style={styles.suggestionCard}>
          <View style={styles.suggestionTop}>
            <Text style={styles.suggestionLabel}>HELIOS SUGGESTION</Text>
            <SymbolView name="sparkles" size={15} tintColor={colors.accent} resizeMode="scaleAspectFit" />
          </View>
          <Text style={styles.suggestionTitle}>
            {longestFreeBlock.minutes >= 90
              ? `You have ${formatLongDuration(longestFreeBlock.minutes)} available today.`
              : "Your schedule has room for a focused reset."}
          </Text>
          <Text style={styles.suggestionText}>
            Recommended: {todayTasks[0]?.title ?? "Continue HELIOS Development"}
          </Text>
          <View style={styles.suggestionActions}>
            <TouchableOpacity style={styles.scheduleButton} onPress={openCreate}>
              <Text style={styles.scheduleButtonText}>Schedule It</Text>
            </TouchableOpacity>
            <Text style={styles.dismissText}>Dismiss</Text>
          </View>
        </View>

        <Text style={[styles.sectionLabel, styles.sectionLabelSpaced]}>{"TODAY'S INSIGHTS"}</Text>
        <View style={styles.insightGrid}>
          {insights.map((insight) => (
            <InsightCard key={insight.label} insight={insight} colors={colors} styles={styles} />
          ))}
        </View>

        <Text style={[styles.sectionLabel, styles.sectionLabelSpaced]}>CONNECTED CALENDARS</Text>
        <View style={styles.connectedCard}>
          <ConnectedCalendarRow name="Google Calendar" status="Connected" active colors={colors} styles={styles} />
          <ConnectedCalendarRow name="Apple Calendar" status="Connected" active colors={colors} styles={styles} />
          <ConnectedCalendarRow name="Outlook" status="Not Connected" colors={colors} styles={styles} />
        </View>
      </ScrollView>

      <Modal visible={modalVisible} animationType="slide" transparent onRequestClose={closeModal}>
        <TouchableWithoutFeedback onPress={closeModal}>
          <View style={styles.overlay} />
        </TouchableWithoutFeedback>

        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.modalWrapper}
        >
          <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>{editingEvent ? "EDIT EVENT" : "NEW EVENT"}</Text>

            <Input
              label="TITLE"
              placeholder="e.g. Study D278"
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
              placeholder="e.g. Library, gym, Zoom"
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
              <Button label={editingEvent ? "SAVE" : "CREATE"} onPress={handleSubmit} loading={isMutating} />
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

function SummaryDot({ label, colors }: { label: string; colors: ThemeColors }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, width: "48%" }}>
      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.accentCyan }} />
      <Text style={{ ...typography.caption, color: colors.textSecondary, flex: 1 }}>{label}</Text>
    </View>
  );
}

function AllocationBar({
  colors,
  segments,
}: {
  colors: ThemeColors;
  segments: { color: string; label: string; value: number }[];
}) {
  const total = Math.max(1, segments.reduce((sum, segment) => sum + segment.value, 0));
  return (
    <View style={{ marginTop: spacing.lg }}>
      <View style={{ flexDirection: "row", height: 8, borderRadius: 4, overflow: "hidden", backgroundColor: colors.surfaceDark }}>
        {segments.map((segment) => (
          <View
            key={segment.label}
            style={{ width: `${Math.max(5, (segment.value / total) * 100)}%`, backgroundColor: segment.color }}
          />
        ))}
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: spacing.sm }}>
        {segments.map((segment) => (
          <View key={segment.label} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: segment.color }} />
            <Text style={{ ...typography.caption, color: colors.textMuted }}>{segment.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function WeekStrip({ days, colors }: { days: WeekDay[]; colors: ThemeColors }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm, paddingRight: spacing.lg }}>
      {days.map((day) => (
        <View
          key={day.date.toISOString()}
          style={{
            width: 62,
            borderRadius: radius.lg,
            borderWidth: 1,
            borderColor: day.isToday ? colors.accent : colors.border,
            backgroundColor: day.isToday ? "rgba(168,85,247,0.14)" : colors.surface,
            padding: spacing.sm,
            alignItems: "center",
            gap: 7,
          }}
        >
          <Text style={{ ...typography.label, color: day.isToday ? colors.accent : colors.textMuted }}>
            {day.date.toLocaleDateString("en-US", { weekday: "short" }).toUpperCase()}
          </Text>
          <Text style={{ color: colors.textPrimary, fontSize: 18, fontWeight: "800" }}>{day.date.getDate()}</Text>
          <View style={{ flexDirection: "row", gap: 3 }}>
            {Array.from({ length: day.workload }).map((_, index) => (
              <View
                key={index}
                style={{
                  width: 4,
                  height: 4,
                  borderRadius: 2,
                  backgroundColor: day.count > 0 ? colors.accentCyan : colors.border,
                }}
              />
            ))}
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

function OpenDayState({
  colors,
  onCreate,
  styles,
}: {
  colors: ThemeColors;
  onCreate: () => void;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <View style={styles.emptyState}>
      <Text style={styles.emptyTitle}>Your schedule is completely open today.</Text>
      <Text style={styles.emptyText}>This is a great opportunity to focus on meaningful work.</Text>
      <View style={styles.emptySuggestions}>
        {["Continue D278", "Resume HELIOS Development", "Exercise"].map((item) => (
          <Text key={item} style={styles.emptySuggestion}>• {item}</Text>
        ))}
      </View>
      <TouchableOpacity style={styles.emptyAddButton} onPress={onCreate}>
        <Text style={styles.emptyAddText}>Build My Day</Text>
      </TouchableOpacity>
      <SymbolView name="sparkles" size={18} tintColor={colors.accent} resizeMode="scaleAspectFit" />
    </View>
  );
}

function TimelineBlock({
  colors,
  item,
  onDelete,
  onEdit,
  styles,
}: {
  colors: ThemeColors;
  item: TimelineItem;
  onDelete: (id: string) => void;
  onEdit: (event: CalendarEvent) => void;
  styles: ReturnType<typeof createStyles>;
}) {
  if (item.type === "free") {
    return (
      <View style={styles.timelineRow}>
        <Text style={styles.timelineTime}>{formatTime(item.start)}</Text>
        <View style={styles.timelineLine}>
          <View style={[styles.timelineDot, { backgroundColor: colors.success }]} />
        </View>
        <View style={styles.freeCard}>
          <Text style={styles.freeLabel}>Available</Text>
          <Text style={styles.freeDuration}>{formatLongDuration(item.minutes)}</Text>
          <Text style={styles.freeSub}>Suggested</Text>
          <Text style={styles.freeSuggestion}>Resume HELIOS Development</Text>
          <Text style={styles.freeSuggestion}>Continue D278</Text>
          <Text style={styles.freeSuggestion}>Workout</Text>
          <TouchableOpacity style={styles.scheduleButton}>
            <Text style={styles.scheduleButtonText}>Schedule This Time</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (item.type === "task") {
    return (
      <View style={styles.timelineRow}>
        <Text style={styles.timelineTime}>{formatTime(item.time)}</Text>
        <View style={styles.timelineLine}>
          <View style={[styles.timelineDot, { backgroundColor: colors.accent }]} />
        </View>
        <View style={styles.timelineCard}>
          <Text style={styles.timelineTitle}>{item.task.title}</Text>
          <Text style={styles.timelineMeta}>Task</Text>
          <Text style={styles.timelineDetail}>Estimated: 45 minutes</Text>
        </View>
      </View>
    );
  }

  const start = new Date(item.event.start_time);
  const end = new Date(item.event.end_time);
  const isComplete = end < new Date();
  return (
    <TouchableOpacity style={styles.timelineRow} activeOpacity={0.82} onPress={() => onEdit(item.event)}>
      <Text style={styles.timelineTime}>{formatTime(start)}</Text>
      <View style={styles.timelineLine}>
        <View style={[styles.timelineDot, { backgroundColor: isComplete ? colors.textMuted : colors.accentCyan }]} />
      </View>
      <View style={styles.timelineCard}>
        <View style={styles.timelineTop}>
          <Text style={styles.timelineTitle}>{item.event.title}</Text>
          <TouchableOpacity onPress={() => onDelete(item.event.id)} hitSlop={10}>
            <Text style={styles.deleteText}>Delete</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.timelineMeta}>{isComplete ? "Completed" : sourceLabel(item.event.source)}</Text>
        <Text style={styles.timelineDetail}>{formatDuration(minutesBetween(start, end))}</Text>
      </View>
    </TouchableOpacity>
  );
}

function InsightCard({
  colors,
  insight,
  styles,
}: {
  colors: ThemeColors;
  insight: Insight;
  styles: ReturnType<typeof createStyles>;
}) {
  const color = toneColor(insight.tone, colors);
  return (
    <View style={styles.insightCard}>
      <View style={[styles.insightDot, { backgroundColor: color }]} />
      <Text style={styles.insightLabel}>{insight.label}</Text>
      <Text style={styles.insightValue}>{insight.value}</Text>
      <Text style={styles.insightNote}>{insight.note}</Text>
    </View>
  );
}

function ConnectedCalendarRow({
  active,
  colors,
  name,
  status,
  styles,
}: {
  active?: boolean;
  colors: ThemeColors;
  name: string;
  status: string;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <View style={styles.connectedRow}>
      <Text style={styles.connectedName}>{name}</Text>
      <View style={styles.connectedStatus}>
        <View style={[styles.connectedDot, { backgroundColor: active ? colors.success : colors.textMuted }]} />
        <Text style={[styles.connectedText, { color: active ? colors.success : colors.textMuted }]}>{status}</Text>
      </View>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      paddingHorizontal: spacing.lg,
      paddingBottom: spacing.xxl * 2,
      gap: spacing.lg,
    },
    heroCard: {
      backgroundColor: colors.card,
      borderRadius: radius.xl,
      padding: spacing.xl,
      borderWidth: 1,
      borderColor: colors.border,
    },
    heroTopRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: spacing.md,
    },
    heroLabel: {
      ...typography.label,
      color: colors.accent,
      letterSpacing: 4,
    },
    heroDate: {
      ...typography.displaySmall,
      color: colors.textPrimary,
      marginBottom: spacing.xs,
    },
    heroGreeting: {
      ...typography.body,
      color: colors.textSecondary,
      marginBottom: spacing.lg,
    },
    summaryTitle: {
      ...typography.label,
      color: colors.textPrimary,
      marginBottom: spacing.md,
    },
    summaryGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: spacing.sm,
    },
    sectionHeaderRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    sectionLabel: {
      ...typography.label,
      color: colors.textMuted,
      letterSpacing: 3,
    },
    sectionLabelSpaced: {
      marginTop: spacing.xs,
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
    },
    emptyState: {
      backgroundColor: colors.surface,
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.xl,
      gap: spacing.md,
    },
    emptyTitle: {
      ...typography.title,
      color: colors.textPrimary,
    },
    emptyText: {
      ...typography.body,
      color: colors.textMuted,
    },
    emptySuggestions: {
      gap: spacing.xs,
    },
    emptySuggestion: {
      ...typography.caption,
      color: colors.textSecondary,
    },
    emptyAddButton: {
      alignSelf: "flex-start",
      backgroundColor: colors.accent,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm,
      borderRadius: radius.sm,
    },
    emptyAddText: {
      ...typography.label,
      color: colors.textPrimary,
    },
    timelineRow: {
      flexDirection: "row",
      gap: spacing.md,
      minHeight: 92,
    },
    timelineTime: {
      width: 72,
      ...typography.caption,
      color: colors.textMuted,
      fontWeight: "700",
      paddingTop: spacing.md,
    },
    timelineLine: {
      width: 14,
      alignItems: "center",
      backgroundColor: "transparent",
    },
    timelineDot: {
      width: 10,
      height: 10,
      borderRadius: 5,
      marginTop: spacing.lg,
    },
    timelineCard: {
      flex: 1,
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.md,
      gap: spacing.xs,
    },
    timelineTop: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: spacing.sm,
    },
    timelineTitle: {
      ...typography.title,
      color: colors.textPrimary,
      fontSize: 17,
      flex: 1,
    },
    timelineMeta: {
      ...typography.caption,
      color: colors.accentCyan,
      fontWeight: "700",
    },
    timelineDetail: {
      ...typography.caption,
      color: colors.textMuted,
    },
    deleteText: {
      ...typography.caption,
      color: colors.textMuted,
    },
    freeCard: {
      flex: 1,
      backgroundColor: "rgba(34,197,94,0.08)",
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: "rgba(34,197,94,0.24)",
      padding: spacing.md,
      gap: spacing.xs,
    },
    freeLabel: {
      ...typography.label,
      color: colors.success,
    },
    freeDuration: {
      ...typography.title,
      color: colors.textPrimary,
    },
    freeSub: {
      ...typography.caption,
      color: colors.textMuted,
      marginTop: spacing.xs,
    },
    freeSuggestion: {
      ...typography.caption,
      color: colors.textSecondary,
    },
    suggestionCard: {
      backgroundColor: "rgba(168,85,247,0.10)",
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: "rgba(168,85,247,0.28)",
      padding: spacing.lg,
      gap: spacing.sm,
    },
    suggestionTop: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    suggestionLabel: {
      ...typography.label,
      color: colors.accent,
    },
    suggestionTitle: {
      ...typography.title,
      color: colors.textPrimary,
      fontSize: 18,
    },
    suggestionText: {
      ...typography.body,
      color: colors.textSecondary,
    },
    suggestionActions: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      marginTop: spacing.xs,
    },
    scheduleButton: {
      alignSelf: "flex-start",
      borderRadius: radius.sm,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      backgroundColor: "rgba(59,130,246,0.12)",
      marginTop: spacing.sm,
    },
    scheduleButtonText: {
      ...typography.label,
      color: colors.accentCyan,
    },
    dismissText: {
      ...typography.caption,
      color: colors.textMuted,
      fontWeight: "700",
    },
    insightGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: spacing.md,
    },
    insightCard: {
      width: "47.5%",
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.md,
      gap: spacing.xs,
    },
    insightDot: {
      width: 7,
      height: 7,
      borderRadius: 4,
    },
    insightLabel: {
      ...typography.label,
      color: colors.textMuted,
      letterSpacing: 1.2,
    },
    insightValue: {
      ...typography.title,
      color: colors.textPrimary,
      fontSize: 16,
    },
    insightNote: {
      ...typography.caption,
      color: colors.textMuted,
    },
    connectedCard: {
      backgroundColor: colors.surface,
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: "hidden",
    },
    connectedRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      padding: spacing.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    connectedName: {
      ...typography.body,
      color: colors.textPrimary,
      fontWeight: "700",
    },
    connectedStatus: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.xs,
    },
    connectedDot: {
      width: 7,
      height: 7,
      borderRadius: 4,
    },
    connectedText: {
      ...typography.caption,
      fontWeight: "700",
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
