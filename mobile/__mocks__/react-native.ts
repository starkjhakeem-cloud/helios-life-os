import React from "react";

type Props = {
  children?: React.ReactNode;
  [key: string]: unknown;
};

export const View = ({ children, ...props }: Props) => React.createElement("div", props, children);
export const Text = ({ children, ...props }: Props) => React.createElement("span", props, children);
export const Pressable = ({ children, onPress, ...props }: Props & { onPress?: () => void }) =>
  React.createElement("button", { onClick: onPress, ...props }, children);
export const Platform = { OS: "ios" };
export const StyleSheet = {
  create: <T extends Record<string, unknown>>(styles: T) => styles,
};
