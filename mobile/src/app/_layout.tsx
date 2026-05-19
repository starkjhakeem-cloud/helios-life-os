import { useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { useBackendHealth } from '../hooks/useBackendHealth';
import { useAuthStore } from '../store';
import { colors } from '../theme/theme';

export default function RootLayout() {
  useBackendHealth();

  // Derived: authenticated when a token is present in the store.
  const isAuthenticated = useAuthStore((s) => s.accessToken !== null);
  const revalidate = useAuthStore((s) => s.revalidate);
  const segments = useSegments();
  const router = useRouter();

  // Tracks whether zustand-persist has finished reading from AsyncStorage.
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    // Zustand persist exposes a .persist API on the store instance.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const store = useAuthStore as any;

    function onHydrated() {
      setHydrated(true);
      // Silently validate the persisted token. If expired, revalidate()
      // clears the session and the routing effect below redirects to login.
      revalidate();
    }

    if (store.persist?.hasHydrated?.()) {
      // Rehydration already completed before this effect ran (fast path).
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

  // Show a minimal splash while AsyncStorage is being read.
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
      <Stack screenOptions={{ headerShown: false }} />
    </SafeAreaProvider>
  );
}
