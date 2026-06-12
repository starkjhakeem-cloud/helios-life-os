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
    | "/(tabs)/analytics"
    | "/(tabs)/agents"
    | "/(tabs)/assistant"
    | "/(tabs)/email"
    | "/(tabs)/memory"
    | "/(tabs)/notifications"
    | "/(tabs)/integrations"
    | "/(tabs)/profile";
};

const MORE_ITEMS: MoreItem[] = [
  {
    title: "Analytics",
    subtitle: "Performance trends and completion rates",
    icon: "chart.bar.xaxis",
    route: "/(tabs)/analytics",
  },
  {
    title: "Agents",
    subtitle: "Specialized intelligence and orchestration",
    icon: "cpu",
    route: "/(tabs)/agents",
  },
  {
    title: "Assistant",
    subtitle: "Conversation, planning, and recommended actions",
    icon: "bubble.left.and.bubble.right",
    route: "/(tabs)/assistant",
  },
  {
    title: "Email",
    subtitle: "Inbox context, important messages, and actions",
    icon: "envelope",
    route: "/(tabs)/email",
  },
  {
    title: "Memory",
    subtitle: "Long-term context HELIOS can remember",
    icon: "brain.head.profile",
    route: "/(tabs)/memory",
  },
  {
    title: "Queue",
    subtitle: "Notifications and pending attention items",
    icon: "list.bullet.clipboard",
    route: "/(tabs)/notifications",
  },
  {
    title: "Integrations",
    subtitle: "Connected services and sync status",
    icon: "link",
    route: "/(tabs)/integrations",
  },
  {
    title: "Profile",
    subtitle: "Account, reminders, preferences, and settings",
    icon: "person.crop.circle",
    route: "/(tabs)/profile",
  },
  {
    title: "Settings",
    subtitle: "Theme, planning horizon, and notification controls",
    icon: "gearshape",
    route: "/(tabs)/profile",
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

      <Text style={styles.sectionLabel}>SECONDARY FEATURES</Text>

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
