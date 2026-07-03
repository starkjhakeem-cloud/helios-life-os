import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SymbolView } from "expo-symbols";
import type { SFSymbol } from "sf-symbols-typescript";

import { radius, spacing, typography, type ThemeColors } from "../../theme/theme";
import { useTheme } from "../../theme/ThemeContext";
import { useAuthStore, useIntegrationStore } from "../../store";

type SecurityRow = {
  title: string;
  subtitle: string;
  icon: SFSymbol;
  meta?: string;
  tone?: "default" | "success" | "warning" | "danger" | "muted";
  onPress: () => void;
};

function toneColor(tone: SecurityRow["tone"], colors: ThemeColors): string {
  if (tone === "success") return colors.success;
  if (tone === "warning") return colors.warning;
  if (tone === "danger") return colors.danger;
  if (tone === "muted") return colors.textMuted;
  return colors.accentCyan;
}

export default function PrivacySecurityScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const logout = useAuthStore((s) => s.logout);
  const deleteAccount = useAuthStore((s) => s.deleteAccount);
  const authLoading = useAuthStore((s) => s.isLoading);
  const integrations = useIntegrationStore((s) => s.integrations);
  const connectedCount = integrations.filter((item) => item.status === "connected").length;
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const deleteConfirmationValid = deleteConfirmation === "DELETE";

  function comingInV4(title: string) {
    Alert.alert(title, `${title} is planned for HELIOS V4 and is not enabled in this build.`);
  }

  function confirmSignOut() {
    Alert.alert("Sign Out", "End this HELIOS session on this device?", [
      { text: "Cancel", style: "cancel" },
      { text: "Sign Out", style: "destructive", onPress: logout },
    ]);
  }

  function openDeleteConfirmation() {
    setDeleteConfirmation("");
    setDeleteError(null);
    setDeleteModalVisible(true);
  }

  function closeDeleteConfirmation() {
    if (authLoading) return;
    Keyboard.dismiss();
    setDeleteModalVisible(false);
    setDeleteConfirmation("");
    setDeleteError(null);
  }

  async function handleDeleteAccount() {
    if (!deleteConfirmationValid || authLoading) return;
    Keyboard.dismiss();
    setDeleteError(null);
    const deleted = await deleteAccount();
    if (deleted) {
      setDeleteModalVisible(false);
      setDeleteConfirmation("");
      Alert.alert("Account Deleted", "Your HELIOS account has been deleted.");
      router.replace("/(auth)/login");
      return;
    }
    setDeleteError(useAuthStore.getState().error ?? "Unable to delete account right now. Please try again.");
  }

  const rows: SecurityRow[] = [
    {
      title: "Privacy",
      subtitle: "HELIOS uses user-scoped data for memory, recommendations, and assistant context.",
      icon: "hand.raised",
      meta: "Scoped",
      tone: "success",
      onPress: () => Alert.alert("Privacy", "HELIOS keeps assistant context user-scoped and never exposes OAuth tokens or raw secrets in AI prompts."),
    },
    {
      title: "Security",
      subtitle: "Password changes and sensitive account updates are protected actions.",
      icon: "lock.shield",
      meta: "Protected",
      tone: "success",
      onPress: () => router.push("/(tabs)/change-password"),
    },
    {
      title: "Connected Services",
      subtitle: `${connectedCount} connected service${connectedCount === 1 ? "" : "s"} can provide context to HELIOS.`,
      icon: "link",
      meta: `${connectedCount} active`,
      onPress: () => router.push("/(tabs)/integrations"),
    },
    {
      title: "Biometrics",
      subtitle: "Face ID and biometric app lock support is planned for HELIOS V4.",
      icon: "faceid",
      meta: "Coming in V4",
      tone: "muted",
      onPress: () => comingInV4("Biometrics"),
    },
    {
      title: "Connected Devices",
      subtitle: "Device session management is planned for HELIOS V4.",
      icon: "iphone",
      meta: "Coming in V4",
      tone: "muted",
      onPress: () => comingInV4("Connected Devices"),
    },
    {
      title: "Sign Out",
      subtitle: "End this HELIOS session on the current device.",
      icon: "rectangle.portrait.and.arrow.right",
      meta: "Session",
      tone: "warning",
      onPress: confirmSignOut,
    },
  ];

  return (
    <>
      <ScrollView
        style={{ backgroundColor: colors.background }}
        contentContainerStyle={[styles.container, { paddingTop: insets.top + spacing.lg, paddingBottom: insets.bottom + 120 }]}
        showsVerticalScrollIndicator={false}
      >
        <TouchableOpacity accessibilityRole="button" activeOpacity={0.78} onPress={() => router.back()} style={styles.backButton}>
          <SymbolView name="chevron.left" size={16} tintColor={colors.accentCyan} resizeMode="scaleAspectFit" />
          <Text style={styles.backText}>Command Center</Text>
        </TouchableOpacity>

        <View style={styles.hero}>
          <Text style={styles.heroLabel}>PRIVACY & SECURITY</Text>
          <Text style={styles.heroTitle}>Protected Operations</Text>
          <Text style={styles.heroBody}>
            Review privacy posture, connected-service exposure, future device security, and account-level destructive actions.
          </Text>
        </View>

        <View style={styles.dangerZone}>
          <View style={styles.dangerHeader}>
            <Text style={styles.dangerEyebrow}>DANGER ZONE</Text>
            <Text style={styles.dangerTitle}>Delete Account</Text>
            <Text style={styles.dangerBody}>
              Permanently remove this HELIOS account and disconnect connected Google services after typed confirmation.
            </Text>
          </View>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Delete Account. Destructive action requiring typed confirmation."
            accessibilityHint="Opens the protected account deletion confirmation."
            activeOpacity={0.78}
            disabled={authLoading}
            onPress={openDeleteConfirmation}
            style={[styles.dangerButton, authLoading && styles.disabledButton]}
          >
            <View style={styles.dangerButtonIcon}>
              <SymbolView name="trash" size={17} tintColor={colors.danger} resizeMode="scaleAspectFit" />
            </View>
            <View style={styles.rowCopy}>
              <Text style={styles.dangerButtonTitle}>Delete Account</Text>
              <Text style={styles.rowSubtitle}>Requires typing DELETE before the final action is available.</Text>
            </View>
            <Text style={styles.dangerMeta}>{authLoading ? "Working" : "Protected"}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.card}>
          {rows.map((row, index) => {
            const color = toneColor(row.tone, colors);
            return (
              <TouchableOpacity
                key={row.title}
                accessibilityRole="button"
                activeOpacity={0.78}
                onPress={row.onPress}
                style={[styles.row, index === rows.length - 1 && styles.rowLast]}
              >
                <View style={[styles.icon, { borderColor: `${color}30`, backgroundColor: `${color}12` }]}>
                  <SymbolView name={row.icon} size={17} tintColor={color} resizeMode="scaleAspectFit" />
                </View>
                <View style={styles.rowCopy}>
                  <View style={styles.rowTitleLine}>
                    <Text style={[styles.rowTitle, row.tone === "danger" && { color }]}>{row.title}</Text>
                    {row.meta ? <Text style={[styles.rowMeta, { color }]}>{row.meta}</Text> : null}
                  </View>
                  <Text style={styles.rowSubtitle}>{row.subtitle}</Text>
                </View>
                <SymbolView name="chevron.right" size={14} tintColor={colors.textMuted} resizeMode="scaleAspectFit" />
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>

      <Modal
        visible={deleteModalVisible}
        transparent
        animationType="fade"
        onRequestClose={closeDeleteConfirmation}
      >
        <TouchableWithoutFeedback accessible={false} onPress={Keyboard.dismiss}>
          <View style={styles.modalOverlay}>
            <KeyboardAvoidingView
              behavior={Platform.OS === "ios" ? "padding" : undefined}
              style={styles.modalKeyboard}
            >
              <View style={styles.modalPanel}>
                <View style={styles.modalIcon}>
                  <SymbolView name="exclamationmark.triangle" size={22} tintColor={colors.danger} resizeMode="scaleAspectFit" />
                </View>
                <Text style={styles.modalTitle}>Delete Account</Text>
                <Text style={styles.modalBody}>
                  Deleting your account permanently removes your HELIOS data, including goals, tasks, memories, calendar history, preferences, connected service records, and encrypted integration tokens.
                </Text>
                <Text style={styles.modalBody}>
                  Connected Google services will be disconnected. This action cannot be undone.
                </Text>

                <View style={styles.confirmBox}>
                  <Text style={styles.confirmLabel}>Type DELETE to confirm.</Text>
                  <TextInput
                    accessibilityLabel="Type DELETE to confirm account deletion"
                    autoCapitalize="characters"
                    autoCorrect={false}
                    editable={!authLoading}
                    placeholder="DELETE"
                    placeholderTextColor={colors.textMuted}
                    value={deleteConfirmation}
                    onChangeText={(value) => {
                      setDeleteConfirmation(value);
                      if (deleteError) setDeleteError(null);
                    }}
                    style={styles.confirmInput}
                  />
                </View>

                {deleteError ? <Text style={styles.errorText}>{deleteError}</Text> : null}

                <View style={styles.modalActions}>
                  <TouchableOpacity
                    accessibilityRole="button"
                    activeOpacity={0.78}
                    disabled={authLoading}
                    onPress={closeDeleteConfirmation}
                    style={styles.cancelButton}
                  >
                    <Text style={styles.cancelButtonText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    accessibilityRole="button"
                    accessibilityLabel="Delete My Account"
                    accessibilityState={{ disabled: !deleteConfirmationValid || authLoading }}
                    activeOpacity={0.78}
                    disabled={!deleteConfirmationValid || authLoading}
                    onPress={handleDeleteAccount}
                    style={[
                      styles.finalDeleteButton,
                      (!deleteConfirmationValid || authLoading) && styles.finalDeleteButtonDisabled,
                    ]}
                  >
                    {authLoading ? (
                      <ActivityIndicator color={colors.background} size="small" />
                    ) : (
                      <Text style={styles.finalDeleteButtonText}>Delete My Account</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            </KeyboardAvoidingView>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      paddingHorizontal: spacing.md,
      gap: spacing.lg,
    },
    backButton: {
      minHeight: 40,
      alignSelf: "flex-start",
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.xs,
    },
    backText: {
      ...typography.caption,
      color: colors.accentCyan,
      fontWeight: "800",
    },
    hero: {
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      padding: spacing.lg,
      gap: spacing.sm,
    },
    heroLabel: {
      ...typography.label,
      color: colors.accent,
      letterSpacing: 0,
    },
    heroTitle: {
      ...typography.displaySmall,
      color: colors.textPrimary,
      lineHeight: 32,
    },
    heroBody: {
      ...typography.body,
      color: colors.textSecondary,
      lineHeight: 22,
    },
    dangerZone: {
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: `${colors.danger}55`,
      backgroundColor: colors.surface,
      overflow: "hidden",
    },
    dangerHeader: {
      padding: spacing.lg,
      gap: spacing.xs,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: `${colors.danger}33`,
    },
    dangerEyebrow: {
      ...typography.label,
      color: colors.danger,
      letterSpacing: 0,
    },
    dangerTitle: {
      ...typography.title,
      color: colors.textPrimary,
      fontWeight: "900",
    },
    dangerBody: {
      ...typography.caption,
      color: colors.textSecondary,
      lineHeight: 19,
    },
    dangerButton: {
      minHeight: 76,
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.md,
      backgroundColor: `${colors.danger}0D`,
    },
    dangerButtonIcon: {
      width: 38,
      height: 38,
      borderRadius: 19,
      borderWidth: 1,
      borderColor: `${colors.danger}40`,
      backgroundColor: `${colors.danger}14`,
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
    },
    dangerButtonTitle: {
      ...typography.body,
      color: colors.danger,
      fontWeight: "900",
      lineHeight: 19,
    },
    dangerMeta: {
      fontSize: 10,
      fontWeight: "900",
      color: colors.danger,
      flexShrink: 0,
      textTransform: "uppercase",
    },
    disabledButton: {
      opacity: 0.55,
    },
    card: {
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      overflow: "hidden",
    },
    row: {
      minHeight: 74,
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.borderDark,
    },
    rowLast: {
      borderBottomWidth: 0,
    },
    icon: {
      width: 38,
      height: 38,
      borderRadius: 19,
      borderWidth: 1,
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
    },
    rowCopy: {
      flex: 1,
      minWidth: 0,
      gap: 3,
    },
    rowTitleLine: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: spacing.sm,
    },
    rowTitle: {
      ...typography.body,
      color: colors.textPrimary,
      fontWeight: "800",
      lineHeight: 19,
      flex: 1,
    },
    rowMeta: {
      fontSize: 10,
      fontWeight: "900",
      flexShrink: 0,
      paddingTop: 2,
    },
    rowSubtitle: {
      ...typography.caption,
      color: colors.textMuted,
      lineHeight: 18,
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: colors.overlay,
      justifyContent: "center",
      paddingHorizontal: spacing.md,
    },
    modalKeyboard: {
      width: "100%",
    },
    modalPanel: {
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: `${colors.danger}55`,
      backgroundColor: colors.surface,
      padding: spacing.lg,
      gap: spacing.md,
      shadowColor: colors.shadow,
      shadowOpacity: 0.24,
      shadowRadius: 24,
      shadowOffset: { width: 0, height: 16 },
      elevation: 8,
    },
    modalIcon: {
      width: 48,
      height: 48,
      borderRadius: 24,
      borderWidth: 1,
      borderColor: `${colors.danger}40`,
      backgroundColor: `${colors.danger}14`,
      alignItems: "center",
      justifyContent: "center",
    },
    modalTitle: {
      ...typography.title,
      color: colors.textPrimary,
      fontWeight: "900",
    },
    modalBody: {
      ...typography.body,
      color: colors.textSecondary,
      lineHeight: 22,
    },
    confirmBox: {
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceDark,
      padding: spacing.md,
      gap: spacing.sm,
    },
    confirmLabel: {
      ...typography.caption,
      color: colors.textSecondary,
      fontWeight: "800",
    },
    confirmInput: {
      minHeight: 48,
      borderRadius: radius.sm,
      borderWidth: 1,
      borderColor: `${colors.danger}55`,
      backgroundColor: colors.background,
      color: colors.textPrimary,
      paddingHorizontal: spacing.md,
      fontSize: 16,
      fontWeight: "900",
      letterSpacing: 0,
    },
    errorText: {
      ...typography.caption,
      color: colors.danger,
      fontWeight: "800",
      lineHeight: 18,
    },
    modalActions: {
      flexDirection: "row",
      gap: spacing.sm,
    },
    cancelButton: {
      minHeight: 48,
      flex: 1,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: spacing.md,
    },
    cancelButtonText: {
      ...typography.caption,
      color: colors.textSecondary,
      fontWeight: "900",
    },
    finalDeleteButton: {
      minHeight: 48,
      flex: 1.35,
      borderRadius: radius.md,
      backgroundColor: colors.danger,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: spacing.md,
    },
    finalDeleteButtonDisabled: {
      backgroundColor: `${colors.danger}55`,
    },
    finalDeleteButtonText: {
      ...typography.caption,
      color: "#ffffff",
      fontWeight: "900",
      textAlign: "center",
    },
  });
}
