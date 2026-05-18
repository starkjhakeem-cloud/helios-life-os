import { Text as RNText, type TextProps } from "react-native";
import { colors, typography } from "../../theme/theme";

type TextVariant = keyof typeof typography;

type Props = TextProps & {
  variant?: TextVariant;
  color?: string;
};

export default function Text({ variant = "body", color, style, ...rest }: Props) {
  return (
    <RNText
      {...rest}
      style={[
        typography[variant],
        { color: color ?? colors.textPrimary },
        style,
      ]}
    />
  );
}
