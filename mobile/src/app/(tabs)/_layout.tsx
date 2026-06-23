import { useEffect } from "react";
import { Tabs, useRouter } from "expo-router";
import { SymbolView } from "expo-symbols";
import type { SymbolViewProps } from "expo-symbols";

import { useAuthStore, useNotificationsStore } from "../../store";
import { useTheme } from "../../theme/ThemeContext";

type TabIconProps = {
  name: SymbolViewProps["name"];
  color: string;
};

function TabIcon({ name, color }: TabIconProps) {
  return (
    <SymbolView
      name={name}
      size={29}
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
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: colors.tabBar,
          borderTopColor: colors.tabBarBorder,
          borderTopWidth: 1,
          borderColor: "transparent",
          borderWidth: 0,
          borderRadius: 0,
          height: 106,
          paddingBottom: 28,
          paddingTop: 13,
          paddingHorizontal: 10,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: -10 },
          shadowOpacity: 0.28,
          shadowRadius: 18,
        },
        tabBarActiveTintColor: colors.tabBarActive,
        tabBarInactiveTintColor: colors.tabBarInactive,
        tabBarLabelStyle: {
          fontSize: 11.5,
          fontWeight: "800",
          marginTop: 6,
        },
        tabBarItemStyle: {
          paddingVertical: 2,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ color }) => (
            <TabIcon name="house" color={color} />
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
        name="assistant-settings"
        options={{
          href: null,
          title: "Assistant Settings",
        }}
      />

      <Tabs.Screen
        name="assistant-permissions"
        options={{
          href: null,
          title: "Assistant Permissions",
        }}
      />

      <Tabs.Screen
        name="developer-options"
        options={{
          href: null,
          title: "Developer Options",
        }}
      />

      <Tabs.Screen
        name="audit-log"
        options={{
          href: null,
          title: "Audit Log",
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
