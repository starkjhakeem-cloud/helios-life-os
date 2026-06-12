import { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Alert,
  Modal,
  KeyboardAvoidingView,
  Platform,
  TextInput,
  TouchableWithoutFeedback,
  Keyboard,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { SymbolView } from "expo-symbols";

import { systemService, type VersionResponse } from "../../services/systemService";
import { requestPermissions } from "../../services/notificationService";
import { useAuthStore, useRemindersStore, useSettingsStore, useBackgroundJobsStore, type ReminderOut, type ThemePreference, type BackgroundJob, type JobType } from "../../store";
import { colors, radius, spacing, typography, type ThemeColors } from "../../theme/theme";
import { useTheme } from "../../theme/ThemeContext";

// ── Helpers ───────────────────────────────────────────────────────────────────

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

function formatMemberSince(isoString: string | undefined): string {
  if (!isoString) return "—";
  const date = new Date(isoString);
  if (isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function truncateId(id: string): string {
  return id.length > 16 ? `${id.slice(0, 8)}…${id.slice(-8)}` : id;
}

function formatLastRun(iso: string | null): string {
  if (!iso) return "Never run";
  try {
    const d = new Date(iso);
    const diffMs = Date.now() - d.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return "Just now";
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  } catch {
    return iso;
  }
}

function formatRemindAt(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const now = new Date();
  const isToday =
    d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear();
  if (isToday) {
    return "Today " + d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  }
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) +
    " " + d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

// ── Sub-components ────────────────────────────────────────────────────────────

type InfoRowProps = { label: string; value: string };
function InfoRow({ label, value }: InfoRowProps) {
  const { colors } = useTheme();

  return (
    <View style={styles.infoRow}>
      <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>{label}</Text>
      <Text style={[styles.infoValue, { color: colors.textPrimary }]} numberOfLines={1}>{value}</Text>
    </View>
  );
}

type ReminderRowProps = {
  reminder: ReminderOut;
  onToggle: () => void;
  onDelete: () => void;
};
function ReminderRow({ reminder, onToggle, onDelete }: ReminderRowProps) {
  const { colors } = useTheme();

  return (
    <View style={styles.reminderRow}>
      <View style={[styles.reminderDot, { backgroundColor: reminder.is_enabled ? colors.accentCyan : colors.border }]} />
      <View style={styles.reminderBody}>
        <Text style={styles.reminderTitle} numberOfLines={1}>{reminder.title}</Text>
        <Text style={styles.reminderTime}>{formatRemindAt(reminder.remind_at)}</Text>
      </View>
      <View style={styles.reminderActions}>
        <TouchableOpacity onPress={onToggle} style={styles.reminderToggle} activeOpacity={0.7}>
          <Text style={[styles.reminderToggleText, { color: reminder.is_enabled ? colors.accentCyan : colors.textMuted }]}>
            {reminder.is_enabled ? "ON" : "OFF"}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onDelete} style={styles.reminderDelete} activeOpacity={0.7}>
          <Text style={styles.reminderDeleteText}>✕</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ── New Reminder Modal ────────────────────────────────────────────────────────

type NewReminderModalProps = {
  visible: boolean;
  onClose: () => void;
  onSubmit: (data: { title: string; body: string; remind_at: string }) => void;
  isMutating: boolean;
};

function NewReminderModal({ visible, onClose, onSubmit, isMutating }: NewReminderModalProps) {
  const { colors } = useTheme();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [remindAt, setRemindAt] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  function resetAndClose() {
    setTitle("");
    setBody("");
    setRemindAt("");
    setFormError(null);
    Keyboard.dismiss();
    onClose();
  }

  function handleSubmit() {
    if (!title.trim()) {
      setFormError("Reminder title is required.");
      return;
    }
    if (!remindAt.trim()) {
      setFormError("Remind at date/time is required.");
      return;
    }
    const parsed = new Date(remindAt.trim());
    if (isNaN(parsed.getTime())) {
      setFormError("Invalid date format. Use YYYY-MM-DD HH:MM or ISO 8601.");
      return;
    }
    if (parsed <= new Date()) {
      setFormError("Reminder time must be in the future.");
      return;
    }
    setFormError(null);
    onSubmit({ title: title.trim(), body: body.trim(), remind_at: parsed.toISOString() });
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={resetAndClose}>
      <TouchableWithoutFeedback onPress={resetAndClose}>
        <View style={styles.overlay} />
      </TouchableWithoutFeedback>

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.modalWrapper}>
        <View style={styles.sheet}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>NEW REMINDER</Text>

          <Text style={styles.fieldLabel}>REMINDER TITLE</Text>
          <TextInput
            style={styles.input}
            value={title}
            onChangeText={setTitle}
            placeholder="e.g. Review weekly goals"
            placeholderTextColor={colors.textMuted}
            maxLength={200}
          />

          <Text style={styles.fieldLabel}>NOTE (OPTIONAL)</Text>
          <TextInput
            style={[styles.input, styles.inputMultiline]}
            value={body}
            onChangeText={setBody}
            placeholder="Additional context"
            placeholderTextColor={colors.textMuted}
            maxLength={500}
            multiline
          />

          <Text style={styles.fieldLabel}>REMIND AT</Text>
          <TextInput
            style={styles.input}
            value={remindAt}
            onChangeText={setRemindAt}
            placeholder="e.g. 2026-06-01 09:00"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Text style={styles.fieldHint}>Format: YYYY-MM-DD HH:MM (24h) or full ISO 8601</Text>

          {formError ? <Text style={styles.formError}>{formError}</Text> : null}

          <View style={styles.sheetActions}>
            <TouchableOpacity style={styles.cancelButton} onPress={resetAndClose} activeOpacity={0.7}>
              <Text style={styles.cancelButtonText}>CANCEL</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.createButton, isMutating && { opacity: 0.5 }]}
              onPress={handleSubmit}
              disabled={isMutating}
              activeOpacity={0.8}
            >
              {isMutating ? (
                <ActivityIndicator size="small" color={colors.background} />
              ) : (
                <Text style={styles.createButtonText}>CREATE</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── Background job definitions ────────────────────────────────────────────────

const JOB_TYPE_DEFS: { type: JobType; label: string; icon: string; defaultSchedule: string }[] = [
  { type: "daily_briefing_generation",  label: "Daily Briefing",       icon: "sun.horizon",       defaultSchedule: "Daily at 8:00 AM" },
  { type: "proactive_suggestion_scan",  label: "Proactive Suggestions", icon: "lightbulb",         defaultSchedule: "Every 30 minutes" },
  { type: "reminder_check",             label: "Reminder Check",        icon: "bell",              defaultSchedule: "Every hour" },
  { type: "integration_sync_simulation",label: "Integration Sync",      icon: "arrow.triangle.2.circlepath", defaultSchedule: "Every 6 hours" },
];

let styles = createStyles(colors);

// ── Screen ────────────────────────────────────────────────────────────────────

export default function ProfileScreen() {
  const { colors } = useTheme();
  styles = useMemo(() => createStyles(colors), [colors]);

  const insets = useSafeAreaInsets();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const accessToken = useAuthStore((s) => s.accessToken);
  const logout = useAuthStore((s) => s.logout);
  const deleteAccount = useAuthStore((s) => s.deleteAccount);
  const authLoading = useAuthStore((s) => s.isLoading);
  const [version, setVersion] = useState<VersionResponse | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [permRequesting, setPermRequesting] = useState(false);

  const {
    reminders,
    permissionStatus,
    isLoading: remindersLoading,
    isMutating,
    error: remindersError,
    fetchReminders,
    createReminder,
    updateReminder,
    deleteReminder,
    refreshPermissionStatus,
  } = useRemindersStore();

  const {
    theme_preference,
    notifications_enabled,
    reminder_notifications,
    default_planning_horizon,
    isSaving: prefsSaving,
    fetchPreferences,
    updatePreferences,
  } = useSettingsStore();

  const {
    jobs,
    isMutating: jobsMutating,
    fetchJobs,
    createJob,
    updateJob,
    deleteJob,
    triggerJob,
  } = useBackgroundJobsStore();

  useEffect(() => {
    systemService.version().then(setVersion).catch(() => setVersion(null));
    if (accessToken) {
      fetchReminders(accessToken);
      fetchPreferences(accessToken);
      fetchJobs(accessToken);
    }
  }, [accessToken]);

  function handlePrefChange<K extends keyof Parameters<typeof updatePreferences>[1]>(
    key: K,
    value: Parameters<typeof updatePreferences>[1][K],
  ) {
    if (!accessToken) return;
    updatePreferences(accessToken, { [key]: value });
  }

  function handleLogout() {
    Alert.alert("Sign Out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      { text: "Sign Out", style: "destructive", onPress: logout },
    ]);
  }

  function handleDeleteAccount() {
    Alert.alert(
      "Delete Account",
      "This will permanently delete your account and all data — goals, tasks, reminders, and conversations. This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete Account",
          style: "destructive",
          onPress: () => deleteAccount(),
        },
      ],
    );
  }

  async function handleRequestPermissions() {
    setPermRequesting(true);
    const status = await requestPermissions();
    await refreshPermissionStatus();
    setPermRequesting(false);
    if (status === "denied") {
      Alert.alert(
        "Permission Denied",
        "To receive reminders, enable notifications for HELIOS in your device Settings.",
      );
    }
  }

  async function handleCreateReminder(data: { title: string; body: string; remind_at: string }) {
    if (!accessToken) return;
    await createReminder(accessToken, {
      title: data.title,
      body: data.body || undefined,
      remind_at: data.remind_at,
    });
    setModalVisible(false);
  }

  function handleToggle(reminder: ReminderOut) {
    if (!accessToken) return;
    updateReminder(accessToken, reminder.id, { is_enabled: !reminder.is_enabled });
  }

  function handleDelete(id: string) {
    if (!accessToken) return;
    Alert.alert("Delete Reminder", "This reminder will be permanently deleted.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => deleteReminder(accessToken, id),
      },
    ]);
  }

  const permLabel =
    permissionStatus === "granted" ? "GRANTED"
    : permissionStatus === "denied" ? "DENIED"
    : "NOT REQUESTED";

  const permColor =
    permissionStatus === "granted" ? colors.accentCyan
    : permissionStatus === "denied" ? "#ef4444"
    : colors.textMuted;

  return (
    <>
      <ScrollView
        style={{ backgroundColor: colors.background }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.container, { paddingTop: insets.top + spacing.md }]}
      >
        {/* Hero */}
        <View style={styles.heroCard}>
          <Text style={styles.heroLabel}>HELIOS ACCOUNT</Text>
          <View style={styles.avatarRow}>
            <View style={styles.avatar}>
              <Text style={styles.avatarInitials}>{user ? initials(user.name) : "?"}</Text>
            </View>
            <View style={styles.avatarInfo}>
              <Text style={styles.displayName} numberOfLines={1}>{user?.name ?? "—"}</Text>
              <Text style={styles.emailText} numberOfLines={1}>{user?.email ?? "—"}</Text>
            </View>
          </View>
        </View>

        {/* Account */}
        <Text style={styles.sectionLabel}>ACCOUNT</Text>
        <View style={styles.card}>
          <InfoRow label="Member Since" value={formatMemberSince(user?.created_at)} />
          <View style={styles.cardDivider} />
          <InfoRow label="User ID" value={user ? truncateId(user.id) : "—"} />
        </View>

        {/* System */}
        <Text style={styles.sectionLabel}>SYSTEM</Text>
        <View style={styles.card}>
          {version ? (
            <>
              <InfoRow label="App Version" value={version.version} />
              <View style={styles.cardDivider} />
              <InfoRow label="API Version" value={version.api_version} />
              <View style={styles.cardDivider} />
              <InfoRow label="Service" value={version.service} />
            </>
          ) : (
            <View style={styles.loadingRow}>
              <ActivityIndicator size="small" color={colors.accentCyan} />
              <Text style={styles.loadingText}>LOADING...</Text>
            </View>
          )}
        </View>

        {/* Notifications */}
        <Text style={styles.sectionLabel}>NOTIFICATIONS</Text>

        {/* Permission status card */}
        <View style={styles.card}>
          <View style={styles.permRow}>
            <View style={styles.permLeft}>
              <View style={[styles.permDot, { backgroundColor: permColor }]} />
              <View>
                <Text style={styles.permTitle}>Notification Access</Text>
                <Text style={[styles.permStatus, { color: permColor }]}>{permLabel}</Text>
              </View>
            </View>
            {permissionStatus !== "granted" && (
              <TouchableOpacity
                style={styles.permButton}
                onPress={handleRequestPermissions}
                disabled={permRequesting}
                activeOpacity={0.8}
              >
                {permRequesting ? (
                  <ActivityIndicator size="small" color={colors.background} />
                ) : (
                  <Text style={styles.permButtonText}>REQUEST</Text>
                )}
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Reminders list */}
        <View style={styles.remindersHeader}>
          <Text style={styles.sectionLabel}>REMINDERS</Text>
          <View style={styles.remindersHeaderRight}>
            {(remindersLoading || isMutating) ? (
              <ActivityIndicator size="small" color={colors.accentCyan} />
            ) : null}
            <TouchableOpacity
              style={styles.addButton}
              onPress={() => setModalVisible(true)}
              activeOpacity={0.8}
            >
              <Text style={styles.addButtonText}>+ NEW</Text>
            </TouchableOpacity>
          </View>
        </View>

        {remindersError ? (
          <Text style={styles.errorText}>{remindersError}</Text>
        ) : null}

        {!remindersLoading && reminders.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>No reminders yet. Tap + NEW to add one.</Text>
          </View>
        ) : (
          <View style={styles.card}>
            {reminders.map((r, i) => (
              <View key={r.id}>
                {i > 0 && <View style={styles.cardDivider} />}
                <ReminderRow
                  reminder={r}
                  onToggle={() => handleToggle(r)}
                  onDelete={() => handleDelete(r.id)}
                />
              </View>
            ))}
          </View>
        )}

        {/* Preferences */}
        <View style={styles.prefHeader}>
          <Text style={styles.sectionLabel}>PREFERENCES</Text>
          {prefsSaving && <ActivityIndicator size="small" color={colors.accentCyan} />}
        </View>

        <View style={styles.card}>
          {/* Theme */}
          <View style={styles.prefRow}>
            <Text style={styles.prefLabel}>Theme</Text>
            <View style={styles.segmented}>
              {(["system", "dark", "light"] as ThemePreference[]).map((opt) => (
                <TouchableOpacity
                  key={opt}
                  style={[styles.segment, theme_preference === opt && styles.segmentActive]}
                  onPress={() => handlePrefChange("theme_preference", opt)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.segmentText, theme_preference === opt && styles.segmentTextActive]}>
                    {opt.toUpperCase()}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.cardDivider} />

          {/* Planning Horizon */}
          <View style={styles.prefRow}>
            <Text style={styles.prefLabel}>Plan Horizon</Text>
            <View style={styles.segmented}>
              {([3, 7, 14, 30] as const).map((days) => (
                <TouchableOpacity
                  key={days}
                  style={[styles.segment, default_planning_horizon === days && styles.segmentActive]}
                  onPress={() => handlePrefChange("default_planning_horizon", days)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.segmentText, default_planning_horizon === days && styles.segmentTextActive]}>
                    {days}D
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.cardDivider} />

          {/* Notification master toggle */}
          <View style={styles.prefRow}>
            <View style={styles.prefLabelGroup}>
              <Text style={styles.prefLabel}>Notifications</Text>
              <Text style={styles.prefSub}>Master switch</Text>
            </View>
            <TouchableOpacity
              style={styles.togglePill}
              onPress={() => handlePrefChange("notifications_enabled", !notifications_enabled)}
              activeOpacity={0.7}
            >
              <Text style={[styles.toggleText, { color: notifications_enabled ? colors.accentCyan : colors.textMuted }]}>
                {notifications_enabled ? "ON" : "OFF"}
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.cardDivider} />

          {/* Reminder notifications */}
          <View style={styles.prefRow}>
            <View style={styles.prefLabelGroup}>
              <Text style={[styles.prefLabel, !notifications_enabled && styles.prefLabelDisabled]}>
                Reminder Alerts
              </Text>
              <Text style={styles.prefSub}>Local push for reminders</Text>
            </View>
            <TouchableOpacity
              style={styles.togglePill}
              onPress={() => handlePrefChange("reminder_notifications", !reminder_notifications)}
              disabled={!notifications_enabled}
              activeOpacity={0.7}
            >
              <Text style={[styles.toggleText, {
                color: notifications_enabled && reminder_notifications ? colors.accentCyan : colors.textMuted,
              }]}>
                {reminder_notifications ? "ON" : "OFF"}
              </Text>
            </TouchableOpacity>
          </View>

        </View>

        {/* Integrations */}
        <TouchableOpacity
          style={styles.integrationsButton}
          onPress={() => router.push("/(tabs)/integrations")}
          activeOpacity={0.8}
        >
          <View style={styles.integrationsButtonLeft}>
            <SymbolView
              name="link.circle"
              size={16}
              tintColor={colors.accentCyan}
              resizeMode="scaleAspectFit"
            />
            <Text style={styles.integrationsButtonText}>INTEGRATIONS</Text>
          </View>
          <SymbolView
            name="chevron.right"
            size={12}
            tintColor={colors.textMuted}
            resizeMode="scaleAspectFit"
          />
        </TouchableOpacity>

        {/* Background Jobs */}
        <Text style={[styles.sectionLabel, { marginTop: spacing.lg }]}>BACKGROUND JOBS</Text>
        <View style={styles.card}>
          {JOB_TYPE_DEFS.map((def, idx) => {
            const job = jobs.find((j) => j.job_type === def.type);
            return (
              <View key={def.type}>
                {idx > 0 && <View style={styles.cardDivider} />}
                <View style={styles.jobRow}>
                  <View style={styles.jobLeft}>
                    <SymbolView
                      name={def.icon as Parameters<typeof SymbolView>[0]["name"]}
                      size={16}
                      tintColor={job?.enabled ? colors.accent : colors.textMuted}
                      resizeMode="scaleAspectFit"
                    />
                    <View style={styles.jobInfo}>
                      <Text style={styles.jobName}>{def.label}</Text>
                      <Text style={styles.jobSchedule}>
                        {job ? job.schedule_label : def.defaultSchedule}
                      </Text>
                      {job ? (
                        <Text style={styles.jobLastRun}>{formatLastRun(job.last_run_at)}</Text>
                      ) : null}
                    </View>
                  </View>
                  <View style={styles.jobRight}>
                    {job ? (
                      <>
                        <TouchableOpacity
                          style={[styles.jobRunBtn, (!job.enabled || isMutating || jobsMutating) && styles.btnDisabled]}
                          onPress={() => {
                            if (!accessToken) return;
                            triggerJob(accessToken, job.id).then((result) => {
                              if (result) Alert.alert("Job Triggered", result.result_summary, [{ text: "OK" }]);
                            });
                          }}
                          disabled={!job.enabled || isMutating || jobsMutating}
                          activeOpacity={0.7}
                        >
                          <Text style={styles.jobRunBtnText}>RUN</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.jobToggle, (isMutating || jobsMutating) && styles.btnDisabled]}
                          onPress={() =>
                            accessToken && updateJob(accessToken, job.id, { enabled: !job.enabled })
                          }
                          disabled={isMutating || jobsMutating}
                          activeOpacity={0.7}
                        >
                          <Text style={[styles.jobToggleText, { color: job.enabled ? colors.accent : colors.textMuted }]}>
                            {job.enabled ? "ON" : "OFF"}
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.jobDeleteBtn, (isMutating || jobsMutating) && styles.btnDisabled]}
                          onPress={() => {
                            Alert.alert(
                              "Remove Job",
                              `Remove the "${def.label}" background job?`,
                              [
                                { text: "Cancel", style: "cancel" },
                                {
                                  text: "Remove",
                                  style: "destructive",
                                  onPress: () => accessToken && deleteJob(accessToken, job.id),
                                },
                              ],
                            );
                          }}
                          disabled={isMutating || jobsMutating}
                          activeOpacity={0.7}
                        >
                          <SymbolView name="trash" size={13} tintColor={colors.textMuted} resizeMode="scaleAspectFit" />
                        </TouchableOpacity>
                      </>
                    ) : (
                      <TouchableOpacity
                        style={[styles.jobAddBtn, (isMutating || jobsMutating) && styles.btnDisabled]}
                        onPress={() =>
                          accessToken &&
                          createJob(accessToken, {
                            job_type: def.type,
                            schedule_label: def.defaultSchedule,
                          })
                        }
                        disabled={isMutating || jobsMutating}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.jobAddBtnText}>ADD</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              </View>
            );
          })}
        </View>

        {/* Logout */}
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout} activeOpacity={0.8}>
          <Text style={styles.logoutText}>SIGN OUT</Text>
        </TouchableOpacity>

        {/* Delete Account */}
        <TouchableOpacity
          style={styles.deleteAccountButton}
          onPress={handleDeleteAccount}
          disabled={authLoading}
          activeOpacity={0.8}
        >
          <Text style={styles.deleteAccountText}>DELETE ACCOUNT</Text>
        </TouchableOpacity>
      </ScrollView>

      <NewReminderModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        onSubmit={handleCreateReminder}
        isMutating={isMutating}
      />
    </>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  container: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl * 2,
  },

  heroCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.lg,
  },

  heroLabel: {
    ...typography.label,
    color: colors.accent,
    marginBottom: spacing.lg,
  },

  avatarRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },

  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },

  avatarInitials: {
    fontSize: 22,
    fontWeight: "700" as const,
    color: colors.textPrimary,
    letterSpacing: 1,
  },

  avatarInfo: { flex: 1 },

  displayName: {
    ...typography.title,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },

  emailText: {
    ...typography.body,
    color: colors.textMuted,
  },

  sectionLabel: {
    ...typography.label,
    color: colors.textMuted,
    marginBottom: spacing.sm,
  },

  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.lg,
    overflow: "hidden",
  },

  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.md,
  },

  infoLabel: {
    ...typography.body,
    color: colors.textSecondary,
    flex: 1,
  },

  infoValue: {
    ...typography.body,
    color: colors.textPrimary,
    flex: 1,
    textAlign: "right",
    fontWeight: "600" as const,
  },

  cardDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginHorizontal: -spacing.lg,
  },

  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.md,
  },

  loadingText: {
    ...typography.label,
    color: colors.textMuted,
  },

  // Permission card
  permRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.md,
  },

  permLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    flex: 1,
  },

  permDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    flexShrink: 0,
  },

  permTitle: {
    ...typography.body,
    color: colors.textPrimary,
  },

  permStatus: {
    ...typography.label,
    fontSize: 10,
    marginTop: 2,
  },

  permButton: {
    backgroundColor: colors.accent,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
    minWidth: 72,
    alignItems: "center",
  },

  permButtonText: {
    ...typography.label,
    color: colors.textPrimary,
    fontSize: 10,
  },

  // Reminders section header
  remindersHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.sm,
  },

  remindersHeaderRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },

  addButton: {
    backgroundColor: colors.accent,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
  },

  addButtonText: {
    ...typography.label,
    color: colors.textPrimary,
    fontSize: 10,
  },

  errorText: {
    ...typography.caption,
    color: "#ef4444",
    marginBottom: spacing.sm,
  },

  emptyCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
    alignItems: "center",
    marginBottom: spacing.lg,
  },

  emptyText: {
    ...typography.body,
    color: colors.textMuted,
    textAlign: "center",
  },

  // Reminder row
  reminderRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.md,
    gap: spacing.md,
  },

  reminderDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    flexShrink: 0,
  },

  reminderBody: {
    flex: 1,
    gap: 2,
  },

  reminderTitle: {
    ...typography.body,
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: "600" as const,
  },

  reminderTime: {
    ...typography.caption,
    color: colors.textMuted,
  },

  reminderActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    flexShrink: 0,
  },

  reminderToggle: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },

  reminderToggleText: {
    ...typography.label,
    fontSize: 9,
  },

  reminderDelete: {
    padding: spacing.xs,
  },

  reminderDeleteText: {
    color: colors.textMuted,
    fontSize: 14,
  },

  // Preferences section
  prefHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.sm,
  },

  prefRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.md,
    gap: spacing.md,
  },

  prefLabel: {
    ...typography.body,
    color: colors.textPrimary,
    fontSize: 14,
  },

  prefLabelDisabled: {
    color: colors.textMuted,
  },

  prefLabelGroup: {
    flex: 1,
    gap: 2,
  },

  prefSub: {
    ...typography.caption,
    color: colors.textMuted,
    fontSize: 11,
  },

  segmented: {
    flexDirection: "row",
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
    flexShrink: 0,
  },

  segment: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
  },

  segmentActive: {
    backgroundColor: colors.accent,
  },

  segmentText: {
    ...typography.label,
    fontSize: 9,
    color: colors.textMuted,
  },

  segmentTextActive: {
    color: colors.textPrimary,
  },

  togglePill: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    flexShrink: 0,
  },

  toggleText: {
    ...typography.label,
    fontSize: 9,
  },

  // Integrations nav
  integrationsButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: `${colors.accentCyan}30`,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
  },

  integrationsButtonLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },

  integrationsButtonText: {
    ...typography.label,
    color: colors.accentCyan,
    fontSize: 12,
  },

  // Logout
  logoutButton: {
    backgroundColor: "rgba(239,68,68,0.12)",
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.35)",
    paddingVertical: spacing.md,
    alignItems: "center",
    marginTop: spacing.sm,
  },

  logoutText: {
    ...typography.label,
    color: "#ef4444",
    fontSize: 13,
  },

  deleteAccountButton: {
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: "center",
    marginTop: spacing.sm,
  },

  deleteAccountText: {
    ...typography.label,
    color: colors.textMuted,
    fontSize: 11,
  },

  // New reminder modal
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
  },

  modalWrapper: {
    justifyContent: "flex-end",
  },

  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xxl,
  },

  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: "center",
    marginBottom: spacing.lg,
  },

  sheetTitle: {
    ...typography.label,
    color: colors.accent,
    marginBottom: spacing.lg,
  },

  fieldLabel: {
    ...typography.label,
    color: colors.textMuted,
    marginBottom: spacing.sm,
    marginTop: spacing.xs,
  },

  fieldHint: {
    ...typography.caption,
    color: colors.textMuted,
    opacity: 0.7,
    marginTop: -spacing.sm,
    marginBottom: spacing.sm,
  },

  input: {
    backgroundColor: colors.surfaceDark,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.borderDark,
    color: colors.textPrimary,
    ...typography.body,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.md,
  },

  inputMultiline: {
    height: 72,
    textAlignVertical: "top",
  },

  formError: {
    ...typography.caption,
    color: "#ef4444",
    marginBottom: spacing.sm,
  },

  sheetActions: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.sm,
  },

  cancelButton: {
    flex: 1,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.sm,
    alignItems: "center",
  },

  cancelButtonText: {
    ...typography.label,
    color: colors.textMuted,
    fontSize: 12,
  },

  createButton: {
    flex: 1,
    backgroundColor: colors.accentCyan,
    borderRadius: radius.sm,
    paddingVertical: spacing.sm,
    alignItems: "center",
  },

  createButtonText: {
    ...typography.label,
    color: colors.background,
    fontSize: 12,
    fontWeight: "700" as const,
  },

  jobRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.md,
  },
  jobLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    flex: 1,
  },
  jobInfo: { flex: 1 },
  jobName: { ...typography.body, color: colors.textPrimary, fontWeight: "600" as const },
  jobSchedule: { ...typography.caption, color: colors.textMuted, marginTop: 2 },
  jobLastRun: { ...typography.caption, color: colors.textMuted, opacity: 0.6, marginTop: 1, fontSize: 10 },
  jobRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  jobRunBtn: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs - 2,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: "#22c55e",
    backgroundColor: "rgba(34, 197, 94, 0.08)",
    alignItems: "center",
  },
  jobRunBtnText: {
    fontSize: 9,
    fontWeight: "700" as const,
    letterSpacing: 0.8,
    color: "#22c55e",
  },
  jobToggle: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs - 2,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    minWidth: 36,
    alignItems: "center",
  },
  jobToggleText: {
    fontSize: 10,
    fontWeight: "700" as const,
    letterSpacing: 0.5,
  },
  jobDeleteBtn: {
    padding: spacing.xs,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  jobAddBtn: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs - 2,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.accentCyan,
    backgroundColor: "rgba(0, 255, 255, 0.06)",
    alignItems: "center",
  },
  jobAddBtnText: {
    fontSize: 10,
    fontWeight: "700" as const,
    letterSpacing: 0.5,
    color: colors.accentCyan,
  },
  btnDisabled: { opacity: 0.5 },
});
}
