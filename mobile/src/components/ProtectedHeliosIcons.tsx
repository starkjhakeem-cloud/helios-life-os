import React from "react";
import { Image, type ImageSourcePropType } from "react-native";

export type ProtectedHeliosIconName =
  | "assistant"
  | "goals"
  | "home"
  | "tasks";

export const PROTECTED_HELIOS_ICON_ASSETS = {
  assistant: require("../../assets/design/branding/helios-energy-core-transparent.png"),
  goals: require("../../assets/design/system/icons/goals.png"),
  home: require("../../assets/design/system/icons/home.png"),
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
  return (
    <Image
      source={PROTECTED_HELIOS_ICON_ASSETS[name]}
      style={{ width: size, height: size, tintColor }}
      resizeMode="contain"
      accessibilityIgnoresInvertColors
    />
  );
}
