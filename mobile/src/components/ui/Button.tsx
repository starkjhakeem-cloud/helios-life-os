import { Pressable, Text, ActivityIndicator, StyleSheet } from "react-native";
import * as Haptics from "expo-haptics";
import { spacing, radius, typography } from "../../theme/theme";
import { useTheme } from "../../theme/ThemeContext";

type ButtonVariant = "primary" | "secondary" | "ghost";

type Props = {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  fullWidth?: boolean;
  loading?: boolean;
};

export default function Button({
  label,
  onPress,
  variant = "primary",
  disabled = false,
  fullWidth = false,
  loading = false,
}: Props) {
  const { colors } = useTheme();
  const variantStyle = {
    primary:   { backgroundColor: colors.accent,  borderWidth: 0, borderColor: "transparent" },
    secondary: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
    ghost:     { backgroundColor: "transparent",  borderWidth: 1, borderColor: colors.border },
  } as const;
  const labelColor: Record<ButtonVariant, string> = {
    primary:   colors.textPrimary,
    secondary: colors.textPrimary,
    ghost:     colors.accent,
  };

  function handlePress() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    onPress();
  }

  return (
    <Pressable
      onPress={handlePress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.base,
        variantStyle[variant],
        fullWidth && styles.fullWidth,
        pressed && styles.pressed,
        (disabled || loading) && styles.disabled,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={labelColor[variant]} size="small" />
      ) : (
        <Text style={[styles.label, { color: labelColor[variant] }]}>{label}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    paddingVertical: spacing.sm + spacing.xs,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  fullWidth: {
    width: "100%",
  },
  label: {
    ...typography.title,
    fontSize: 15,
  },
  pressed: {
    opacity: 0.72,
  },
  disabled: {
    opacity: 0.38,
  },
});
