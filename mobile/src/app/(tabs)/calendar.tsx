import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
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
  activity: ActivityKind[];
  count: number;
  date: Date;
  inMonth: boolean;
  isToday: boolean;
  isSelected: boolean;
  workload: number;
};

type DayMode = "future" | "past" | "today";
type ActivityKind = "event" | "focus" | "low" | "personal" | "task";

type MonthStats = {
  activeDays: number;
  eventDays: number;
  focusDays: number;
  lowDays: number;
  personalDays: number;
  taskDays: number;
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

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months, 1);
  return startOfLocalDay(d);
}

function startOfMonth(date: Date): Date {
  const d = new Date(date);
  d.setDate(1);
  return startOfLocalDay(d);
}

function getMonthGrid(month: Date): { date: Date; inMonth: boolean }[] {
  const first = startOfMonth(month);
  const gridStart = addDays(first, -first.getDay());
  return Array.from({ length: 42 }, (_, index) => {
    const date = addDays(gridStart, index);
    return { date, inMonth: date.getMonth() === first.getMonth() };
  });
}

function dayMode(date: Date, today: Date): DayMode {
  const selected = startOfLocalDay(date).getTime();
  const current = startOfLocalDay(today).getTime();
  if (selected < current) return "past";
  if (selected > current) return "future";
  return "today";
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

function isTaskPlannedForDate(task: Task, date: Date): boolean {
  if (!isTaskOpen(task) || !task.due_date) return false;
  return isSameLocalDay(new Date(task.due_date), date);
}

function isTaskCompletedOnDate(task: Task, date: Date): boolean {
  if (!["done", "completed"].includes(task.status.toLowerCase())) return false;
  return isSameLocalDay(new Date(task.updated_at), date);
}

function getActivityForDate(date: Date, events: CalendarEvent[], tasks: Task[]): ActivityKind[] {
  const eventCount = events.filter((event) => isSameLocalDay(new Date(event.start_time), date)).length;
  const plannedTasks = tasks.filter((task) => isTaskPlannedForDate(task, date)).length;
  const completedTasks = tasks.filter((task) => isTaskCompletedOnDate(task, date)).length;
  const activities: ActivityKind[] = [];

  if (eventCount > 0) activities.push("event");
  if (plannedTasks + completedTasks > 0) activities.push("task");
  if (eventCount === 0 && plannedTasks + completedTasks === 0) activities.push("low");
  if (plannedTasks + completedTasks >= 2) activities.push("focus");
  if (eventCount > 0 && /workout|gym|exercise|family|personal|dinner|lunch/i.test(
    events.filter((event) => isSameLocalDay(new Date(event.start_time), date)).map((event) => event.title).join(" "),
  )) {
    activities.push("personal");
  }

  return activities.slice(0, 3);
}

function getActivityColor(kind: ActivityKind, colors: ThemeColors): string {
  if (kind === "event") return colors.accent;
  if (kind === "focus") return colors.accentCyan;
  if (kind === "task") return colors.info;
  if (kind === "personal") return colors.success;
  return colors.warning;
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
  const [selectedDate, setSelectedDate] = useState(() => startOfLocalDay(new Date()));
  const [visibleMonth, setVisibleMonth] = useState(() => startOfMonth(new Date()));
  const slide = useMemo(() => new Animated.Value(0), []);

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

  const today = useMemo(() => startOfLocalDay(new Date()), []);
  const selectedMode = dayMode(selectedDate, today);
  const dayStart = useMemo(() => startOfLocalDay(selectedDate), [selectedDate]);
  const dayEnd = useMemo(() => endOfLocalDay(selectedDate), [selectedDate]);

  const animateDayChange = useCallback((direction: number) => {
    slide.setValue(direction >= 0 ? 18 : -18);
    Animated.timing(slide, {
      toValue: 0,
      duration: 240,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [slide]);

  const selectDate = useCallback((date: Date) => {
    const next = startOfLocalDay(date);
    const direction = next.getTime() - selectedDate.getTime();
    setSelectedDate(next);
    setVisibleMonth(startOfMonth(next));
    animateDayChange(direction);
  }, [animateDayChange, selectedDate]);

  const returnToToday = useCallback(() => selectDate(today), [selectDate, today]);

  const moveMonth = useCallback((delta: number) => {
    const next = addMonths(visibleMonth, delta);
    setVisibleMonth(next);
    animateDayChange(delta);
  }, [animateDayChange, visibleMonth]);

  const todayEvents = useMemo(() => (
    events
      .filter((event) => isSameLocalDay(new Date(event.start_time), selectedDate))
      .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())
  ), [events, selectedDate]);

  const todayTasks = useMemo(() => tasks.filter((task) => isTaskPlannedForDate(task, selectedDate)), [tasks, selectedDate]);
  const completedTasksForDay = useMemo(() => (
    tasks.filter((task) =>
      ["done", "completed"].includes(task.status.toLowerCase())
      && isSameLocalDay(new Date(task.updated_at), selectedDate),
    )
  ), [selectedDate, tasks]);

  const freeBlocks = useMemo(() => {
    const blocks: { start: Date; end: Date; minutes: number }[] = [];
    let cursor = selectedMode === "today"
      ? new Date(Math.max(dayStart.getTime(), new Date().getTime()))
      : new Date(dayStart);

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
  }, [dayEnd, dayStart, selectedMode, todayEvents]);

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

  const monthDays = useMemo<WeekDay[]>(() => (
    getMonthGrid(visibleMonth).map(({ date, inMonth }) => {
      const activity = getActivityForDate(date, events, tasks);
      const count = events.filter((event) => isSameLocalDay(new Date(event.start_time), date)).length;
      return {
        activity,
        date,
        count,
        inMonth,
        workload: Math.min(3, Math.max(1, count)),
        isToday: isSameLocalDay(date, today),
        isSelected: isSameLocalDay(date, selectedDate),
      };
    })
  ), [events, selectedDate, tasks, today, visibleMonth]);

  const monthStats = useMemo<MonthStats>(() => {
    const inMonthDays = monthDays.filter((day) => day.inMonth);
    return {
      activeDays: inMonthDays.filter((day) => !day.activity.includes("low")).length,
      eventDays: inMonthDays.filter((day) => day.activity.includes("event")).length,
      focusDays: inMonthDays.filter((day) => day.activity.includes("focus")).length,
      lowDays: inMonthDays.filter((day) => day.activity.includes("low")).length,
      personalDays: inMonthDays.filter((day) => day.activity.includes("personal")).length,
      taskDays: inMonthDays.filter((day) => day.activity.includes("task")).length,
    };
  }, [monthDays]);

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
        const taskTime = new Date(selectedDate);
        taskTime.setHours(11, 0, 0, 0);
        items.push({ type: "task", task: primaryTask, time: taskTime });
      }
      const start = selectedMode === "today" ? new Date() : new Date(dayStart);
      const minutes = minutesBetween(start, dayEnd);
      if (minutes > 0) items.push({ type: "free", start, end: dayEnd, minutes });
    }

    return items;
  }, [dayEnd, dayStart, selectedDate, selectedMode, todayEvents, todayTasks]);

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

  const dayLabel = selectedMode === "today" ? "TODAY" : selectedMode === "past" ? "DAILY MEMORY" : "PLANNING";
  const timelineLabel = selectedMode === "past" ? "DAY HISTORY" : selectedMode === "future" ? "PLANNED TIMELINE" : "TODAY'S TIMELINE";
  const suggestionTitle = selectedMode === "past"
    ? "HELIOS remembers this day as a timeline snapshot."
    : longestFreeBlock.minutes >= 90
      ? `You have ${formatLongDuration(longestFreeBlock.minutes)} available ${selectedMode === "today" ? "today" : "that day"}.`
      : "Your schedule has room for a focused reset.";
  const suggestionText = selectedMode === "past"
    ? `${todayEvents.length} events and ${todayTasks.length} tasks are preserved for this day.`
    : `Recommended: ${todayTasks[0]?.title ?? "Continue HELIOS Development"}`;
  const memoryFacts = [
    `${todayEvents.length} calendar ${todayEvents.length === 1 ? "event" : "events"}`,
    `${todayTasks.length} scheduled ${todayTasks.length === 1 ? "task" : "tasks"}`,
    `${completedTasksForDay.length} completed ${completedTasksForDay.length === 1 ? "task" : "tasks"}`,
    `${focusBlocks.length} focus ${focusBlocks.length === 1 ? "window" : "windows"}`,
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
        <Animated.View style={{ transform: [{ translateX: slide }] }}>
        <View style={styles.heroCard}>
          <View style={styles.heroTopRow}>
            <Text style={styles.heroLabel}>{dayLabel}</Text>
            {(isLoading || isMutating) ? <ActivityIndicator size="small" color={colors.accentCyan} /> : null}
          </View>
          <Text style={styles.heroDate}>
            {selectedDate.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
          </Text>
          <Text style={styles.heroGreeting}>
            {selectedMode === "past"
              ? "A preserved snapshot of what happened that day."
              : selectedMode === "future"
                ? "A planning view for what HELIOS can help prepare."
                : getGreeting(new Date())}
          </Text>
          <Text style={styles.summaryTitle}>
            {selectedMode === "past" ? "Day Summary" : selectedMode === "future" ? "Planned Summary" : "Today's Summary"}
          </Text>
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
        </Animated.View>

        <LifeTimelineMonth
          colors={colors}
          days={monthDays}
          month={visibleMonth}
          monthStats={monthStats}
          onNextMonth={() => moveMonth(1)}
          onPreviousMonth={() => moveMonth(-1)}
          onSelectDate={selectDate}
          onToday={returnToToday}
          styles={styles}
        />

        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionLabel}>{timelineLabel}</Text>
          <TouchableOpacity style={styles.addButton} onPress={openCreate}>
            <Text style={styles.addButtonText}>+ ADD</Text>
          </TouchableOpacity>
        </View>

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        {todayEvents.length === 0 && !isLoading ? (
          <OpenDayState mode={selectedMode} onCreate={openCreate} colors={colors} styles={styles} />
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

        <View style={styles.memoryCard}>
          <View style={styles.suggestionTop}>
            <Text style={styles.suggestionLabel}>DAILY MEMORY</Text>
            <SymbolView name="clock.arrow.circlepath" size={15} tintColor={colors.accentCyan} resizeMode="scaleAspectFit" />
          </View>
          <Text style={styles.memoryTitle}>
            {selectedMode === "past"
              ? "Historical snapshot"
              : selectedMode === "future"
                ? "Planning snapshot"
                : "Live snapshot"}
          </Text>
          <Text style={styles.memoryText}>
            {selectedMode === "past"
              ? "HELIOS is showing stored calendar and task records for this date."
              : selectedMode === "future"
                ? "HELIOS is using scheduled records to prepare this day."
                : "HELIOS is tracking today as it unfolds."}
          </Text>
          <View style={styles.memoryFacts}>
            {memoryFacts.map((fact) => (
              <View key={fact} style={styles.memoryFact}>
                <View style={styles.memoryDot} />
                <Text style={styles.memoryFactText}>{fact}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.suggestionCard}>
          <View style={styles.suggestionTop}>
            <Text style={styles.suggestionLabel}>HELIOS SUGGESTION</Text>
            <SymbolView name="sparkles" size={15} tintColor={colors.accent} resizeMode="scaleAspectFit" />
          </View>
          <Text style={styles.suggestionTitle}>{suggestionTitle}</Text>
          <Text style={styles.suggestionText}>{suggestionText}</Text>
          {selectedMode !== "past" ? (
            <View style={styles.suggestionActions}>
              <TouchableOpacity style={styles.scheduleButton} onPress={openCreate}>
                <Text style={styles.scheduleButtonText}>Schedule It</Text>
              </TouchableOpacity>
              <Text style={styles.dismissText}>Dismiss</Text>
            </View>
          ) : null}
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

function LifeTimelineMonth({
  colors,
  days,
  month,
  monthStats,
  onNextMonth,
  onPreviousMonth,
  onSelectDate,
  onToday,
  styles,
}: {
  colors: ThemeColors;
  days: WeekDay[];
  month: Date;
  monthStats: MonthStats;
  onNextMonth: () => void;
  onPreviousMonth: () => void;
  onSelectDate: (date: Date) => void;
  onToday: () => void;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <View style={styles.lifeCard}>
      <Text style={styles.lifeLabel}>LIFE TIMELINE</Text>
      <View style={styles.monthHeader}>
        <Text style={styles.monthTitle}>
          {month.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
        </Text>
        <View style={styles.monthControls}>
          <TouchableOpacity style={styles.monthButton} onPress={onPreviousMonth} accessibilityLabel="Previous month">
            <SymbolView name="chevron.left" size={18} tintColor={colors.textSecondary} resizeMode="scaleAspectFit" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.monthTodayButton} onPress={onToday}>
            <Text style={styles.monthTodayText}>Today</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.monthButton} onPress={onNextMonth} accessibilityLabel="Next month">
            <SymbolView name="chevron.right" size={18} tintColor={colors.textSecondary} resizeMode="scaleAspectFit" />
          </TouchableOpacity>
        </View>
        <View style={styles.modeToggle}>
          <View style={styles.modeSelected}>
            <Text style={styles.modeSelectedText}>Month</Text>
          </View>
          <Text style={styles.modeText}>Week</Text>
        </View>
      </View>

      <View style={styles.monthGrid}>
        {["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"].map((label) => (
          <View key={label} style={styles.weekdayCell}>
            <Text style={styles.weekdayText}>{label}</Text>
          </View>
        ))}
        {days.map((day) => (
          <TouchableOpacity
            key={day.date.toISOString()}
            activeOpacity={0.84}
            onPress={() => onSelectDate(day.date)}
            style={[
              styles.dayCell,
              day.isSelected && styles.dayCellSelected,
              day.isToday && !day.isSelected && styles.dayCellToday,
            ]}
          >
            <Text
              style={[
                styles.dayNumber,
                !day.inMonth && styles.dayNumberMuted,
                day.isSelected && styles.dayNumberSelected,
              ]}
            >
              {day.date.getDate()}
            </Text>
            <View style={styles.activityDots}>
              {day.activity.map((kind) => (
                <View
                  key={kind}
                  style={[styles.activityDot, { backgroundColor: getActivityColor(kind, colors) }]}
                />
              ))}
            </View>
            {day.isSelected ? <View style={styles.selectedUnderline} /> : null}
          </TouchableOpacity>
        ))}
      </View>

      <MonthSummary colors={colors} monthStats={monthStats} styles={styles} />
      <ActivityLegend colors={colors} styles={styles} />
      <Text style={styles.timelineHint}>Tap any day to view full details and timeline.</Text>
    </View>
  );
}

function MonthSummary({
  colors,
  monthStats,
  styles,
}: {
  colors: ThemeColors;
  monthStats: MonthStats;
  styles: ReturnType<typeof createStyles>;
}) {
  const maxDays = 31;
  const progress = Math.min(1, monthStats.activeDays / maxDays);
  return (
    <View style={styles.monthSummaryCard}>
      <View style={styles.activityRing}>
        <View style={[styles.activityRingProgress, { transform: [{ rotate: `${Math.round(progress * 250)}deg` }] }]} />
        <View style={styles.activityRingInner}>
          <Text style={styles.activityRingNumber}>{monthStats.activeDays}</Text>
          <Text style={styles.activityRingLabel}>Active Days</Text>
        </View>
      </View>
      <View style={styles.monthSummaryContent}>
        <Text style={styles.monthSummaryTitle}>
          {monthStats.activeDays >= 15 ? "You've had a productive month." : "Your month is still taking shape."}
        </Text>
        <Text style={styles.monthSummaryText}>Keep building momentum.</Text>
        <View style={styles.monthStatsRow}>
          <MonthStat color={colors.accentCyan} label="Focus Days" value={monthStats.focusDays} styles={styles} />
          <MonthStat color={colors.accent} label="Event Days" value={monthStats.eventDays} styles={styles} />
          <MonthStat color={colors.info} label="Task Days" value={monthStats.taskDays} styles={styles} />
          <MonthStat color={colors.success} label="Personal Days" value={monthStats.personalDays} styles={styles} />
          <MonthStat color={colors.warning} label="Low Activity" value={monthStats.lowDays} styles={styles} />
        </View>
      </View>
    </View>
  );
}

function MonthStat({
  color,
  label,
  styles,
  value,
}: {
  color: string;
  label: string;
  styles: ReturnType<typeof createStyles>;
  value: number;
}) {
  return (
    <View style={styles.monthStat}>
      <Text style={styles.monthStatValue}>{value}</Text>
      <View style={styles.monthStatLabelRow}>
        <View style={[styles.activityDot, { backgroundColor: color }]} />
        <Text style={styles.monthStatLabel}>{label}</Text>
      </View>
    </View>
  );
}

function ActivityLegend({ colors, styles }: { colors: ThemeColors; styles: ReturnType<typeof createStyles> }) {
  return (
    <View style={styles.legendCard}>
      <LegendItem color={colors.accent} icon="calendar" title="Events" subtitle="Days with meetings or scheduled events" styles={styles} />
      <LegendItem color={colors.success} icon="person" title="Personal" subtitle="Days with personal activities or habits" styles={styles} />
      <LegendItem color={colors.accentCyan} icon="target" title="Focus" subtitle="Days with focus blocks or deep work sessions" styles={styles} />
      <LegendItem color={colors.warning} icon="waveform.path.ecg" title="Low Activity" subtitle="Days with minimal recorded activity" styles={styles} />
      <LegendItem color={colors.info} icon="checkmark.circle" title="Tasks" subtitle="Days with completed or scheduled tasks" styles={styles} />
    </View>
  );
}

function LegendItem({
  color,
  icon,
  styles,
  subtitle,
  title,
}: {
  color: string;
  icon: string;
  styles: ReturnType<typeof createStyles>;
  subtitle: string;
  title: string;
}) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendIcon, { backgroundColor: `${color}22` }]}>
        <SymbolView name={icon as never} size={18} tintColor={color} resizeMode="scaleAspectFit" />
      </View>
      <View style={styles.legendCopy}>
        <Text style={[styles.legendTitle, { color }]}>{title}</Text>
        <Text style={styles.legendSubtitle}>{subtitle}</Text>
      </View>
    </View>
  );
}

