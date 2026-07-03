import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { type Href, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SymbolView } from "expo-symbols";
import type { SFSymbol } from "sf-symbols-typescript";

import { useCurrentDateTime } from "../../hooks/useCurrentDateTime";
import { radius, spacing, typography, type ThemeColors } from "../../theme/theme";
import { useTheme } from "../../theme/ThemeContext";
import {
  useAuthStore,
  useDailyBriefStore,
  useIntegrationStore,
  useMemoryStore,
  useNotificationsStore,
  useProfileStore,
  useRemindersStore,
  useSettingsStore,
} from "../../store";
import type { Integration } from "../../services/integrationService";

type RowTone = "default" | "success" | "warning" | "danger" | "muted";

type CommandRow = {
  id: string;
  title: string;
  subtitle: string;
  icon: SFSymbol;
  route?: Href;
  onPress?: () => void;
  meta?: string;
  tone?: RowTone;
  searchTerms?: string[];
};

type CommandSection = {
  id: string;
  title: string;
  description?: string;
  rows: CommandRow[];
};

type QuickAction = {
  id: string;
  label: string;
  icon: SFSymbol;
  onPress: () => void;
  loading?: boolean;
};

const FUTURE_SERVICES = [
  { title: "Apple Calendar", icon: "calendar" },
  { title: "Apple Reminders", icon: "checklist" },
  { title: "Apple Health", icon: "heart" },
  { title: "Weather", icon: "cloud.sun" },
  { title: "GitHub", icon: "chevron.left.forwardslash.chevron.right" },
  { title: "Outlook", icon: "envelope" },
  { title: "Notion", icon: "doc.richtext" },
  { title: "Apple Notes", icon: "note.text" },
  { title: "Google Drive", icon: "externaldrive" },
  { title: "Slack", icon: "bubble.left.and.bubble.right" },
  { title: "Maps", icon: "map" },
  { title: "Finance", icon: "creditcard" },
  { title: "Smart Home", icon: "house" },
  { title: "Spotify", icon: "music.note" },
] satisfies { title: string; icon: SFSymbol }[];

