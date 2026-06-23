import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useRouter } from "expo-router";
import { SymbolView } from "expo-symbols";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { radius, spacing, typography, type ThemeColors } from "../../theme/theme";
import { useTheme } from "../../theme/ThemeContext";

export default function DeveloperOptionsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const developerModeEnabled = __DEV__;

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={[styles.container, { paddingTop: insets.top + spacing.lg }]}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.label}>DEVELOPER OPTIONS</Text>
      <Text style={styles.title}>Developer Options</Text>
      <Text style={styles.subtitle}>Diagnostics are hidden from the normal HELIOS experience.</Text>

      {developerModeEnabled ? (
        <View style={styles.listCard}>
          <TouchableOpacity style={styles.item} activeOpacity={0.78} onPress={() => router.push("/(tabs)/audit-log")}>
            <View style={styles.itemIcon}>
              <SymbolView name="doc.text.magnifyingglass" size={20} tintColor={colors.accentCyan} resizeMode="scaleAspectFit" />
            </View>
            <View style={styles.itemBody}>
              <Text style={styles.itemTitle}>Audit Log</Text>
              <Text style={styles.itemSubtitle}>AI requests, approvals, blocks, errors, jobs, and performance diagnostics</Text>
            </View>
            <SymbolView name="chevron.right" size={14} tintColor={colors.textMuted} resizeMode="scaleAspectFit" />
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>Developer Mode is off.</Text>
          <Text style={styles.emptyText}>Diagnostics are unavailable in the normal user experience.</Text>
        </View>
      )}
    </ScrollView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl * 2 },
    label: { ...typography.label, color: colors.accentCyan, marginBottom: spacing.sm },
    title: { ...typography.displaySmall, color: colors.textPrimary, marginBottom: spacing.sm },
    subtitle: { ...typography.body, color: colors.textSecondary, marginBottom: spacing.xl },
    listCard: {
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      overflow: "hidden",
    },
    item: {
      minHeight: 84,
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
    },
    itemIcon: {
      width: 42,
      height: 42,
      borderRadius: 16,
      backgroundColor: `${colors.accentCyan}14`,
      borderWidth: 1,
      borderColor: `${colors.accentCyan}25`,
      alignItems: "center",
      justifyContent: "center",
    },
    itemBody: { flex: 1, gap: 3 },
    itemTitle: { ...typography.body, color: colors.textPrimary, fontWeight: "800" },
    itemSubtitle: { ...typography.caption, color: colors.textMuted },
    emptyCard: {
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      padding: spacing.lg,
      gap: spacing.xs,
    },
    emptyTitle: { ...typography.body, color: colors.textPrimary, fontWeight: "800" },
    emptyText: { ...typography.caption, color: colors.textMuted },
  });
}
