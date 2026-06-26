import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Alert,
  RefreshControl,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SymbolView } from "expo-symbols";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import type { SFSymbol } from "sf-symbols-typescript";

import { useAuthStore, useIntegrationStore } from "../../store";
import { spacing, radius, typography, type ThemeColors } from "../../theme/theme";
import { useTheme } from "../../theme/ThemeContext";
import { ApiError, SessionExpiredError } from "../../services/apiClient";
import { integrationService, providerToServiceType } from "../../services/integrationService";
import type {
  Integration,
  IntegrationProvider,
  SyncJobOut,
} from "../../services/integrationService";

WebBrowser.maybeCompleteAuthSession();

// ── Provider metadata ─────────────────────────────────────────────────────────

const GOOGLE_OAUTH_RETURN_URL = "helios://oauth/google";

type ProviderMeta = {
  displayName: string;
  subtitle: string;
  icon: SFSymbol;
  accent: string;
  usedFor: string[];
  connectLabel: string;
  comingSoon?: boolean;
};

const PROVIDER_META: Record<IntegrationProvider, ProviderMeta> = {
  google_calendar: {
    displayName: "Google Calendar",
    subtitle: "Sync events and scheduled commitments",
    icon: "calendar.circle",
    accent: "#4285f4",
    usedFor: ["Daily Brief", "Today's Flow", "Scheduling", "Assistant"],
    connectLabel: "Connect Google",
  },
  gmail: {
    displayName: "Gmail",
    subtitle: "Surface important emails in your briefings",
    icon: "envelope.circle",
    accent: "#ea4335",
    usedFor: ["Daily Brief", "Assistant", "Priority Alerts"],
    connectLabel: "Connect Google",
  },
  outlook_calendar: {
    displayName: "Outlook Calendar",
    subtitle: "Sync Microsoft calendar events",
    icon: "calendar.badge.clock",
    accent: "#0078d4",
    usedFor: ["Daily Brief", "Today's Flow", "Scheduling", "Assistant"],
    connectLabel: "Connect Microsoft",
    comingSoon: true,
  },
  outlook_mail: {
    displayName: "Outlook Mail",
    subtitle: "Surface Outlook emails in your briefings",
    icon: "envelope.badge",
    accent: "#0078d4",
    usedFor: ["Daily Brief", "Assistant", "Priority Alerts"],
    connectLabel: "Connect Microsoft",
    comingSoon: true,
  },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatRelativeTime(iso: string | null): string {
  if (!iso) return "Never";
  const d = new Date(iso);
  const diffMin = Math.floor((Date.now() - d.getTime()) / 60000);
  if (diffMin < 1)  return "Just now";
  if (diffMin < 60) return `${diffMin} minute${diffMin === 1 ? "" : "s"} ago`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24)  return `${diffH} hour${diffH === 1 ? "" : "s"} ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// Maps raw backend status to what the UI badge should show
function resolveStatusDisplay(
  integration: Integration,
  isSyncingNow: boolean,
  colors: ThemeColors,
  styles: ReturnType<typeof createStyles>,
): { label: string; badgeStyle: object; dotColor: string; textColor: string } {
  const meta = PROVIDER_META[integration.provider as IntegrationProvider];
  if (meta?.comingSoon) {
    return {
      label: "Coming Soon",
      badgeStyle: styles.statusComingSoon,
      dotColor: colors.accentCyan,
      textColor: colors.accentCyan,
    };
  }
  if (isSyncingNow || integration.status === "syncing") {
    return {
      label: "Syncing",
      badgeStyle: styles.statusSyncing,
      dotColor: colors.accentCyan,
      textColor: colors.accentCyan,
    };
  }
  if (integration.status === "connected") {
    return {
      label: "Connected",
      badgeStyle: styles.statusConnected,
      dotColor: colors.success,
      textColor: colors.success,
    };
  }
  if (integration.status === "needs_attention" || integration.requires_reconnect) {
    return {
      label: "Needs Attention",
      badgeStyle: styles.statusNeedsAttention,
      dotColor: colors.warning,
      textColor: colors.warning,
    };
  }
  return {
    label: "Not Connected",
    badgeStyle: styles.statusDisconnected,
    dotColor: colors.textMuted,
    textColor: colors.textMuted,
  };
}

// ── Integration card ──────────────────────────────────────────────────────────

type CardProps = {
  integration: Integration;
  isMutating: boolean;
  isSyncing: boolean;
  isConnecting: boolean;
  syncResult: SyncJobOut | null;
  onDisconnect: (id: string, displayName: string) => void;
  onSync: (id: string) => void;
  onGoogleConnect: (provider: IntegrationProvider) => void;
  onGoogleReconnect: (provider: IntegrationProvider) => void;
};

function IntegrationCard({
  integration,
  isMutating,
  isSyncing,
  isConnecting,
  syncResult,
  onDisconnect,
  onSync,
  onGoogleConnect,
  onGoogleReconnect,
}: CardProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const meta = PROVIDER_META[integration.provider as IntegrationProvider];
  if (!meta) return null;

  const isComingSoon = !!meta.comingSoon;
  const effectiveIsSyncing = !isComingSoon && isSyncing;
  const effectiveSyncResult = isComingSoon ? null : syncResult;
  const isConnected = !isComingSoon && integration.status === "connected";
  const needsReconnect = !isComingSoon && (integration.requires_reconnect || integration.status === "needs_attention");
  const { accent } = meta;
  const syncFailed  = effectiveSyncResult?.status === "failed";

  const { label: statusLabel, badgeStyle: statusStyle, dotColor: statusDotColor, textColor: statusTextColor } =
    resolveStatusDisplay(integration, effectiveIsSyncing, colors, styles);

  return (
    <View style={[styles.card, isConnected && { borderColor: `${accent}40` }]}>
      {isConnected && <View style={[styles.cardAccentBar, { backgroundColor: accent }]} />}

      <View style={styles.cardBody}>

        {/* ── Header ── */}
        <View style={styles.cardHeader}>
          <View style={[styles.iconWrap, { backgroundColor: `${accent}18`, borderColor: `${accent}35` }]}>
            <SymbolView name={meta.icon} size={22} tintColor={accent} resizeMode="scaleAspectFit" />
          </View>
          <View style={styles.cardInfo}>
            <View style={styles.providerTopRow}>
              <Text style={styles.providerName}>{meta.displayName}</Text>
              <View style={[styles.statusBadge, statusStyle]}>
                <View style={[styles.statusDot, { backgroundColor: statusDotColor }]} />
                <Text style={[styles.statusText, { color: statusTextColor }]}>{statusLabel}</Text>
              </View>
            </View>
            <Text
              style={[
                styles.providerSubtitle,
                integration.email && styles.providerEmail,
              ]}
              numberOfLines={integration.email ? 1 : 2}
              adjustsFontSizeToFit={!!integration.email}
              minimumFontScale={0.82}
            >
              {integration.email ? integration.email : meta.subtitle}
            </Text>
          </View>
        </View>

        {/* ── Sync info (connected state only) ── */}
        {isConnected && (
          <>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>CONNECTED SINCE</Text>
              <Text style={styles.metaValue}>{formatDate(integration.connected_at)}</Text>
            </View>

            <View style={styles.syncInfoGrid}>
              <View style={styles.syncInfoCell}>
                <Text style={styles.metaLabel}>LAST SYNC</Text>
                <Text style={styles.metaValue}>{formatRelativeTime(integration.last_sync_at)}</Text>
              </View>
              <View style={styles.syncInfoDivider} />
              <View style={styles.syncInfoCell}>
                <Text style={styles.metaLabel}>AUTO SYNC</Text>
                <Text style={[styles.metaValue, { color: colors.success }]}>Enabled</Text>
              </View>
            </View>
          </>
        )}

        {/* ── Sync result breakdown ── */}
        {effectiveSyncResult?.status === "completed" && (
          <View style={styles.syncStats}>
            <View style={styles.syncStat}>
              <Text style={styles.syncStatNum}>{effectiveSyncResult.records_created}</Text>
              <Text style={styles.syncStatLabel}>ADDED</Text>
            </View>
            <View style={styles.syncStatDivider} />
            <View style={styles.syncStat}>
              <Text style={styles.syncStatNum}>{effectiveSyncResult.records_updated}</Text>
              <Text style={styles.syncStatLabel}>UPDATED</Text>
            </View>
            <View style={styles.syncStatDivider} />
            <View style={styles.syncStat}>
              <Text style={styles.syncStatNum}>{effectiveSyncResult.records_processed}</Text>
              <Text style={styles.syncStatLabel}>TOTAL</Text>
            </View>
          </View>
        )}

        {/* ── Sync error ── */}
        {syncFailed && (effectiveSyncResult?.errors.length ?? 0) > 0 && (
          <View style={styles.syncErrorRow}>
            <SymbolView name="exclamationmark.circle" size={11} tintColor={colors.danger} resizeMode="scaleAspectFit" />
            <Text style={styles.syncErrorText} numberOfLines={2}>
              Sync encountered an issue. Try syncing again or reconnect.
            </Text>
          </View>
        )}

        {/* ── Needs attention notice ── */}
        {needsReconnect && !isConnected && (
          <View style={styles.syncErrorRow}>
            <SymbolView name="exclamationmark.triangle" size={11} tintColor={colors.warning} resizeMode="scaleAspectFit" />
            <Text style={[styles.syncErrorText, { color: colors.warning }]} numberOfLines={2}>
              Your Google connection needs to be refreshed. Tap Reconnect to restore access.
            </Text>
          </View>
        )}

        {/* ── Used For ── */}
        <View style={styles.usedForSection}>
          <Text style={styles.metaLabel}>USED FOR</Text>
          <View style={styles.usedForList}>
            {meta.usedFor.map((item) => (
              <View key={item} style={styles.usedForItem}>
                <View style={[styles.usedForDot, { backgroundColor: accent }]} />
                <Text style={styles.usedForText}>{item}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* ── Actions ── */}
        {isConnected ? (
          <View style={styles.actionRow}>
            <TouchableOpacity
              style={[
                styles.actionButton,
                styles.syncButton,
                { borderColor: `${accent}60`, backgroundColor: `${accent}15` },
                effectiveIsSyncing && styles.actionButtonDisabled,
              ]}
              onPress={() => integration.id && onSync(integration.id)}
              disabled={effectiveIsSyncing || isMutating}
              activeOpacity={0.8}
            >
              {effectiveIsSyncing ? (
                <ActivityIndicator size="small" color={accent} />
              ) : (
                <>
                  <SymbolView name="arrow.clockwise" size={11} tintColor={accent} resizeMode="scaleAspectFit" />
                  <Text style={[styles.actionButtonText, { color: accent }]}>Sync Now</Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionButton, styles.disconnectButton, isMutating && styles.actionButtonDisabled]}
              onPress={() => integration.id && onDisconnect(integration.id, meta.displayName)}
              disabled={isMutating || effectiveIsSyncing}
              activeOpacity={0.8}
            >
              {isMutating ? (
                <ActivityIndicator size="small" color={colors.textMuted} />
              ) : (
                <Text style={[styles.actionButtonText, styles.disconnectButtonText]}>Disconnect</Text>
              )}
            </TouchableOpacity>
          </View>
        ) : meta.comingSoon ? (
          <View style={[styles.actionButton, styles.comingSoonButton]}>
            <SymbolView name="clock" size={11} tintColor={colors.textMuted} resizeMode="scaleAspectFit" />
            <Text style={[styles.actionButtonText, { color: colors.textMuted }]}>Coming Soon</Text>
          </View>
        ) : needsReconnect ? (
          // Needs Attention — show Reconnect button
          <TouchableOpacity
            style={[
              styles.actionButton,
              styles.connectButton,
              { backgroundColor: colors.warning },
              (isConnecting || isMutating) && styles.actionButtonDisabled,
            ]}
            onPress={() => onGoogleReconnect(integration.provider as IntegrationProvider)}
            disabled={isConnecting || isMutating}
            activeOpacity={0.8}
          >
            {isConnecting ? (
              <ActivityIndicator size="small" color={colors.background} />
            ) : (
              <>
                <SymbolView name="arrow.triangle.2.circlepath" size={11} tintColor={colors.background} resizeMode="scaleAspectFit" />
                <Text style={styles.actionButtonText}>Reconnect Google</Text>
              </>
            )}
          </TouchableOpacity>
        ) : (
          // Not connected — show Connect button
          <TouchableOpacity
            style={[
              styles.actionButton,
              styles.connectButton,
              { backgroundColor: accent },
              (isConnecting || isMutating) && styles.actionButtonDisabled,
            ]}
            onPress={() => onGoogleConnect(integration.provider as IntegrationProvider)}
            disabled={isConnecting || isMutating}
            activeOpacity={0.8}
          >
            {isConnecting ? (
              <ActivityIndicator size="small" color={colors.background} />
            ) : (
              <>
                <SymbolView name="lock.shield" size={11} tintColor={colors.background} resizeMode="scaleAspectFit" />
                <Text style={styles.actionButtonText}>{meta.connectLabel}</Text>
              </>
            )}
          </TouchableOpacity>
        )}

      </View>
    </View>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function IntegrationsScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const accessToken = useAuthStore((s) => s.accessToken);
  const handledOAuthUrlsRef = useRef<Set<string>>(new Set());

  const {
    integrations,
    isLoading,
    isMutating,
    error,
    syncResults,
    syncingId,
    syncError,
    backendUnavailable,
    fetchIntegrations,
    fetchSyncStatus,
    disconnect,
    googleDisconnect,
    triggerSync,
  } = useIntegrationStore();

  const load = useCallback(() => {
    if (accessToken) {
      fetchIntegrations(accessToken);
      fetchSyncStatus(accessToken);
    }
  }, [accessToken, fetchIntegrations, fetchSyncStatus]);

  useEffect(() => { load(); }, [load]);

  const handleGoogleOAuthReturn = useCallback(async (
    url: string,
    expectedProvider?: IntegrationProvider,
    explicitToken?: string,
  ) => {
    if (!isGoogleOAuthReturnUrl(url)) return false;
    if (handledOAuthUrlsRef.current.has(url)) return true;
    handledOAuthUrlsRef.current.add(url);

    const authState = useAuthStore.getState();
    const token = explicitToken ?? authState.accessToken;
    const params = getOAuthReturnParams(url);
    const success = params.success === "true";
    const serviceType = params.service_type;
    const services = params.services || serviceType || "Google";
    const message = params.message;
    const code = params.code;

    console.log("[integrations] google_oauth.return", {
      success,
      serviceType: serviceType ?? null,
      services,
      code: code ?? null,
      hasAccessToken: !!token,
      clientTime: new Date().toISOString(),
    });

    if (token) {
      await fetchIntegrations(token);
      await fetchSyncStatus(token);
    }

    if (success) {
      const providerLabel = expectedProvider
        ? PROVIDER_META[expectedProvider].displayName
        : "Google";
      Alert.alert(
        "Connected",
        message || `${providerLabel} is now connected. HELIOS has started syncing your information.`,
        [{ text: "Done" }],
      );
      return true;
    }

    Alert.alert(
      "Connection Failed",
      friendlyOAuthError(message || code || "Google authorization did not complete."),
      [{ text: "OK" }],
    );
    return true;
  }, [fetchIntegrations, fetchSyncStatus]);

  useEffect(() => {
    const subscription = Linking.addEventListener("url", ({ url }) => {
      void handleGoogleOAuthReturn(url);
    });
    return () => subscription.remove();
  }, [handleGoogleOAuthReturn]);

  function handleDisconnect(id: string, displayName: string) {
    Alert.alert(
      `Disconnect ${displayName}`,
      `Remove the ${displayName} integration? You can reconnect at any time.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Disconnect",
          style: "destructive",
          onPress: () => {
            if (!accessToken) return;
            // Find the integration to get its provider for the Google endpoint
            const integration = integrations.find((i) => i.id === id);
            const isGoogle =
              integration?.provider === "google_calendar" ||
              integration?.provider === "gmail";
            if (isGoogle && integration) {
              googleDisconnect(accessToken, providerToServiceType(integration.provider));
            } else {
              disconnect(accessToken, id);
            }
          },
        },
      ],
    );
  }

  function handleSync(id: string) {
    if (accessToken) triggerSync(accessToken, id);
  }

  const [connectingProvider, setConnectingProvider] = useState<IntegrationProvider | null>(null);

  // Opens the Google OAuth URL in an in-app browser, then refreshes status.
  async function openGoogleOAuth(provider: IntegrationProvider, isReconnect = false) {
    const authState = useAuthStore.getState();
    const token = authState.accessToken;
    const user = authState.user;
    const serviceType = providerToServiceType(provider);
    const endpoint = isReconnect
      ? `/api/v1/integrations/google/reconnect-url?service_type=${serviceType}`
      : `/api/v1/integrations/google/auth-url?service_type=${serviceType}`;

    console.log("[integrations] google_oauth.start", {
      provider,
      serviceType,
      isReconnect,
      isLoggedIn: !!user,
      userId: user?.id ?? null,
      hasAccessToken: !!token,
      tokenLength: token?.length ?? 0,
      authorizationHeader: token ? "Bearer <redacted>" : null,
      endpoint,
      clientTime: new Date().toISOString(),
    });

    if (!user || !token) {
      Alert.alert(
        "Please sign in again",
        "Your HELIOS session is not active. Sign in before connecting Google.",
        [{ text: "OK" }],
      );
      return;
    }

    setConnectingProvider(provider);
    try {
      const data = isReconnect
        ? await integrationService.getReconnectUrl(token, serviceType)
        : await integrationService.getAuthUrl(token, serviceType);

      console.log("[integrations] google_oauth.response", {
        endpoint,
        status: 200,
        configured: data.configured,
        hasUrl: !!data.url,
        urlHost: getUrlHost(data.url),
        serviceType: data.service_type,
        scopeCount: data.scopes?.length ?? 0,
        note: data.note,
        clientTime: new Date().toISOString(),
      });

      if (!data.configured) {
        Alert.alert(
          "OAuth Not Configured",
          "Google sign-in isn't available in this build yet. Ask your admin to set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and TOKEN_ENCRYPTION_KEY on the backend.",
          [{ text: "OK" }],
        );
        return;
      }

      if (!data.url) {
        Alert.alert(
          "Connection Failed",
          "Google did not return an authorization URL. Please try again.",
          [{ text: "OK" }],
        );
        return;
      }

      // The backend callback stores tokens server-side, performs the first sync,
      // then redirects to helios://oauth/google so the auth session closes.
      const result = await WebBrowser.openAuthSessionAsync(data.url, GOOGLE_OAUTH_RETURN_URL, {
        presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET,
      });

      if (result.type === "success" && result.url) {
        await handleGoogleOAuthReturn(result.url, provider, token);
        return;
      }

      if (result.type === "cancel" || result.type === "dismiss") {
        console.log("[integrations] google_oauth.dismissed", {
          endpoint,
          resultType: result.type,
          clientTime: new Date().toISOString(),
        });
      }

      // Refresh status after the user returns from the browser session, even if
      // the platform only reports a dismiss event.
      await fetchIntegrations(token);
      await fetchSyncStatus(token);

      // Check whether the connection succeeded by looking at the refreshed state
      const updated = useIntegrationStore.getState().integrations.find(
        (i) => i.provider === provider,
      );
      if (updated?.status === "connected") {
        Alert.alert(
          "Connected",
          `Your Google account is now linked to ${PROVIDER_META[provider].displayName}. HELIOS will begin syncing shortly.`,
          [{ text: "Done" }],
        );
      }
      // If still not connected, no alert — the updated badge state makes it clear.
    } catch (err) {
      const status = err instanceof ApiError ? err.status : undefined;
      const message = err instanceof Error ? err.message : "Something went wrong.";
      console.log("[integrations] google_oauth.error", {
        endpoint,
        status: status ?? null,
        errorName: err instanceof Error ? err.name : "UnknownError",
        message,
        clientTime: new Date().toISOString(),
      });

      if (err instanceof SessionExpiredError || status === 401) {
        Alert.alert(
          "Please sign in again",
          "Your HELIOS session expired. Sign in again before connecting Google.",
          [{ text: "OK" }],
        );
        return;
      }

      Alert.alert(
        "Connection Failed",
        friendlyOAuthError(message),
        [{ text: "OK" }],
      );
    } finally {
      setConnectingProvider(null);
    }
  }

  function handleGoogleConnect(provider: IntegrationProvider) {
    openGoogleOAuth(provider, false);
  }

  function handleGoogleReconnect(provider: IntegrationProvider) {
    openGoogleOAuth(provider, true);
  }

  const connectedCount = integrations.filter((i) => i.status === "connected").length;

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={[
        styles.container,
        { paddingTop: insets.top + spacing.md, paddingBottom: insets.bottom + 106 },
      ]}
      refreshControl={
        <RefreshControl refreshing={isLoading} onRefresh={load} tintColor={colors.accentCyan} />
      }
    >
      {/* ── Hero ── */}
      <View style={styles.heroCard}>
        <Text style={styles.heroLabel}>CONNECTED SERVICES</Text>
        <Text style={styles.heroTitle}>Connect Your World</Text>
        <Text style={styles.heroSubtitle}>
          HELIOS works best when it understands your day. Connect the apps you already use so your schedule, email, goals, and reminders stay in sync automatically.
        </Text>
        {connectedCount > 0 && (
          <View style={styles.heroStatRow}>
            <View style={[styles.heroStatDot, { backgroundColor: colors.success }]} />
            <Text style={styles.heroStatText}>
              {connectedCount} of {integrations.length} services connected
            </Text>
          </View>
        )}
      </View>

      {/* ── Section header ── */}
      <View style={styles.sectionHeaderRow}>
        <Text style={styles.sectionLabel}>CONNECTED SERVICES</Text>
        {isLoading ? <ActivityIndicator size="small" color={colors.accentCyan} /> : null}
      </View>

      {/* ── Backend unavailable banner ── */}
      {backendUnavailable && (
        <View style={styles.unavailableBanner}>
          <View style={styles.unavailableCopy}>
            <SymbolView name="wifi.slash" size={13} tintColor={colors.textMuted} resizeMode="scaleAspectFit" />
            <Text style={styles.unavailableText}>
              Connected Services are temporarily unavailable.
            </Text>
          </View>
          <TouchableOpacity
            style={styles.unavailableRetry}
            onPress={load}
            disabled={isLoading}
            activeOpacity={0.78}
          >
            {isLoading ? (
              <ActivityIndicator size="small" color={colors.accentCyan} />
            ) : (
              <Text style={styles.unavailableRetryText}>Retry</Text>
            )}
          </TouchableOpacity>
        </View>
      )}

      {error && !backendUnavailable ? <Text style={styles.errorText}>{friendlyOAuthError(error)}</Text> : null}
      {syncError ? <Text style={styles.errorText}>{friendlyOAuthError(syncError)}</Text> : null}

      {integrations.map((integration) => (
        <IntegrationCard
          key={integration.provider}
          integration={integration}
          isMutating={isMutating}
          isSyncing={syncingId === integration.id}
          isConnecting={connectingProvider === integration.provider}
          syncResult={integration.id ? (syncResults[integration.id] ?? null) : null}
          onDisconnect={handleDisconnect}
          onSync={handleSync}
          onGoogleConnect={handleGoogleConnect}
          onGoogleReconnect={handleGoogleReconnect}
        />
      ))}

      {/* ── Footer ── */}
      <View style={styles.footer}>
        <SymbolView name="lock.shield" size={12} tintColor={colors.textMuted} resizeMode="scaleAspectFit" />
        <Text style={styles.footerText}>
          Your credentials are never stored by HELIOS. All connections use secure OAuth authorization.
        </Text>
      </View>
    </ScrollView>
  );
}

