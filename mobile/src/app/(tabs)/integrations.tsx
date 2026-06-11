import { useCallback, useEffect, useState } from "react";
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
import type { SFSymbol } from "sf-symbols-typescript";

import { useAuthStore, useIntegrationStore } from "../../store";
import { colors, spacing, radius, typography } from "../../theme/theme";
import { integrationService } from "../../services/integrationService";
import type {
  ConnectUrlResponse,
  Integration,
  IntegrationProvider,
  SyncJobOut,
} from "../../services/integrationService";

// ── Provider metadata ─────────────────────────────────────────────────────────

type ProviderMeta = {
  displayName: string;
  subtitle: string;
  icon: SFSymbol;
  accent: string;
};

const PROVIDER_META: Record<IntegrationProvider, ProviderMeta> = {
  google_calendar: {
    displayName: "Google Calendar",
    subtitle: "Sync events and scheduled commitments",
    icon: "calendar.circle",
    accent: "#4285f4",
  },
  gmail: {
    displayName: "Gmail",
    subtitle: "Surface important emails in briefings",
    icon: "envelope.circle",
    accent: "#ea4335",
  },
  outlook_calendar: {
    displayName: "Outlook Calendar",
    subtitle: "Sync Microsoft calendar events",
    icon: "calendar.badge.clock",
    accent: "#0078d4",
  },
  outlook_mail: {
    displayName: "Outlook Mail",
    subtitle: "Surface Outlook emails in briefings",
    icon: "envelope.badge",
    accent: "#0078d4",
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

function formatTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ── Integration card ──────────────────────────────────────────────────────────

type CardProps = {
  integration: Integration;
  isMutating: boolean;
  isSyncing: boolean;
  isConnecting: boolean;
  syncResult: SyncJobOut | null;
  onConnect: (provider: IntegrationProvider) => void;
  onDisconnect: (id: string, displayName: string) => void;
  onSync: (id: string) => void;
  onGoogleConnect: (provider: IntegrationProvider) => void;
};

function IntegrationCard({
  integration,
  isMutating,
  isSyncing,
  isConnecting,
  syncResult,
  onConnect,
  onDisconnect,
  onSync,
  onGoogleConnect,
}: CardProps) {
  const meta = PROVIDER_META[integration.provider as IntegrationProvider];
  if (!meta) return null;

  const isConnected = integration.status === "connected";
  const accent = meta.accent;
  const syncFailed = syncResult?.status === "failed";
  const isOAuthReady =
    integration.provider === "google_calendar" || integration.provider === "gmail";

  return (
    <View style={[styles.card, isConnected && { borderColor: `${accent}40` }]}>
      {/* Left accent strip for connected state */}
      {isConnected && <View style={[styles.cardAccentBar, { backgroundColor: accent }]} />}

      <View style={styles.cardBody}>
        {/* Header row */}
        <View style={styles.cardHeader}>
          <View
            style={[
              styles.iconWrap,
              { backgroundColor: `${accent}18`, borderColor: `${accent}35` },
            ]}
          >
            <SymbolView
              name={meta.icon}
              size={22}
              tintColor={accent}
              resizeMode="scaleAspectFit"
            />
          </View>
          <View style={styles.cardInfo}>
            <Text style={styles.providerName}>{meta.displayName}</Text>
            <Text style={styles.providerSubtitle}>{meta.subtitle}</Text>
            {isOAuthReady && (
              <View style={styles.oauthReadyBadge}>
                <SymbolView
                  name="checkmark.shield"
                  size={9}
                  tintColor="#10b981"
                  resizeMode="scaleAspectFit"
                />
                <Text style={styles.oauthReadyText}>OAUTH READY</Text>
              </View>
            )}
          </View>
          <View
            style={[
              styles.statusBadge,
              isConnected ? styles.statusConnected : styles.statusDisconnected,
            ]}
          >
            <View
              style={[
                styles.statusDot,
                { backgroundColor: isConnected ? "#10b981" : colors.textMuted },
              ]}
            />
            <Text
              style={[
                styles.statusText,
                { color: isConnected ? "#10b981" : colors.textMuted },
              ]}
            >
              {isConnected ? "CONNECTED" : "DISCONNECTED"}
            </Text>
          </View>
        </View>

        {/* Connected-at row */}
        {isConnected && (
          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>Connected</Text>
            <Text style={styles.metaValue}>{formatDate(integration.connected_at)}</Text>
          </View>
        )}

        {/* Last synced row */}
        {isConnected && (
          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>Last synced</Text>
            <Text style={styles.metaValue}>
              {integration.last_sync_at ? formatTime(integration.last_sync_at) : "Never"}
            </Text>
          </View>
        )}

        {/* Scopes */}
        {isConnected && integration.scopes.length > 0 && (
          <View style={styles.scopesRow}>
            <Text style={styles.metaLabel}>Scopes</Text>
            <Text style={styles.scopeText} numberOfLines={2}>
              {integration.scopes.join("  ·  ")}
            </Text>
          </View>
        )}

        {/* OAuth note for disconnected state */}
        {!isConnected && (
          <View style={styles.oauthNote}>
            <SymbolView
              name="lock.shield"
              size={11}
              tintColor={colors.textMuted}
              resizeMode="scaleAspectFit"
            />
            <Text style={styles.oauthNoteText}>
              {isOAuthReady
                ? "OAuth architecture prepared — encrypted token storage ready for production"
                : "Real OAuth coming soon — mock connection available now"}
            </Text>
          </View>
        )}

        {/* Sync result stats */}
        {syncResult && syncResult.status === "completed" && (
          <View style={styles.syncStats}>
            <View style={styles.syncStat}>
              <Text style={styles.syncStatNum}>{syncResult.records_created}</Text>
              <Text style={styles.syncStatLabel}>CREATED</Text>
            </View>
            <View style={styles.syncStatDivider} />
            <View style={styles.syncStat}>
              <Text style={styles.syncStatNum}>{syncResult.records_updated}</Text>
              <Text style={styles.syncStatLabel}>UPDATED</Text>
            </View>
            <View style={styles.syncStatDivider} />
            <View style={styles.syncStat}>
              <Text style={styles.syncStatNum}>{syncResult.records_processed}</Text>
              <Text style={styles.syncStatLabel}>PROCESSED</Text>
            </View>
          </View>
        )}

        {/* Sync error */}
        {syncFailed && syncResult.errors.length > 0 && (
          <View style={styles.syncErrorRow}>
            <SymbolView
              name="exclamationmark.circle"
              size={11}
              tintColor="#ef4444"
              resizeMode="scaleAspectFit"
            />
            <Text style={styles.syncErrorText} numberOfLines={2}>
              {syncResult.errors[0]}
            </Text>
          </View>
        )}

        {/* Action buttons */}
        {isConnected ? (
          <View style={styles.actionRow}>
            {/* SYNC NOW */}
            <TouchableOpacity
              style={[
                styles.actionButton,
                styles.syncButton,
                { borderColor: `${accent}60`, backgroundColor: `${accent}15` },
                isSyncing && styles.actionButtonDisabled,
              ]}
              onPress={() => integration.id && onSync(integration.id)}
              disabled={isSyncing || isMutating}
              activeOpacity={0.8}
            >
              {isSyncing ? (
                <ActivityIndicator size="small" color={accent} />
              ) : (
                <>
                  <SymbolView
                    name="arrow.clockwise"
                    size={11}
                    tintColor={accent}
                    resizeMode="scaleAspectFit"
                  />
                  <Text style={[styles.actionButtonText, { color: accent }]}>
                    SYNC NOW
                  </Text>
                </>
              )}
            </TouchableOpacity>

            {/* DISCONNECT */}
            <TouchableOpacity
              style={[
                styles.actionButton,
                styles.disconnectButton,
                isMutating && styles.actionButtonDisabled,
              ]}
              onPress={() =>
                integration.id && onDisconnect(integration.id, meta.displayName)
              }
              disabled={isMutating || isSyncing}
              activeOpacity={0.8}
            >
              {isMutating ? (
                <ActivityIndicator size="small" color={colors.textMuted} />
              ) : (
                <Text style={[styles.actionButtonText, styles.disconnectButtonText]}>
                  DISCONNECT
                </Text>
              )}
            </TouchableOpacity>
          </View>
        ) : isOAuthReady ? (
          // Google providers: real OAuth skeleton + mock fallback
          <View style={styles.actionRow}>
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
                  <SymbolView
                    name="lock.shield"
                    size={11}
                    tintColor={colors.background}
                    resizeMode="scaleAspectFit"
                  />
                  <Text style={styles.actionButtonText}>CONNECT GOOGLE</Text>
                </>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.actionButton,
                styles.mockConnectSecondary,
                (isMutating || isConnecting) && styles.actionButtonDisabled,
              ]}
              onPress={() => onConnect(integration.provider as IntegrationProvider)}
              disabled={isMutating || isConnecting}
              activeOpacity={0.8}
            >
              {isMutating ? (
                <ActivityIndicator size="small" color={colors.textMuted} />
              ) : (
                <Text style={[styles.actionButtonText, { color: colors.textMuted }]}>
                  MOCK
                </Text>
              )}
            </TouchableOpacity>
          </View>
        ) : (
          // Non-Google providers: mock connect only
          <TouchableOpacity
            style={[
              styles.actionButton,
              styles.connectButton,
              { backgroundColor: accent },
              isMutating && styles.actionButtonDisabled,
            ]}
            onPress={() => onConnect(integration.provider as IntegrationProvider)}
            disabled={isMutating}
            activeOpacity={0.8}
          >
            {isMutating ? (
              <ActivityIndicator size="small" color={colors.background} />
            ) : (
              <Text style={styles.actionButtonText}>MOCK CONNECT</Text>
            )}
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function IntegrationsScreen() {
  const insets = useSafeAreaInsets();
  const accessToken = useAuthStore((s) => s.accessToken);

  const {
    integrations,
    isLoading,
    isMutating,
    error,
    syncResults,
    syncingId,
    syncError,
    fetchIntegrations,
    fetchSyncStatus,
    mockConnect,
    disconnect,
    triggerSync,
  } = useIntegrationStore();

  const load = useCallback(() => {
    if (accessToken) {
      fetchIntegrations(accessToken);
      fetchSyncStatus(accessToken);
    }
  }, [accessToken, fetchIntegrations, fetchSyncStatus]);

  useEffect(() => {
    load();
  }, [load]);

  function handleConnect(provider: IntegrationProvider) {
    if (!accessToken) return;
    mockConnect(accessToken, provider);
  }

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
            if (accessToken) disconnect(accessToken, id);
          },
        },
      ],
    );
  }

  function handleSync(id: string) {
    if (!accessToken) return;
    triggerSync(accessToken, id);
  }

  const [connectingProvider, setConnectingProvider] = useState<IntegrationProvider | null>(null);

  async function handleGoogleConnect(provider: IntegrationProvider) {
    if (!accessToken) return;
    setConnectingProvider(provider);
    try {
      const data = await integrationService.getConnectUrl(accessToken);
      const urlPreview = data.url.length > 120 ? `${data.url.substring(0, 120)}…` : data.url;
      Alert.alert(
        "Google OAuth — Skeleton",
        `${data.configured ? "✓ Real URL generated (GOOGLE_CLIENT_ID configured)" : "⚠ Placeholder URL (GOOGLE_CLIENT_ID not set)"}\n\n${data.note}\n\nURL:\n${urlPreview}`,
        [{ text: "OK" }],
      );
    } catch (err) {
      Alert.alert(
        "Connection Error",
        err instanceof Error ? err.message : "Failed to generate authorization URL.",
      );
    } finally {
      setConnectingProvider(null);
    }
  }

  const connectedCount = integrations.filter((i) => i.status === "connected").length;

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={[
        styles.container,
        { paddingTop: insets.top + spacing.md },
      ]}
      refreshControl={
        <RefreshControl
          refreshing={isLoading}
          onRefresh={load}
          tintColor={colors.accentCyan}
        />
      }
    >
      {/* Hero */}
      <View style={styles.heroCard}>
        <Text style={styles.heroLabel}>EXTERNAL INTEGRATIONS</Text>
        <Text style={styles.heroTitle}>Connect Your World</Text>
        <Text style={styles.heroSubtitle}>
          {connectedCount > 0
            ? `${connectedCount} of ${integrations.length} providers connected · sync to populate calendar and email data`
            : "Link external services to give HELIOS access to your calendar and email data."}
        </Text>
      </View>

      {/* Sync engine banner */}
      <View style={styles.readinessBanner}>
        <SymbolView
          name="antenna.radiowaves.left.and.right"
          size={13}
          tintColor={colors.accentCyan}
          resizeMode="scaleAspectFit"
        />
        <Text style={styles.readinessText}>
          Sync simulation active. Mock syncs populate real calendar and email records — the same architecture used by live provider sync workers.
        </Text>
      </View>

      {/* Section header */}
      <View style={styles.sectionHeaderRow}>
        <Text style={styles.sectionLabel}>AVAILABLE INTEGRATIONS</Text>
        {isLoading ? (
          <ActivityIndicator size="small" color={colors.accentCyan} />
        ) : null}
      </View>

      {error ? <Text style={styles.errorText}>{error}</Text> : null}
      {syncError ? <Text style={styles.errorText}>{syncError}</Text> : null}

      {integrations.map((integration) => (
        <IntegrationCard
          key={integration.provider}
          integration={integration}
          isMutating={isMutating}
          isSyncing={syncingId === integration.id}
          isConnecting={connectingProvider === integration.provider}
          syncResult={integration.id ? (syncResults[integration.id] ?? null) : null}
          onConnect={handleConnect}
          onDisconnect={handleDisconnect}
          onSync={handleSync}
          onGoogleConnect={handleGoogleConnect}
        />
      ))}

      {/* Footer note */}
      <View style={styles.footer}>
        <SymbolView
          name="info.circle"
          size={12}
          tintColor={colors.textMuted}
          resizeMode="scaleAspectFit"
        />
        <Text style={styles.footerText}>
          Mock syncs write stable fake records with upsert logic — re-syncing updates existing records rather than duplicating them. No real credentials are stored.
        </Text>
      </View>
    </ScrollView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
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
    color: colors.accentCyan,
    marginBottom: spacing.md,
  },

  heroTitle: {
    ...typography.displaySmall,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },

  heroSubtitle: {
    ...typography.body,
    color: colors.textMuted,
    lineHeight: 22,
  },

  readinessBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    backgroundColor: `${colors.accentCyan}0d`,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: `${colors.accentCyan}25`,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },

  readinessText: {
    ...typography.caption,
    color: colors.accentCyan,
    flex: 1,
    lineHeight: 18,
    opacity: 0.85,
  },

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
    color: "#ef4444",
    marginBottom: spacing.sm,
  },

  // ── Integration card ───────────────────────────────────────────────────────

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
    gap: 3,
  },

  providerName: {
    fontSize: 15,
    fontWeight: "700" as const,
    color: colors.textPrimary,
  },

  providerSubtitle: {
    ...typography.caption,
    color: colors.textMuted,
    lineHeight: 17,
  },

  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 3,
    flexShrink: 0,
  },

  statusConnected: {
    backgroundColor: "#10b98115",
    borderWidth: 1,
    borderColor: "#10b98130",
  },

  statusDisconnected: {
    backgroundColor: colors.surfaceDark,
    borderWidth: 1,
    borderColor: colors.border,
  },

  statusDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },

  statusText: {
    ...typography.label,
    fontSize: 8,
  },

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

  scopesRow: {
    gap: 4,
  },

  scopeText: {
    ...typography.caption,
    color: colors.textMuted,
    fontSize: 11,
    lineHeight: 16,
    opacity: 0.8,
  },

  oauthReadyBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    alignSelf: "flex-start",
    backgroundColor: "#10b98112",
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: "#10b98128",
    marginTop: 3,
  },

  oauthReadyText: {
    ...typography.label,
    color: "#10b981",
    fontSize: 8,
  },

  oauthNote: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },

  oauthNoteText: {
    ...typography.caption,
    color: colors.textMuted,
    flex: 1,
    fontSize: 11,
    lineHeight: 16,
    opacity: 0.75,
  },

  // Sync stats row
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
    color: "#ef4444",
    flex: 1,
    fontSize: 11,
    lineHeight: 16,
  },

  // Action buttons
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
    minHeight: 36,
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

  mockConnectSecondary: {
    flex: 0.45,   // narrower than primary — MOCK label is short
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "transparent",
  },

  actionButtonText: {
    ...typography.label,
    color: colors.background,
    fontSize: 11,
  },

  disconnectButtonText: {
    color: colors.textMuted,
  },

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
