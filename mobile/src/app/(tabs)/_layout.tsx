import { useEffect } from "react";
import { Tabs, useRouter } from "expo-router";
import { SymbolView } from "expo-symbols";
import type { SFSymbol } from "sf-symbols-typescript";

import { useAuthStore } from "../../store";
import { colors } from "../../theme/theme";

type TabIconProps = {
  name: SFSymbol;
  color: string;
};

function TabIcon({ name, color }: TabIconProps) {
  return (
    <SymbolView
      name={name}
      size={22}
      tintColor={color}
      resizeMode="scaleAspectFit"
    />
  );
}

export default function TabsLayout() {
  const isAuthenticated = useAuthStore((s) => s.accessToken !== null);
  const router = useRouter();

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
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          height: 80,
          paddingBottom: 20,
          paddingTop: 10,
        },
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: "600",
          marginTop: 2,
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
        name="analytics"
        options={{
          title: "Analytics",
          tabBarIcon: ({ color }) => (
            <TabIcon name="chart.bar" color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="agents"
        options={{
          title: "Agents",
          tabBarIcon: ({ color }) => (
            <TabIcon name="cpu" color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="assistant"
        options={{
          title: "Assistant",
          tabBarIcon: ({ color }) => (
            <TabIcon name="bubble.left.and.bubble.right" color={color} />
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
        name="memory"
        options={{
          title: "Memory",
          tabBarIcon: ({ color }) => (
            <TabIcon name="brain.head.profile" color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ color }) => (
            <TabIcon name="person.crop.circle" color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
