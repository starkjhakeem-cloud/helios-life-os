import { useCallback, useEffect, useMemo } from "react";
import { ActivityIndicator, Alert, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SymbolView } from "expo-symbols";
import type { SFSymbol } from "sf-symbols-typescript";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuthStore, useAutonomyStore } from "../../store";
import type { AutonomyRule, AutonomyRuleCreate } from "../../store";
import { radius, spacing, typography, type ThemeColors } from "../../theme/theme";
import { useTheme } from "../../theme/ThemeContext";

type PermissionTemplate = {
  title: string;
  subtitle: string;
  icon: SFSymbol;
  rule: AutonomyRuleCreate;
};

const PERMISSION_TEMPLATES: PermissionTemplate[] = [
  { title: "Always ask before sending emails", subtitle: "Email", icon: "envelope.fill", rule: { action_type: "send_email", requires_manual_approval: true, allow_execution: true } },
  { title: "Always ask before deleting anything", subtitle: "Files, tasks, goals, and messages", icon: "trash.fill", rule: { action_type: "delete", requires_manual_approval: true, allow_execution: false } },
  { title: "Always ask before spending money", subtitle: "Purchases", icon: "creditcard.fill", rule: { action_type: "purchase", requires_manual_approval: true, allow_execution: false } },
  { title: "Allow HELIOS to create tasks automatically", subtitle: "Tasks", icon: "checklist", rule: { action_type: "create_task", requires_manual_approval: false, allow_execution: true } },
  { title: "Allow HELIOS to suggest calendar changes", subtitle: "Calendar", icon: "calendar.badge.plus", rule: { action_type: "suggest_calendar_change", requires_manual_approval: true, allow_execution: true } },
  { title: "Allow HELIOS to run background scans", subtitle: "Background Automations", icon: "clock.arrow.circlepath", rule: { action_type: "background_scan", requires_manual_approval: false, allow_execution: true } },
  { title: "Allow HELIOS to send reminders", subtitle: "Reminders and Notifications", icon: "bell.fill", rule: { action_type: "send_reminder", requires_manual_approval: false, allow_execution: true } },
  { title: "Allow HELIOS to archive inbox items", subtitle: "Email", icon: "archivebox.fill", rule: { action_type: "archive_inbox_item", requires_manual_approval: true, allow_execution: true } },
];

const CATEGORIES = [
  "Calendar",
  "Email",
  "Contacts",
  "Reminders",
  "Tasks",
  "Goals",
  "Notifications",
  "Files",
  "Purchases",
  "Location",
  "Connected Apps",
  "Background Automations",
];

