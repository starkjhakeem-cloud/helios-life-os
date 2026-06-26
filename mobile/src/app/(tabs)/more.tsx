import { useEffect, useMemo } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SymbolView } from "expo-symbols";
import type { SFSymbol } from "sf-symbols-typescript";

import { radius, spacing, typography, type ThemeColors } from "../../theme/theme";
import { useTheme } from "../../theme/ThemeContext";
import { useAuthStore, useIntegrationStore } from "../../store";

type MoreItem = {
  title: string;
  subtitle: string;
  icon: SFSymbol;
  route:
    | "/(tabs)/assistant-settings"
    | "/(tabs)/autonomy"
    | "/(tabs)/developer-options"
    | "/(tabs)/notifications"
    | "/(tabs)/integrations"
    | "/(tabs)/memory"
    | "/(tabs)/profile";
};

const BASE_MORE_ITEMS: MoreItem[] = [
  { title: "Profile",        subtitle: "Profile, identity, and account details",                 icon: "person.crop.circle", route: "/(tabs)/profile"            },
  { title: "Settings",       subtitle: "Assistant preferences, permissions, and daily brief",    icon: "slider.horizontal.3", route: "/(tabs)/assistant-settings" },
  { title: "Notifications",  subtitle: "Alerts, reminders, and items that need attention",       icon: "bell",               route: "/(tabs)/notifications"      },
  { title: "Connected Apps", subtitle: "Apps and services HELIOS can use",                       icon: "link",               route: "/(tabs)/integrations"       },
  { title: "About HELIOS",   subtitle: "App details and support information",                    icon: "info.circle",        route: "/(tabs)/profile"            },
];

const DEV_ITEM: MoreItem = {
  title: "Developer Options", subtitle: "Diagnostics for development builds", icon: "hammer", route: "/(tabs)/developer-options",
};

const MORE_ITEMS: MoreItem[] = __DEV__
  ? [...BASE_MORE_ITEMS.slice(0, -1), DEV_ITEM, BASE_MORE_ITEMS[BASE_MORE_ITEMS.length - 1]]
  : BASE_MORE_ITEMS;

const MEMORY_ITEMS: MoreItem[] = [
  { title: "Memory", subtitle: "Long-term context HELIOS can remember", icon: "brain.head.profile", route: "/(tabs)/memory" },
];

