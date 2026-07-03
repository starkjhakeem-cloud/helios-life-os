import { Component, ReactNode } from 'react';
import { View, Text, Pressable, StyleSheet } from "react-native";
import { colors, radius, spacing, typography } from "../theme/theme";
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
        <View style={styles.container}>
          <View style={styles.card}>
            <Text style={styles.title}>Something went wrong.</Text>
            <Text style={styles.message}>
              Restarting the screen may fix the issue. If it persists, close and reopen the app.
            </Text>
            <Pressable
              onPress={this.handleReload}
              style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
            >
              <Text style={styles.buttonText}>Retry</Text>
            </Pressable>
          </View>
        </View>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.lg,
  },
  card: {
    width: "100%",
    maxWidth: 360,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.lg,
    alignItems: "center",
  },
  title: {
    ...typography.title,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
    textAlign: "center",
  },
  message: {
    ...typography.body,
    color: colors.textMuted,
    textAlign: "center",
    marginBottom: spacing.lg,
  },
  button: {
    minHeight: 48,
    borderRadius: radius.md,
    backgroundColor: colors.accentCyan,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  buttonPressed: {
    opacity: 0.78,
  },
  buttonText: {
    ...typography.body,
    color: colors.background,
    fontWeight: "800",
  },
});
