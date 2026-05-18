import { View, Text, StyleSheet } from "react-native";
import { colors } from "../../theme/theme";

export default function AgentsScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>AI Agents</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: "center",
    alignItems: "center",
  },
  title: {
    color: colors.textPrimary,
    fontSize: 28,
    fontWeight: "800",
  },
});
