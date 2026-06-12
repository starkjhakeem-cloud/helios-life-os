import { View, Text, StyleSheet } from "react-native";
import { SymbolView } from "expo-symbols";
import type { SFSymbol } from "sf-symbols-typescript";
import { spacing, radius, type ThemeColors } from "../theme/theme";
import { useTheme } from "../theme/ThemeContext";

type MetricCardProps = {
  value: string;
  label: string;
  icon?: SFSymbol;
};

export default function MetricCard({ value, label, icon }: MetricCardProps) {
  const { colors } = useTheme();
  const styles = createStyles(colors);

  return (
    <View style={styles.card}>
      {icon && (
        <SymbolView
          name={icon}
          size={18}
          tintColor={colors.accent}
          resizeMode="scaleAspectFit"
          style={styles.icon}
        />
      )}
      <Text style={styles.value}>{value}</Text>
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    card: {
      width: "48%",
      minHeight: 132,
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      padding: spacing.lg,
      borderWidth: 1,
      borderColor: `${colors.accentCyan}18`,
      justifyContent: "space-between",
    },
    icon: {
      marginBottom: spacing.md,
    },
    value: {
      color: colors.textPrimary,
      fontSize: 30,
      fontWeight: "900",
      marginBottom: spacing.xs,
    },
    label: {
      color: colors.textMuted,
      fontSize: 13,
      fontWeight: "600",
    },
  });
}
