import { useEffect } from "react";
import { Tabs, useRouter } from "expo-router";
import { SymbolView } from "expo-symbols";
import type { SFSymbol } from "sf-symbols-typescript";

import { useAuthStore, useNotificationsStore } from "../../store";
import { useTheme } from "../../theme/ThemeContext";

type TabIconProps = {
  name: SFSymbol;
  color: string;
};

function TabIcon({ name, color }: TabIconProps) {
  return (
    <SymbolView
      name={name}
      size={25}
      tintColor={color}
      resizeMode="scaleAspectFit"
    />
  );
}

export default function TabsLayout() {
  const { colors } = useTheme();
  const isAuthenticated = useAuthStore((s) => s.accessToken !== null);
  const accessToken = useAuthStore((s) => s.accessToken);
  const router = useRouter();
  const fetchNotifications = useNotificationsStore((s) => s.fetchNotifications);

  useEffect(() => {
    if (accessToken) fetchNotifications(accessToken);
  }, [accessToken, fetchNotifications]);

  // Secondary guard: root _layout.tsx is the primary gatekeeper, but this
  // catches any edge-case (e.g., deep-link into a tab while unauthenticated).
  useEffect(() => {
    if (!isAuthenticated) {
      router.replace("/(auth)/login");
    }
  }, [isAuthenticated, router]);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.surfaceDark,
          borderTopColor: `${colors.accentCyan}22`,
          borderTopWidth: 1,
          height: 92,
          paddingBottom: 24,
          paddingTop: 12,
          paddingHorizontal: 6,
        },
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: "700",
          marginTop: 5,
        },
        tabBarItemStyle: {
          paddingVertical: 4,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ color }) => (
            <TabIcon name="square.grid.2x2" color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="autonomy"
        options={{
          title: "Autonomy",
          tabBarIcon: ({ color }) => (
            <TabIcon name="sparkles" color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="goals"
        options={{
          title: "Goals",
          tabBarIcon: ({ color }) => (
            <TabIcon name="target" color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="tasks"
        options={{
          title: "Tasks",
          tabBarIcon: ({ color }) => (
            <TabIcon name="checklist" color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="calendar"
        options={{
          title: "Calendar",
          tabBarIcon: ({ color }) => (
            <TabIcon name="calendar" color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="more"
        options={{
          title: "More",
          tabBarIcon: ({ color }) => (
            <TabIcon name="ellipsis.circle" color={color} />
          ),
        }}
      />

      {/* Secondary screens — reachable from More, hidden from the bottom bar. */}
      <Tabs.Screen
        name="analytics"
        options={{
          href: null,
          title: "Analytics",
        }}
      />

      <Tabs.Screen
        name="agents"
        options={{
          href: null,
          title: "Agents",
        }}
      />

      <Tabs.Screen
        name="assistant"
        options={{
          href: null,
          title: "Assistant",
        }}
      />

      <Tabs.Screen
        name="email"
        options={{
          href: null,
          title: "Email",
        }}
      />

      <Tabs.Screen
        name="memory"
        options={{
          href: null,
          title: "Memory",
        }}
      />

      <Tabs.Screen
        name="notifications"
        options={{
          href: null,
          title: "Queue",
        }}
      />

      <Tabs.Screen
        name="profile"
        options={{
          href: null,
          title: "Profile",
        }}
      />

      <Tabs.Screen
        name="integrations"
        options={{
          href: null,
          title: "Integrations",
        }}
      />
    </Tabs>
  );
}
