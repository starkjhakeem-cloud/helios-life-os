import { useMemo } from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { SymbolView } from "expo-symbols";

import { spacing, radius, typography , type ThemeColors } from "../theme/theme";
import { useTheme } from "../theme/ThemeContext";
import type { CalendarEvent } from "../services/calendarService";

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function formatTimeShort(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function isSameDay(a: string, b: string): boolean {
  try {
    const da = new Date(a);
    const db = new Date(b);
    return (
      da.getFullYear() === db.getFullYear() &&
      da.getMonth() === db.getMonth() &&
      da.getDate() === db.getDate()
    );
  } catch {
    return false;
  }
}

function getSourceColor(c: ThemeColors): Record<string, string> {
  return {
    manual:  c.textMuted,
    google:  "#4285F4",
    outlook: "#0078D4",
    ical:    c.accentCyan,
  };
}

// ── EventCard ─────────────────────────────────────────────────────────────────

type Props = {
  event: CalendarEvent;
  onEdit?: (event: CalendarEvent) => void;
  onDelete?: (eventId: string) => void;
};

export default function EventCard({ event, onEdit, onDelete }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const sourceColor = useMemo(() => getSourceColor(colors), [colors])[event.source] ?? colors.textMuted;

  const timeLabel = isSameDay(event.start_time, event.end_time)
    ? `${formatTime(event.start_time)} – ${formatTimeShort(event.end_time)}`
    : `${formatTime(event.start_time)} → ${formatTime(event.end_time)}`;

  return (
    <View style={styles.card}>
      {/* Left accent strip */}
      <View style={[styles.strip, { backgroundColor: sourceColor }]} />

      <View style={styles.body}>
        {/* Title row */}
        <View style={styles.titleRow}>
          <Text style={styles.title} numberOfLines={2}>{event.title}</Text>
          <View style={styles.actions}>
            {onEdit ? (
              <TouchableOpacity onPress={() => onEdit(event)} hitSlop={8}>
                <SymbolView
                  name="pencil"
                  size={14}
                  tintColor={colors.textMuted}
                  resizeMode="scaleAspectFit"
                />
              </TouchableOpacity>
            ) : null}
            {onDelete ? (
              <TouchableOpacity onPress={() => onDelete(event.id)} hitSlop={8}>
                <SymbolView
                  name="trash"
                  size={14}
                  tintColor={colors.danger}
                  resizeMode="scaleAspectFit"
                />
              </TouchableOpacity>
            ) : null}
          </View>
        </View>

        {/* Time */}
        <View style={styles.metaRow}>
          <SymbolView
            name="clock"
            size={11}
            tintColor={colors.textMuted}
            resizeMode="scaleAspectFit"
          />
          <Text style={styles.metaText}>{timeLabel}</Text>
        </View>

        {/* Location (if set) */}
        {event.location ? (
          <View style={styles.metaRow}>
            <SymbolView
              name="mappin"
              size={11}
              tintColor={colors.textMuted}
              resizeMode="scaleAspectFit"
            />
            <Text style={styles.metaText} numberOfLines={1}>{event.location}</Text>
          </View>
        ) : null}

        {/* Description (if set) */}
        {event.description ? (
          <Text style={styles.description} numberOfLines={2}>{event.description}</Text>
        ) : null}

        {/* Source badge */}
        <View style={[styles.sourceBadge, { borderColor: `${sourceColor}50` }]}>
          <Text style={[styles.sourceText, { color: sourceColor }]}>
            {event.source.toUpperCase()}
          </Text>
        </View>
      </View>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.sm,
    flexDirection: "row",
    overflow: "hidden",
  },

  strip: {
    width: 3,
    flexShrink: 0,
  },

  body: {
    flex: 1,
    padding: spacing.md,
    gap: 5,
  },

  titleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.sm,
  },

  title: {
    fontSize: 15,
    fontWeight: "600" as const,
    color: colors.textPrimary,
    flex: 1,
    lineHeight: 21,
  },

  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    flexShrink: 0,
    paddingTop: 3,
  },

  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },

  metaText: {
    ...typography.caption,
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 16,
  },

  description: {
    ...typography.caption,
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 1,
  },

  sourceBadge: {
    alignSelf: "flex-start",
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginTop: spacing.xs,
  },

  sourceText: {
    ...typography.label,
    fontSize: 8,
  },
});
}
