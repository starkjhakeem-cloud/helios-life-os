import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SymbolView } from "expo-symbols";
import type { SFSymbol } from "sf-symbols-typescript";

import { radius, spacing, typography, type ThemeColors } from "../../theme/theme";
import { useTheme } from "../../theme/ThemeContext";

type MoreItem = {
  title: string;
  subtitle: string;
  icon: SFSymbol;
  route:
    | "/(tabs)/assistant-settings"
    | "/(tabs)/assistant"
    | "/(tabs)/developer-options"
    | "/(tabs)/notifications"
    | "/(tabs)/integrations"
    | "/(tabs)/memory"
    | "/(tabs)/profile";
};

const BASE_MORE_ITEMS: MoreItem[] = [
  {
    title: "Account",
    subtitle: "Profile, identity, and account details",
    icon: "person.crop.circle",
    route: "/(tabs)/profile",
  },
  {
    title: "Personalization",
    subtitle: "Preferences that shape how HELIOS helps",
    icon: "slider.horizontal.3",
    route: "/(tabs)/profile",
  },
  {
    title: "Assistant Settings",
    subtitle: "Preferences, permissions, daily brief, memory, and automation",
    icon: "bubble.left.and.bubble.right",
    route: "/(tabs)/assistant-settings",
  },
  {
    title: "Notifications",
    subtitle: "Alerts, reminders, and items that need attention",
    icon: "bell",
    route: "/(tabs)/notifications",
  },
  {
    title: "Appearance",
    subtitle: "Theme and visual preferences",
    icon: "paintbrush",
    route: "/(tabs)/profile",
  },
  {
    title: "Privacy & Security",
    subtitle: "Session, privacy, and account safety",
    icon: "lock.shield",
    route: "/(tabs)/profile",
  },
  {
    title: "Connected Services",
    subtitle: "Apps and services HELIOS can use",
    icon: "link",
    route: "/(tabs)/integrations",
  },
  {
    title: "About HELIOS",
    subtitle: "App details and support information",
    icon: "info.circle",
    route: "/(tabs)/profile",
  },
];

const DEV_ITEM: MoreItem = {
  title: "Developer Options",
  subtitle: "Diagnostics for development builds",
  icon: "hammer",
  route: "/(tabs)/developer-options",
};

const MORE_ITEMS: MoreItem[] = __DEV__
  ? [...BASE_MORE_ITEMS.slice(0, -1), DEV_ITEM, BASE_MORE_ITEMS[BASE_MORE_ITEMS.length - 1]]
  : BASE_MORE_ITEMS;

const FEATURE_ITEMS: MoreItem[] = [
  {
    title: "Assistant",
    subtitle: "Conversation and planning",
    icon: "sparkles",
    route: "/(tabs)/assistant",
  },
  {
    title: "Memory",
    subtitle: "Long-term context HELIOS can remember",
    icon: "brain.head.profile",
    route: "/(tabs)/memory",
  },
];

export default function MoreScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = createStyles(colors);

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={[styles.container, { paddingTop: insets.top + spacing.lg }]}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.heroCard}>
        <View style={styles.heroIcon}>
          <SymbolView
            name="square.grid.3x3"
            size={26}
            tintColor={colors.accentCyan}
            resizeMode="scaleAspectFit"
          />
        </View>
        <Text style={styles.heroLabel}>HELIOS MORE</Text>
        <Text style={styles.heroTitle}>All systems, less clutter.</Text>
        <Text style={styles.heroSubtitle}>
          Secondary tools stay close without crowding the main navigation.
        </Text>
      </View>

      <Text style={styles.sectionLabel}>MORE</Text>

      <View style={styles.listCard}>
        {MORE_ITEMS.map((item, index) => (
          <TouchableOpacity
            key={`${item.title}-${index}`}
            style={styles.item}
            activeOpacity={0.78}
            onPress={() => router.push(item.route)}
          >
            <View style={styles.itemIcon}>
              <SymbolView
                name={item.icon}
                size={20}
                tintColor={colors.accent}
                resizeMode="scaleAspectFit"
              />
            </View>
            <View style={styles.itemBody}>
              <Text style={styles.itemTitle}>{item.title}</Text>
              <Text style={styles.itemSubtitle}>{item.subtitle}</Text>
            </View>
            <SymbolView
              name="chevron.right"
              size={14}
              tintColor={colors.textMuted}
              resizeMode="scaleAspectFit"
            />
          </TouchableOpacity>
        ))}
      </View>

      <Text style={[styles.sectionLabel, { marginTop: spacing.xl }]}>HELPFUL TOOLS</Text>
      <View style={styles.listCard}>
        {FEATURE_ITEMS.map((item, index) => (
          <TouchableOpacity
            key={`${item.title}-${index}`}
            style={styles.item}
            activeOpacity={0.78}
            onPress={() => router.push(item.route)}
          >
            <View style={styles.itemIcon}>
              <SymbolView
                name={item.icon}
                size={20}
                tintColor={colors.accent}
                resizeMode="scaleAspectFit"
              />
            </View>
            <View style={styles.itemBody}>
              <Text style={styles.itemTitle}>{item.title}</Text>
              <Text style={styles.itemSubtitle}>{item.subtitle}</Text>
            </View>
            <SymbolView
              name="chevron.right"
              size={14}
              tintColor={colors.textMuted}
              resizeMode="scaleAspectFit"
            />
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      paddingHorizontal: spacing.lg,
      paddingBottom: spacing.xxl * 2,
    },
    heroCard: {
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: `${colors.accentCyan}25`,
      backgroundColor: colors.surface,
      padding: spacing.xl,
      marginBottom: spacing.xl,
      overflow: "hidden",
    },
    heroIcon: {
      width: 54,
      height: 54,
      borderRadius: 20,
      backgroundColor: `${colors.accentCyan}14`,
      borderWidth: 1,
      borderColor: `${colors.accentCyan}30`,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: spacing.lg,
    },
    heroLabel: {
      ...typography.label,
      color: colors.accentCyan,
      marginBottom: spacing.sm,
    },
    heroTitle: {
      ...typography.displaySmall,
      color: colors.textPrimary,
      marginBottom: spacing.sm,
    },
    heroSubtitle: {
      ...typography.body,
      color: colors.textSecondary,
    },
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
      width: 42,
      height: 42,
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
