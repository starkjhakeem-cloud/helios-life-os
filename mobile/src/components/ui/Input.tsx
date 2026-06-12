import { forwardRef, useState } from "react";
import { View, TextInput, Text, StyleSheet, type TextInputProps } from "react-native";
import { spacing, radius, typography } from "../../theme/theme";
import { useTheme } from "../../theme/ThemeContext";

type Props = TextInputProps & {
  label?: string;
  error?: string;
};

const Input = forwardRef<TextInput, Props>(function Input(
  { label, error, style, onFocus, onBlur, ...rest },
  ref,
) {
  const [focused, setFocused] = useState(false);
  const { colors } = useTheme();

  return (
    <View style={styles.container}>
      {label ? <Text style={[styles.label, { color: colors.textMuted }]}>{label}</Text> : null}
      <TextInput
        ref={ref}
        style={[
          styles.input,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
            color: colors.textPrimary,
          },
          focused && styles.inputFocused,
          focused && { borderColor: colors.accentCyan },
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
  },
  input: {
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingVertical: spacing.sm + spacing.xs,
    paddingHorizontal: spacing.md,
    ...typography.body,
  },
  inputFocused: {},
  inputError: {
    borderColor: "#ef4444",
  },
  error: {
    ...typography.caption,
    color: "#ef4444",
  },
});
