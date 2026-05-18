import { useState } from "react";
import { View, StyleSheet } from "react-native";
import { Link } from "expo-router";
import { useAuthStore } from "../../store";
import { Screen, Text, Button, Input } from "../../components/ui";
import { colors, spacing } from "../../theme/theme";

export default function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const { login, isLoading, error, clearError } = useAuthStore();

  async function handleLogin() {
    clearError();
    await login(email, password);
  }

  return (
    <Screen style={styles.screen}>
      <View style={styles.header}>
        <Text variant="label" color={colors.accentCyan}>HELIOS</Text>
        <Text variant="displaySmall" style={styles.centered}>ACCESS SYSTEM</Text>
        <Text variant="body" color={colors.textMuted} style={styles.centered}>
          Enter your credentials to continue
        </Text>
      </View>

      <View style={styles.form}>
        <Input
          label="EMAIL"
          value={email}
          onChangeText={setEmail}
          placeholder="operator@helios.app"
          keyboardType="email-address"
        />
        <Input
          label="PASSWORD"
          value={password}
          onChangeText={setPassword}
          placeholder="••••••••"
          secureTextEntry
        />
        {error ? (
          <Text variant="caption" color="#ef4444">{error}</Text>
        ) : null}
        <Button
          label="ACCESS SYSTEM"
          onPress={handleLogin}
          fullWidth
          loading={isLoading}
        />
      </View>

      <View style={styles.footer}>
        <Text variant="body" color={colors.textMuted}>New operator?  </Text>
        <Link href="/(auth)/signup">
          <Text variant="body" color={colors.accentCyan}>Create account</Text>
        </Link>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: {
    justifyContent: "center",
    paddingBottom: spacing.xl,
  },
  header: {
    alignItems: "center",
    marginBottom: spacing.xl,
    gap: spacing.sm,
  },
  centered: {
    textAlign: "center",
  },
  form: {
    gap: spacing.md,
  },
  footer: {
    flexDirection: "row",
    justifyContent: "center",
    marginTop: spacing.xl,
  },
});
