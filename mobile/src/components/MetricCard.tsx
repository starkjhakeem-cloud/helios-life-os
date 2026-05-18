import { View, Text, StyleSheet } from "react-native";
import { colors } from "../theme/theme";

type MetricCardProps = {
  value: string;
  label: string;
};

export default function MetricCard({
  value,
  label,
}: MetricCardProps) {
  return (
    <View style={styles.card}>
      <Text style={styles.value}>{value}</Text>
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: "48%",
    backgroundColor: colors.surfaceDark,
    borderRadius: 22,
    padding: 18,
    borderWidth: 1,
    borderColor: colors.borderDark,
  },
  value: {
    color: colors.textPrimary,
    fontSize: 24,
    fontWeight: "800",
    marginBottom: 6,
  },
  label: {
    color: colors.textMuted,
    fontSize: 13,
  },
});
