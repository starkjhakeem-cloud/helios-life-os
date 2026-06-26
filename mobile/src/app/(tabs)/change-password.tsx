import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
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
} from "react-native";
import { useRouter } from "expo-router";
import { SymbolView } from "expo-symbols";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { spacing, radius, typography, type ThemeColors } from "../../theme/theme";
import { useTheme } from "../../theme/ThemeContext";
import { useAuthStore } from "../../store";
import { profileService } from "../../services/profileService";
import { ApiError } from "../../services/apiClient";

// ── Password requirements ─────────────────────────────────────────────────────

const REQUIREMENTS = [
  { id: "length",    label: "At least 8 characters",  test: (v: string) => v.length >= 8 },
  { id: "upper",     label: "One uppercase letter",    test: (v: string) => /[A-Z]/.test(v) },
  { id: "lower",     label: "One lowercase letter",    test: (v: string) => /[a-z]/.test(v) },
  { id: "number",    label: "One number",              test: (v: string) => /\d/.test(v) },
  { id: "special",   label: "One special character",   test: (v: string) => /[!@#$%^&*()\-_=+\[\]{};':"\\|,.<>/?`~]/.test(v) },
] as const;

// ── Secure field ──────────────────────────────────────────────────────────────

type SecureFieldProps = {
  label: string;
  placeholder: string;
  value: string;
  onChangeText: (v: string) => void;
  onSubmitEditing?: () => void;
  returnKeyType?: "next" | "done";
  textContentType?: "password" | "newPassword";
  colors: ThemeColors;
  styles: ReturnType<typeof createStyles>;
  inputRef?: React.RefObject<TextInput | null>;
};

function SecureField({
  label, placeholder, value, onChangeText, onSubmitEditing,
  returnKeyType = "next", textContentType = "password", colors, styles, inputRef,
}: SecureFieldProps) {
  const [visible, setVisible] = useState(false);
  const [focused, setFocused] = useState(false);

  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View
        style={[
          styles.fieldWrap,
          focused && { borderColor: colors.accent },
        ]}
      >
        <TextInput
          ref={inputRef}
          style={styles.fieldInput}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.textMuted}
          secureTextEntry={!visible}
          autoCapitalize="none"
          autoCorrect={false}
          spellCheck={false}
          autoComplete="off"
          textContentType={textContentType}
          returnKeyType={returnKeyType}
          onSubmitEditing={onSubmitEditing}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          accessibilityLabel={label}
        />
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
      </View>
    </View>
  );
}

// ── Requirement row ───────────────────────────────────────────────────────────