function routeFor(path: string): Href {
  return path as Href;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "H";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function serviceMatches(integration: Integration, service: "calendar" | "gmail"): boolean {
  if (service === "calendar") {
    return integration.provider === "google_calendar"
      || (integration.provider === "gmail" && integration.service_type === "calendar")
      || integration.service_type === "calendar";
  }
  return integration.provider === "gmail" || integration.service_type === "gmail";
}

function statusLabel(status: string | undefined): string {
  if (status === "connected") return "Connected";
  if (status === "needs_attention") return "Needs attention";
  if (status === "syncing") return "Syncing";
  if (status === "error") return "Error";
  return "Not connected";
}

function statusTone(status: string | undefined): RowTone {
  if (status === "connected") return "success";
  if (status === "needs_attention" || status === "error") return "warning";
  return "muted";
}

function formatLastSync(value: string | null | undefined): string {
  if (!value) return "No sync recorded";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Sync recorded";
  return `Last sync ${date.toLocaleDateString("en-US", { month: "short", day: "numeric" })} at ${date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;
}

function toneColor(tone: RowTone | undefined, colors: ThemeColors): string {
  if (tone === "success") return colors.success;
  if (tone === "warning") return colors.warning;
  if (tone === "danger") return colors.danger;
  if (tone === "muted") return colors.textMuted;
  return colors.accent;
}

export default function MoreScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const now = useCurrentDateTime();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const accessToken = useAuthStore((s) => s.accessToken);
  const authUser = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  const profile = useProfileStore();
  const settings = useSettingsStore();
  const memories = useMemoryStore((s) => s.memories);
  const unreadNotifications = useNotificationsStore((s) => s.unreadCount);
  const permissionStatus = useRemindersStore((s) => s.permissionStatus);
  const dailyBrief = useDailyBriefStore((s) => s.brief);
  const generateDailyBrief = useDailyBriefStore((s) => s.generate);
  const isGeneratingBrief = useDailyBriefStore((s) => s.isGenerating);

  const {
    integrations,
    isLoading: integrationsLoading,
    syncingId,
    fetchIntegrations,
    triggerSync,
  } = useIntegrationStore();

  const [query, setQuery] = useState("");
  const [syncingEverything, setSyncingEverything] = useState(false);

  useEffect(() => {
    if (accessToken) fetchIntegrations(accessToken);
  }, [accessToken, fetchIntegrations]);

  const displayName = profile.display_name ?? authUser?.name ?? "HELIOS Operator";
  const userId = profile.custom_user_id ?? authUser?.id ?? "Account ID pending";
  const email = authUser?.email ?? "Email unavailable";
  const googleCalendar = integrations.find((item) => serviceMatches(item, "calendar"));
  const gmail = integrations.find((item) => serviceMatches(item, "gmail"));
  const connectedCount = integrations.filter((item) => item.status === "connected").length;
  const memoryStatus = memories.length > 0 ? `${memories.length} remembered` : "Ready to learn";
  const dailyBriefStatus = dailyBrief ? "Generated today" : "Ready on demand";
  const dayPeriod = now.getHours() < 12 ? "Morning" : now.getHours() < 17 ? "Afternoon" : "Evening";

  function navigate(route: Href) {
    router.push(route);
  }

  async function handleSyncEverything() {
    if (!accessToken) return;
    const connected = integrations.filter((item) => item.status === "connected" && item.id);
    if (connected.length === 0) {
      Alert.alert(
        "No connected services",
        "Connect Google Calendar and Gmail to unlock smarter recommendations.",
      );
      return;
    }
    setSyncingEverything(true);
    try {
      await Promise.all(connected.map((item) => triggerSync(accessToken, item.id as string)));
      Alert.alert("Sync complete", "HELIOS requested a fresh sync for every connected service.");
    } catch {
      Alert.alert("Sync interrupted", "One or more services could not be synced right now.");
    } finally {
      setSyncingEverything(false);
    }
  }

  function handleGenerateBrief() {
    if (!accessToken) return;
    generateDailyBrief(accessToken)
      .then(() => Alert.alert("Daily Brief generated", "HELIOS refreshed today's executive brief."))
      .catch(() => Alert.alert("Daily Brief unavailable", "HELIOS could not generate the brief right now."));
  }

  function handleComingInV4(title: string) {
    Alert.alert(title, `${title} is planned for HELIOS V4 and is not enabled in this build.`);
  }

  function confirmSignOut() {
    Alert.alert("Sign Out", "End this HELIOS session on this device?", [
      { text: "Cancel", style: "cancel" },
      { text: "Sign Out", style: "destructive", onPress: logout },
    ]);
  }

  const quickActions: QuickAction[] = [
    { id: "build-day", label: "Build My Day", icon: "calendar.badge.clock", onPress: () => navigate(routeFor("/(tabs)/calendar")) },
    { id: "sync", label: "Sync Everything", icon: "arrow.clockwise", onPress: handleSyncEverything, loading: syncingEverything },
    { id: "brief", label: "Generate Brief", icon: "sun.horizon", onPress: handleGenerateBrief, loading: isGeneratingBrief },
    { id: "assistant", label: "Open Assistant", icon: "sparkles", onPress: () => navigate(routeFor("/(tabs)/assistant")) },
  ];

  const sections: CommandSection[] = [
    {
      id: "account",
      title: "Account",
      description: "Identity, membership, and secure account changes.",
      rows: [
        { id: "edit-profile", title: "Edit Profile", subtitle: "Photo, profile details, location, and account handle.", icon: "person.crop.circle", route: routeFor("/(tabs)/profile"), meta: "Profile" },
        { id: "display-name", title: "Change Display Name", subtitle: `${profile.display_name_changes_remaining} display-name changes remaining.`, icon: "person.text.rectangle", route: routeFor("/(tabs)/profile"), meta: profile.can_change_display_name ? "Available" : "Locked", tone: profile.can_change_display_name ? "success" : "muted" },
        { id: "change-email", title: "Change Email", subtitle: "Update the email address used for sign-in and account recovery.", icon: "envelope", route: routeFor("/(tabs)/change-email"), meta: "Protected" },
        { id: "change-password", title: "Change Password", subtitle: "Rotate your HELIOS password.", icon: "key", route: routeFor("/(tabs)/change-password"), meta: "Protected" },
      ],
    },
    {
      id: "intelligence",
      title: "HELIOS Intelligence",
      description: "AI, memory, daily planning, and operational recommendations.",
      rows: [
        { id: "memory", title: "View Memory", subtitle: memories.length > 0 ? `${memories.length} memory records are available.` : "Start teaching HELIOS about yourself.", icon: "brain.head.profile", route: routeFor("/(tabs)/memory"), meta: memoryStatus, tone: memories.length > 0 ? "success" : "warning" },
        { id: "connected-knowledge", title: "Connected Knowledge", subtitle: "Approved services HELIOS can use for context, planning, and recommendations.", icon: "link", route: routeFor("/(tabs)/integrations"), meta: `${connectedCount} source${connectedCount === 1 ? "" : "s"}`, tone: connectedCount > 0 ? "success" : "muted" },
        { id: "ai-settings", title: "AI Settings", subtitle: "Assistant tone, identity, permissions, and intelligence preferences.", icon: "slider.horizontal.3", route: routeFor("/(tabs)/assistant-settings"), meta: "Online", tone: "success" },
        { id: "build-my-day", title: "Build My Day", subtitle: "Create an optimized schedule from calendar, goals, tasks, memory, and priorities.", icon: "calendar.badge.clock", route: routeFor("/(tabs)/calendar"), meta: "Automatic" },
        { id: "daily-brief-history", title: "Daily Brief History", subtitle: "Review generated briefs and daily context from your timeline.", icon: "doc.text.magnifyingglass", route: routeFor("/(tabs)/calendar"), meta: dailyBriefStatus },
        { id: "automations", title: "Smart Automations", subtitle: "Approvals, action queue, rules, and background recommendations.", icon: "sparkles", route: routeFor("/(tabs)/autonomy"), meta: "Active" },
      ],
    },
    {
      id: "personalization",
      title: "Personalization",
      description: "Appearance, assistant identity, notifications, language, units, and formats.",
      rows: [
        { id: "theme", title: "Theme and Appearance", subtitle: `Theme is set to ${settings.theme_preference}. Accent follows HELIOS system colors.`, icon: "paintbrush", route: routeFor("/(tabs)/profile"), meta: settings.theme_preference },
        { id: "assistant-name", title: "Assistant Name Preference", subtitle: `HELIOS addresses you using ${settings.assistant_name_preference.replace("_", " ")}.`, icon: "textformat", route: routeFor("/(tabs)/profile"), meta: settings.assistant_tone },
        { id: "notification-preferences", title: "Notification Preferences", subtitle: "Push, reminders, AI alerts, and quiet-hour planning.", icon: "bell.badge", route: routeFor("/(tabs)/notifications"), meta: settings.notifications_enabled ? "Enabled" : "Off", tone: settings.notifications_enabled ? "success" : "muted" },
        { id: "time-format", title: "Time, Date, Language, and Units", subtitle: `${settings.time_format.toUpperCase()} time format. Language and units use the device defaults in this build.`, icon: "clock", route: routeFor("/(tabs)/profile"), meta: settings.time_format },
        { id: "ai-personality", title: "Custom AI Personality", subtitle: "Personality tuning is planned for HELIOS V4.", icon: "theatermasks", onPress: () => handleComingInV4("Custom AI Personality"), meta: "Coming in V4", tone: "muted" },
      ],
    },
    {
      id: "notifications",
      title: "Notifications",
      description: "Permission, reminders, queue history, and focus boundaries.",
      rows: [
        { id: "permission", title: "Notification Permission", subtitle: `Device permission is ${permissionStatus}.`, icon: "bell.and.waves.left.and.right", route: routeFor("/(tabs)/notifications"), meta: permissionStatus, tone: permissionStatus === "granted" ? "success" : "warning" },
        { id: "push", title: "Push Notification Status", subtitle: settings.notifications_enabled ? "Push alerts are enabled in HELIOS preferences." : "Push alerts are disabled in HELIOS preferences.", icon: "iphone.radiowaves.left.and.right", route: routeFor("/(tabs)/notifications"), meta: settings.notifications_enabled ? "Enabled" : "Off", tone: settings.notifications_enabled ? "success" : "muted" },
        { id: "reminders", title: "Reminder Settings", subtitle: settings.reminder_notifications ? "Reminder notifications are active." : "Reminder notifications are disabled.", icon: "checklist", route: routeFor("/(tabs)/profile"), meta: settings.reminder_notifications ? "Active" : "Off" },
        { id: "quiet-hours", title: "Quiet Hours", subtitle: "Quiet-hour controls are planned for HELIOS V4.", icon: "moon", onPress: () => handleComingInV4("Quiet Hours"), meta: "Coming in V4", tone: "muted" },
        { id: "history", title: "Notification History", subtitle: `${unreadNotifications} unread notification${unreadNotifications === 1 ? "" : "s"} in the command queue.`, icon: "tray.full", route: routeFor("/(tabs)/notifications"), meta: `${unreadNotifications} unread` },
      ],
    },
    {
      id: "privacy",
      title: "Privacy & Security",
      description: "Account protection, connected devices, and destructive account actions.",
      rows: [
        { id: "privacy-security", title: "Privacy and Security", subtitle: "Review privacy controls, security posture, and protected actions.", icon: "lock.shield", route: routeFor("/(tabs)/privacy-security"), meta: "Protected", searchTerms: ["delete account", "danger zone", "account deletion"] },
        { id: "biometrics", title: "Biometrics", subtitle: "Face ID and biometric lock support is planned for HELIOS V4.", icon: "faceid", onPress: () => handleComingInV4("Biometrics"), meta: "Coming in V4", tone: "muted" },
        { id: "devices", title: "Connected Devices", subtitle: "Device session management is planned for HELIOS V4.", icon: "iphone", onPress: () => handleComingInV4("Connected Devices"), meta: "Coming in V4", tone: "muted" },
        { id: "sign-out", title: "Sign Out", subtitle: "End the current session on this device.", icon: "rectangle.portrait.and.arrow.right", onPress: confirmSignOut, meta: "Session", tone: "warning" },
      ],
    },
    {
      id: "about",
      title: "About HELIOS",
      description: "Version, release notes, legal, support, and diagnostics.",
      rows: [
        { id: "about-helios", title: "About HELIOS", subtitle: "Product details, release channel, support, legal links, and diagnostics.", icon: "info.circle", route: routeFor("/(tabs)/about-helios"), meta: "Product" },
        { id: "developer", title: "Developer Options", subtitle: __DEV__ ? "Diagnostics and development controls." : "Developer diagnostics are hidden outside debug builds.", icon: "hammer", route: __DEV__ ? routeFor("/(tabs)/developer-options") : undefined, onPress: __DEV__ ? undefined : () => Alert.alert("Diagnostics", "Diagnostics are available in debug builds."), meta: __DEV__ ? "Debug" : "Debug only" },
      ],
    },
  ];

  const q = normalize(query);
  const filteredSections = q
    ? sections
      .map((section) => ({
        ...section,
        rows: section.rows.filter((row) => {
          const haystack = [
            section.title,
            row.title,
            row.subtitle,
            row.meta,
            ...(row.searchTerms ?? []),
          ].join(" ").toLowerCase();
          return haystack.includes(q);
        }),
      }))
      .filter((section) => section.rows.length > 0)
    : sections;

  const futureServices = q
    ? FUTURE_SERVICES.filter((service) => service.title.toLowerCase().includes(q))
    : FUTURE_SERVICES;

  const showConnectedServices = !q
    || "connected services google calendar gmail integrations apps sync".includes(q)
    || ["google calendar", "gmail", "connected services"].some((term) => term.includes(q));

  const hasSearchResults = filteredSections.length > 0 || futureServices.length > 0 || showConnectedServices;

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={[styles.container, { paddingTop: insets.top + spacing.lg, paddingBottom: insets.bottom + 160 }]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <CommandHero
        colors={colors}
        connectedCount={connectedCount}
        dailyBriefStatus={dailyBriefStatus}
        dayPeriod={dayPeriod}
        memoryStatus={memoryStatus}
        quickActions={quickActions}
        styles={styles}
      />

      <View style={styles.searchWrap}>
        <SymbolView name="magnifyingglass" size={16} tintColor={colors.textMuted} resizeMode="scaleAspectFit" />
        <TextInput
          accessibilityLabel="Search command center"
          autoCapitalize="none"
          autoCorrect={false}
          clearButtonMode="while-editing"
          onChangeText={setQuery}
          placeholder="Search settings, services, memory, notifications"
          placeholderTextColor={colors.textMuted}
          returnKeyType="search"
          style={styles.searchInput}
          value={query}
        />
        {query ? (
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Clear search"
            hitSlop={10}
            onPress={() => setQuery("")}
          >
            <SymbolView name="xmark.circle.fill" size={16} tintColor={colors.textMuted} resizeMode="scaleAspectFit" />
          </TouchableOpacity>
        ) : null}
      </View>

      <AccountSummary
        colors={colors}
        displayName={displayName}
        email={email}
        initialsText={initials(displayName)}
        styles={styles}
        userId={userId}
      />

      {showConnectedServices ? (
        <ConnectedServicesSection
          colors={colors}
          gmail={gmail}
          googleCalendar={googleCalendar}
          integrationsLoading={integrationsLoading}
          onConnect={() => navigate(routeFor("/(tabs)/integrations"))}
          onServiceAction={(service, action) => {
            if (action === "sync" && accessToken && service.id) {
              triggerSync(accessToken, service.id).catch(() => {
                Alert.alert("Sync failed", "HELIOS could not sync this service right now.");
              });
              return;
            }
            navigate(routeFor("/(tabs)/integrations"));
          }}
          syncingId={syncingId}
          styles={styles}
        />
      ) : null}

      {filteredSections.map((section) => (
        <CommandSectionView
          key={section.id}
          colors={colors}
          section={section}
          styles={styles}
          onPressRow={(row) => {
            if (row.route) navigate(row.route);
            else row.onPress?.();
          }}
        />
      ))}

      {futureServices.length > 0 ? (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>V4 Service Slots</Text>
            <Text style={styles.sectionSubtitle}>Future integrations are visible here without implying they work today.</Text>
          </View>
          <View style={styles.futureGrid}>
            {futureServices.map((service) => (
              <TouchableOpacity
                key={service.title}
                accessibilityRole="button"
                accessibilityLabel={`${service.title}, coming in V4`}
                activeOpacity={0.78}
                onPress={() => handleComingInV4(service.title)}
                style={styles.futureTile}
              >
                <SymbolView name={service.icon} size={16} tintColor={colors.textMuted} resizeMode="scaleAspectFit" />
                <Text style={styles.futureTitle}>{service.title}</Text>
                <Text style={styles.futureMeta}>Coming in V4</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      ) : null}

      {!hasSearchResults ? (
        <View style={styles.emptyState}>
          <SymbolView name="magnifyingglass" size={22} tintColor={colors.accentCyan} resizeMode="scaleAspectFit" />
          <Text style={styles.emptyTitle}>No command found</Text>
          <Text style={styles.emptyText}>Try searching for profile, memory, notifications, services, privacy, or AI settings.</Text>
        </View>
      ) : null}
    </ScrollView>
  );
}

function CommandHero({
  colors,
  connectedCount,
  dailyBriefStatus,
  dayPeriod,
  memoryStatus,
  quickActions,
  styles,
}: {
  colors: ThemeColors;
  connectedCount: number;
  dailyBriefStatus: string;
  dayPeriod: string;
  memoryStatus: string;
  quickActions: QuickAction[];
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <View style={styles.heroCard}>
      <View style={styles.heroTop}>
        <View>
          <Text style={styles.heroLabel}>HELIOS CORE</Text>
          <Text style={styles.heroTitle}>Command Center</Text>
        </View>
        <View style={styles.liveBadge}>
          <View style={styles.liveDot} />
          <Text style={styles.liveText}>{dayPeriod}</Text>
        </View>
      </View>
      <Text style={styles.heroSubtitle}>
        Manage account identity, connected services, intelligence, privacy, notifications, and application operations.
      </Text>

      <View style={styles.heroStatusGrid}>
        <HeroStatusItem icon="checkmark.shield.fill" title="System Status" subtitle="Operational" color={colors.success} styles={styles} />
        <HeroStatusItem icon="link" title="Connected Services" subtitle={`${connectedCount} active`} color={connectedCount > 0 ? colors.accentCyan : colors.textMuted} styles={styles} />
        <HeroStatusItem icon="sparkles" title="AI Status" subtitle="Online" color={colors.accent} styles={styles} />
        <HeroStatusItem icon="brain.head.profile" title="Memory Status" subtitle={memoryStatus} color={colors.info} styles={styles} />
        <HeroStatusItem icon="sun.horizon" title="Daily Brief" subtitle={dailyBriefStatus} color={colors.warning} styles={styles} />
      </View>

      <View style={styles.quickActions}>
        {quickActions.map((action) => (
          <TouchableOpacity
            key={action.id}
            accessibilityRole="button"
            accessibilityLabel={action.label}
            activeOpacity={0.82}
            onPress={action.onPress}
            style={styles.quickAction}
            disabled={action.loading}
          >
            {action.loading ? (
              <ActivityIndicator size="small" color={colors.accentCyan} />
            ) : (
              <SymbolView name={action.icon} size={15} tintColor={colors.accentCyan} resizeMode="scaleAspectFit" />
            )}
            <Text style={styles.quickActionText}>{action.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

function HeroStatusItem({
  color,
  icon,
  styles,
  subtitle,
  title,
}: {
  color: string;
  icon: SFSymbol;
  styles: ReturnType<typeof createStyles>;
  subtitle: string;
  title: string;
}) {
  return (
    <View style={styles.statusItem}>
      <View style={[styles.statusIcon, { backgroundColor: `${color}18`, borderColor: `${color}30` }]}>
        <SymbolView name={icon} size={15} tintColor={color} resizeMode="scaleAspectFit" />
      </View>
      <View style={styles.statusCopy}>
        <Text style={styles.statusTitle}>{title}</Text>
        <Text style={[styles.statusSub, { color }]}>{subtitle}</Text>
      </View>
    </View>
  );
}

function AccountSummary({
  colors,
  displayName,
  email,
  initialsText,
  styles,
  userId,
}: {
  colors: ThemeColors;
  displayName: string;
  email: string;
  initialsText: string;
  styles: ReturnType<typeof createStyles>;
  userId: string;
}) {
  return (
    <View style={styles.accountCard}>
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{initialsText}</Text>
      </View>
      <View style={styles.accountBody}>
        <View style={styles.accountTitleRow}>
          <Text style={styles.accountName}>{displayName}</Text>
          <View style={styles.accountStatus}>
            <View style={[styles.smallDot, { backgroundColor: colors.success }]} />
            <Text style={styles.accountStatusText}>Active</Text>
          </View>
        </View>
        <Text style={styles.accountLine}>{email}</Text>
        <Text style={styles.accountLine}>User ID: {userId}</Text>
        <View style={styles.accountFacts}>
          <Text style={styles.accountFact}>Membership: HELIOS Core</Text>
          <Text style={styles.accountFact}>Status: Protected</Text>
        </View>
      </View>
    </View>
  );
}

function ConnectedServicesSection({
  colors,
  gmail,
  googleCalendar,
  integrationsLoading,
  onConnect,
  onServiceAction,
  syncingId,
  styles,
}: {
  colors: ThemeColors;
  gmail: Integration | undefined;
  googleCalendar: Integration | undefined;
  integrationsLoading: boolean;
  onConnect: () => void;
  onServiceAction: (service: Integration, action: "sync" | "details") => void;
  syncingId: string | null;
  styles: ReturnType<typeof createStyles>;
}) {
  const services = [
    { title: "Google Calendar", icon: "calendar" as SFSymbol, service: googleCalendar },
    { title: "Gmail", icon: "envelope" as SFSymbol, service: gmail },
  ];
  const hasConnected = services.some((item) => item.service?.status === "connected");

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Connected Services</Text>
        <Text style={styles.sectionSubtitle}>Google Calendar and Gmail power recommendations, briefings, scheduling, and assistant context.</Text>
      </View>
      <View style={styles.serviceStack}>
        {services.map(({ title, icon, service }) => {
          const tone = statusTone(service?.status);
          const color = toneColor(tone, colors);
          const syncing = Boolean(service?.id && syncingId === service.id);
          return (
            <View key={title} style={styles.serviceCard}>
              <View style={styles.serviceTop}>
                <View style={[styles.rowIcon, { borderColor: `${color}30`, backgroundColor: `${color}12` }]}>
                  <SymbolView name={icon} size={18} tintColor={color} resizeMode="scaleAspectFit" />
                </View>
                <View style={styles.serviceCopy}>
                  <Text style={styles.serviceTitle}>{title}</Text>
                  <Text style={styles.serviceMeta}>{formatLastSync(service?.last_sync_at)}</Text>
                </View>
                <Text style={[styles.serviceStatus, { color }]}>{statusLabel(service?.status)}</Text>
              </View>
              <View style={styles.serviceActions}>
                <ServiceButton
                  disabled={!service?.id || service.status !== "connected" || syncing}
                  label={syncing ? "Syncing" : "Sync Now"}
                  loading={syncing}
                  onPress={() => service && onServiceAction(service, "sync")}
                  styles={styles}
                  colors={colors}
                />
                <ServiceButton label={service?.status === "connected" ? "Disconnect" : "Reconnect"} onPress={onConnect} styles={styles} colors={colors} />
                <ServiceButton label="View Details" onPress={() => service ? onServiceAction(service, "details") : onConnect()} styles={styles} colors={colors} />
              </View>
            </View>
          );
        })}
      </View>
      {!hasConnected && !integrationsLoading ? (
        <View style={styles.serviceEmpty}>
          <Text style={styles.emptyTitle}>No connected services</Text>
          <Text style={styles.emptyText}>Connect Google Calendar and Gmail to unlock smarter recommendations.</Text>
          <TouchableOpacity accessibilityRole="button" activeOpacity={0.82} onPress={onConnect} style={styles.emptyButton}>
            <Text style={styles.emptyButtonText}>Open Connected Services</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );
}

function ServiceButton({
  colors,
  disabled,
  label,
  loading,
  onPress,
  styles,
}: {
  colors: ThemeColors;
  disabled?: boolean;
  label: string;
  loading?: boolean;
  onPress: () => void;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <TouchableOpacity
      accessibilityRole="button"
      activeOpacity={0.78}
      disabled={disabled}
      onPress={onPress}
      style={[styles.serviceButton, disabled && styles.disabled]}
    >
      {loading ? <ActivityIndicator size="small" color={colors.accentCyan} /> : null}
      <Text style={styles.serviceButtonText}>{label}</Text>
    </TouchableOpacity>
  );
}

function CommandSectionView({
  colors,
  onPressRow,
  section,
  styles,
}: {
  colors: ThemeColors;
  onPressRow: (row: CommandRow) => void;
  section: CommandSection;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{section.title}</Text>
        {section.description ? <Text style={styles.sectionSubtitle}>{section.description}</Text> : null}
      </View>
      <View style={styles.listCard}>
        {section.rows.map((row, index) => (
          <CommandRowView
            key={row.id}
            colors={colors}
            isLast={index === section.rows.length - 1}
            row={row}
            styles={styles}
            onPress={() => onPressRow(row)}
          />
        ))}
      </View>
    </View>
  );
}

function CommandRowView({
  colors,
  isLast,
  onPress,
  row,
  styles,
}: {
  colors: ThemeColors;
  isLast: boolean;
  onPress: () => void;
  row: CommandRow;
  styles: ReturnType<typeof createStyles>;
}) {
  const color = toneColor(row.tone, colors);
  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={`${row.title}. ${row.subtitle}`}
      activeOpacity={0.78}
      onPress={onPress}
      style={[styles.row, isLast && styles.rowLast]}
    >
      <View style={[styles.rowIcon, { borderColor: `${color}30`, backgroundColor: `${color}12` }]}>
        <SymbolView name={row.icon} size={18} tintColor={color} resizeMode="scaleAspectFit" />
      </View>
      <View style={styles.rowBody}>
        <View style={styles.rowTitleLine}>
          <Text style={[styles.rowTitle, row.tone === "danger" && { color }]}>{row.title}</Text>
          {row.meta ? <Text style={[styles.rowMeta, { color }]}>{row.meta}</Text> : null}
        </View>
        <Text style={styles.rowSubtitle}>{row.subtitle}</Text>
      </View>
      <SymbolView name="chevron.right" size={14} tintColor={colors.textMuted} resizeMode="scaleAspectFit" />
    </TouchableOpacity>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      paddingHorizontal: spacing.md,
      gap: spacing.lg,
    },
    heroCard: {
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      padding: spacing.lg,
      gap: spacing.md,
    },
    heroTop: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: spacing.md,
    },
    heroLabel: {
      ...typography.label,
      color: colors.accentCyan,
      letterSpacing: 0,
      marginBottom: spacing.xs,
    },
    heroTitle: {
      ...typography.displaySmall,
      color: colors.textPrimary,
      lineHeight: 32,
    },
    heroSubtitle: {
      ...typography.body,
      color: colors.textSecondary,
      lineHeight: 22,
    },
    liveBadge: {
      minHeight: 32,
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.xs,
      borderRadius: radius.sm,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceDark,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs,
      flexShrink: 0,
    },
    liveDot: {
      width: 7,
      height: 7,
      borderRadius: 4,
      backgroundColor: colors.success,
    },
    liveText: {
      ...typography.caption,
      color: colors.textSecondary,
      fontWeight: "700",
    },
    heroStatusGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: spacing.sm,
    },
    statusItem: {
      width: "48%",
      minHeight: 56,
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.borderDark,
      backgroundColor: colors.surfaceDark,
      padding: spacing.sm,
    },
    statusIcon: {
      width: 32,
      height: 32,
      borderRadius: 16,
      borderWidth: 1,
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
    },
    statusCopy: {
      flex: 1,
      minWidth: 0,
    },
    statusTitle: {
      ...typography.caption,
      color: colors.textPrimary,
      fontWeight: "800",
    },
    statusSub: {
      fontSize: 11,
      fontWeight: "700",
      marginTop: 2,
    },
    quickActions: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: spacing.sm,
    },
    quickAction: {
      minHeight: 38,
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.xs,
      borderRadius: radius.sm,
      borderWidth: 1,
      borderColor: "rgba(34,211,238,0.24)",
      backgroundColor: "rgba(34,211,238,0.08)",
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.sm,
    },
    quickActionText: {
      ...typography.label,
      color: colors.textPrimary,
      letterSpacing: 0,
    },
    searchWrap: {
      minHeight: 48,
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      paddingHorizontal: spacing.md,
    },
    searchInput: {
      flex: 1,
      minHeight: 46,
      color: colors.textPrimary,
      fontSize: 15,
      fontWeight: "600",
    },
    accountCard: {
      flexDirection: "row",
      gap: spacing.md,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      padding: spacing.lg,
    },
    avatar: {
      width: 58,
      height: 58,
      borderRadius: 29,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: `${colors.accent}22`,
      borderWidth: 1,
      borderColor: `${colors.accent}40`,
      flexShrink: 0,
    },
    avatarText: {
      color: colors.textPrimary,
      fontSize: 18,
      fontWeight: "900",
    },
    accountBody: {
      flex: 1,
      gap: 4,
      minWidth: 0,
    },
    accountTitleRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: spacing.sm,
    },
    accountName: {
      ...typography.title,
      color: colors.textPrimary,
      flex: 1,
      lineHeight: 24,
    },
    accountStatus: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      minHeight: 24,
      borderRadius: radius.sm,
      backgroundColor: "rgba(34,197,94,0.12)",
      paddingHorizontal: spacing.sm,
      flexShrink: 0,
    },
    smallDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
    },
    accountStatusText: {
      fontSize: 11,
      color: colors.success,
      fontWeight: "800",
    },
    accountLine: {
      ...typography.caption,
      color: colors.textMuted,
      lineHeight: 18,
    },
    accountFacts: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: spacing.sm,
      marginTop: spacing.xs,
    },
    accountFact: {
      ...typography.caption,
      color: colors.textSecondary,
      fontWeight: "700",
    },
    section: {
      gap: spacing.sm,
    },
    sectionHeader: {
      gap: 3,
    },
    sectionTitle: {
      ...typography.label,
      color: colors.textPrimary,
      letterSpacing: 0,
      fontSize: 12,
    },
    sectionSubtitle: {
      ...typography.caption,
      color: colors.textMuted,
      lineHeight: 18,
    },
    listCard: {
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
    rowIcon: {
      width: 38,
      height: 38,
      borderRadius: 19,
      borderWidth: 1,
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
    },
    rowBody: {
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
    serviceStack: {
      gap: spacing.sm,
    },
    serviceCard: {
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      padding: spacing.md,
      gap: spacing.md,
    },
    serviceTop: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
    },
    serviceCopy: {
      flex: 1,
      minWidth: 0,
      gap: 2,
    },
    serviceTitle: {
      ...typography.body,
      color: colors.textPrimary,
      fontWeight: "800",
    },
    serviceMeta: {
      ...typography.caption,
      color: colors.textMuted,
      lineHeight: 18,
    },
    serviceStatus: {
      fontSize: 11,
      fontWeight: "900",
      flexShrink: 0,
    },
    serviceActions: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: spacing.sm,
    },
    serviceButton: {
      minHeight: 36,
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.xs,
      borderRadius: radius.sm,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceDark,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs,
    },
    serviceButtonText: {
      ...typography.caption,
      color: colors.textSecondary,
      fontWeight: "800",
    },
    disabled: {
      opacity: 0.45,
    },
    serviceEmpty: {
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: "rgba(34,211,238,0.22)",
      backgroundColor: "rgba(34,211,238,0.07)",
      padding: spacing.lg,
      gap: spacing.sm,
    },
    emptyState: {
      alignItems: "flex-start",
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      padding: spacing.lg,
      gap: spacing.sm,
    },
    emptyTitle: {
      ...typography.title,
      color: colors.textPrimary,
      fontSize: 17,
    },
    emptyText: {
      ...typography.body,
      color: colors.textSecondary,
      lineHeight: 21,
    },
    emptyButton: {
      minHeight: 38,
      alignSelf: "flex-start",
      justifyContent: "center",
      borderRadius: radius.sm,
      backgroundColor: colors.accent,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      marginTop: spacing.xs,
    },
    emptyButtonText: {
      ...typography.label,
      color: colors.background,
      letterSpacing: 0,
    },
    futureGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: spacing.sm,
    },
    futureTile: {
      width: "48%",
      minHeight: 86,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      padding: spacing.md,
      gap: spacing.xs,
    },
    futureTitle: {
      ...typography.caption,
      color: colors.textPrimary,
      fontWeight: "800",
      lineHeight: 18,
    },
    futureMeta: {
      fontSize: 10,
      color: colors.textMuted,
      fontWeight: "800",
    },
  });
}
