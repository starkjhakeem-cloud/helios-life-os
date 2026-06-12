import { useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ErrorBoundary } from '../components/ErrorBoundary';
import { useBackendHealth } from '../hooks/useBackendHealth';
import { useAuthStore } from '../store';
import { ThemeProvider, useTheme } from '../theme/ThemeContext';

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
  const revalidate = useAuthStore((s) => s.revalidate);
  const segments = useSegments();
  const router = useRouter();

  const [hydrated, setHydrated] = useState(false);

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

  useEffect(() => {
    if (!hydrated) return;

    const inAuthGroup = segments[0] === '(auth)';
    if (!isAuthenticated && !inAuthGroup) {
      router.replace('/(auth)/login');
    } else if (isAuthenticated && inAuthGroup) {
      router.replace('/(tabs)');
    }
  }, [isAuthenticated, hydrated, segments, router]);

  if (!hydrated) {
    return (
      <SafeAreaProvider>
        <View style={{ flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={colors.accentCyan} />
        </View>
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <Stack screenOptions={{ headerShown: false }} />
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
