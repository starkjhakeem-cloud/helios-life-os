import { useEffect, useMemo, useState, useCallback } from "react";
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
import { detectLocation, getDeviceTimezone } from "../../services/locationService";
import DateTimeField from "../../components/ui/DateTimeField";
import { formatBackendDate, parseDateTimeInput } from "../../utils/dateInput";

import { systemService, type VersionResponse } from "../../services/systemService";
import { requestPermissions } from "../../services/notificationService";
import {
  useAuthStore,
  useRemindersStore,
  useSettingsStore,
  useBackgroundJobsStore,
  useProfileStore,
  SessionExpiredError,
  type ReminderOut,
  type ThemePreference,
  type JobType,
  type AssistantNamePreference,
  type AssistantTone,
  type LifeArea,
} from "../../store";
import { radius, spacing, typography, type ThemeColors } from "../../theme/theme";
import { useTheme } from "../../theme/ThemeContext";

// ── Constants ─────────────────────────────────────────────────────────────────

const USER_ID_RE = /^[a-z0-9_.]{3,24}$/;

const LIFE_AREA_OPTIONS: { value: LifeArea; label: string }[] = [
  { value: "school", label: "School" },
  { value: "work", label: "Work" },
  { value: "family", label: "Family" },
  { value: "health", label: "Health" },
  { value: "finances", label: "Finances" },
  { value: "creative_projects", label: "Creative Projects" },
  { value: "fitness", label: "Fitness" },
  { value: "business", label: "Business" },
];

const TONE_OPTIONS: { value: AssistantTone; label: string }[] = [
  { value: "balanced", label: "Balanced" },
  { value: "formal", label: "Formal" },
  { value: "casual", label: "Casual" },
  { value: "brief", label: "Brief" },
];

const AI_NAME_OPTIONS: { value: AssistantNamePreference; label: string }[] = [
  { value: "display_name", label: "Display" },
  { value: "preferred_name", label: "Preferred" },
  { value: "first_name", label: "First" },
];

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
  return (
    d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) +
    " " +
    d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

