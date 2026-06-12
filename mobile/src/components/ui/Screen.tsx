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
  const { colors } = useTheme();

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
        {children}
      </ScrollView>
    );
  }

  return (
    <View style={[styles.fill, { backgroundColor: colors.background }, contentStyle]}>
      {children}
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
});
