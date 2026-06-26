import { useEffect, useRef, useState } from 'react';
import { View, ActivityIndicator, Alert, TextInput, type TextInputProps } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ErrorBoundary } from '../components/ErrorBoundary';
import { useBackendHealth } from '../hooks/useBackendHealth';
import { useAuthStore } from '../store';
import { ThemeProvider, useTheme } from '../theme/ThemeContext';

const textInputWithDefaults = TextInput as typeof TextInput & {
  defaultProps?: Partial<TextInputProps>;
};

textInputWithDefaults.defaultProps = {
  ...textInputWithDefaults.defaultProps,
  autoCapitalize: 'none',
  autoCorrect: false,
  spellCheck: false,
  smartInsertDelete: false,
};

export default function RootLayout() {
  return (
    <ThemeProvider>
      <RootLayoutInner />
    </ThemeProvider>
  );
}

function RootLayoutInner() {
  useBackendHealth();

  const { colors } = useTheme();
  const isAuthenticated = useAuthStore((s) => s.accessToken !== null);
  const sessionExpired = useAuthStore((s) => s.sessionExpired);
  const clearSessionExpired = useAuthStore((s) => s.clearSessionExpired);
  const logout = useAuthStore((s) => s.logout);
  const revalidate = useAuthStore((s) => s.revalidate);
  const segments = useSegments();
  const router = useRouter();

  const [hydrated, setHydrated] = useState(false);
  // Guard so the session-expired alert is shown at most once per expiry event.
  const sessionAlertShown = useRef(false);

  // ── Hydration ───────────────────────────────────────────────────────────────
  useEffect(() => {
    const store = useAuthStore as any;

    function onHydrated() {
      setHydrated(true);
      revalidate();
    }

    if (store.persist?.hasHydrated?.()) {
      onHydrated();
    } else {
      const unsub = store.persist?.onFinishHydration?.(onHydrated) as
        | (() => void)
        | undefined;
      return () => unsub?.();
    }
  }, [revalidate]);

  // ── Route guard ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!hydrated) return;
    const inAuthGroup = segments[0] === '(auth)';
    if (!isAuthenticated && !inAuthGroup) {
      router.replace('/(auth)/login');
    } else if (isAuthenticated && inAuthGroup) {
      router.replace('/(tabs)');
    }
  }, [isAuthenticated, hydrated, segments, router]);

  // ── Session-expired global handler ──────────────────────────────────────────
  // Shown once whenever the refresh token is expired/revoked.  The user taps
  // "Sign In" and is sent to the login screen.  Raw "Unauthorized" / "JWT
  // expired" strings never reach any individual screen.
  useEffect(() => {
    if (!sessionExpired || sessionAlertShown.current) return;
    const inAuthGroup = segments[0] === '(auth)';
    if (inAuthGroup) {
      clearSessionExpired();
      return;
    }
    sessionAlertShown.current = true;

    Alert.alert(
      'Session Expired',
      'Your session has expired. Please sign in again to continue.',
      [
        {
          text: 'Sign In Again',
          onPress: () => {
            sessionAlertShown.current = false;
            clearSessionExpired();
            logout();
            router.replace('/(auth)/login');
          },
        },
      ],
      { cancelable: false },
    );
  }, [sessionExpired, clearSessionExpired, logout, router, segments]);

  // ── Loading splash ──────────────────────────────────────────────────────────
  if (!hydrated) {
    return (
      <SafeAreaProvider>
        <View
          style={{
            flex: 1,
            backgroundColor: colors.background,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <ActivityIndicator size="large" color={colors.accentCyan} />
        </View>
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <ErrorBoundary>
          <Stack screenOptions={{ headerShown: false }} />
        </ErrorBoundary>
      </GestureHandlerRootView>
    </SafeAreaProvider>
  );
}
