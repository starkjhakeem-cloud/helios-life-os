import { useState } from "react";
import { View, StyleSheet } from "react-native";
import { Link } from "expo-router";
import { useAuthStore } from "../../store";
import { Screen, Text, Button, Input } from "../../components/ui";
import { colors, spacing } from "../../theme/theme";

export default function SignupScreen() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const { signup, isLoading, error, clearError } = useAuthStore();

  async function handleSignup() {
    clearError();
    await signup(name, email, password);
  }

  return (
    <Screen style={styles.screen}>
      <View style={styles.header}>
        <Text variant="label" color={colors.accentCyan}>HELIOS</Text>
        <Text variant="displaySmall" style={styles.centered}>CREATE ACCOUNT</Text>
        <Text variant="body" color={colors.textMuted} style={styles.centered}>
          Register your operator profile
        </Text>
      </View>

      <View style={styles.form}>
        <Input
          label="NAME"
          value={name}
          onChangeText={setName}
          placeholder="Operator name"
          autoCapitalize="words"
        />
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
          label="CREATE ACCOUNT"
          onPress={handleSignup}
          fullWidth
          loading={isLoading}
        />
      </View>

      <View style={styles.footer}>
        <Text variant="body" color={colors.textMuted}>Already registered?  </Text>
        <Link href="/(auth)/login">
          <Text variant="body" color={colors.accentCyan}>Sign in</Text>
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
