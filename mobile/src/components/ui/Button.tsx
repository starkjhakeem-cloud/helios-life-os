import { Pressable, Text, ActivityIndicator, StyleSheet } from "react-native";
import { colors, spacing, radius, typography } from "../../theme/theme";

type ButtonVariant = "primary" | "secondary" | "ghost";

type Props = {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  fullWidth?: boolean;
  loading?: boolean;
};

const variantStyle = {
  primary:   { backgroundColor: colors.accent,       borderWidth: 0,  borderColor: "transparent" },
  secondary: { backgroundColor: colors.surface,      borderWidth: 1,  borderColor: colors.border },
  ghost:     { backgroundColor: "transparent",        borderWidth: 1,  borderColor: colors.border },
} as const;

const labelColor: Record<ButtonVariant, string> = {
  primary:   colors.textPrimary,
  secondary: colors.textPrimary,
  ghost:     colors.accent,
};

export default function Button({
  label,
  onPress,
  variant = "primary",
  disabled = false,
  fullWidth = false,
  loading = false,
}: Props) {
  return (
    <Pressable
      onPress={onPress}
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
        <Text style={[styles.label, { color: labelColor[variant] }]}>
          {label}
        </Text>
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
