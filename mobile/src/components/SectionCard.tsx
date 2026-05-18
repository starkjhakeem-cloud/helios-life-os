import { View, Text, StyleSheet } from "react-native";

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
    backgroundColor: "#10172a",
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: "#263452",
    marginBottom: 14,
  },
  title: {
    color: "#ffffff",
    fontSize: 19,
    fontWeight: "800",
    marginBottom: 8,
  },
  text: {
    color: "#aab4cf",
    fontSize: 15,
    lineHeight: 22,
  },
});