// ── Error helpers ─────────────────────────────────────────────────────────────

function friendlyOAuthError(rawMessage: string): string {
  const lower = rawMessage.toLowerCase();
  if (lower.includes("network") || lower.includes("timed out") || lower.includes("unavailable")) {
    return "Check your internet connection and try again.";
  }
  if (lower.includes("not configured") || lower.includes("client_id")) {
    return "Google sign-in is not set up on this server yet.";
  }
  if (lower.includes("rate limit") || lower.includes("too many")) {
    return "Too many requests. Please wait a moment and try again.";
  }
  if (lower.includes("denied") || lower.includes("cancelled") || lower.includes("canceled")) {
    return "Authorization was cancelled. You can try again any time.";
  }
  if (lower.includes("expired") || lower.includes("reconnect")) {
    return "Your session expired. Please try connecting again.";
  }
  return "We couldn't complete the connection. Please try again.";
}

function getUrlHost(url: string): string | null {
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

function isGoogleOAuthReturnUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "helios:" && parsed.hostname === "oauth" && parsed.pathname === "/google";
  } catch {
    return false;
  }
}

function getOAuthReturnParams(url: string): Record<string, string> {
  try {
    const parsed = new URL(url);
    return Object.fromEntries(parsed.searchParams.entries());
  } catch {
    return {};
  }
}

