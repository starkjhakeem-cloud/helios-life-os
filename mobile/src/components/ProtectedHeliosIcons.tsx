import React from "react";
import { Image, StyleSheet, View, type ImageSourcePropType } from "react-native";

export type ProtectedHeliosIconName =
  | "assistant"
  | "calendar"
  | "goals"
  | "home"
  | "more"
  | "tasks";

export const PROTECTED_HELIOS_ICON_ASSETS = {
  assistant: require("../../assets/design/branding/helios-energy-core-transparent.png"),
  calendar: require("../../assets/design/system/icons/calendar.png"),
  goals: require("../../assets/design/system/icons/goals.png"),
  home: require("../../assets/design/system/icons/home.png"),
  more: require("../../assets/design/system/icons/more.png"),
  tasks: require("../../assets/design/system/icons/tasks.png"),
} as const satisfies Record<ProtectedHeliosIconName, ImageSourcePropType>;

type ProtectedHeliosIconProps = {
  name: ProtectedHeliosIconName;
  size?: number;
  tintColor?: string;
};

export function ProtectedHeliosIcon({
  name,
  size = 28,
  tintColor,
}: ProtectedHeliosIconProps) {
  const shouldGlow = name !== "assistant";
  const iconStyle = { width: size, height: size };
  const glowSize = size + 8;
  const glowOffset = -4;
  const glowStyle = {
    height: glowSize,
    left: glowOffset,
    top: glowOffset,
    width: glowSize,
  };

  return (
    <View style={[styles.root, iconStyle]}>
      {shouldGlow && (
        <Image
          source={PROTECTED_HELIOS_ICON_ASSETS[name]}
          style={[styles.icon, styles.glow, glowStyle]}
          resizeMode="contain"
          blurRadius={4}
          accessibilityIgnoresInvertColors
        />
      )}
      <Image
        source={PROTECTED_HELIOS_ICON_ASSETS[name]}
        style={[styles.icon, iconStyle, { tintColor }]}
        resizeMode="contain"
        accessibilityIgnoresInvertColors
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    overflow: "visible",
  },
  icon: {
    left: 0,
    position: "absolute",
    top: 0,
  },
  glow: {
    opacity: 0.18,
  },
});
