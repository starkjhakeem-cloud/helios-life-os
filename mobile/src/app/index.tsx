import { View, Text, StyleSheet, ScrollView } from "react-native";

export default function HomeScreen() {
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
      <Text style={styles.greeting}>Good evening, Aegis.</Text>
      <Text style={styles.subtitle}>Your system overview for today.</Text>

      <View style={styles.heroCard}>
        <Text style={styles.heroLabel}>HELIOS STATUS</Text>
        <Text style={styles.heroTitle}>Command Center Online</Text>
        <Text style={styles.heroText}>
          Your AI life operating system is active and ready to organize goals,
          tasks, finances, habits, and daily strategy.
        </Text>
      </View>

      <View style={styles.grid}>
        <View style={styles.metricCard}>
          <Text style={styles.metricValue}>82</Text>
          <Text style={styles.metricLabel}>Productivity</Text>
        </View>

        <View style={styles.metricCard}>
          <Text style={styles.metricValue}>5h 32m</Text>
          <Text style={styles.metricLabel}>Focus Time</Text>
        </View>

        <View style={styles.metricCard}>
          <Text style={styles.metricValue}>12</Text>
          <Text style={styles.metricLabel}>Tasks Done</Text>
        </View>

        <View style={styles.metricCard}>
          <Text style={styles.metricValue}>68%</Text>
          <Text style={styles.metricLabel}>Energy</Text>
        </View>
      </View>

      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>AI Insight</Text>
        <Text style={styles.sectionText}>
          You are most productive between 9 AM and 12 PM. HELIOS recommends
          scheduling deep work during that window.
        </Text>
      </View>

      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Today&apos;s Mission</Text>
        <Text style={styles.sectionText}>
          Build the first mobile dashboard, commit your progress, and prepare
          the backend foundation.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#050816",
  },
  container: {
    padding: 24,
    paddingTop: 72,
  },
  greeting: {
    color: "#ffffff",
    fontSize: 30,
    fontWeight: "800",
  },
  subtitle: {
    color: "#8f9bb3",
    fontSize: 15,
    marginTop: 6,
    marginBottom: 24,
  },
  heroCard: {
    backgroundColor: "#10172a",
    borderRadius: 28,
    padding: 24,
    borderWidth: 1,
    borderColor: "#263452",
    marginBottom: 20,
  },
  heroLabel: {
    color: "#7c3aed",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 2,
    marginBottom: 10,
  },
  heroTitle: {
    color: "#ffffff",
    fontSize: 26,
    fontWeight: "800",
    marginBottom: 10,
  },
  heroText: {
    color: "#aab4cf",
    fontSize: 15,
    lineHeight: 23,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginBottom: 20,
  },
  metricCard: {
    width: "48%",
    backgroundColor: "#0b1020",
    borderRadius: 22,
    padding: 18,
    borderWidth: 1,
    borderColor: "#1e2a44",
  },
  metricValue: {
    color: "#ffffff",
    fontSize: 24,
    fontWeight: "800",
    marginBottom: 6,
  },
  metricLabel: {
    color: "#8f9bb3",
    fontSize: 13,
  },
  sectionCard: {
    backgroundColor: "#10172a",
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: "#263452",
    marginBottom: 14,
  },
  sectionTitle: {
    color: "#ffffff",
    fontSize: 19,
    fontWeight: "800",
    marginBottom: 8,
  },
  sectionText: {
    color: "#aab4cf",
    fontSize: 15,
    lineHeight: 22,
  },
});
