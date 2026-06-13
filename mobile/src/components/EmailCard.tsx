import { useMemo } from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { SymbolView } from "expo-symbols";

import { spacing, radius, typography , type ThemeColors } from "../theme/theme";
import { useTheme } from "../theme/ThemeContext";
import type { EmailMessage } from "../services/emailService";

// ── Constants ─────────────────────────────────────────────────────────────────

const IMPORTANCE_COLOR: Record<string, string> = {
  low:    "#8490ab",
  normal: "#22d3ee",
  high:   "#f59e0b",
  urgent: "#ef4444",
};

const SOURCE_COLOR: Record<string, string> = {
  manual:  "#8490ab",
  gmail:   "#EA4335",
  outlook: "#0078D4",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

// ── EmailCard ─────────────────────────────────────────────────────────────────

type Props = {
  message: EmailMessage;
  onToggleRead?: (message: EmailMessage) => void;
  onArchive?: (messageId: string) => void;
  onDelete?: (messageId: string) => void;
};

export default function EmailCard({ message, onToggleRead, onArchive, onDelete }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const importanceColor = IMPORTANCE_COLOR[message.importance] ?? "#22d3ee";
  const sourceColor     = SOURCE_COLOR[message.source] ?? "#8490ab";
  const isUnread        = message.status === "unread";
  const isArchived      = message.status === "archived";

  return (
    <View style={[styles.card, isUnread && styles.cardUnread]}>
      {/* Left importance strip */}
      <View style={[styles.strip, { backgroundColor: importanceColor }]} />

      <View style={styles.body}>
        {/* Header: sender + date */}
        <View style={styles.headerRow}>
          <Text style={[styles.sender, isUnread && styles.senderUnread]} numberOfLines={1}>
            {message.sender}
          </Text>
          <Text style={styles.date}>{formatDate(message.received_at)}</Text>
        </View>

        {/* Subject */}
        <Text style={[styles.subject, isUnread && styles.subjectUnread]} numberOfLines={2}>
          {message.subject}
        </Text>

        {/* Snippet */}
        {message.snippet ? (
          <Text style={styles.snippet} numberOfLines={2}>{message.snippet}</Text>
        ) : null}

        {/* Footer: badges + actions */}
        <View style={styles.footerRow}>
          <View style={styles.badges}>
            {/* Importance badge (only show high/urgent) */}
            {(message.importance === "high" || message.importance === "urgent") ? (
              <View style={[styles.badge, { borderColor: `${importanceColor}60` }]}>
                <Text style={[styles.badgeText, { color: importanceColor }]}>
                  {message.importance.toUpperCase()}
                </Text>
              </View>
            ) : null}

            {/* Source badge */}
            <View style={[styles.badge, { borderColor: `${sourceColor}50` }]}>
              <Text style={[styles.badgeText, { color: sourceColor }]}>
                {message.source.toUpperCase()}
              </Text>
            </View>

            {/* Status badge */}
            {isArchived ? (
              <View style={[styles.badge, { borderColor: `${"#8490ab"}40` }]}>
                <Text style={[styles.badgeText, { color: "#8490ab" }]}>ARCHIVED</Text>
              </View>
            ) : null}
          </View>

          {/* Quick actions */}
          <View style={styles.actions}>
            {/* Toggle read/unread */}
            {onToggleRead ? (
              <TouchableOpacity onPress={() => onToggleRead(message)} hitSlop={8}>
                <SymbolView
                  name={isUnread ? "envelope.open" : "envelope"}
                  size={14}
                  tintColor={isUnread ? "#22d3ee" : "#8490ab"}
                  resizeMode="scaleAspectFit"
                />
              </TouchableOpacity>
            ) : null}

            {/* Archive */}
            {onArchive && !isArchived ? (
              <TouchableOpacity onPress={() => onArchive(message.id)} hitSlop={8}>
                <SymbolView
                  name="archivebox"
                  size={14}
                  tintColor={"#8490ab"}
                  resizeMode="scaleAspectFit"
                />
              </TouchableOpacity>
            ) : null}

            {/* Delete */}
            {onDelete ? (
              <TouchableOpacity onPress={() => onDelete(message.id)} hitSlop={8}>
                <SymbolView
                  name="trash"
                  size={14}
                  tintColor="#ef4444"
                  resizeMode="scaleAspectFit"
                />
              </TouchableOpacity>
            ) : null}
          </View>
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

  cardUnread: {
    borderColor: `${colors.accentCyan}30`,
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

  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },

  sender: {
    fontSize: 13,
    fontWeight: "500" as const,
    color: colors.textSecondary,
    flex: 1,
  },

  senderUnread: {
    color: colors.textPrimary,
    fontWeight: "700" as const,
  },

  date: {
    ...typography.caption,
    color: colors.textMuted,
    fontSize: 11,
    flexShrink: 0,
  },

  subject: {
    fontSize: 14,
    fontWeight: "500" as const,
    color: colors.textSecondary,
    lineHeight: 19,
  },

  subjectUnread: {
    color: colors.textPrimary,
    fontWeight: "600" as const,
  },

  snippet: {
    ...typography.caption,
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 16,
  },

  footerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 2,
  },

  badges: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    flexWrap: "wrap",
    flex: 1,
  },

  badge: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },

  badgeText: {
    ...typography.label,
    fontSize: 8,
  },

  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    flexShrink: 0,
  },
});
}
