import { View, Text, StyleSheet, ScrollView } from "react-native";
import MetricCard from "../components/MetricCard";
import SectionCard from "../components/SectionCard";
import { colors } from "../theme/theme";
import {
  dashboardMetrics,
  dashboardSections,
} from "../data/dashboardData";

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
        {dashboardMetrics.map((metric) => (
          <MetricCard
            key={metric.label}
            value={metric.value}
            label={metric.label}
          />
        ))}
      </View>

      {dashboardSections.map((section) => (
        <SectionCard key={section.title} title={section.title}>
          {section.content}
        </SectionCard>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    padding: 24,
    paddingTop: 72,
  },
  greeting: {
    color: colors.textPrimary,
    fontSize: 30,
    fontWeight: "800",
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 15,
    marginTop: 6,
    marginBottom: 24,
  },
  heroCard: {
    backgroundColor: colors.surface,
    borderRadius: 28,
    padding: 24,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 20,
  },
  heroLabel: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 2,
    marginBottom: 10,
  },
  heroTitle: {
    color: colors.textPrimary,
    fontSize: 26,
    fontWeight: "800",
    marginBottom: 10,
  },
  heroText: {
    color: colors.textSecondary,
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
