import { useMemo, useState } from "react";
import { Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { SymbolView } from "expo-symbols";

import { radius, spacing, typography, type ThemeColors } from "../../theme/theme";
import { useTheme } from "../../theme/ThemeContext";
import { formatDateInput, formatDateTimeInput } from "../../utils/dateInput";

type Mode = "date" | "datetime";

type Props = {
  label: string;
  value: Date | null;
  onChange: (date: Date | null) => void;
  mode?: Mode;
  placeholder?: string;
  error?: string | null;
  minimumDate?: Date;
  maximumDate?: Date;
  disabled?: boolean;
};

export default function DateTimeField({
  label,
  value,
  onChange,
  mode = "datetime",
  placeholder = mode === "date" ? "Select date" : "Select date and time",
  error,
  minimumDate,
  maximumDate,
  disabled = false,
}: Props) {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [open, setOpen] = useState(false);
  const [androidStep, setAndroidStep] = useState<"date" | "time">("date");
  const pickerValue = value ?? new Date();
  const displayValue = value
    ? mode === "date"
      ? formatDateInput(value)
      : formatDateTimeInput(value)
    : placeholder;

  function handlePress() {
    if (disabled) return;
    setAndroidStep("date");
    setOpen(true);
  }

  function handlePickerChange(event: DateTimePickerEvent, selected?: Date) {
    if (event.type === "dismissed") {
      setOpen(false);
      setAndroidStep("date");
      return;
    }
    if (!selected) return;

    if (Platform.OS === "android" && mode === "datetime" && androidStep === "date") {
      const merged = new Date(value ?? selected);
      merged.setFullYear(selected.getFullYear(), selected.getMonth(), selected.getDate());
      onChange(merged);
      setAndroidStep("time");
      return;
    }

    onChange(selected);
    if (Platform.OS === "android") {
      setOpen(false);
      setAndroidStep("date");
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <TouchableOpacity
        style={[
          styles.field,
          {
            backgroundColor: isDark ? colors.surface : colors.glassSubtle,
            borderColor: error ? colors.danger : isDark ? colors.border : colors.secondaryBorder,
          },
          disabled && styles.disabled,
        ]}
        onPress={handlePress}
        activeOpacity={0.78}
        accessibilityRole="button"
        accessibilityLabel={label}
      >
        <Text style={[styles.value, !value && styles.placeholder]} numberOfLines={1}>
          {displayValue}
        </Text>
        <SymbolView name="calendar" size={17} tintColor={colors.textMuted} resizeMode="scaleAspectFit" />
      </TouchableOpacity>
      {error ? <Text style={styles.error}>{error}</Text> : null}

      {open ? (
        <View style={styles.pickerWrap}>
          <DateTimePicker
            value={pickerValue}
            mode={Platform.OS === "android" ? (androidStep as "date" | "time") : mode}
            display={Platform.OS === "ios" ? "spinner" : "default"}
            minimumDate={minimumDate}
            maximumDate={maximumDate}
            accentColor={colors.accent}
            themeVariant={isDark ? "dark" : "light"}
            onChange={handlePickerChange}
          />
          {Platform.OS === "ios" ? (
            <TouchableOpacity style={styles.doneButton} onPress={() => setOpen(false)} activeOpacity={0.75}>
              <Text style={styles.doneText}>DONE</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      gap: spacing.xs,
      marginBottom: spacing.md,
    },
    label: {
      ...typography.label,
      color: colors.textMuted,
    },
    field: {
      minHeight: 48,
      borderRadius: radius.md,
      borderWidth: 1,
      paddingHorizontal: spacing.md,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: spacing.sm,
    },
    disabled: {
      opacity: 0.5,
    },
    value: {
      ...typography.body,
      color: colors.textPrimary,
      flex: 1,
    },
    placeholder: {
      color: colors.textMuted,
    },
    error: {
      ...typography.caption,
      color: colors.danger,
    },
    pickerWrap: {
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.secondaryBorder,
      backgroundColor: colors.glassSubtle,
      overflow: "hidden",
      paddingVertical: spacing.xs,
    },
    doneButton: {
      alignSelf: "flex-end",
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
    doneText: {
      ...typography.label,
      color: colors.accent,
    },
  });
}
