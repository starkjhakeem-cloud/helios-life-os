import { useRef, useState, useMemo } from 'react';
import { View, StyleSheet, TextInput } from "react-native";
import { Link } from "expo-router";
import { useAuthStore } from "../../store";
import { Screen, Text, Button, Input } from "../../components/ui";
import { spacing , type ThemeColors } from "../../theme/theme";
import { useTheme } from "../../theme/ThemeContext";

export default function LoginScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const { login, isLoading, error, clearError } = useAuthStore();

  const passwordRef = useRef<TextInput>(null);

  function validate(): boolean {
    const e = email.trim();
    if (!e) { setLocalError("Email is required."); return false; }
    if (!e.includes("@") || !e.includes(".")) { setLocalError("Enter a valid email address."); return false; }
    if (!password) { setLocalError("Password is required."); return false; }
    return true;
  }

  async function handleLogin() {
    setLocalError(null);
    clearError();
    if (!validate()) return;
    await login(email.trim().toLowerCase(), password);
  }

  const displayError = localError ?? error;

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
          onChangeText={(t) => { setEmail(t); setLocalError(null); }}
          placeholder="operator@helios.app"
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          returnKeyType="next"
          onSubmitEditing={() => passwordRef.current?.focus()}
          blurOnSubmit={false}
        />
        <Input
          ref={passwordRef}
          label="PASSWORD"
          value={password}
          onChangeText={(t) => { setPassword(t); setLocalError(null); }}
          placeholder="••••••••"
          secureTextEntry
          autoCapitalize="none"
          autoComplete="current-password"
          returnKeyType="done"
          onSubmitEditing={handleLogin}
        />
        {displayError ? (
          <Text variant="caption" color={colors.danger}>{displayError}</Text>
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

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  screen: { justifyContent: "center", paddingBottom: spacing.xl },
  header: { alignItems: "center", marginBottom: spacing.xl, gap: spacing.sm },
  centered: { textAlign: "center" },
  form: { gap: spacing.md },
  footer: { flexDirection: "row", justifyContent: "center", marginTop: spacing.xl },
});
}