function OpenDayState({
  colors,
  mode,
  onCreate,
  styles,
}: {
  colors: ThemeColors;
  mode: DayMode;
  onCreate: () => void;
  styles: ReturnType<typeof createStyles>;
}) {
  const title = mode === "past"
    ? "No recorded activity for this day yet."
    : mode === "future"
      ? "This day is open for planning."
      : "Your schedule is completely open today.";
  const body = mode === "past"
    ? "When HELIOS has stored activity for a day, it will appear here as a permanent memory."
    : "This is a great opportunity to focus on meaningful work.";

  return (
    <View style={styles.emptyState}>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyText}>{body}</Text>
      {mode !== "past" ? (
        <>
          <View style={styles.emptySuggestions}>
            {["Continue D278", "Resume HELIOS Development", "Exercise"].map((item) => (
              <Text key={item} style={styles.emptySuggestion}>• {item}</Text>
            ))}
          </View>
          <TouchableOpacity style={styles.emptyAddButton} onPress={onCreate}>
            <Text style={styles.emptyAddText}>{mode === "future" ? "Plan This Day" : "Build My Day"}</Text>
          </TouchableOpacity>
        </>
      ) : null}
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
    lifeCard: {
      backgroundColor: colors.card,
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.lg,
      gap: spacing.lg,
    },
    lifeLabel: {
      ...typography.label,
      color: colors.accent,
      letterSpacing: 5,
    },
    monthHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: spacing.sm,
      flexWrap: "wrap",
    },
    monthTitle: {
      color: colors.textPrimary,
      fontSize: 24,
      fontWeight: "900",
      minWidth: 150,
    },
    monthControls: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
    },
    monthButton: {
      width: 44,
      height: 44,
      borderRadius: radius.sm,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "rgba(10,20,39,0.72)",
    },
    monthTodayButton: {
      height: 44,
      paddingHorizontal: spacing.lg,
      borderRadius: radius.sm,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "rgba(10,20,39,0.72)",
    },
    monthTodayText: {
      color: colors.textSecondary,
      fontSize: 15,
      fontWeight: "800",
    },
    modeToggle: {
      height: 44,
      flexDirection: "row",
      alignItems: "center",
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: "rgba(10,20,39,0.72)",
      overflow: "hidden",
    },
    modeSelected: {
      height: "100%",
      paddingHorizontal: spacing.lg,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.accent,
      backgroundColor: "rgba(168,85,247,0.16)",
    },
    modeSelectedText: {
      color: colors.accent,
      fontSize: 15,
      fontWeight: "900",
    },
    modeText: {
      color: colors.textMuted,
      fontSize: 15,
      fontWeight: "800",
      paddingHorizontal: spacing.lg,
    },
    monthGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.lg,
      overflow: "hidden",
      backgroundColor: "rgba(3,11,28,0.58)",
    },
    weekdayCell: {
      width: `${100 / 7}%`,
      minHeight: 48,
      alignItems: "center",
      justifyContent: "center",
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      backgroundColor: "rgba(8,18,36,0.64)",
    },
    weekdayText: {
      ...typography.label,
      color: colors.textMuted,
      letterSpacing: 2.6,
    },
    dayCell: {
      width: `${100 / 7}%`,
      aspectRatio: 0.9,
      borderRightWidth: StyleSheet.hairlineWidth,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderColor: colors.borderDark,
      paddingTop: spacing.lg,
      alignItems: "center",
      gap: spacing.sm,
      backgroundColor: "rgba(4,13,30,0.42)",
    },
    dayCellSelected: {
      borderWidth: 2,
      borderColor: colors.accent,
      backgroundColor: "rgba(168,85,247,0.16)",
      shadowColor: colors.accent,
      shadowOpacity: 0.55,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 0 },
    },
    dayCellToday: {
      borderColor: "rgba(168,85,247,0.55)",
      backgroundColor: "rgba(168,85,247,0.08)",
    },
    dayNumber: {
      color: colors.textPrimary,
      fontSize: 22,
      fontWeight: "900",
    },
    dayNumberMuted: {
      color: "rgba(132,144,171,0.48)",
    },
    dayNumberSelected: {
      color: colors.textPrimary,
    },
    activityDots: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 7,
      minHeight: 8,
    },
    activityDot: {
      width: 7,
      height: 7,
      borderRadius: 4,
    },
    selectedUnderline: {
      width: 20,
      height: 3,
      borderRadius: 2,
      backgroundColor: colors.accent,
      marginTop: spacing.xs,
    },
    monthSummaryCard: {
      backgroundColor: "rgba(10,20,39,0.72)",
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.lg,
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.lg,
    },
    activityRing: {
      width: 104,
      height: 104,
      borderRadius: 52,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 6,
      borderColor: "rgba(168,85,247,0.35)",
    },
    activityRingProgress: {
      position: "absolute",
      width: 104,
      height: 104,
      borderRadius: 52,
      borderWidth: 6,
      borderTopColor: colors.accentCyan,
      borderRightColor: colors.success,
      borderBottomColor: colors.accent,
      borderLeftColor: colors.warning,
    },
    activityRingInner: {
      width: 78,
      height: 78,
      borderRadius: 39,
      backgroundColor: colors.card,
      alignItems: "center",
      justifyContent: "center",
    },
    activityRingNumber: {
      color: colors.textPrimary,
      fontSize: 28,
      fontWeight: "900",
    },
    activityRingLabel: {
      color: colors.textMuted,
      fontSize: 11,
      fontWeight: "700",
    },
    monthSummaryContent: {
      flex: 1,
      gap: spacing.sm,
    },
    monthSummaryTitle: {
      color: colors.textPrimary,
      fontSize: 18,
      fontWeight: "900",
    },
    monthSummaryText: {
      ...typography.body,
      color: colors.textMuted,
    },
    monthStatsRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: spacing.md,
      marginTop: spacing.xs,
    },
    monthStat: {
      minWidth: 88,
      gap: spacing.xs,
    },
    monthStatValue: {
      color: colors.textPrimary,
      fontSize: 18,
      fontWeight: "900",
    },
    monthStatLabelRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.xs,
    },
    monthStatLabel: {
      ...typography.caption,
      color: colors.textMuted,
    },
    legendCard: {
      backgroundColor: "rgba(10,20,39,0.72)",
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.lg,
      flexDirection: "row",
      flexWrap: "wrap",
      gap: spacing.lg,
    },
    legendItem: {
      width: "46%",
      flexDirection: "row",
      gap: spacing.md,
      alignItems: "center",
    },
    legendIcon: {
      width: 42,
      height: 42,
      borderRadius: 21,
      alignItems: "center",
      justifyContent: "center",
    },
    legendCopy: {
      flex: 1,
      gap: 2,
    },
    legendTitle: {
      fontSize: 16,
      fontWeight: "900",
    },
    legendSubtitle: {
      ...typography.caption,
      color: colors.textMuted,
    },
    timelineHint: {
      ...typography.body,
      color: colors.textMuted,
      textAlign: "center",
    },
    sectionHeaderRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    timelineNavHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: -spacing.sm,
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
    todayButton: {
      borderRadius: radius.sm,
      borderWidth: 1,
      borderColor: colors.accent,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
      backgroundColor: "rgba(168,85,247,0.12)",
    },
    todayButtonText: {
      ...typography.label,
      color: colors.accent,
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
    memoryCard: {
      backgroundColor: "rgba(34,211,238,0.08)",
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: "rgba(34,211,238,0.22)",
      padding: spacing.lg,
      gap: spacing.sm,
    },
    memoryTitle: {
      ...typography.title,
      color: colors.textPrimary,
      fontSize: 18,
    },
    memoryText: {
      ...typography.body,
      color: colors.textSecondary,
    },
    memoryFacts: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: spacing.sm,
      marginTop: spacing.xs,
    },
    memoryFact: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.xs,
      width: "47%",
    },
    memoryDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: colors.accentCyan,
    },
    memoryFactText: {
      ...typography.caption,
      color: colors.textSecondary,
      flex: 1,
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