function formatActionType(value: string): string {
  return value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function AssistantPermissionsScreen() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const {
    rules,
    isRulesLoading,
    isRulesMutating,
    rulesError,
    fetchRules,
    createRule,
    updateRule,
    deleteRule,
  } = useAutonomyStore();

  const load = useCallback(() => {
    if (accessToken) fetchRules(accessToken);
  }, [accessToken, fetchRules]);

  useEffect(() => {
    load();
  }, [load]);

  const addRule = useCallback((template: PermissionTemplate) => {
    if (!accessToken) return;
    createRule(accessToken, template.rule);
  }, [accessToken, createRule]);

  const toggleApproval = useCallback((rule: AutonomyRule) => {
    if (!accessToken) return;
    updateRule(accessToken, rule.id, { requires_manual_approval: !rule.requires_manual_approval });
  }, [accessToken, updateRule]);

  const toggleAllowed = useCallback((rule: AutonomyRule) => {
    if (!accessToken) return;
    updateRule(accessToken, rule.id, { allow_execution: !rule.allow_execution });
  }, [accessToken, updateRule]);

  const confirmDelete = useCallback((rule: AutonomyRule) => {
    if (!accessToken) return;
    Alert.alert("Delete Permission Rule", `Remove ${formatActionType(rule.action_type)}?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => deleteRule(accessToken, rule.id) },
    ]);
  }, [accessToken, deleteRule]);

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={[styles.container, { paddingTop: insets.top + spacing.lg }]}
      refreshControl={<RefreshControl refreshing={isRulesLoading} onRefresh={load} tintColor={colors.accentCyan} />}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.label}>ASSISTANT PERMISSIONS</Text>
      <Text style={styles.title}>Assistant Permissions</Text>
      <Text style={styles.subtitle}>Choose what HELIOS can do automatically and what should always require your approval.</Text>

      <Text style={styles.sectionLabel}>PERMISSION AREAS</Text>
      <View style={styles.categoryWrap}>
        {CATEGORIES.map((category) => (
          <View key={category} style={styles.categoryChip}>
            <Text style={styles.categoryText}>{category}</Text>
          </View>
        ))}
      </View>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionLabel}>SUGGESTED PERMISSION RULES</Text>
        {isRulesMutating ? <ActivityIndicator color={colors.accentCyan} size="small" /> : null}
      </View>
      <View style={styles.card}>
        {PERMISSION_TEMPLATES.map((item) => (
          <TouchableOpacity key={item.title} style={styles.templateRow} onPress={() => addRule(item)} activeOpacity={0.78}>
            <View style={styles.iconWrap}>
              <SymbolView name={item.icon} size={17} tintColor={colors.accentCyan} resizeMode="scaleAspectFit" />
            </View>
            <View style={styles.rowBody}>
              <Text style={styles.rowTitle}>{item.title}</Text>
              <Text style={styles.rowSubtitle}>{item.subtitle}</Text>
            </View>
            <Text style={styles.addText}>Add</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={[styles.sectionLabel, { marginTop: spacing.xl }]}>CURRENT PERMISSION RULES</Text>
      {rulesError ? (
        <Text style={styles.errorText}>Unable to load permissions. Pull to refresh.</Text>
      ) : null}
      {isRulesLoading && rules.length === 0 ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator color={colors.accent} size="small" />
          <Text style={styles.loadingText}>Loading permissions…</Text>
        </View>
      ) : rules.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>No custom permission rules yet.</Text>
          <Text style={styles.emptyText}>HELIOS will ask before sensitive actions. Add permission rules when you want finer control.</Text>
        </View>
      ) : (
        rules.map((rule) => (
          <View key={rule.id} style={styles.ruleCard}>
            <View style={styles.ruleHeader}>
              <Text style={styles.ruleTitle}>{formatActionType(rule.action_type)}</Text>
              <TouchableOpacity onPress={() => confirmDelete(rule)} hitSlop={10}>
                <SymbolView name="trash" size={15} tintColor={colors.textMuted} resizeMode="scaleAspectFit" />
              </TouchableOpacity>
            </View>
            <Text style={styles.ruleSubtitle}>
              {rule.risk_level ? `${formatActionType(rule.risk_level)} risk` : "Any risk level"}
            </Text>
            {rule.notes ? <Text style={styles.ruleNotes}>{rule.notes}</Text> : null}
            <View style={styles.ruleActions}>
              <TouchableOpacity
                style={[styles.toggleButton, rule.requires_manual_approval && styles.toggleButtonActive]}
                onPress={() => toggleApproval(rule)}
                activeOpacity={0.78}
              >
                <Text style={[styles.toggleText, rule.requires_manual_approval && styles.toggleTextActive]}>
                  {rule.requires_manual_approval ? "Asks First" : "Can Help Automatically"}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.toggleButton, !rule.allow_execution && styles.toggleButtonBlocked]}
                onPress={() => toggleAllowed(rule)}
                activeOpacity={0.78}
              >
                <Text style={[styles.toggleText, !rule.allow_execution && styles.toggleTextBlocked]}>
                  {rule.allow_execution ? "Allowed" : "Blocked"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        ))
      )}
    </ScrollView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      paddingHorizontal: spacing.lg,
      paddingBottom: spacing.xxl * 2,
    },
    label: { ...typography.label, color: colors.accent, marginBottom: spacing.sm },
    title: { ...typography.displaySmall, color: colors.textPrimary, marginBottom: spacing.sm },
    subtitle: { ...typography.body, color: colors.textSecondary, marginBottom: spacing.xl },
    sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: spacing.xl },
    sectionLabel: { ...typography.label, color: colors.textMuted, marginBottom: spacing.sm },
    categoryWrap: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginBottom: spacing.lg },
    categoryChip: {
      borderRadius: radius.sm,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceDark,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
    categoryText: { ...typography.caption, color: colors.textSecondary, fontWeight: "800" },
    card: {
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      overflow: "hidden",
    },
    templateRow: {
      minHeight: 76,
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: colors.borderDark,
    },
    iconWrap: {
      width: 38,
      height: 38,
      borderRadius: 14,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: `${colors.accentCyan}14`,
      borderWidth: 1,
      borderColor: `${colors.accentCyan}28`,
    },
    rowBody: { flex: 1, gap: 3 },
    rowTitle: { ...typography.body, color: colors.textPrimary, fontWeight: "800" },
    rowSubtitle: { ...typography.caption, color: colors.textMuted },
    addText: { ...typography.caption, color: colors.accentCyan, fontWeight: "900" },
    errorText: { ...typography.caption, color: colors.warning, marginBottom: spacing.sm },
    loadingRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, padding: spacing.lg },
    loadingText: { ...typography.caption, color: colors.textMuted },
    emptyCard: {
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      padding: spacing.lg,
      gap: spacing.xs,
    },
    emptyTitle: { ...typography.body, color: colors.textPrimary, fontWeight: "800" },
    emptyText: { ...typography.caption, color: colors.textMuted },
    ruleCard: {
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      padding: spacing.lg,
      marginBottom: spacing.md,
      gap: spacing.sm,
    },
    ruleHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md },
    ruleTitle: { ...typography.title, color: colors.textPrimary, flex: 1 },
    ruleSubtitle: { ...typography.caption, color: colors.textMuted },
    ruleNotes: { ...typography.caption, color: colors.textSecondary },
    ruleActions: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.xs },
    toggleButton: {
      borderRadius: radius.sm,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
    toggleButtonActive: { borderColor: colors.accentCyan, backgroundColor: `${colors.accentCyan}14` },
    toggleButtonBlocked: { borderColor: colors.warning, backgroundColor: `${colors.warning}14` },
    toggleText: { ...typography.caption, color: colors.textMuted, fontWeight: "900" },
    toggleTextActive: { color: colors.accentCyan },
    toggleTextBlocked: { color: colors.warning },
  });
}
