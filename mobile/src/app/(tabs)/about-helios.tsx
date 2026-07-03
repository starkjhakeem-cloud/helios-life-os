import { useEffect, useMemo, useState } from "react";
import { Alert, Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import Constants from "expo-constants";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SymbolView } from "expo-symbols";
import type { SFSymbol } from "sf-symbols-typescript";

import { radius, spacing, typography, type ThemeColors } from "../../theme/theme";
import { useTheme } from "../../theme/ThemeContext";
import { systemService, type DiagnosticsResponse, type VersionResponse } from "../../services/systemService";

type AboutRow = {
  title: string;
  value: string;
  icon: SFSymbol;
  onPress?: () => void;
  debugOnly?: boolean;
};

const PRODUCT_URLS = {
  website: "https://helios-life-os.com",
  privacy: "https://helios-life-os.com/privacy",
  terms: "https://helios-life-os.com/terms",
  licenses: "https://helios-life-os.com/licenses",
  support: "mailto:support@helios-life-os.com",
  bug: "mailto:support@helios-life-os.com?subject=HELIOS%20Bug%20Report",
  feature: "mailto:support@helios-life-os.com?subject=HELIOS%20Feature%20Request",
};

async function openExternal(url: string) {
  try {
    await Linking.openURL(url);
  } catch {
    Alert.alert("Unable to open link", "Your device could not open this destination right now.");
  }
}

export default function AboutHeliosScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [version, setVersion] = useState<VersionResponse | null>(null);
  const [diagnostics, setDiagnostics] = useState<DiagnosticsResponse | null>(null);

  useEffect(() => {
    systemService.version().then(setVersion).catch(() => setVersion(null));
    if (__DEV__) {
      systemService.diagnostics().then(setDiagnostics).catch(() => setDiagnostics(null));
    }
  }, []);

  const expoConfig = Constants.expoConfig;
  const iosConfig = expoConfig?.ios as { buildNumber?: string } | undefined;
  const releaseChannel = __DEV__ ? "Development" : "Production";
  const branch = process.env.EXPO_PUBLIC_GIT_BRANCH ?? "Not embedded in this build";

  const productRows: AboutRow[] = [
    { title: "HELIOS Version", value: version?.helios_version ?? expoConfig?.version ?? "1.0.0", icon: "sparkles" },
    { title: "Build Number", value: iosConfig?.buildNumber ?? "Local build", icon: "number" },
    { title: "Release Channel", value: releaseChannel, icon: "shippingbox" },
    { title: "Current Branch", value: branch, icon: "arrow.triangle.branch", debugOnly: true },
    { title: "Backend Service", value: version?.service ?? "HELIOS API", icon: "server.rack" },
    { title: "API Version", value: version?.api_version ?? "v1", icon: "point.3.connected.trianglepath.dotted" },
  ];

  const resourceRows: AboutRow[] = [
    { title: "Changelog", value: "Review notable product changes", icon: "list.bullet.rectangle", onPress: () => Alert.alert("Changelog", "HELIOS V3 adds the Priority Engine, Build My Day redesign, Real-Time Awareness, and this Command Center refinement.") },
    { title: "Release Notes", value: "Read the current release summary", icon: "doc.text", onPress: () => Alert.alert("Release Notes", "This build focuses on intelligence consistency, automatic day planning, account operations, and connected-service readiness.") },
    { title: "Privacy Policy", value: "Open privacy policy", icon: "hand.raised", onPress: () => openExternal(PRODUCT_URLS.privacy) },
    { title: "Terms", value: "Open terms of service", icon: "doc.plaintext", onPress: () => openExternal(PRODUCT_URLS.terms) },
    { title: "Licenses", value: "Open open-source licenses", icon: "scroll", onPress: () => openExternal(PRODUCT_URLS.licenses) },
  ];

  const supportRows: AboutRow[] = [
    { title: "Developer", value: "HELIOS Life OS", icon: "hammer" },
    { title: "Website", value: PRODUCT_URLS.website, icon: "globe", onPress: () => openExternal(PRODUCT_URLS.website) },
    { title: "Support", value: "Contact support", icon: "questionmark.circle", onPress: () => openExternal(PRODUCT_URLS.support) },
    { title: "Report Bug", value: "Send a bug report", icon: "ladybug", onPress: () => openExternal(PRODUCT_URLS.bug) },
    { title: "Feature Request", value: "Suggest an improvement", icon: "lightbulb", onPress: () => openExternal(PRODUCT_URLS.feature) },
    { title: "Diagnostics", value: diagnostics ? `${diagnostics.status} | DB ${diagnostics.database.status}` : "Open diagnostics", icon: "waveform.path.ecg", debugOnly: true, onPress: () => router.push("/(tabs)/developer-options") },
  ];

  return (
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
        <Text style={styles.heroLabel}>ABOUT HELIOS</Text>
        <Text style={styles.heroTitle}>AI Life Operating System</Text>
        <Text style={styles.heroBody}>
          Product details, release information, support links, legal resources, and diagnostics for HELIOS.
        </Text>
      </View>

      <AboutSection title="Product" rows={productRows} styles={styles} colors={colors} />
      <AboutSection title="Resources" rows={resourceRows} styles={styles} colors={colors} />
      <AboutSection title="Support" rows={supportRows} styles={styles} colors={colors} />
    </ScrollView>
  );
}

function AboutSection({
  colors,
  rows,
  styles,
  title,
}: {
  colors: ThemeColors;
  rows: AboutRow[];
  styles: ReturnType<typeof createStyles>;
  title: string;
}) {
  const visibleRows = rows.filter((row) => !row.debugOnly || __DEV__);
  if (visibleRows.length === 0) return null;

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.card}>
        {visibleRows.map((row, index) => {
          const handlePress = row.onPress ?? (() => Alert.alert(row.title, row.value));
          return (
            <TouchableOpacity
              key={row.title}
              accessibilityRole="button"
              activeOpacity={0.78}
              onPress={handlePress}
              style={[styles.row, index === visibleRows.length - 1 && styles.rowLast]}
            >
              <View style={styles.icon}>
                <SymbolView name={row.icon} size={17} tintColor={colors.accentCyan} resizeMode="scaleAspectFit" />
              </View>
              <View style={styles.rowCopy}>
                <Text style={styles.rowTitle}>{row.title}</Text>
                <Text style={styles.rowValue}>{row.value}</Text>
              </View>
              <SymbolView name="chevron.right" size={14} tintColor={colors.textMuted} resizeMode="scaleAspectFit" />
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
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
    section: {
      gap: spacing.sm,
    },
    sectionTitle: {
      ...typography.label,
      color: colors.textPrimary,
      letterSpacing: 0,
      fontSize: 12,
    },
    card: {
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      overflow: "hidden",
    },
    row: {
      minHeight: 68,
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
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "rgba(34,211,238,0.10)",
      borderWidth: 1,
      borderColor: "rgba(34,211,238,0.24)",
      flexShrink: 0,
    },
    rowCopy: {
      flex: 1,
      minWidth: 0,
      gap: 3,
    },
    rowTitle: {
      ...typography.body,
      color: colors.textPrimary,
      fontWeight: "800",
      lineHeight: 19,
    },
    rowValue: {
      ...typography.caption,
      color: colors.textMuted,
      lineHeight: 18,
    },
  });
}
