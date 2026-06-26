import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import { SymbolView } from "expo-symbols";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { spacing, radius, typography, type ThemeColors } from "../../theme/theme";
import { useTheme } from "../../theme/ThemeContext";
import { useAuthStore } from "../../store";
import { profileService } from "../../services/profileService";
import { ApiError } from "../../services/apiClient";

// ── Email field ───────────────────────────────────────────────────────────────

type EmailFieldProps = {
  label: string;
  placeholder: string;
  value: string;
  onChangeText: (v: string) => void;
  onSubmitEditing?: () => void;
  returnKeyType?: "next" | "done";
  colors: ThemeColors;
  styles: ReturnType<typeof createStyles>;
  inputRef?: React.RefObject<TextInput | null>;
  secure?: boolean;
};

function Field({
  label, placeholder, value, onChangeText, onSubmitEditing,
  returnKeyType = "next", colors, styles, inputRef, secure = false,
}: EmailFieldProps) {
  const [visible, setVisible] = useState(false);
  const [focused, setFocused] = useState(false);

  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={[styles.fieldWrap, focused && { borderColor: colors.accent }]}>
        <TextInput
          ref={inputRef}
          style={styles.fieldInput}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.textMuted}
          secureTextEntry={secure && !visible}
          autoCapitalize="none"
          autoCorrect={false}
          spellCheck={false}
          smartInsertDelete={false}
          autoComplete={secure ? "off" : "email"}
          textContentType={secure ? "password" : "emailAddress"}
          keyboardType={secure ? "default" : "email-address"}
          returnKeyType={returnKeyType}
          onSubmitEditing={onSubmitEditing}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          accessibilityLabel={label}
        />
        {secure && (
          <TouchableOpacity
            style={styles.eyeButton}
            onPress={() => setVisible((v) => !v)}
            activeOpacity={0.7}
            accessibilityLabel={visible ? "Hide password" : "Show password"}
            accessibilityRole="button"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <SymbolView
              name={visible ? "eye.slash.fill" : "eye.fill"}
              size={16}
              tintColor={focused ? colors.accent : colors.textMuted}
              resizeMode="scaleAspectFit"
            />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

const EMAIL_RE = /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/;

export default function ChangeEmailScreen() {
  const { colors, isDark } = useTheme();
  const insets   = useSafeAreaInsets();
  const router   = useRouter();
  const styles   = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  const accessToken  = useAuthStore((s) => s.accessToken);
  const currentEmail = useAuthStore((s) => s.user?.email ?? "");

  const [password,    setPassword]    = useState("");
  const [newEmail,    setNewEmail]    = useState("");
  const [confirmEmail, setConfirmEmail] = useState("");
  const [isLoading,   setIsLoading]   = useState(false);
  const [error,       setError]       = useState<string | null>(null);
  const [succeeded,   setSucceeded]   = useState(false);

  const newEmailRef     = useRef<TextInput>(null);
  const confirmEmailRef = useRef<TextInput>(null);

  const isValidEmail   = EMAIL_RE.test(newEmail.trim());
  const isDifferent    = newEmail.trim().toLowerCase() !== currentEmail.toLowerCase();
  const emailsMatch    = newEmail.trim() !== "" && newEmail.trim() === confirmEmail.trim();
  const canSubmit      =
    !isLoading &&
    password.length > 0 &&
    isValidEmail &&
    isDifferent &&
    emailsMatch;

  const handleSubmit = useCallback(async () => {
    if (!accessToken || !canSubmit) return;
    Keyboard.dismiss();
    setIsLoading(true);
    setError(null);

    try {
      await profileService.changeEmail(accessToken, password, newEmail.trim().toLowerCase());
      setPassword("");
      setNewEmail("");
      setConfirmEmail("");
      setSucceeded(true);

      setTimeout(() => {
        router.back();
        Alert.alert("Email Updated", "Your email address has been changed successfully.");
      }, 400);
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.message
          : "Unable to update email right now. Please try again.";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [accessToken, canSubmit, password, newEmail, router]);

  const handleCancel = useCallback(() => {
    Keyboard.dismiss();
    router.back();
  }, [router]);

  const inlineValidation = (() => {
    if (!newEmail) return null;
    if (!isValidEmail) return "Enter a valid email address.";
    if (!isDifferent) return "New email must be different from your current address.";
    if (confirmEmail && !emailsMatch) return "Email addresses do not match.";
    return null;
  })();

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* ── Header ───────────────────────────────────────────────────────── */}
      <View style={styles.headerRow}>
        <TouchableOpacity style={styles.backButton} onPress={handleCancel} activeOpacity={0.75}>
          <SymbolView name="chevron.left" size={15} tintColor={colors.textPrimary} resizeMode="scaleAspectFit" />
          <Text style={styles.backLabel}>Profile</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Change Email</Text>
        <View style={styles.headerSpacer} />
      </View>

      <KeyboardAvoidingView
        style={styles.kav}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={0}
      >
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 40 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* ── Current address ──────────────────────────────────────────── */}
          <Text style={styles.sectionLabel}>CURRENT EMAIL</Text>
          <View style={styles.currentEmailCard}>
            <SymbolView
              name="envelope.fill"
              size={14}
              tintColor={colors.textMuted}
              resizeMode="scaleAspectFit"
            />
            <Text style={styles.currentEmailText} numberOfLines={1}>{currentEmail || "—"}</Text>
          </View>

          {/* ── Fields ───────────────────────────────────────────────────── */}
          <Text style={styles.sectionLabel}>UPDATE EMAIL</Text>
          <View style={styles.card}>
            <Field
              label="CURRENT PASSWORD"
              placeholder="Verify your identity"
              value={password}
              onChangeText={(v) => { setPassword(v); setError(null); }}
              onSubmitEditing={() => newEmailRef.current?.focus()}
              returnKeyType="next"
              colors={colors}
              styles={styles}
              secure
            />
            <View style={styles.cardDivider} />
            <Field
              label="NEW EMAIL ADDRESS"
              placeholder="Enter new email"
              value={newEmail}
              onChangeText={(v) => { setNewEmail(v); setError(null); }}
              onSubmitEditing={() => confirmEmailRef.current?.focus()}
              returnKeyType="next"
              colors={colors}
              styles={styles}
              inputRef={newEmailRef}
            />
            <View style={styles.cardDivider} />
            <Field
              label="CONFIRM NEW EMAIL"
              placeholder="Re-enter new email"
              value={confirmEmail}
              onChangeText={(v) => { setConfirmEmail(v); setError(null); }}
              onSubmitEditing={handleSubmit}
              returnKeyType="done"
              colors={colors}
              styles={styles}
              inputRef={confirmEmailRef}
            />
          </View>

          {/* ── Inline validation hint ────────────────────────────────────── */}
          {inlineValidation ? (
            <View style={styles.hintBanner}>
              <SymbolView
                name="info.circle.fill"
                size={13}
                tintColor={colors.textMuted}
                resizeMode="scaleAspectFit"
              />
              <Text style={styles.hintText}>{inlineValidation}</Text>
            </View>
          ) : null}

          {/* ── Error banner ─────────────────────────────────────────────── */}
          {error ? (
            <View style={styles.errorBanner}>
              <SymbolView
                name="exclamationmark.triangle.fill"
                size={14}
                tintColor={colors.danger}
                resizeMode="scaleAspectFit"
              />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          {/* ── Actions ──────────────────────────────────────────────────── */}
          <TouchableOpacity
            style={[
              styles.submitButton,
              !canSubmit && styles.submitButtonDisabled,
              succeeded && styles.submitButtonSuccess,
            ]}
            onPress={handleSubmit}
            disabled={!canSubmit || succeeded}
            activeOpacity={0.82}
            accessibilityRole="button"
            accessibilityLabel="Update Email"
            accessibilityState={{ disabled: !canSubmit || succeeded }}
          >
            {isLoading ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : succeeded ? (
              <>
                <SymbolView name="checkmark" size={14} tintColor="#ffffff" resizeMode="scaleAspectFit" />
                <Text style={styles.submitButtonText}>Updated</Text>
              </>
            ) : (
              <Text style={styles.submitButtonText}>Update Email</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.cancelButton}
            onPress={handleCancel}
            activeOpacity={0.75}
            accessibilityRole="button"
            accessibilityLabel="Cancel"
          >
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

function createStyles(colors: ThemeColors, isDark: boolean) {
  return StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: colors.background,
    },

    // ── Header ───────────────────────────────────────────────────────────────
    headerRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderBottomWidth: 1,
      borderBottomColor: colors.primaryBorder,
    },
    backButton: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      flex: 1,
    },
    backLabel: {
      ...typography.body,
      color: colors.textPrimary,
      fontWeight: "600",
    },
    headerTitle: {
      ...typography.body,
      color: colors.textPrimary,
      fontWeight: "700",
      textAlign: "center",
      flex: 1,
    },
    headerSpacer: {
      flex: 1,
    },

    // ── Layout ───────────────────────────────────────────────────────────────
    kav: { flex: 1 },
    scroll: { flex: 1 },
    scrollContent: {
      paddingHorizontal: spacing.md,
      paddingTop: spacing.lg,
      gap: spacing.md,
    },

    // ── Section label ─────────────────────────────────────────────────────────
    sectionLabel: {
      ...typography.label,
      color: colors.textMuted,
    },

    // ── Current email display ─────────────────────────────────────────────────
    currentEmailCard: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
    },
    currentEmailText: {
      ...typography.body,
      color: colors.textSecondary,
      flex: 1,
    },

    // ── Card ─────────────────────────────────────────────────────────────────
    card: {
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: "hidden",
    },
    cardDivider: {
      height: 1,
      backgroundColor: colors.border,
    },

    // ── Field ────────────────────────────────────────────────────────────────
    fieldGroup: {
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.md,
      paddingBottom: spacing.sm,
      gap: 6,
    },
    fieldLabel: {
      ...typography.label,
      color: colors.textMuted,
      fontSize: 10,
    },
    fieldWrap: {
      flexDirection: "row",
      alignItems: "center",
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      backgroundColor: isDark ? colors.surfaceDark : colors.glassSubtle,
      minHeight: 48,
      paddingHorizontal: spacing.md,
    },
    fieldInput: {
      flex: 1,
      ...typography.body,
      color: colors.textPrimary,
      paddingVertical: spacing.sm,
    },
    eyeButton: {
      paddingLeft: spacing.sm,
      paddingVertical: spacing.xs,
      alignItems: "center",
      justifyContent: "center",
    },

    // ── Hint banner ───────────────────────────────────────────────────────────
    hintBanner: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: spacing.sm,
      backgroundColor: `${colors.textMuted}14`,
      borderWidth: 1,
      borderColor: `${colors.textMuted}20`,
      borderRadius: radius.md,
      padding: spacing.md,
    },
    hintText: {
      ...typography.caption,
      color: colors.textMuted,
      flex: 1,
      lineHeight: 18,
    },

    // ── Error banner ──────────────────────────────────────────────────────────
    errorBanner: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: spacing.sm,
      backgroundColor: `${colors.danger}14`,
      borderWidth: 1,
      borderColor: `${colors.danger}30`,
      borderRadius: radius.md,
      padding: spacing.md,
    },
    errorText: {
      ...typography.caption,
      color: colors.danger,
      flex: 1,
      lineHeight: 18,
    },

    // ── Buttons ───────────────────────────────────────────────────────────────
    submitButton: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: spacing.sm,
      backgroundColor: colors.accent,
      borderRadius: radius.md,
      paddingVertical: 15,
      minHeight: 52,
    },
    submitButtonDisabled: {
      opacity: 0.4,
    },
    submitButtonSuccess: {
      backgroundColor: colors.accentCyan,
      opacity: 1,
    },
    submitButtonText: {
      ...typography.body,
      color: "#ffffff",
      fontWeight: "700",
    },
    cancelButton: {
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: 14,
    },
    cancelButtonText: {
      ...typography.body,
      color: colors.textMuted,
    },
  });
}
