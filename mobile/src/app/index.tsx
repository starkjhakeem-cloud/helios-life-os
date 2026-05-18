import { View, Text, StyleSheet, ScrollView } from "react-native";
import MetricCard from "../components/MetricCard";
import SectionCard from "../components/SectionCard";

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
        <MetricCard value="82" label="Productivity" />
        <MetricCard value="5h 32m" label="Focus Time" />
        <MetricCard value="12" label="Tasks Done" />
        <MetricCard value="68%" label="Energy" />
      </View>

      <SectionCard title="AI Insight">
        You are most productive between 9 AM and 12 PM. HELIOS recommends scheduling
        deep work during that window.
      </SectionCard>

      <SectionCard title="Today&apos;s Mission">
        Build the first mobile dashboard, commit your progress, and prepare the
        backend foundation.
      </SectionCard>
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
});
