import { View, Text, StyleSheet } from "react-native";
import { SymbolView } from "expo-symbols";
import type { SFSymbol } from "sf-symbols-typescript";
import { spacing, type ThemeColors } from "../theme/theme";
import { useTheme } from "../theme/ThemeContext";

type MetricCardProps = {
  value: string;
  label: string;
  helper?: string;
  icon?: SFSymbol;
};

export default function MetricCard({ value, label, helper, icon }: MetricCardProps) {
  const { colors } = useTheme();
  const styles = createStyles(colors);

  return (
    <View style={styles.card}>
      <View style={styles.glow} />
      <View style={styles.cardTop}>
        {icon && (
          <View style={styles.iconBadge}>
            <SymbolView
              name={icon}
              size={20}
              tintColor={colors.accent}
              resizeMode="scaleAspectFit"
            />
          </View>
        )}
      </View>
      <View>
        <Text style={styles.value}>{value}</Text>
        <Text style={styles.label}>{label}</Text>
        {helper ? <Text style={styles.helper}>{helper}</Text> : null}
      </View>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    card: {
      width: "48%",
      minHeight: 156,
      backgroundColor: `${colors.surface}ee`,
      borderRadius: 25,
      padding: spacing.md,
      borderWidth: 1,
      borderColor: `${colors.accentCyan}24`,
      justifyContent: "space-between",
      overflow: "hidden",
      shadowColor: colors.accent,
      shadowOffset: { width: 0, height: 14 },
      shadowOpacity: 0.16,
      shadowRadius: 22,
    },
    glow: {
      position: "absolute",
      top: -36,
      right: -32,
      width: 86,
      height: 86,
      borderRadius: 43,
      backgroundColor: `${colors.accent}1f`,
    },
    cardTop: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    iconBadge: {
      width: 46,
      height: 46,
      borderRadius: 16,
      backgroundColor: `${colors.accent}18`,
      borderWidth: 1,
      borderColor: `${colors.accent}30`,
      alignItems: "center",
      justifyContent: "center",
    },
    value: {
      color: colors.textPrimary,
      fontSize: 34,
      fontWeight: "900",
      marginBottom: spacing.xs,
    },
    label: {
      color: colors.textPrimary,
      fontSize: 14,
      fontWeight: "800",
      marginBottom: 3,
    },
    helper: {
      color: colors.textMuted,
      fontSize: 12,
      fontWeight: "600",
    },
  });
}
