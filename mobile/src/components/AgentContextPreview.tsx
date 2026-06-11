import { View, Text, StyleSheet, ActivityIndicator } from "react-native";
import { SymbolView } from "expo-symbols";

import { colors, spacing, radius, typography } from "../theme/theme";
import type { AgentContextPackage, AgentContextSection } from "../services/agentsService";

// ── Static maps ───────────────────────────────────────────────────────────────

const CATEGORY_ICON: Record<string, Parameters<typeof SymbolView>[0]["name"]> = {
  memory:        "brain.head.profile",
  goals:         "target",
  tasks:         "checklist",
  analytics:     "chart.bar",
  conversations: "bubble.left.and.bubble.right",
};

const CATEGORY_ACCENT: Record<string, string> = {
  memory:        colors.accent,
  goals:         "#f59e0b",
  tasks:         colors.accentCyan,
  analytics:     "#10b981",
  conversations: "#818cf8",
};

// ── SectionRow ────────────────────────────────────────────────────────────────

type SectionRowProps = { section: AgentContextSection };

function SectionRow({ section }: SectionRowProps) {
  const { category, label, description, is_active, item_count, items } = section;

  const accent = CATEGORY_ACCENT[category] ?? colors.textMuted;
  const icon = CATEGORY_ICON[category] ?? "cpu";

  const hasData = item_count > 0;
  const badgeColor = is_active && hasData ? accent : colors.textMuted;
  const badgeLabel = !is_active ? "INACTIVE" : hasData ? `${item_count}` : "NO DATA";
  const badgeBg = is_active && hasData ? `${accent}18` : "transparent";
  const badgeBorder = is_active && hasData ? `${accent}50` : colors.borderDark;

  return (
    <View style={styles.sectionRow}>
      {/* Left: icon + label + description */}
      <View style={[styles.iconWrap, { borderColor: is_active ? `${accent}40` : colors.borderDark }]}>
        <SymbolView
          name={icon}
          size={14}
          tintColor={is_active ? accent : colors.textMuted}
          resizeMode="scaleAspectFit"
        />
      </View>

      <View style={styles.sectionBody}>
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionLabel, !is_active && styles.sectionLabelInactive]}>
            {label}
          </Text>
          <View style={[styles.badge, { backgroundColor: badgeBg, borderColor: badgeBorder }]}>
            <Text style={[styles.badgeText, { color: badgeColor }]}>{badgeLabel}</Text>
          </View>
        </View>

        <Text style={styles.sectionDesc}>{description}</Text>

        {/* Preview items (only when active and data exists) */}
        {is_active && items.length > 0 ? (
          <View style={styles.previewList}>
            {items.map((item, i) => (
              <View key={i} style={styles.previewRow}>
                <View style={[styles.previewDot, { backgroundColor: accent }]} />
                <Text style={styles.previewText} numberOfLines={2}>{item}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {/* Active but no data hint */}
        {is_active && !hasData ? (
          <Text style={styles.noDataHint}>No data yet — add some to activate this source.</Text>
        ) : null}
      </View>
    </View>
  );
}

// ── AgentContextPreview ───────────────────────────────────────────────────────

type Props = {
  contextPackage: AgentContextPackage | null | undefined;
  isLoading: boolean;
  accentColor?: string;
};

export default function AgentContextPreview({ contextPackage, isLoading, accentColor }: Props) {
  if (isLoading) {
    return (
      <View style={styles.loadingRow}>
        <ActivityIndicator size="small" color={colors.accentCyan} />
        <Text style={styles.loadingText}>Loading context...</Text>
      </View>
    );
  }

  if (!contextPackage) {
    return null;
  }

  const activeSections = contextPackage.sections.filter((s) => s.is_active);
  const inactiveSections = contextPackage.sections.filter((s) => !s.is_active);

  return (
    <View style={styles.container}>
      <Text style={[styles.header, { color: accentColor ?? colors.textMuted }]}>
        DATA SOURCES
      </Text>

      <View style={styles.sectionList}>
        {activeSections.map((s) => (
          <View key={s.category}>
            <SectionRow section={s} />
            {/* Divider between rows */}
            <View style={styles.divider} />
          </View>
        ))}

        {inactiveSections.map((s, i) => (
          <View key={s.category}>
            <SectionRow section={s} />
            {i < inactiveSections.length - 1 ? <View style={styles.divider} /> : null}
          </View>
        ))}
      </View>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    gap: spacing.sm,
  },

  header: {
    ...typography.label,
    fontSize: 9,
    marginBottom: 2,
  },

  sectionList: {
    backgroundColor: colors.surfaceDark,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.borderDark,
    overflow: "hidden",
  },

  // Section row
  sectionRow: {
    flexDirection: "row",
    gap: spacing.md,
    padding: spacing.md,
    alignItems: "flex-start",
  },

  iconWrap: {
    width: 30,
    height: 30,
    borderRadius: radius.sm - 4,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    marginTop: 1,
  },

  sectionBody: {
    flex: 1,
    gap: 3,
  },

  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },

  sectionLabel: {
    ...typography.caption,
    color: colors.textPrimary,
    fontWeight: "600" as const,
    fontSize: 12,
    flex: 1,
  },

  sectionLabelInactive: {
    color: colors.textMuted,
  },

  badge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    flexShrink: 0,
  },

  badgeText: {
    ...typography.label,
    fontSize: 8,
  },

  sectionDesc: {
    ...typography.caption,
    color: colors.textMuted,
    fontSize: 11,
    lineHeight: 16,
  },

  // Preview items
  previewList: {
    marginTop: spacing.xs,
    gap: 4,
  },

  previewRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
  },

  previewDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    marginTop: 5,
    flexShrink: 0,
  },

  previewText: {
    ...typography.caption,
    color: colors.textSecondary,
    fontSize: 11,
    lineHeight: 16,
    flex: 1,
  },

  noDataHint: {
    ...typography.caption,
    color: colors.textMuted,
    fontSize: 10,
    fontStyle: "italic" as const,
    marginTop: 2,
  },

  // Divider between rows
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginHorizontal: spacing.md,
  },

  // Loading state
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },

  loadingText: {
    ...typography.caption,
    color: colors.textMuted,
    fontSize: 12,
  },
});