type InfoRowProps = { label: string; value: string };
function InfoRow({ label, value }: InfoRowProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.infoRow}>
      <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>{label}</Text>
      <Text style={[styles.infoValue, { color: colors.textPrimary }]} numberOfLines={1}>
        {value}
      </Text>
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
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.reminderRow}>
      <View
        style={[
          styles.reminderDot,
          { backgroundColor: reminder.is_enabled ? colors.accentCyan : colors.border },
        ]}
      />
      <View style={styles.reminderBody}>
        <Text style={styles.reminderTitle} numberOfLines={1}>
          {reminder.title}
        </Text>
        <Text style={styles.reminderTime}>{formatRemindAt(reminder.remind_at)}</Text>
      </View>
      <View style={styles.reminderActions}>
        <TouchableOpacity onPress={onToggle} style={styles.reminderToggle} activeOpacity={0.7}>
          <Text
            style={[
              styles.reminderToggleText,
              { color: reminder.is_enabled ? colors.accentCyan : colors.textMuted },
            ]}
          >
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
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [remindAt, setRemindAt] = useState<Date | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  function resetAndClose() {
    setTitle("");
    setBody("");
    setRemindAt(null);
    setFormError(null);
    Keyboard.dismiss();
    onClose();
  }

  function handleSubmit() {
    if (!title.trim()) {
      setFormError("Reminder title is required.");
      return;
    }
    if (!remindAt) {
      setFormError("Reminder time is required.");
      return;
    }
    if (remindAt <= new Date()) {
      setFormError("Reminder time must be in the future.");
      return;
    }
    setFormError(null);
    onSubmit({ title: title.trim(), body: body.trim(), remind_at: remindAt.toISOString() });
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
            autoCapitalize="sentences"
            autoCorrect
            spellCheck
            maxLength={200}
          />
          <Text style={styles.fieldLabel}>NOTE (OPTIONAL)</Text>
          <TextInput
            style={[styles.input, styles.inputMultiline]}
            value={body}
            onChangeText={setBody}
            placeholder="Additional context"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="sentences"
            autoCorrect
            spellCheck
            maxLength={500}
            multiline
          />
          <DateTimeField
            label="REMIND AT"
            value={remindAt}
            onChange={setRemindAt}
            mode="datetime"
            placeholder="Select reminder time"
            minimumDate={new Date()}
          />
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

// ── User ID Modal ─────────────────────────────────────────────────────────────

type UserIdCheckResult = {
  available: boolean;
  reason: string;
  message: string;
};

/** Map a check `reason` code to a human-readable sentence. */
function formatCheckMessage(result: UserIdCheckResult): string {
  if (result.available) return result.message || "User ID is available.";
  switch (result.reason) {
    case "too_short":
      return "User ID too short — needs at least 3 characters.";
    case "too_long":
      return "User ID too long — 24 characters maximum.";
    case "invalid_format":
      return "Invalid format. Use a–z, 0–9, underscores, or periods.";
    case "reserved":
      return "This User ID is reserved and cannot be used.";
    case "taken":
      return "User ID already taken. Please choose a different one.";
    case "available":
      return "User ID is available.";
    default:
      return result.message || "Unable to check this User ID right now.";
  }
}

/** Map an API error HTTP status to a user-facing sentence. */
function formatApiError(err: unknown): string {
  if (!err || typeof err !== "object") return "Something went wrong. Try again.";
  const e = err as { status?: number; message?: string };
  const message = e.message && !/^HTTP\s+\d+$/.test(e.message) ? e.message : null;
  if (e.status === 503) return message ?? "Unable to reach HELIOS services. Check your connection.";
  if (e.status === 409) return message ?? "User ID already taken.";
  if (e.status === 422) return message ?? "Invalid User ID format.";
  if (e.status === 401) return "Session expired. Please sign in again.";
  if (e.message?.toLowerCase().includes("network"))
    return "Network unavailable. Check your connection.";
  return message ?? "Something went wrong. Try again.";
}

type UserIdModalProps = {
  visible: boolean;
  onClose: () => void;
  currentId: string | null;
  canChange: boolean;
  accessToken: string;
};

function UserIdModal({ visible, onClose, currentId, canChange, accessToken }: UserIdModalProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { updateUserId, checkUserId, isSaving } = useProfileStore();

  const [draft, setDraft] = useState(currentId ?? "");
  const [checkResult, setCheckResult] = useState<UserIdCheckResult | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setDraft(currentId ?? "");
    setCheckResult(null);
    setFormError(null);
    setSuccess(false);
  }, [currentId, visible]);

  function resetAndClose() {
    Keyboard.dismiss();
    onClose();
  }

  function validate(value: string): string | null {
    if (value.length < 3) return "User ID too short — needs at least 3 characters.";
    if (value.length > 24) return "User ID too long — 24 characters maximum.";
    if (!USER_ID_RE.test(value)) return "Use only lowercase letters (a–z), numbers, underscores, or periods.";
    return null;
  }

  async function handleCheck() {
    const val = draft.trim().toLowerCase();
    const validation = validate(val);
    if (validation) {
      setFormError(validation);
      setCheckResult(null);
      return;
    }
    if (currentId && val === currentId) {
      setFormError(null);
      setCheckResult({ available: true, reason: "available", message: "This is already your User ID." });
      return;
    }

    setFormError(null);
    setCheckResult(null);
    setIsChecking(true);
    try {
      setCheckResult(await checkUserId(accessToken, val));
    } catch (err) {
      setFormError(formatApiError(err));
    } finally {
      setIsChecking(false);
    }
  }

  async function handleSave() {
    const val = draft.trim().toLowerCase();
    const validation = validate(val);
    if (validation) {
      setFormError(validation);
      return;
    }
    if (currentId && val === currentId) {
      setFormError("Enter a different User ID before saving.");
      return;
    }
    if (checkResult && !checkResult.available) {
      setFormError(formatCheckMessage(checkResult));
      return;
    }

    setFormError(null);
    try {
      await updateUserId(accessToken, val);
      setSuccess(true);
      setTimeout(resetAndClose, 800);
    } catch (err) {
      setFormError(formatApiError(err));
    }
  }

  const isInitialSet = currentId === null;
  const statusLine = canChange
    ? isInitialSet
      ? "Optional account handle for future sharing and support."
      : "You have 1 User ID change remaining."
    : "Your User ID is locked.";

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={resetAndClose}>
      <TouchableWithoutFeedback onPress={resetAndClose}>
        <View style={styles.overlay} />
      </TouchableWithoutFeedback>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.modalWrapper}>
        <View style={styles.sheet}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>{isInitialSet ? "SET USER ID" : canChange ? "CHANGE USER ID" : "USER ID"}</Text>
          <Text style={[styles.fieldHint, { marginTop: 0, marginBottom: spacing.md }]}>{statusLine}</Text>

          {!canChange ? (
            <>
              <View style={[styles.input, { justifyContent: "center", marginBottom: spacing.sm }]}>
                <Text style={{ color: colors.textMuted, fontSize: 14 }}>@{currentId}</Text>
              </View>
              <Text style={[styles.fieldHint, { color: colors.danger }]}>
                Your User ID has already been changed once and cannot be changed again.
              </Text>
            </>
          ) : (
            <>
              <Text style={styles.fieldLabel}>USER ID</Text>
              <View style={styles.userIdRow}>
                <Text style={styles.userIdAt}>@</Text>
                <TextInput
                  style={[styles.input, styles.userIdInput]}
                  value={draft}
                  onChangeText={(t) => {
                    setDraft(t);
                    setCheckResult(null);
                    setFormError(null);
                  }}
                  placeholder="yourhandle"
                  placeholderTextColor={colors.textMuted}
                  autoCapitalize="none"
                  autoCorrect={false}
                  spellCheck={false}
                  textContentType="username"
                  maxLength={24}
                />
                <TouchableOpacity
                  style={[styles.checkButton, (isChecking || !draft.trim()) && { opacity: 0.5 }]}
                  onPress={handleCheck}
                  disabled={isChecking || !draft.trim()}
                  activeOpacity={0.8}
                >
                  {isChecking ? (
                    <ActivityIndicator size="small" color={colors.background} />
                  ) : (
                    <Text style={styles.checkButtonText}>CHECK</Text>
                  )}
                </TouchableOpacity>
              </View>
              <Text style={styles.fieldHint}>3–24 chars · a–z · 0–9 · _ ·  .</Text>
              {checkResult && !formError ? (
                <Text
                  style={[
                    styles.fieldHint,
                    {
                      color: checkResult.available ? colors.success : colors.danger,
                      marginTop: spacing.xs,
                      fontWeight: "600",
                    },
                  ]}
                >
                  {checkResult.available ? "✓ " : "✗ "}
                  {formatCheckMessage(checkResult)}
                </Text>
              ) : null}
              {formError ? <Text style={[styles.formError, { marginTop: spacing.xs }]}>{formError}</Text> : null}
              {success ? (
                <Text style={[styles.fieldHint, { color: colors.success, fontWeight: "600" }]}>
                  ✓ User ID saved successfully.
                </Text>
              ) : null}
            </>
          )}

          <View style={styles.sheetActions}>
            <TouchableOpacity style={styles.cancelButton} onPress={resetAndClose} activeOpacity={0.7}>
              <Text style={styles.cancelButtonText}>CANCEL</Text>
            </TouchableOpacity>
            {canChange ? (
              <TouchableOpacity
                style={[styles.createButton, (isSaving || !draft.trim() || success) && { opacity: 0.5 }]}
                onPress={handleSave}
                disabled={isSaving || !draft.trim() || success}
                activeOpacity={0.8}
              >
                {isSaving ? (
                  <ActivityIndicator size="small" color={colors.background} />
                ) : (
                  <Text style={styles.createButtonText}>SAVE</Text>
                )}
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}


// ── Personal Information Modal ────────────────────────────────────────────────

type PersonalInfoModalProps = {
  visible: boolean;
  onClose: () => void;
  accessToken: string;
};

function PersonalInfoModal({ visible, onClose, accessToken }: PersonalInfoModalProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const profile = useProfileStore();
  const user = useAuthStore((s) => s.user);
  const displayNameLocked = !profile.can_change_display_name;
  const displayNameLimitMessage = profile.display_name
    ? `Display Name changes are limited to 2 after initial account setup. You have ${profile.display_name_changes_remaining} change${profile.display_name_changes_remaining === 1 ? "" : "s"} remaining.`
    : "Your first Display Name setup is free. After initial setup, you can change your Display Name up to 2 times.";

  const [draft, setDraft] = useState({
    first_name: profile.first_name ?? "",
    last_name: profile.last_name ?? "",
    display_name: profile.display_name ?? "",
    phone_number: profile.phone_number ?? "",
    date_of_birth: profile.date_of_birth ?? "",
    address_line_1: profile.address_line_1 ?? "",
    address_line_2: profile.address_line_2 ?? "",
    city: profile.city ?? "",
    state: profile.state ?? "",
    postal_code: profile.postal_code ?? "",
    country: profile.country ?? "",
    timezone: profile.timezone ?? "",
  });
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (visible) {
      setDraft({
        first_name: profile.first_name ?? "",
        last_name: profile.last_name ?? "",
        display_name: profile.display_name ?? "",
        phone_number: profile.phone_number ?? "",
        date_of_birth: profile.date_of_birth ?? "",
        address_line_1: profile.address_line_1 ?? "",
        address_line_2: profile.address_line_2 ?? "",
        city: profile.city ?? "",
        state: profile.state ?? "",
        postal_code: profile.postal_code ?? "",
        country: profile.country ?? "",
        timezone: profile.timezone ?? "",
      });
      setFormError(null);
      setSuccess(false);
    }
  // Initialize the draft only when the sheet opens; adding profile fields here
  // would reset in-progress edits after a background profile refresh.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  function resetAndClose() {
    Keyboard.dismiss();
    onClose();
  }

  async function handleSave() {
    setFormError(null);
    try {
      await profile.updateProfile(accessToken, {
        first_name: draft.first_name.trim() || null,
        last_name: draft.last_name.trim() || null,
        display_name: draft.display_name.trim() || null,
        phone_number: draft.phone_number.trim() || null,
        date_of_birth: draft.date_of_birth.trim() || null,
        address_line_1: draft.address_line_1.trim() || null,
        address_line_2: draft.address_line_2.trim() || null,
        city: draft.city.trim() || null,
        state: draft.state.trim() || null,
        postal_code: draft.postal_code.trim() || null,
        country: draft.country.trim() || null,
        timezone: draft.timezone.trim() || null,
      });
      setSuccess(true);
      setTimeout(resetAndClose, 800);
    } catch (err) {
      if (err instanceof SessionExpiredError) {
        // The global session-expired dialog in _layout.tsx will handle this.
        resetAndClose();
        return;
      }
      const msg = err instanceof Error ? err.message : "Failed to save. Try again.";
      setFormError(msg);
    }
  }

  const field = (
    label: string,
    key: keyof typeof draft,
    opts?: { placeholder?: string; optional?: boolean; autoCapitalize?: "none" | "sentences" | "words" | "characters" },
  ) => (
    <>
      <Text style={styles.fieldLabel}>
        {label}
        {opts?.optional ? " (OPTIONAL)" : ""}
      </Text>
      <TextInput
        style={[styles.input, { marginBottom: spacing.sm }]}
        value={draft[key]}
        onChangeText={(v) => setDraft((d) => ({ ...d, [key]: v }))}
        placeholder={opts?.placeholder ?? ""}
        placeholderTextColor={colors.textMuted}
        autoCapitalize={opts?.autoCapitalize ?? "words"}
        autoCorrect={opts?.autoCapitalize !== "none"}
        spellCheck={opts?.autoCapitalize !== "none"}
      />
    </>
  );

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={resetAndClose}>
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View style={[styles.overlay, { backgroundColor: "transparent" }]} />
      </TouchableWithoutFeedback>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.modalWrapper}
      >
        <View style={[styles.sheet, { maxHeight: "90%" }]}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>PERSONAL INFORMATION</Text>
          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            {field("FIRST NAME", "first_name")}
            {field("LAST NAME", "last_name")}
            <Text style={styles.fieldLabel}>DISPLAY NAME / ORGANIZATION (OPTIONAL)</Text>
            <TextInput
              style={[
                styles.input,
                styles.displayNameInput,
                displayNameLocked && { opacity: 0.55 },
              ]}
              value={draft.display_name}
              onChangeText={(v) => setDraft((d) => ({ ...d, display_name: v }))}
              placeholder="How you'd like to appear"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="words"
              autoCorrect
              spellCheck
              editable={!displayNameLocked}
            />
            <Text style={styles.displayNameHint}>
              {displayNameLocked
                ? "Display Name is locked. You have used both allowed changes after initial account setup."
                : displayNameLimitMessage}
            </Text>
            <Text style={styles.fieldLabel}>EMAIL ADDRESS</Text>
            <View style={[styles.input, { justifyContent: "center", marginBottom: spacing.md }]}>
              <Text style={{ color: colors.textMuted, fontSize: 14 }}>{user?.email ?? "—"}</Text>
            </View>
            {field("PHONE NUMBER", "phone_number", { optional: true, placeholder: "+1 555 000 0000", autoCapitalize: "none" })}
            <DateTimeField
              label="DATE OF BIRTH (OPTIONAL)"
              value={draft.date_of_birth ? parseDateTimeInput(draft.date_of_birth) : null}
              onChange={(date) => setDraft((d) => ({ ...d, date_of_birth: date ? formatBackendDate(date) : "" }))}
              mode="date"
              placeholder="Select date"
              maximumDate={new Date()}
            />
            {field("ADDRESS LINE 1", "address_line_1", { autoCapitalize: "words" })}
            {field("ADDRESS LINE 2", "address_line_2", { optional: true, autoCapitalize: "words" })}
            {field("CITY", "city", { autoCapitalize: "words" })}
            {field("STATE / PROVINCE", "state", { autoCapitalize: "words" })}
            {field("ZIP / POSTAL CODE", "postal_code", { autoCapitalize: "characters" })}
            {field("COUNTRY", "country", { autoCapitalize: "words" })}
            <Text style={styles.fieldLabel}>TIME ZONE</Text>
            <View style={[styles.input, { justifyContent: "space-between", flexDirection: "row", alignItems: "center", marginBottom: spacing.sm }]}>
              <Text style={{ color: draft.timezone ? colors.textPrimary : colors.textMuted, fontSize: 14, flex: 1 }}>
                {draft.timezone || getDeviceTimezone()}
              </Text>
              <SymbolView name="location.fill" size={12} tintColor={colors.textMuted} resizeMode="scaleAspectFit" />
            </View>
            <Text style={[styles.fieldHint, { marginBottom: spacing.md }]}>
              Detected automatically from your device. Tap &quot;Detect Location&quot; on the Profile screen to refresh.
            </Text>
            {formError ? <Text style={[styles.formError, { marginBottom: spacing.sm }]}>{formError}</Text> : null}
            {success ? (
              <Text style={[styles.fieldHint, { color: colors.success, marginBottom: spacing.sm }]}>
                ✓ Profile saved successfully.
              </Text>
            ) : null}
            <View style={[styles.sheetActions, { marginBottom: spacing.xl }]}>
              <TouchableOpacity style={styles.cancelButton} onPress={resetAndClose} activeOpacity={0.7}>
                <Text style={styles.cancelButtonText}>CANCEL</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.createButton, profile.isSaving && { opacity: 0.5 }]}
                onPress={handleSave}
                disabled={profile.isSaving}
                activeOpacity={0.8}
              >
                {profile.isSaving ? (
                  <ActivityIndicator size="small" color={colors.background} />
                ) : (
                  <Text style={styles.createButtonText}>SAVE</Text>
                )}
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── Personalization Modal ─────────────────────────────────────────────────────

