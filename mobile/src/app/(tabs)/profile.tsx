import { useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { systemService, type VersionResponse } from "../../services/systemService";
import { useAuthStore } from "../../store";
import { colors, radius, spacing, typography } from "../../theme/theme";

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

type InfoRowProps = { label: string; value: string };
function InfoRow({ label, value }: InfoRowProps) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const [version, setVersion] = useState<VersionResponse | null>(null);

  useEffect(() => {
    systemService.version().then(setVersion).catch(() => setVersion(null));
  }, []);

  function handleLogout() {
    Alert.alert("Sign Out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      { text: "Sign Out", style: "destructive", onPress: logout },
    ]);
  }

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={[
        styles.container,
        { paddingTop: insets.top + spacing.md },
      ]}
    >
      {/* Hero */}
      <View style={styles.heroCard}>
        <Text style={styles.heroLabel}>HELIOS ACCOUNT</Text>

        <View style={styles.avatarRow}>
          <View style={styles.avatar}>
            <Text style={styles.avatarInitials}>
              {user ? initials(user.name) : "?"}
            </Text>
          </View>
          <View style={styles.avatarInfo}>
            <Text style={styles.displayName} numberOfLines={1}>
              {user?.name ?? "—"}
            </Text>
            <Text style={styles.emailText} numberOfLines={1}>
              {user?.email ?? "—"}
            </Text>
          </View>
        </View>
      </View>

      {/* Account section */}
      <Text style={styles.sectionLabel}>ACCOUNT</Text>
      <View style={styles.card}>
        <InfoRow
          label="Member Since"
          value={formatMemberSince(user?.created_at)}
        />
        <View style={styles.cardDivider} />
        <InfoRow
          label="User ID"
          value={user ? truncateId(user.id) : "—"}
        />
      </View>

      {/* System section */}
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

      {/* Logout */}
      <TouchableOpacity style={styles.logoutButton} onPress={handleLogout} activeOpacity={0.8}>
        <Text style={styles.logoutText}>SIGN OUT</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

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

  avatarInfo: {
    flex: 1,
  },

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
});