// ── Styles ────────────────────────────────────────────────────────────────────

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({

    container: {
      paddingHorizontal: spacing.lg,
    },

    // ── Hero ──────────────────────────────────────────────────────────────────

    heroCard: {
      backgroundColor: colors.surface,
      borderRadius: radius.xl,
      padding: spacing.xl,
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom: spacing.lg,
      gap: spacing.xs,
    },

    heroLabel: {
      ...typography.label,
      color: colors.accentCyan,
      marginBottom: spacing.xs,
    },

    heroTitle: {
      ...typography.displaySmall,
      color: colors.textPrimary,
    },

    heroSubtitle: {
      ...typography.body,
      color: colors.textMuted,
      lineHeight: 22,
    },

    heroStatRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      marginTop: spacing.xs,
    },

    heroStatDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
    },

    heroStatText: {
      ...typography.caption,
      color: colors.textSecondary,
      fontWeight: "600" as const,
    },

    // ── Section header ────────────────────────────────────────────────────────

    sectionHeaderRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: spacing.sm,
    },

    sectionLabel: {
      ...typography.label,
      color: colors.textMuted,
    },

    errorText: {
      ...typography.caption,
      color: colors.danger,
      marginBottom: spacing.sm,
    },

    // ── Unavailable banner ────────────────────────────────────────────────────

    unavailableBanner: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: spacing.sm,
      backgroundColor: colors.surfaceDark,
      borderRadius: radius.sm,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      marginBottom: spacing.md,
    },

    unavailableCopy: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
    },

    unavailableText: {
      ...typography.caption,
      color: colors.textMuted,
      flex: 1,
    },

    unavailableRetry: {
      minWidth: 52,
      minHeight: 28,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: radius.sm,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: spacing.sm,
    },

    unavailableRetryText: {
      ...typography.caption,
      color: colors.accentCyan,
      fontWeight: "700" as const,
    },

    // ── Integration card ──────────────────────────────────────────────────────

    card: {
      flexDirection: "row",
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom: spacing.md,
      overflow: "hidden",
    },

    cardAccentBar: {
      width: 3,
      flexShrink: 0,
    },

    cardBody: {
      flex: 1,
      padding: spacing.lg,
      gap: spacing.md,
    },

    cardHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
    },

    iconWrap: {
      width: 44,
      height: 44,
      borderRadius: radius.sm,
      borderWidth: 1,
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
    },

    cardInfo: {
      flex: 1,
      minWidth: 0,
      gap: 5,
    },

    providerTopRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: spacing.sm,
    },

    providerName: {
      fontSize: 15,
      fontWeight: "700" as const,
      color: colors.textPrimary,
      flex: 1,
      minWidth: 0,
    },

    providerSubtitle: {
      ...typography.caption,
      color: colors.textMuted,
      lineHeight: 17,
    },

    providerEmail: {
      alignSelf: "stretch",
      flexShrink: 1,
    },

    // ── Status badge ──────────────────────────────────────────────────────────

    statusBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      borderRadius: 6,
      paddingHorizontal: 7,
      paddingVertical: 4,
      flexShrink: 0,
    },

    statusConnected: {
      backgroundColor: `${colors.success}26`,
      borderWidth: 1,
      borderColor: `${colors.success}4d`,
    },

    statusDisconnected: {
      backgroundColor: colors.surfaceDark,
      borderWidth: 1,
      borderColor: colors.border,
    },

    statusComingSoon: {
      backgroundColor: `${colors.accentCyan}15`,
      borderWidth: 1,
      borderColor: `${colors.accentCyan}35`,
    },

    statusSyncing: {
      backgroundColor: `${colors.accentCyan}20`,
      borderWidth: 1,
      borderColor: `${colors.accentCyan}50`,
    },

    statusNeedsAttention: {
      backgroundColor: `${colors.warning}20`,
      borderWidth: 1,
      borderColor: `${colors.warning}50`,
    },

    statusDot: {
      width: 5,
      height: 5,
      borderRadius: 3,
    },

    statusText: {
      fontSize: 10,
      fontWeight: "600" as const,
      letterSpacing: 0.2,
    },

    // ── Meta rows ─────────────────────────────────────────────────────────────

    metaRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },

    metaLabel: {
      ...typography.label,
      color: colors.textMuted,
      fontSize: 9,
    },

    metaValue: {
      ...typography.caption,
      color: colors.textSecondary,
      fontSize: 12,
    },

    // ── Sync info grid ────────────────────────────────────────────────────────

    syncInfoGrid: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.surfaceDark,
      borderRadius: radius.sm,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: "hidden",
    },

    syncInfoCell: {
      flex: 1,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
      gap: 3,
    },

    syncInfoDivider: {
      width: 1,
      height: "100%",
      backgroundColor: colors.border,
    },

    // ── Sync result stats ─────────────────────────────────────────────────────

    syncStats: {
      flexDirection: "row",
      backgroundColor: colors.surfaceDark,
      borderRadius: radius.sm,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: "hidden",
    },

    syncStat: {
      flex: 1,
      alignItems: "center",
      paddingVertical: spacing.sm,
      gap: 2,
    },

    syncStatNum: {
      fontSize: 18,
      fontWeight: "800" as const,
      color: colors.textPrimary,
      letterSpacing: -0.5,
    },

    syncStatLabel: {
      ...typography.label,
      color: colors.textMuted,
      fontSize: 8,
    },

    syncStatDivider: {
      width: 1,
      backgroundColor: colors.border,
    },

    syncErrorRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },

    syncErrorText: {
      ...typography.caption,
      color: colors.danger,
      flex: 1,
      fontSize: 11,
      lineHeight: 16,
    },

    // ── Used For ──────────────────────────────────────────────────────────────

    usedForSection: {
      gap: spacing.xs,
    },

    usedForList: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 6,
      marginTop: 2,
    },

    usedForItem: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      backgroundColor: colors.surfaceDark,
      borderRadius: 6,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderWidth: 1,
      borderColor: colors.border,
    },

    usedForDot: {
      width: 5,
      height: 5,
      borderRadius: 3,
      opacity: 0.8,
    },

    usedForText: {
      fontSize: 11,
      fontWeight: "500" as const,
      color: colors.textSecondary,
    },

    // ── Action buttons ────────────────────────────────────────────────────────

    actionRow: {
      flexDirection: "row",
      gap: spacing.sm,
    },

    actionButton: {
      borderRadius: radius.sm,
      paddingVertical: spacing.sm,
      alignItems: "center",
      justifyContent: "center",
      flexDirection: "row",
      gap: 5,
      minHeight: 38,
    },

    actionButtonDisabled: {
      opacity: 0.55,
    },

    syncButton: {
      flex: 1,
      borderWidth: 1,
    },

    connectButton: {
      flex: 1,
    },

    disconnectButton: {
      flex: 1,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: "transparent",
    },

    comingSoonButton: {
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: "transparent",
    },

    actionButtonText: {
      fontSize: 12,
      fontWeight: "600" as const,
      color: colors.background,
    },

    disconnectButtonText: {
      color: colors.textMuted,
    },

    // ── Footer ───────────────────────────────────────────────────────────────

    footer: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: spacing.sm,
      paddingTop: spacing.md,
    },

    footerText: {
      ...typography.caption,
      color: colors.textMuted,
      flex: 1,
      lineHeight: 18,
      opacity: 0.7,
      fontSize: 11,
    },

  });
}
