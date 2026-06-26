import { forwardRef, useState, useMemo } from "react";
import { View, TextInput, Text, StyleSheet, type TextInputProps } from "react-native";
import { spacing, radius, typography, type ThemeColors } from "../../theme/theme";
import { useTheme } from "../../theme/ThemeContext";

type Props = TextInputProps & {
  label?: string;
  error?: string;
};

const Input = forwardRef<TextInput, Props>(function Input(
  {
    label,
    error,
    style,
    onFocus,
    onBlur,
    autoCapitalize = "none",
    autoCorrect = false,
    spellCheck = false,
    smartInsertDelete = false,
    ...rest
  },
  ref,
) {
  const [focused, setFocused] = useState(false);
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.container}>
      {label ? <Text style={[styles.label, { color: colors.textMuted }]}>{label}</Text> : null}
      <TextInput
        ref={ref}
        style={[
          styles.input,
          {
            backgroundColor: isDark ? colors.surface : colors.glassSubtle,
            borderColor: isDark ? colors.border : colors.secondaryBorder,
            color: colors.textPrimary,
          },
          focused && styles.inputFocused,
          focused && {
            borderColor: colors.accent,
            shadowColor: colors.accent,
            shadowOpacity: isDark ? 0 : 0.12,
            shadowRadius: isDark ? 0 : 10,
            shadowOffset: { width: 0, height: 4 },
          },
          error ? styles.inputError : null,
          style,
        ]}
        placeholderTextColor={colors.textMuted}
        autoCapitalize={autoCapitalize}
        autoCorrect={autoCorrect}
        spellCheck={spellCheck}
        smartInsertDelete={smartInsertDelete}
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

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  container: {
    gap: spacing.xs,
  },
  label: {
    ...typography.label,
  },
  input: {
    borderWidth: 1,
    borderRadius: radius.md,
    minHeight: 48,
    paddingVertical: spacing.sm + spacing.xs,
    paddingHorizontal: spacing.md,
    ...typography.body,
  },
  inputFocused: {},
  inputError: {
    borderColor: colors.danger,
  },
  error: {
    ...typography.caption,
    color: colors.danger,
  },
});
}
