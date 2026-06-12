import { Text as RNText, type TextProps } from "react-native";
import { typography } from "../../theme/theme";
import { useTheme } from "../../theme/ThemeContext";

type TextVariant = keyof typeof typography;

type Props = TextProps & {
  variant?: TextVariant;
  color?: string;
};

export default function Text({ variant = "body", color, style, ...rest }: Props) {
  const { colors } = useTheme();

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
