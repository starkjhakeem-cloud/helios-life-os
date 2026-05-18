import { View, Text, StyleSheet } from "react-native";
import { colors } from "../theme/theme";

type SectionCardProps = {
  title: string;
  children: string;
};

export default function SectionCard({ title, children }: SectionCardProps) {
  return (
    <View style={styles.card}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.text}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 14,
  },
  title: {
    color: colors.textPrimary,
    fontSize: 19,
    fontWeight: "800",
    marginBottom: 8,
  },
  text: {
    color: colors.textSecondary,
    fontSize: 15,
    lineHeight: 22,
  },
});
