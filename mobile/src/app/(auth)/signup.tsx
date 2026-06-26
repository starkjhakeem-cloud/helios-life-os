import { useRef, useState, useMemo } from 'react';
import { View, StyleSheet, TextInput } from "react-native";
import { Link } from "expo-router";
import { useAuthStore } from "../../store";
import { Screen, Text, Button, Input } from "../../components/ui";
import { spacing , type ThemeColors } from "../../theme/theme";
import { useTheme } from "../../theme/ThemeContext";

export default function SignupScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const { signup, isLoading, error, clearError } = useAuthStore();

  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);

  function validate(): boolean {
    if (!name.trim()) { setLocalError("Name is required."); return false; }
    const e = email.trim();
    if (!e) { setLocalError("Email is required."); return false; }
    if (!e.includes("@") || !e.includes(".")) { setLocalError("Enter a valid email address."); return false; }
    if (password.length < 6) { setLocalError("Password must be at least 6 characters."); return false; }
    return true;
  }

  async function handleSignup() {
    setLocalError(null);
    clearError();
    if (!validate()) return;
    await signup(name.trim(), email.trim().toLowerCase(), password);
  }

  const displayError = localError ?? error;

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
          onChangeText={(t) => { setName(t); setLocalError(null); }}
          placeholder="Operator name"
          autoCapitalize="words"
          autoComplete="name"
          returnKeyType="next"
          onSubmitEditing={() => emailRef.current?.focus()}
          blurOnSubmit={false}
        />
        <Input
          ref={emailRef}
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
          placeholder="Min. 6 characters"
          secureTextEntry
          autoCapitalize="none"
          autoComplete="new-password"
          returnKeyType="done"
          onSubmitEditing={handleSignup}
        />
        {displayError ? (
          <Text variant="caption" color={colors.danger}>{displayError}</Text>
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

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  screen: { justifyContent: "center", paddingBottom: spacing.xl },
  header: { alignItems: "center", marginBottom: spacing.xl, gap: spacing.sm },
  centered: { textAlign: "center" },
  form: { gap: spacing.md },
  footer: { flexDirection: "row", justifyContent: "center", marginTop: spacing.xl },
});
}
