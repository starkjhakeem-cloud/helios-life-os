import { View, Text, StyleSheet } from "react-native";
import { SymbolView } from "expo-symbols";
import type { SFSymbol } from "sf-symbols-typescript";
import { colors, spacing, radius } from "../theme/theme";

type SectionCardProps = {
  title: string;
  icon?: SFSymbol;
  children: string;
};

export default function SectionCard({ title, icon, children }: SectionCardProps) {
  return (
    <View style={styles.card}>
      <View style={styles.accentBar} />
      <View style={styles.titleRow}>
        {icon && (
          <SymbolView
            name={icon}
            size={15}
            tintColor={colors.accent}
            resizeMode="scaleAspectFit"
          />
        )}
        <Text style={styles.title}>{title}</Text>
      </View>
      <Text style={styles.text}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.sm,
    overflow: "hidden",
  },
  accentBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: colors.accent,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  title: {
    color: colors.textPrimary,
    fontSize: 17,
    fontWeight: "700",
  },
  text: {
    color: colors.textSecondary,
    fontSize: 15,
    lineHeight: 23,
  },
});
