import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useRouter } from "expo-router";
import { SymbolView } from "expo-symbols";
import type { SFSymbol } from "sf-symbols-typescript";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { radius, spacing, typography, type ThemeColors } from "../../theme/theme";
import { useTheme } from "../../theme/ThemeContext";

type SettingsItem = {
  title: string;
  subtitle: string;
  icon: SFSymbol;
  route?: "/(tabs)/assistant-permissions" | "/(tabs)/assistant" | "/(tabs)/memory" | "/(tabs)/notifications";
};

const ITEMS: SettingsItem[] = [
  {
    title: "Assistant Preferences",
    subtitle: "Conversation style and helpfulness preferences",
    icon: "sparkles",
    route: "/(tabs)/assistant",
  },
  {
    title: "Assistant Permissions",
    subtitle: "Choose what HELIOS can do automatically",
    icon: "hand.raised.fill",
    route: "/(tabs)/assistant-permissions",
  },
  {
    title: "Daily Brief Settings",
    subtitle: "Tune what appears in your daily planning brief",
    icon: "doc.text.fill",
    route: "/(tabs)/assistant",
  },
  {
    title: "Memory Settings",
    subtitle: "Manage what HELIOS can remember",
    icon: "brain.head.profile",
    route: "/(tabs)/memory",
  },
  {
    title: "Automation Settings",
    subtitle: "Review reminders and background assistance",
    icon: "clock.arrow.circlepath",
    route: "/(tabs)/assistant-permissions",
  },
];

export default function AssistantSettingsScreen() {
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
      <Text style={styles.label}>ASSISTANT SETTINGS</Text>
      <Text style={styles.title}>Assistant Settings</Text>
      <Text style={styles.subtitle}>Personalize how HELIOS helps, plans, remembers, and asks for approval.</Text>

      <View style={styles.listCard}>
        {ITEMS.map((item) => (
          <TouchableOpacity
            key={item.title}
            style={styles.item}
            activeOpacity={0.78}
            onPress={() => item.route && router.push(item.route)}
          >
            <View style={styles.itemIcon}>
              <SymbolView name={item.icon} size={19} tintColor={colors.accent} resizeMode="scaleAspectFit" />
            </View>
            <View style={styles.itemBody}>
              <Text style={styles.itemTitle}>{item.title}</Text>
              <Text style={styles.itemSubtitle}>{item.subtitle}</Text>
            </View>
            <SymbolView name="chevron.right" size={13} tintColor={colors.textMuted} resizeMode="scaleAspectFit" />
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
    label: {
      ...typography.label,
      color: colors.accent,
      marginBottom: spacing.sm,
    },
    title: {
      ...typography.displaySmall,
      color: colors.textPrimary,
      marginBottom: spacing.sm,
    },
    subtitle: {
      ...typography.body,
      color: colors.textSecondary,
      marginBottom: spacing.xl,
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
      ...typography.body,
      color: colors.textPrimary,
      fontWeight: "800",
    },
    itemSubtitle: {
      ...typography.caption,
      color: colors.textMuted,
    },
  });
}
