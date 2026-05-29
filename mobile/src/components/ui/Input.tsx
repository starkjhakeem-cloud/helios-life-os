import { forwardRef, useState } from "react";
import { View, TextInput, Text, StyleSheet, type TextInputProps } from "react-native";
import { colors, spacing, radius, typography } from "../../theme/theme";

type Props = TextInputProps & {
  label?: string;
  error?: string;
};

const Input = forwardRef<TextInput, Props>(function Input(
  { label, error, style, onFocus, onBlur, ...rest },
  ref,
) {
  const [focused, setFocused] = useState(false);

  return (
    <View style={styles.container}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <TextInput
        ref={ref}
        style={[
          styles.input,
          focused && styles.inputFocused,
          error ? styles.inputError : null,
          style,
        ]}
        placeholderTextColor={colors.textMuted}
        autoCapitalize="none"
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        {...rest}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
});

export default Input;

const styles = StyleSheet.create({
  container: {
    gap: spacing.xs,
  },
  label: {
    ...typography.label,
    color: colors.textMuted,
  },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingVertical: spacing.sm + spacing.xs,
    paddingHorizontal: spacing.md,
    color: colors.textPrimary,
    ...typography.body,
  },
  inputFocused: {
    borderColor: colors.accentCyan,
  },
  inputError: {
    borderColor: "#ef4444",
  },
  error: {
    ...typography.caption,
    color: "#ef4444",
  },
});
