import { View, Text, StyleSheet } from "react-native";
import { SymbolView } from "expo-symbols";
import type { SFSymbol } from "sf-symbols-typescript";
import { spacing, radius } from "../theme/theme";
import { useTheme } from "../theme/ThemeContext";

type SectionCardProps = {
  title: string;
  icon?: SFSymbol;
  children: string;
};

export default function SectionCard({ title, icon, children }: SectionCardProps) {
  const { colors } = useTheme();

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={[styles.accentBar, { backgroundColor: colors.accent }]} />
      <View style={styles.titleRow}>
        {icon && (
          <SymbolView
            name={icon}
            size={15}
            tintColor={colors.accent}
            resizeMode="scaleAspectFit"
          />
        )}
        <Text style={[styles.title, { color: colors.textPrimary }]}>{title}</Text>
      </View>
      <Text style={[styles.text, { color: colors.textSecondary }]}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    marginBottom: spacing.sm,
    overflow: "hidden",
  },
  accentBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 3,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  title: {
    fontSize: 17,
    fontWeight: "700",
  },
  text: {
    fontSize: 15,
    lineHeight: 23,
  },
});
