import { View, Text, StyleSheet } from "react-native";
import { SymbolView } from "expo-symbols";
import type { SFSymbol } from "sf-symbols-typescript";
import { colors, spacing, radius } from "../theme/theme";

type MetricCardProps = {
  value: string;
  label: string;
  icon?: SFSymbol;
};

export default function MetricCard({ value, label, icon }: MetricCardProps) {
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

const styles = StyleSheet.create({
  card: {
    width: "48%",
    backgroundColor: colors.surfaceDark,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderDark,
  },
  icon: {
    marginBottom: spacing.sm,
  },
  value: {
    color: colors.textPrimary,
    fontSize: 26,
    fontWeight: "800",
    marginBottom: spacing.xs,
  },
  label: {
    color: colors.textMuted,
    fontSize: 13,
  },
});
