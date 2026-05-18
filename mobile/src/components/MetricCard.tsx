import { View, Text, StyleSheet } from "react-native";

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
    backgroundColor: "#0b1020",
    borderRadius: 22,
    padding: 18,
    borderWidth: 1,
    borderColor: "#1e2a44",
  },
  value: {
    color: "#ffffff",
    fontSize: 24,
    fontWeight: "800",
    marginBottom: 6,
  },
  label: {
    color: "#8f9bb3",
    fontSize: 13,
  },
});
