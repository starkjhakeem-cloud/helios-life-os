import { Component, ReactNode } from 'react';
import { View, Text, Pressable } from "react-native";
import { colors } from "../theme/theme";
import { reportError } from "../services/errorReporter";

type Props = {
  children: ReactNode;
};

type State = {
  hasError: boolean;
};

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  componentDidCatch(error: unknown, info: { componentStack: string }): void {
    reportError(error, "Uncaught UI error", { componentStack: info.componentStack });
    this.setState({ hasError: true });
  }

  handleReload = (): void => {
    this.setState({ hasError: false });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <View style={{ flex: 1, backgroundColor: colors.background, alignItems: "center", justifyContent: "center", padding: 24 }}>
          <Text style={{ color: colors.textPrimary, fontSize: 20, fontWeight: "700", marginBottom: 12 }}>
            Something went wrong.
          </Text>
          <Text style={{ color: colors.textMuted, fontSize: 16, textAlign: "center", marginBottom: 24 }}>
            Restarting the screen may fix the issue. If it persists, close and reopen the app.
          </Text>
          <Pressable
            onPress={this.handleReload}
            style={{
              paddingVertical: 14,
              paddingHorizontal: 24,
              backgroundColor: colors.accentCyan,
              borderRadius: 10,
            }}
          >
            <Text style={{ color: colors.background, fontSize: 16, fontWeight: "700" }}>
              Retry
            </Text>
          </Pressable>
        </View>
      );
    }

    return this.props.children;
  }
}