function RequirementRow({ label, met, styles, colors }: {
  label: string;
  met: boolean;
  styles: ReturnType<typeof createStyles>;
  colors: ThemeColors;
}) {
  return (
    <View style={styles.reqRow}>
      <SymbolView
        name={met ? "checkmark.circle.fill" : "circle"}
        size={14}
        tintColor={met ? colors.accentCyan : colors.textMuted}
        resizeMode="scaleAspectFit"
      />
      <Text style={[styles.reqLabel, { color: met ? colors.accentCyan : colors.textMuted }]}>
        {label}
      </Text>
    </View>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function ChangePasswordScreen() {
  const { colors, isDark } = useTheme();
  const insets   = useSafeAreaInsets();
  const router   = useRouter();
  const styles   = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  const accessToken = useAuthStore((s) => s.accessToken);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword,     setNewPassword]     = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading,       setIsLoading]       = useState(false);
  const [error,           setError]           = useState<string | null>(null);
  const [succeeded,       setSucceeded]       = useState(false);

  const newRef     = useRef<TextInput>(null);
  const confirmRef = useRef<TextInput>(null);

  const requirements = useMemo(
    () => REQUIREMENTS.map((r) => ({ ...r, met: r.test(newPassword) })),
    [newPassword],
  );

  const allRequirementsMet = requirements.every((r) => r.met);
  const passwordsMatch     = newPassword.length > 0 && newPassword === confirmPassword;
  const validationMessage = useMemo(() => {
    if (!currentPassword) return "Enter your current password.";
    if (!newPassword) return "Enter a new password.";
    const missing = requirements.filter((r) => !r.met).map((r) => r.label.toLowerCase());
    if (missing.length > 0) return `New password needs ${missing.join(", ")}.`;
    if (!confirmPassword) return "Confirm your new password.";
    if (!passwordsMatch) return "New passwords do not match.";
    return null;
  }, [confirmPassword, currentPassword, newPassword, passwordsMatch, requirements]);
  const canSubmit          =
    !isLoading &&
    currentPassword.length > 0 &&
    allRequirementsMet &&
    passwordsMatch;

  const handleSubmit = useCallback(async () => {
    if (!accessToken) {
      setError("Session expired. Please sign in again.");
      return;
    }
    if (!canSubmit) {
      setError(validationMessage ?? "Complete all password requirements before saving.");
      return;
    }
    Keyboard.dismiss();
    setIsLoading(true);
    setError(null);

    try {
      await profileService.changePassword(accessToken, currentPassword, newPassword);

      // Clear all fields before navigating away
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setSucceeded(true);

      // Brief success flash then return
      setTimeout(() => {
        router.back();
        Alert.alert("Password Updated", "Your password has been changed successfully.");
      }, 400);
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.message
          : "Unable to update password right now. Please try again.";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [accessToken, canSubmit, currentPassword, newPassword, router, validationMessage]);

  const handleCancel = useCallback(() => {
    Keyboard.dismiss();
    router.back();
  }, [router]);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* ── Header ───────────────────────────────────────────────────────── */}
      <View style={styles.headerRow}>
        <TouchableOpacity style={styles.backButton} onPress={handleCancel} activeOpacity={0.75}>
          <SymbolView name="chevron.left" size={15} tintColor={colors.textPrimary} resizeMode="scaleAspectFit" />
          <Text style={styles.backLabel}>Profile</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Change Password</Text>
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
          {/* ── Section label ───────────────────────────────────────────── */}
          <Text style={styles.sectionLabel}>SECURITY</Text>

          {/* ── Field card ──────────────────────────────────────────────── */}
          <View style={styles.card}>
            <SecureField
              label="CURRENT PASSWORD"
              placeholder="Enter your current password"
              value={currentPassword}
              onChangeText={(v) => { setCurrentPassword(v); setError(null); }}
              onSubmitEditing={() => newRef.current?.focus()}
              returnKeyType="next"
              colors={colors}
              styles={styles}
            />

            <View style={styles.cardDivider} />

            <SecureField
              label="NEW PASSWORD"
              placeholder="Enter a new password"
              value={newPassword}
              onChangeText={(v) => { setNewPassword(v); setError(null); }}
              onSubmitEditing={() => confirmRef.current?.focus()}
              returnKeyType="next"
              textContentType="newPassword"
              colors={colors}
              styles={styles}
              inputRef={newRef}
            />

            <View style={styles.cardDivider} />

            <SecureField
              label="CONFIRM NEW PASSWORD"
              placeholder="Re-enter your new password"
              value={confirmPassword}
              onChangeText={(v) => { setConfirmPassword(v); setError(null); }}
              onSubmitEditing={handleSubmit}
              returnKeyType="done"
              textContentType="newPassword"
              colors={colors}
              styles={styles}
              inputRef={confirmRef}
            />
          </View>

          {/* ── Password requirements ────────────────────────────────────── */}
          {newPassword.length > 0 && (
            <View style={styles.requirementsCard}>
              <Text style={styles.requirementsHeader}>PASSWORD REQUIREMENTS</Text>
              {requirements.map((r) => (
                <RequirementRow
                  key={r.id}
                  label={r.label}
                  met={r.met}
                  styles={styles}
                  colors={colors}
                />
              ))}
              {confirmPassword.length > 0 && (
                <RequirementRow
                  label="Passwords match"
                  met={passwordsMatch}
                  styles={styles}
                  colors={colors}
                />
              )}
            </View>
          )}

          {/* ── Error message ────────────────────────────────────────────── */}
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

          {!error && validationMessage ? (
            <View style={styles.infoBanner}>
              <SymbolView
                name="info.circle.fill"
                size={14}
                tintColor={colors.textMuted}
                resizeMode="scaleAspectFit"
              />
              <Text style={styles.infoText}>{validationMessage}</Text>
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
            accessibilityLabel="Update Password"
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
              <Text style={styles.submitButtonText}>Update Password</Text>
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

          {/* ── Future security features placeholder ─────────────────────── */}
          {/* Two-Factor Authentication, Passkeys, Trusted Devices, Active Sessions */}
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
    kav: {
      flex: 1,
    },
    scroll: {
      flex: 1,
    },
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

    // ── Secure field ──────────────────────────────────────────────────────────
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

    // ── Requirements ─────────────────────────────────────────────────────────
    requirementsCard: {
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.md,
      gap: 8,
    },
    requirementsHeader: {
      ...typography.label,
      color: colors.textMuted,
      fontSize: 10,
      marginBottom: 2,
    },
    reqRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    reqLabel: {
      ...typography.caption,
      fontSize: 13,
    },

    // ── Info banner ───────────────────────────────────────────────────────────
    infoBanner: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: spacing.sm,
      backgroundColor: `${colors.textMuted}14`,
      borderWidth: 1,
      borderColor: `${colors.textMuted}20`,
      borderRadius: radius.md,
      padding: spacing.md,
    },
    infoText: {
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
