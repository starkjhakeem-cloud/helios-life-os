import { type ReactNode } from "react";
import { View, ScrollView, StyleSheet, type StyleProp, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { spacing } from "../../theme/theme";
import { useTheme } from "../../theme/ThemeContext";

type Props = {
  children: ReactNode;
  scroll?: boolean;
  style?: StyleProp<ViewStyle>;
};

export default function Screen({ children, scroll = false, style }: Props) {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();

  const contentStyle = [
    styles.container,
    { paddingTop: insets.top + spacing.md },
    style,
  ];

  if (scroll) {
    return (
      <ScrollView
        style={[styles.fill, { backgroundColor: colors.background }]}
        contentContainerStyle={contentStyle}
        showsVerticalScrollIndicator={false}
      >
        {!isDark ? <LightBackgroundMaterial /> : null}
        {children}
      </ScrollView>
    );
  }

  return (
    <View style={[styles.fill, { backgroundColor: colors.background }, contentStyle]}>
      {!isDark ? <LightBackgroundMaterial /> : null}
      {children}
    </View>
  );
}

function LightBackgroundMaterial() {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <View style={[styles.bgTop, { backgroundColor: "rgba(255,255,255,0.55)" }]} />
      <View style={[styles.bgMid, { backgroundColor: "rgba(237,232,255,0.38)" }]} />
      <View style={[styles.bgBottom, { backgroundColor: "rgba(222,232,248,0.42)" }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  container: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl * 2,
  },
  bgTop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: "34%",
  },
  bgMid: {
    position: "absolute",
    top: "28%",
    left: 0,
    right: 0,
    height: "38%",
  },
  bgBottom: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: "42%",
  },
});