const AI_AUTOMATION_ITEMS: MoreItem[] = [
  { title: "Smart Automations", subtitle: "Manage HELIOS planning, approvals, and background recommendations.", icon: "sparkles", route: "/(tabs)/autonomy" },
];

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function MoreScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const accessToken = useAuthStore((s) => s.accessToken);
  const { integrations, fetchIntegrations } = useIntegrationStore();

  useEffect(() => {
    if (accessToken) fetchIntegrations(accessToken);
  }, [accessToken, fetchIntegrations]);

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={[styles.container, { paddingTop: insets.top + spacing.lg, paddingBottom: insets.bottom + 106 }]}
      showsVerticalScrollIndicator={false}
    >
      <MoreHeroCard colors={colors} styles={styles} integrations={integrations} />

      <Text style={styles.sectionLabel}>MORE</Text>
      <View style={styles.listCard}>
        {MORE_ITEMS.map((item, i) => (
          <TouchableOpacity key={i} style={styles.item} activeOpacity={0.78} onPress={() => router.push(item.route)}>
            <View style={styles.itemIcon}>
              <SymbolView name={item.icon} size={20} tintColor={colors.accent} resizeMode="scaleAspectFit" />
            </View>
            <View style={styles.itemBody}>
              <Text style={styles.itemTitle}>{item.title}</Text>
              <Text style={styles.itemSubtitle}>{item.subtitle}</Text>
            </View>
            <SymbolView name="chevron.right" size={14} tintColor={colors.textMuted} resizeMode="scaleAspectFit" />
          </TouchableOpacity>
        ))}
      </View>

      <Text style={[styles.sectionLabel, { marginTop: spacing.xl }]}>MEMORY</Text>
      <View style={styles.listCard}>
        {MEMORY_ITEMS.map((item, i) => (
          <TouchableOpacity key={i} style={styles.item} activeOpacity={0.78} onPress={() => router.push(item.route)}>
            <View style={styles.itemIcon}>
              <SymbolView name={item.icon} size={20} tintColor={colors.accent} resizeMode="scaleAspectFit" />
            </View>
            <View style={styles.itemBody}>
              <Text style={styles.itemTitle}>{item.title}</Text>
              <Text style={styles.itemSubtitle}>{item.subtitle}</Text>
            </View>
            <SymbolView name="chevron.right" size={14} tintColor={colors.textMuted} resizeMode="scaleAspectFit" />
          </TouchableOpacity>
        ))}
      </View>

      <Text style={[styles.sectionLabel, { marginTop: spacing.xl }]}>AI & AUTOMATION</Text>
      <View style={styles.listCard}>
        {AI_AUTOMATION_ITEMS.map((item, i) => (
          <TouchableOpacity key={i} style={styles.item} activeOpacity={0.78} onPress={() => router.push(item.route)}>
            <View style={styles.itemIcon}>
              <SymbolView name={item.icon} size={20} tintColor={colors.accent} resizeMode="scaleAspectFit" />
            </View>
            <View style={styles.itemBody}>
              <Text style={styles.itemTitle}>{item.title}</Text>
              <Text style={styles.itemSubtitle}>{item.subtitle}</Text>
            </View>
            <SymbolView name="chevron.right" size={14} tintColor={colors.textMuted} resizeMode="scaleAspectFit" />
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
  );
}

// ─── Hero Card ────────────────────────────────────────────────────────────────
//
function MoreHeroCard({
  colors,
  integrations,
  styles,
}: {
  colors: ThemeColors;
  integrations: { status: string; last_sync_at: string | null }[];
  styles: ReturnType<typeof createStyles>;
}) {
  const connectedCount = useMemo(
    () => integrations.filter((i) => i.status === "connected").length,
    [integrations],
  );

  return (
    <View style={styles.heroCard}>
      <Text style={styles.heroLabel}>HELIOS CORE</Text>
      <Text style={styles.heroTitle}>Command Center</Text>
      <Text style={styles.heroSubtitle}>
        Manage your profile, integrations, preferences, notifications, appearance, security, and developer tools — all from one place.
      </Text>

      <View style={styles.heroDivider} />

      <View style={styles.heroStatusRow}>
        <HeroStatusItem icon="scope"                 title="AI Online"  subtitle="Active"                                                 color={colors.accentCyan} styles={styles} />
        <HeroStatusItem icon="square.grid.2x2.fill"  title={`${connectedCount} ${connectedCount === 1 ? "App" : "Apps"}`} subtitle={connectedCount > 0 ? "Connected" : "Not connected"} color={connectedCount > 0 ? colors.accent : colors.textMuted} styles={styles} />
        <HeroStatusItem icon="brain.head.profile"    title="Memory On"  subtitle="Learning"                                               color={colors.success}    styles={styles} />
        <HeroStatusItem icon="checkmark.shield.fill" title="Secured"    subtitle="Protected"                                              color={colors.info}       styles={styles} />
      </View>
    </View>
  );
}

function HeroStatusItem({
  color, icon, styles, subtitle, title,
}: {
  color: string; icon: string;
  styles: ReturnType<typeof createStyles>; subtitle: string; title: string;
}) {
  return (
    <View style={styles.statusItem}>
      <SymbolView name={icon as never} size={15} tintColor={color} resizeMode="scaleAspectFit" />
      <View style={styles.statusTextStack}>
        <Text style={[styles.statusTitle, { color }]} numberOfLines={1}>{title}</Text>
        <Text style={styles.statusSub} numberOfLines={1}>{subtitle}</Text>
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      paddingHorizontal: spacing.lg,
      paddingBottom: spacing.xxl * 2,
    },

    // ── Hero card ──────────────────────────────────────────────────────────────
    heroCard: {
      borderRadius: radius.lg,       // 24pt — matches reference corner radius
      borderWidth: 1,
      borderColor: `${colors.accent}28`,
      backgroundColor: colors.surface,
      paddingHorizontal: 24,
      paddingTop: 24,
      paddingBottom: 22,
      marginBottom: spacing.xl,
      overflow: "hidden",
    },
    // Typography
    heroLabel: {
      fontSize: 11,
      fontWeight: "700",
      letterSpacing: 3.5,
      color: colors.accent,
      marginBottom: 8,
    },
    heroTitle: {
      fontSize: 28,
      fontWeight: "800",
      color: colors.textPrimary,
      lineHeight: 34,
      marginBottom: 10,
    },
    heroSubtitle: {
      fontSize: 15,
      fontWeight: "400",
      color: colors.textSecondary,
      lineHeight: 23,
      maxWidth: 292,
    },

    // Divider — hairline, accent tinted, sits between body copy and status row
    heroDivider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: `${colors.accent}30`,
      marginTop: 24,
      marginBottom: 18,
    },

    // Status row — 4 items, each HORIZONTAL: [icon] [title + subtitle stacked]
    // 313pt content (16pt padding) / 4 = 78pt per item — fits all text at 11/9pt
    heroStatusRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
    },
    statusItem: {
      flex: 1,
      alignItems: "center",
      justifyContent: "flex-start",
      minWidth: 0,
      paddingHorizontal: 2,
      gap: 6,
    },
    statusTextStack: {
      alignItems: "center",
      alignSelf: "stretch",
      minWidth: 0,
    },
    statusTitle: {
      fontSize: 10.5,
      fontWeight: "800",
      lineHeight: 14,
      textAlign: "center",
    },
    statusSub: {
      fontSize: 9,
      fontWeight: "500",
      color: colors.textMuted,
      lineHeight: 12,
      marginTop: 2,
      textAlign: "center",
    },

    // ── List sections ──────────────────────────────────────────────────────────
    sectionLabel: {
      ...typography.label,
      color: colors.textMuted,
      marginBottom: spacing.sm,
    },
    listCard: {
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      overflow: "hidden",
    },
    item: {
      minHeight: 78,
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: colors.borderDark,
    },
    itemIcon: {
      width: 42, height: 42,
      borderRadius: 16,
      backgroundColor: `${colors.accent}14`,
      borderWidth: 1,
      borderColor: `${colors.accent}25`,
      alignItems: "center",
      justifyContent: "center",
    },
    itemBody: {
      flex: 1,
      gap: 3,
    },
    itemTitle: {
      ...typography.title,
      color: colors.textPrimary,
      fontSize: 16,
    },
    itemSubtitle: {
      ...typography.caption,
      color: colors.textMuted,
      lineHeight: 18,
    },
  });
}