type PersonalizationModalProps = {
  visible: boolean;
  onClose: () => void;
  accessToken: string;
};

function PersonalizationModal({ visible, onClose, accessToken }: PersonalizationModalProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const {
    preferred_name,
    assistant_name_preference,
    assistant_tone,
    primary_location,
    work_focus,
    daily_brief_time,
    time_format,
    important_life_areas,
    isSaving,
    updatePreferences,
  } = useSettingsStore();

  const [draft, setDraft] = useState({
    preferred_name: preferred_name ?? "",
    assistant_name_preference: assistant_name_preference,
    assistant_tone: assistant_tone,
    primary_location: primary_location ?? "",
    work_focus: work_focus ?? "",
    daily_brief_time: daily_brief_time,
    time_format: time_format,
    important_life_areas: [...important_life_areas],
  });
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (visible) {
      setDraft({
        preferred_name: preferred_name ?? "",
        assistant_name_preference: assistant_name_preference,
        assistant_tone: assistant_tone,
        primary_location: primary_location ?? "",
        work_focus: work_focus ?? "",
        daily_brief_time: daily_brief_time,
        time_format: time_format,
        important_life_areas: [...important_life_areas],
      });
      setFormError(null);
      setSuccess(false);
    }
  // Initialize the draft only when the sheet opens; adding preferences here
  // would reset in-progress edits after a background preference refresh.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  function toggleArea(area: LifeArea) {
    setDraft((d) => {
      const areas = d.important_life_areas.includes(area)
        ? d.important_life_areas.filter((a) => a !== area)
        : [...d.important_life_areas, area];
      return { ...d, important_life_areas: areas };
    });
  }

  function resetAndClose() {
    Keyboard.dismiss();
    onClose();
  }

  async function handleSave() {
    setFormError(null);
    try {
      await updatePreferences(accessToken, {
        preferred_name: draft.preferred_name.trim() || null,
        assistant_name_preference: draft.assistant_name_preference,
        assistant_tone: draft.assistant_tone,
        primary_location: draft.primary_location.trim() || null,
        work_focus: draft.work_focus.trim() || null,
        daily_brief_time: draft.daily_brief_time,
        time_format: draft.time_format,
        important_life_areas: draft.important_life_areas as LifeArea[],
      });
      setSuccess(true);
      setTimeout(resetAndClose, 800);
    } catch (err) {
      if (err instanceof SessionExpiredError) {
        resetAndClose();
        return;
      }
      const msg = err instanceof Error ? err.message : "Failed to save. Try again.";
      setFormError(msg);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={resetAndClose}>
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View style={[styles.overlay, { backgroundColor: "transparent" }]} />
      </TouchableWithoutFeedback>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.modalWrapper}
      >
        <View style={[styles.sheet, { maxHeight: "90%" }]}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>PERSONALIZATION</Text>
          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            {/* Preferred Name */}
            <Text style={styles.fieldLabel}>PREFERRED NAME</Text>
            <TextInput
              style={[styles.input, { marginBottom: spacing.md }]}
              value={draft.preferred_name}
              onChangeText={(v) => setDraft((d) => ({ ...d, preferred_name: v }))}
              placeholder="How HELIOS should address you"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="words"
              autoCorrect
              spellCheck
              maxLength={100}
            />

            {/* AI Greeting Name */}
            <Text style={styles.fieldLabel}>AI GREETING NAME</Text>
            <Text style={[styles.fieldHint, { marginBottom: spacing.xs }]}>
              Which name HELIOS uses when addressing you in conversation.
            </Text>
            <View style={[styles.segmented, { marginBottom: spacing.md }]}>
              {AI_NAME_OPTIONS.map((opt) => (
                <TouchableOpacity
                  key={opt.value}
                  style={[styles.segment, draft.assistant_name_preference === opt.value && styles.segmentActive]}
                  onPress={() => setDraft((d) => ({ ...d, assistant_name_preference: opt.value }))}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.segmentText,
                      draft.assistant_name_preference === opt.value && styles.segmentTextActive,
                    ]}
                  >
                    {opt.label.toUpperCase()}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Assistant Tone */}
            <Text style={styles.fieldLabel}>ASSISTANT TONE</Text>
            <View style={[styles.segmented, { marginBottom: spacing.md }]}>
              {TONE_OPTIONS.map((opt) => (
                <TouchableOpacity
                  key={opt.value}
                  style={[styles.segment, draft.assistant_tone === opt.value && styles.segmentActive]}
                  onPress={() => setDraft((d) => ({ ...d, assistant_tone: opt.value }))}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.segmentText,
                      draft.assistant_tone === opt.value && styles.segmentTextActive,
                    ]}
                  >
                    {opt.label.toUpperCase()}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Primary Location — auto-detected, editable override */}
            <Text style={styles.fieldLabel}>PRIMARY LOCATION</Text>
            <Text style={[styles.fieldHint, { marginBottom: spacing.xs }]}>
              Auto-detected from GPS. Edit to override what HELIOS uses for AI context.
            </Text>
            <TextInput
              style={[styles.input, { marginBottom: spacing.md }]}
              value={draft.primary_location}
              onChangeText={(v) => setDraft((d) => ({ ...d, primary_location: v }))}
              placeholder="Auto-detected on login"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="words"
              autoCorrect
              spellCheck
              maxLength={120}
            />

            {/* Work Focus */}
            <Text style={styles.fieldLabel}>WORK FOCUS</Text>
            <TextInput
              style={[styles.input, { marginBottom: spacing.md }]}
              value={draft.work_focus}
              onChangeText={(v) => setDraft((d) => ({ ...d, work_focus: v }))}
              placeholder="e.g. Software engineering, law, nursing"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="sentences"
              autoCorrect
              spellCheck
              maxLength={200}
            />

            {/* Daily Brief Time */}
            <Text style={styles.fieldLabel}>DAILY BRIEF TIME</Text>
            <TextInput
              style={[styles.input, { marginBottom: spacing.md }]}
              value={draft.daily_brief_time}
              onChangeText={(v) => setDraft((d) => ({ ...d, daily_brief_time: v }))}
              placeholder="HH:MM (24-hour)"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              spellCheck={false}
              maxLength={5}
              keyboardType="numbers-and-punctuation"
            />

            {/* Time Format */}
            <Text style={styles.fieldLabel}>TIME FORMAT</Text>
            <View style={[styles.segmented, { marginBottom: spacing.md, alignSelf: "flex-start" }]}>
              {(["12h", "24h"] as const).map((fmt) => (
                <TouchableOpacity
                  key={fmt}
                  style={[styles.segment, draft.time_format === fmt && styles.segmentActive]}
                  onPress={() => setDraft((d) => ({ ...d, time_format: fmt }))}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.segmentText,
                      draft.time_format === fmt && styles.segmentTextActive,
                    ]}
                  >
                    {fmt.toUpperCase()}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Important Life Areas */}
            <Text style={styles.fieldLabel}>IMPORTANT LIFE AREAS</Text>
            <View style={styles.lifeAreaGrid}>
              {LIFE_AREA_OPTIONS.map((area) => {
                const active = draft.important_life_areas.includes(area.value);
                return (
                  <TouchableOpacity
                    key={area.value}
                    style={[styles.lifeAreaChip, active && styles.lifeAreaChipActive]}
                    onPress={() => toggleArea(area.value)}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[styles.lifeAreaText, active && styles.lifeAreaTextActive]}
                    >
                      {area.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {formError ? (
              <Text style={[styles.formError, { marginBottom: spacing.sm }]}>{formError}</Text>
            ) : null}
            {success ? (
              <Text style={[styles.fieldHint, { color: colors.success, marginBottom: spacing.sm }]}>
                ✓ Personalization saved.
              </Text>
            ) : null}

            <View style={[styles.sheetActions, { marginBottom: spacing.xl }]}>
              <TouchableOpacity style={styles.cancelButton} onPress={resetAndClose} activeOpacity={0.7}>
                <Text style={styles.cancelButtonText}>CANCEL</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.createButton, isSaving && { opacity: 0.5 }]}
                onPress={handleSave}
                disabled={isSaving}
                activeOpacity={0.8}
              >
                {isSaving ? (
                  <ActivityIndicator size="small" color={colors.background} />
                ) : (
                  <Text style={styles.createButtonText}>SAVE</Text>
                )}
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── Background job defs ───────────────────────────────────────────────────────

const JOB_TYPE_DEFS: { type: JobType; label: string; icon: string; defaultSchedule: string }[] = [
  { type: "daily_briefing_generation", label: "Daily Briefing", icon: "sun.horizon", defaultSchedule: "Daily at 8:00 AM" },
  { type: "proactive_suggestion_scan", label: "Proactive Suggestions", icon: "lightbulb", defaultSchedule: "Every 30 minutes" },
  { type: "reminder_check", label: "Reminder Check", icon: "bell", defaultSchedule: "Every hour" },
  { type: "integration_sync_simulation", label: "Integration Sync", icon: "arrow.triangle.2.circlepath", defaultSchedule: "Every 6 hours" },
];

// ── Screen ────────────────────────────────────────────────────────────────────

export default function ProfileScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const user = useAuthStore((s) => s.user);
  const accessToken = useAuthStore((s) => s.accessToken);
  const logout = useAuthStore((s) => s.logout);
  const deleteAccount = useAuthStore((s) => s.deleteAccount);
  const authLoading = useAuthStore((s) => s.isLoading);

  const profile = useProfileStore();
  const displayName = profile.display_name ?? user?.name ?? "—";
  const avatarLabel = initials(displayName);

  const [version, setVersion] = useState<VersionResponse | null>(null);
  const [reminderModalVisible, setReminderModalVisible] = useState(false);
  const [userIdModalVisible, setUserIdModalVisible] = useState(false);
  const [personalInfoModalVisible, setPersonalInfoModalVisible] = useState(false);
  const [personalizationModalVisible, setPersonalizationModalVisible] = useState(false);
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
    location,
    preferred_name,
    assistant_tone,
    primary_location,
    work_focus,
    daily_brief_time,
    time_format,
    important_life_areas,
    isSaving: prefsSaving,
    fetchPreferences,
    updatePreferences,
  } = useSettingsStore();

  const [locationDraft, setLocationDraft] = useState(location);
  const [isDetectingLocation, setIsDetectingLocation] = useState(false);

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
      profile.fetchProfile(accessToken);
    }
  // Fetch once when authentication becomes available; store actions are stable.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  useEffect(() => {
    setLocationDraft(location);
  }, [location]);

  function handlePrefChange<K extends keyof Parameters<typeof updatePreferences>[1]>(
    key: K,
    value: Parameters<typeof updatePreferences>[1][K],
  ) {
    if (!accessToken) return;
    updatePreferences(accessToken, { [key]: value });
  }

  function handleSaveLocation() {
    const nextLocation = locationDraft.trim() || "New York";
    setLocationDraft(nextLocation);
    handlePrefChange("location", nextLocation);
  }

  const handleDetectLocation = useCallback(async () => {
    if (!accessToken || isDetectingLocation) return;
    setIsDetectingLocation(true);
    try {
      const detected = await detectLocation();
      if (!detected.permissionGranted) {
        Alert.alert(
          "Location Permission Required",
          "Allow HELIOS to access your location in Settings to auto-detect your city and timezone.",
          [{ text: "OK" }],
        );
        return;
      }

      // Always sync timezone from the detected location when available.
      const timezone = detected.timezone || getDeviceTimezone();
      await profile.updateProfile(accessToken, {
        timezone,
        city: detected.city ?? undefined,
        state: detected.state ?? undefined,
        country: detected.country ?? undefined,
      }).catch(() => {});

      if (detected.locationLabel) {
        const next = detected.locationLabel;
        setLocationDraft(next);
        await updatePreferences(accessToken, {
          location: next,
          primary_location: next,
        }).catch(() => {});
      } else if (detected.warningCode === "simulator_default") {
        Alert.alert(
          "Simulator Location Detected",
          "The iOS Simulator is still reporting its default San Francisco-area location. Set a custom simulator location or run HELIOS on your phone to detect your real location.",
          [{ text: "OK" }],
        );
      } else if (detected.warningCode) {
        Alert.alert(
          "Location Not Found",
          "HELIOS could not resolve your current city from Location Services. Your timezone was updated, but your location label was left unchanged.",
          [{ text: "OK" }],
        );
      }
    } finally {
      setIsDetectingLocation(false);
    }
  }, [accessToken, isDetectingLocation, profile, updatePreferences]);

  function handleLogout() {
    Alert.alert("Sign Out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      { text: "Sign Out", style: "destructive", onPress: logout },
    ]);
  }

  function handleDeleteAccount() {
    Alert.alert(
      "Delete Account",
      "This will permanently delete your account and all data. This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Delete Account", style: "destructive", onPress: () => deleteAccount() },
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
    setReminderModalVisible(false);
  }

  function handleToggle(reminder: ReminderOut) {
    if (!accessToken) return;
    updateReminder(accessToken, reminder.id, { is_enabled: !reminder.is_enabled });
  }

  function handleDelete(id: string) {
    if (!accessToken) return;
    Alert.alert("Delete Reminder", "This reminder will be permanently deleted.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => deleteReminder(accessToken, id) },
    ]);
  }

  const permLabel =
    permissionStatus === "granted"
      ? "GRANTED"
      : permissionStatus === "denied"
      ? "DENIED"
      : "NOT REQUESTED";
  const permColor =
    permissionStatus === "granted"
      ? colors.accentCyan
      : permissionStatus === "denied"
      ? colors.danger
      : colors.textMuted;

  // Build a compact summary for the personalization section card
  const personalizationSummary: { label: string; value: string }[] = [];
  if (preferred_name) personalizationSummary.push({ label: "Preferred Name", value: preferred_name });
  if (assistant_tone) personalizationSummary.push({ label: "Tone", value: assistant_tone.charAt(0).toUpperCase() + assistant_tone.slice(1) });
  if (primary_location) personalizationSummary.push({ label: "Primary Location", value: primary_location });
  if (work_focus) personalizationSummary.push({ label: "Work Focus", value: work_focus });
  if (daily_brief_time) personalizationSummary.push({ label: "Daily Brief", value: daily_brief_time });
  personalizationSummary.push({ label: "Time Format", value: time_format });
  if (important_life_areas.length > 0) {
    const labels = important_life_areas.map((a) => LIFE_AREA_OPTIONS.find((o) => o.value === a)?.label ?? a);
    personalizationSummary.push({ label: "Life Areas", value: labels.join(", ") });
  }

  // Build personal info summary
  const personalSummary: { label: string; value: string }[] = [];
  if (profile.first_name || profile.last_name) {
    const name = [profile.first_name, profile.last_name].filter(Boolean).join(" ");
    personalSummary.push({ label: "Name", value: name });
  }
  if (profile.phone_number) personalSummary.push({ label: "Phone", value: profile.phone_number });
  if (profile.city) {
    const loc = [profile.city, profile.state, profile.country].filter(Boolean).join(", ");
    personalSummary.push({ label: "Location", value: loc });
  }
  if (profile.timezone) personalSummary.push({ label: "Timezone", value: profile.timezone });

  return (
    <>
      <ScrollView
        style={{ backgroundColor: colors.background }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.container, { paddingTop: insets.top + spacing.md }]}
      >
        {/* ── Hero ─────────────────────────────────────────────────────────── */}
        <View style={styles.heroCard}>
          <Text style={styles.heroLabel}>Account</Text>
          <View style={styles.avatarRow}>
            <View style={styles.avatar}>
              <Text style={styles.avatarInitials}>{avatarLabel || "?"}</Text>
            </View>
            <View style={styles.avatarInfo}>
              <Text style={styles.displayName} numberOfLines={1}>{displayName}</Text>
              <Text style={styles.emailText} numberOfLines={1}>{user?.email ?? "—"}</Text>
            </View>
          </View>
        </View>

        {/* ── Account ───────────────────────────────────────────────────────── */}
        <Text style={styles.sectionLabel}>ACCOUNT</Text>
        <View style={styles.card}>
          <InfoRow label="Member Since" value={formatMemberSince(user?.created_at)} />
          <View style={styles.cardDivider} />
          <View style={styles.infoRow}>
            <Text style={[styles.infoLabel, { color: colors.textSecondary, flex: 0 }]}>User ID</Text>
            <TouchableOpacity
              onPress={() => setUserIdModalVisible(true)}
              style={styles.userIdValueRow}
              activeOpacity={0.7}
            >
              {profile.custom_user_id ? (
                <Text style={[styles.infoValue, { color: colors.textPrimary }]} numberOfLines={1}>
                  @{profile.custom_user_id}
                </Text>
              ) : (
                <Text style={[styles.infoValue, { color: colors.textMuted, fontStyle: "italic" }]} numberOfLines={1}>
                  Not set
                </Text>
              )}
              {profile.can_change_user_id ? (
                <Text style={styles.editChip}>{profile.custom_user_id ? "CHANGE" : "SET"}</Text>
              ) : (
                <SymbolView name="lock" size={11} tintColor={colors.textMuted} resizeMode="scaleAspectFit" />
              )}
            </TouchableOpacity>
          </View>
          <TouchableOpacity
            onPress={() => setUserIdModalVisible(true)}
            activeOpacity={0.7}
          >
            <Text style={styles.lockNote}>
              {profile.can_change_user_id
                ? profile.custom_user_id
                  ? "Used for account identity and future sharing. You can change it once after setup."
                  : "Optional account handle for future sharing and support."
                : "User ID can only be changed once after setup."}
            </Text>
          </TouchableOpacity>
          <View style={styles.cardDivider} />
          <View style={styles.infoRow}>
            <Text style={[styles.infoLabel, { color: colors.textSecondary, flex: 0 }]}>Display Name</Text>
            <TouchableOpacity
              onPress={() => setPersonalInfoModalVisible(true)}
              style={styles.userIdValueRow}
              activeOpacity={0.7}
            >
              {profile.display_name ? (
                <Text style={[styles.infoValue, { color: colors.textPrimary }]} numberOfLines={1}>
                  {profile.display_name}
                </Text>
              ) : (
                <Text style={[styles.infoValue, { color: colors.textMuted, fontStyle: "italic" }]} numberOfLines={1}>
                  Not set
                </Text>
              )}
              {profile.can_change_display_name ? (
                <Text style={styles.editChip}>{profile.display_name ? "CHANGE" : "SET"}</Text>
              ) : (
                <SymbolView name="lock" size={11} tintColor={colors.textMuted} resizeMode="scaleAspectFit" />
              )}
            </TouchableOpacity>
          </View>
          <TouchableOpacity
            onPress={() => setPersonalInfoModalVisible(true)}
            activeOpacity={0.7}
          >
            <Text style={styles.lockNote}>
              {profile.can_change_display_name
                ? `${profile.display_name_changes_remaining} display name change${profile.display_name_changes_remaining === 1 ? "" : "s"} remaining after setup.`
                : "Display Name can only be changed twice after setup."}
            </Text>
          </TouchableOpacity>
          <View style={styles.cardDivider} />
          <TouchableOpacity
            style={styles.infoRow}
            onPress={() => router.push("/(tabs)/change-password")}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Change Password"
          >
            <View style={styles.changePasswordLeft}>
              <SymbolView name="lock.rotation" size={14} tintColor={colors.accent} resizeMode="scaleAspectFit" />
              <Text style={[styles.infoLabel, { color: colors.textPrimary, flex: 0 }]}>Change Password</Text>
            </View>
            <SymbolView name="chevron.right" size={12} tintColor={colors.textMuted} resizeMode="scaleAspectFit" />
          </TouchableOpacity>
          <View style={styles.cardDivider} />
          <TouchableOpacity
            style={styles.infoRow}
            onPress={() => router.push("/(tabs)/change-email")}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Change Email"
          >
            <View style={styles.changePasswordLeft}>
              <SymbolView name="envelope.badge" size={14} tintColor={colors.accent} resizeMode="scaleAspectFit" />
              <Text style={[styles.infoLabel, { color: colors.textPrimary, flex: 0 }]}>Change Email</Text>
            </View>
            <SymbolView name="chevron.right" size={12} tintColor={colors.textMuted} resizeMode="scaleAspectFit" />
          </TouchableOpacity>
          <View style={styles.cardDivider} />
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
                  <Text
                    style={[
                      styles.segmentText,
                      theme_preference === opt && styles.segmentTextActive,
                    ]}
                  >
                    {opt.toUpperCase()}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>

        {/* ── System ────────────────────────────────────────────────────────── */}
        <Text style={styles.sectionLabel}>SYSTEM</Text>
        <View style={styles.card}>
          {version ? (
            <>
              <InfoRow label="App Version" value={version.version} />
              <View style={styles.cardDivider} />
              <InfoRow label="API Version" value={version.helios_version ?? "HELIOS 2.6"} />
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

        {/* ── Personal Information ─────────────────────────────────────────── */}
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionLabel}>PERSONAL INFORMATION</Text>
          <TouchableOpacity
            onPress={() => setPersonalInfoModalVisible(true)}
            style={styles.sectionEditButton}
            activeOpacity={0.7}
          >
            <Text style={styles.sectionEditText}>EDIT</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.card}>
          {personalSummary.length > 0 ? (
            personalSummary.map((row, i) => (
              <View key={row.label}>
                {i > 0 && <View style={styles.cardDivider} />}
                <InfoRow label={row.label} value={row.value} />
              </View>
            ))
          ) : (
            <TouchableOpacity
              style={styles.emptySection}
              onPress={() => setPersonalInfoModalVisible(true)}
              activeOpacity={0.7}
            >
              <Text style={styles.emptyText}>
                Tap Edit to add your personal information.
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* ── Personalization ───────────────────────────────────────────────── */}
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionLabel}>PERSONALIZATION</Text>
          <TouchableOpacity
            onPress={() => setPersonalizationModalVisible(true)}
            style={styles.sectionEditButton}
            activeOpacity={0.7}
          >
            <Text style={styles.sectionEditText}>EDIT</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.card}>
          {personalizationSummary.length > 0 ? (
            personalizationSummary.map((row, i) => (
              <View key={row.label}>
                {i > 0 && <View style={styles.cardDivider} />}
                <InfoRow label={row.label} value={row.value} />
              </View>
            ))
          ) : (
            <TouchableOpacity
              style={styles.emptySection}
              onPress={() => setPersonalizationModalVisible(true)}
              activeOpacity={0.7}
            >
              <Text style={styles.emptyText}>
                Tap Edit to configure how HELIOS personalizes for you.
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* ── Notifications ─────────────────────────────────────────────────── */}
        <Text style={styles.sectionLabel}>NOTIFICATIONS</Text>
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

        {/* ── Reminders ─────────────────────────────────────────────────────── */}
        <View style={styles.remindersHeader}>
          <Text style={styles.sectionLabel}>REMINDERS</Text>
          <View style={styles.remindersHeaderRight}>
            {remindersLoading || isMutating ? (
              <ActivityIndicator size="small" color={colors.accentCyan} />
            ) : null}
            <TouchableOpacity
              style={styles.addButton}
              onPress={() => setReminderModalVisible(true)}
              activeOpacity={0.8}
            >
              <Text style={styles.addButtonText}>+ NEW</Text>
            </TouchableOpacity>
          </View>
        </View>
        {remindersError ? <Text style={styles.errorText}>{remindersError}</Text> : null}
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

        {/* ── Preferences ───────────────────────────────────────────────────── */}
        <View style={styles.prefHeader}>
          <Text style={styles.sectionLabel}>PREFERENCES</Text>
          {prefsSaving && <ActivityIndicator size="small" color={colors.accentCyan} />}
        </View>
        <View style={styles.card}>
          {/* Location — auto-detected, with manual override */}
          <View style={styles.locationPrefRow}>
            <View style={styles.prefLabelGroup}>
              <Text style={styles.prefLabel}>Location</Text>
              <Text style={styles.prefSub}>Auto-detected · shown with local time</Text>
            </View>
            <View style={styles.locationEditor}>
              <TextInput
                style={styles.locationInput}
                value={locationDraft}
                onChangeText={setLocationDraft}
                onSubmitEditing={handleSaveLocation}
                returnKeyType="done"
                maxLength={120}
                placeholder="Detecting…"
                placeholderTextColor={colors.textMuted}
                autoCapitalize="none"
                autoCorrect={false}
                spellCheck={false}
                accessibilityLabel="Profile location"
              />
              <TouchableOpacity
                style={[styles.locationSaveButton, isDetectingLocation && styles.btnDisabled]}
                onPress={handleDetectLocation}
                disabled={isDetectingLocation}
                activeOpacity={0.75}
              >
                {isDetectingLocation ? (
                  <ActivityIndicator size="small" color={colors.accentCyan} />
                ) : (
                  <SymbolView name="location.fill" size={14} tintColor={colors.accentCyan} resizeMode="scaleAspectFit" />
                )}
              </TouchableOpacity>
            </View>
          </View>
          {/* Planning Horizon */}
          <View style={styles.prefRow}>
            <Text style={styles.prefLabel}>Plan Horizon</Text>
            <View style={styles.segmented}>
              {([3, 7, 14, 30] as const).map((days) => (
                <TouchableOpacity
                  key={days}
                  style={[
                    styles.segment,
                    default_planning_horizon === days && styles.segmentActive,
                  ]}
                  onPress={() => handlePrefChange("default_planning_horizon", days)}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.segmentText,
                      default_planning_horizon === days && styles.segmentTextActive,
                    ]}
                  >
                    {days}D
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
          <View style={styles.cardDivider} />
          {/* Notifications master */}
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
              <Text
                style={[
                  styles.toggleText,
                  { color: notifications_enabled ? colors.accentCyan : colors.textMuted },
                ]}
              >
                {notifications_enabled ? "ON" : "OFF"}
              </Text>
            </TouchableOpacity>
          </View>
          <View style={styles.cardDivider} />
          {/* Reminder alerts */}
          <View style={styles.prefRow}>
            <View style={styles.prefLabelGroup}>
              <Text
                style={[styles.prefLabel, !notifications_enabled && styles.prefLabelDisabled]}
              >
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
              <Text
                style={[
                  styles.toggleText,
                  {
                    color:
                      notifications_enabled && reminder_notifications
                        ? colors.accentCyan
                        : colors.textMuted,
                  },
                ]}
              >
                {reminder_notifications ? "ON" : "OFF"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Integrations ──────────────────────────────────────────────────── */}
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

        {/* ── Background Jobs ───────────────────────────────────────────────── */}
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
                          style={[
                            styles.jobRunBtn,
                            (!job.enabled || isMutating || jobsMutating) && styles.btnDisabled,
                          ]}
                          onPress={() => {
                            if (!accessToken) return;
                            triggerJob(accessToken, job.id).then((result) => {
                              if (result)
                                Alert.alert("Job Triggered", result.result_summary, [{ text: "OK" }]);
                            });
                          }}
                          disabled={!job.enabled || isMutating || jobsMutating}
                          activeOpacity={0.7}
                        >
                          <Text style={styles.jobRunBtnText}>RUN</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[
                            styles.jobToggle,
                            (isMutating || jobsMutating) && styles.btnDisabled,
                          ]}
                          onPress={() =>
                            accessToken &&
                            updateJob(accessToken, job.id, { enabled: !job.enabled })
                          }
                          disabled={isMutating || jobsMutating}
                          activeOpacity={0.7}
                        >
                          <Text
                            style={[
                              styles.jobToggleText,
                              { color: job.enabled ? colors.accent : colors.textMuted },
                            ]}
                          >
                            {job.enabled ? "ON" : "OFF"}
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[
                            styles.jobDeleteBtn,
                            (isMutating || jobsMutating) && styles.btnDisabled,
                          ]}
                          onPress={() => {
                            Alert.alert("Remove Job", `Remove the "${def.label}" background job?`, [
                              { text: "Cancel", style: "cancel" },
                              {
                                text: "Remove",
                                style: "destructive",
                                onPress: () => accessToken && deleteJob(accessToken, job.id),
                              },
                            ]);
                          }}
                          disabled={isMutating || jobsMutating}
                          activeOpacity={0.7}
                        >
                          <SymbolView
                            name="trash"
                            size={13}
                            tintColor={colors.textMuted}
                            resizeMode="scaleAspectFit"
                          />
                        </TouchableOpacity>
                      </>
                    ) : (
                      <TouchableOpacity
                        style={[
                          styles.jobAddBtn,
                          (isMutating || jobsMutating) && styles.btnDisabled,
                        ]}
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

        {/* ── Sign Out / Delete ──────────────────────────────────────────────── */}
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout} activeOpacity={0.8}>
          <Text style={styles.logoutText}>SIGN OUT</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.deleteAccountButton}
          onPress={handleDeleteAccount}
          disabled={authLoading}
          activeOpacity={0.8}
        >
          <Text style={styles.deleteAccountText}>DELETE ACCOUNT</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* ── Modals ────────────────────────────────────────────────────────────── */}
      <NewReminderModal
        visible={reminderModalVisible}
        onClose={() => setReminderModalVisible(false)}
        onSubmit={handleCreateReminder}
        isMutating={isMutating}
      />
      {accessToken && (
        <>
          <UserIdModal
            visible={userIdModalVisible}
            onClose={() => setUserIdModalVisible(false)}
            currentId={profile.custom_user_id}
            canChange={profile.can_change_user_id}
            accessToken={accessToken}
          />
          <PersonalInfoModal
            visible={personalInfoModalVisible}
            onClose={() => setPersonalInfoModalVisible(false)}
            accessToken={accessToken}
          />
          <PersonalizationModal
            visible={personalizationModalVisible}
            onClose={() => setPersonalizationModalVisible(false)}
            accessToken={accessToken}
          />
        </>
      )}
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

    // Hero
    heroCard: {
      backgroundColor: colors.surface,
      borderRadius: radius.xl,
      padding: spacing.xl,
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom: spacing.lg,
    },
    heroLabel: {
      fontSize: 22,
      fontWeight: "700" as const,
      color: colors.textPrimary,
      marginBottom: spacing.lg,
      letterSpacing: -0.5,
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
    handleRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      marginTop: 3,
    },
    handleText: {
      ...typography.label,
      color: colors.accentCyan,
      fontSize: 12,
    },
    handlePrompt: {
      ...typography.label,
      color: colors.textMuted,
      fontSize: 11,
      fontStyle: "italic",
    },

    // Section headers
    sectionHeaderRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: spacing.sm,
    },
    sectionLabel: {
      ...typography.label,
      color: colors.textMuted,
      marginBottom: spacing.sm,
    },
    sectionEditButton: {
      paddingHorizontal: spacing.sm,
      paddingVertical: 3,
      borderRadius: radius.sm,
      borderWidth: 1,
      borderColor: colors.border,
    },
    sectionEditText: {
      ...typography.label,
      color: colors.accentCyan,
      fontSize: 9,
    },

    // Cards
    card: {
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: spacing.lg,
      marginBottom: spacing.lg,
      overflow: "hidden",
    },
    cardDivider: {
      height: 1,
      backgroundColor: colors.border,
      marginHorizontal: -spacing.lg,
    },

    // Info rows
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
    userIdValueRow: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "flex-end",
      gap: spacing.sm,
    },
    editChip: {
      ...typography.label,
      color: colors.accentCyan,
      fontSize: 9,
      borderWidth: 1,
      borderColor: `${colors.accentCyan}40`,
      borderRadius: radius.sm,
      paddingHorizontal: 5,
      paddingVertical: 2,
    },
    lockNote: {
      ...typography.caption,
      color: colors.textMuted,
      fontSize: 10,
      paddingBottom: spacing.sm,
      fontStyle: "italic",
    },
    changePasswordLeft: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
    },

    // Loading
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

    // Empty sections
    emptySection: {
      paddingVertical: spacing.lg,
      alignItems: "center",
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

    // Reminders
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
      color: colors.danger,
      marginBottom: spacing.sm,
    },
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
    reminderDelete: { padding: spacing.xs },
    reminderDeleteText: { color: colors.textMuted, fontSize: 14 },

    // Preferences
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
    locationPrefRow: {
      paddingVertical: spacing.md,
      gap: spacing.sm,
    },
    locationEditor: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
    },
    locationInput: {
      flex: 1,
      minHeight: 42,
      borderRadius: radius.sm,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceDark,
      color: colors.textPrimary,
      paddingHorizontal: spacing.md,
      fontSize: 14,
      fontWeight: "600" as const,
    },
    locationSaveButton: {
      minHeight: 42,
      justifyContent: "center",
      paddingHorizontal: spacing.md,
      borderRadius: radius.sm,
      backgroundColor: colors.accent,
    },
    locationSaveText: {
      ...typography.label,
      color: colors.textPrimary,
      fontSize: 9,
    },
    prefLabel: {
      ...typography.body,
      color: colors.textPrimary,
      fontSize: 14,
    },
    prefLabelDisabled: { color: colors.textMuted },
    prefLabelGroup: { flex: 1, gap: 2 },
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
    segmentActive: { backgroundColor: colors.accent },
    segmentText: {
      ...typography.label,
      fontSize: 9,
      color: colors.textMuted,
    },
    segmentTextActive: { color: colors.textPrimary },
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

    // Integrations
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

    // Background jobs
    jobRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingVertical: spacing.md,
    },
    jobLeft: { flexDirection: "row", alignItems: "center", gap: spacing.sm, flex: 1 },
    jobInfo: { flex: 1 },
    jobName: { ...typography.body, color: colors.textPrimary, fontWeight: "600" as const },
    jobSchedule: { ...typography.caption, color: colors.textMuted, marginTop: 2 },
    jobLastRun: { ...typography.caption, color: colors.textMuted, opacity: 0.6, marginTop: 1, fontSize: 10 },
    jobRight: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
    jobRunBtn: {
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs - 2,
      borderRadius: radius.sm,
      borderWidth: 1,
      borderColor: colors.success,
      backgroundColor: `${colors.success}14`,
      alignItems: "center",
    },
    jobRunBtnText: { fontSize: 9, fontWeight: "700" as const, letterSpacing: 0.8, color: colors.success },
    jobToggle: {
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs - 2,
      borderRadius: radius.sm,
      borderWidth: 1,
      borderColor: colors.border,
      minWidth: 36,
      alignItems: "center",
    },
    jobToggleText: { fontSize: 10, fontWeight: "700" as const, letterSpacing: 0.5 },
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
      backgroundColor: `${colors.accentCyan}0f`,
      alignItems: "center",
    },
    jobAddBtnText: { fontSize: 10, fontWeight: "700" as const, letterSpacing: 0.5, color: colors.accentCyan },
    btnDisabled: { opacity: 0.5 },

    // Logout / Delete
    logoutButton: {
      backgroundColor: `${colors.danger}1e`,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: `${colors.danger}59`,
      paddingVertical: spacing.md,
      alignItems: "center",
      marginTop: spacing.sm,
    },
    logoutText: { ...typography.label, color: colors.danger, fontSize: 13 },
    deleteAccountButton: {
      borderRadius: radius.md,
      paddingVertical: spacing.md,
      alignItems: "center",
      marginTop: spacing.sm,
    },
    deleteAccountText: { ...typography.label, color: colors.textMuted, fontSize: 11 },

    // Modals
    overlay: {
      flex: 1,
      backgroundColor: colors.overlay,
    },
    modalWrapper: { ...StyleSheet.absoluteFillObject, justifyContent: "flex-end" },
    sheet: {
      backgroundColor: colors.glassStrong,
      borderTopLeftRadius: radius.xl,
      borderTopRightRadius: radius.xl,
      borderWidth: 1,
      borderColor: colors.primaryBorder,
      padding: spacing.lg + 2,
      paddingTop: spacing.md,
      paddingBottom: spacing.xxl,
      shadowColor: colors.shadow,
      shadowOpacity: 0.18,
      shadowRadius: 28,
      shadowOffset: { width: 0, height: -12 },
      elevation: 18,
    },
    sheetHandle: {
      width: 40,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.secondaryBorder,
      alignSelf: "center",
      marginBottom: spacing.lg + 2,
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
      marginTop: spacing.md,
    },
    fieldHint: {
      ...typography.caption,
      color: colors.textMuted,
      opacity: 0.7,
      marginTop: -spacing.sm,
      marginBottom: spacing.sm,
    },
    input: {
      backgroundColor: colors.glassSubtle,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.secondaryBorder,
      color: colors.textPrimary,
      ...typography.body,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      minHeight: 48,
      marginBottom: spacing.md,
    },
    displayNameInput: {
      marginBottom: spacing.xs,
    },
    displayNameHint: {
      ...typography.caption,
      color: colors.textMuted,
      opacity: 0.72,
      marginTop: 0,
      marginBottom: spacing.lg,
      lineHeight: 17,
      flexShrink: 1,
    },
    inputMultiline: { height: 72, textAlignVertical: "top" },
    formError: { ...typography.caption, color: colors.danger, marginBottom: spacing.sm },
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
    cancelButtonText: { ...typography.label, color: colors.textMuted, fontSize: 12 },
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

    // User ID modal
    userIdRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      marginBottom: spacing.xs,
    },
    userIdAt: {
      ...typography.body,
      color: colors.accentCyan,
      fontWeight: "700" as const,
      fontSize: 18,
    },
    userIdInput: {
      flex: 1,
      marginBottom: 0,
    },
    checkButton: {
      backgroundColor: colors.accent,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: radius.sm,
      alignItems: "center",
      minWidth: 64,
    },
    checkButtonText: { ...typography.label, color: colors.textPrimary, fontSize: 10 },

    // Life area chips
    lifeAreaGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: spacing.sm,
      marginBottom: spacing.lg,
    },
    lifeAreaChip: {
      paddingHorizontal: spacing.md,
      paddingVertical: 6,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceDark,
    },
    lifeAreaChipActive: {
      borderColor: colors.accentCyan,
      backgroundColor: `${colors.accentCyan}1a`,
    },
    lifeAreaText: {
      ...typography.label,
      color: colors.textMuted,
      fontSize: 11,
    },
    lifeAreaTextActive: { color: colors.accentCyan },
  });
}
