import { useEffect, useRef } from "react";
import {
  Animated,
  Easing,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import { Tabs, useRouter } from "expo-router";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";

import { useAuthStore, useNotificationsStore } from "../../store";
import { useTheme } from "../../theme/ThemeContext";
import { HeliosIcon, type HeliosIconName } from "../../components/HeliosIcons";
import HeliosEnergyCore from "../../components/HeliosEnergyCore";

// HELIOS NAVIGATION PILL DESIGN LOCK
//
// This bottom navigation is an approved HELIOS design-system component.
// Do not change pill dimensions, tab order, icon size, Assistant positioning,
// label baseline, divider placement, active indicator, or spacing unless the
// navigation pill is explicitly being redesigned.

// ── Tab definitions — order is permanent ─────────────────────────────────────

const TABS: readonly { name: string; label: string; icon: HeliosIconName }[] = [
  { name: "index",     label: "Home",      icon: "home"      },
  { name: "assistant", label: "Assistant", icon: "assistant" },
  { name: "goals",     label: "Goals",     icon: "goals"     },
  { name: "tasks",     label: "Tasks",     icon: "tasks"     },
  { name: "calendar",  label: "Calendar",  icon: "calendar"  },
  { name: "more",      label: "More",      icon: "more"      },
];

const ICON_SIZE      = 26; // LOCKED
const TAB_ROW_HEIGHT = 82; // LOCKED
const PILL_W         = 27; // LOCKED
const PILL_H         = 3;  // LOCKED
const FADE_MS        = 200;

// ── Custom tab bar ────────────────────────────────────────────────────────────

function HeliosTabBar({ state, navigation, insets }: BottomTabBarProps) {
  const { colors, isDark } = useTheme();

  const routes = TABS
    .map(tab => state.routes.find(r => r.name === tab.name))
    .filter((r): r is (typeof state.routes)[number] => r !== undefined);

  const activeKey = state.routes[state.index]?.key;

  // One Animated.Value per route: 0 = inactive, 1 = active.
  // Opacity-only — runs on the native driver.
  const animMap = useRef<Record<string, Animated.Value>>({});
  routes.forEach(route => {
    if (!animMap.current[route.key]) {
      animMap.current[route.key] = new Animated.Value(
        route.key === activeKey ? 1 : 0,
      );
    }
  });

  useEffect(() => {
    Animated.parallel(
      routes.map(route =>
        Animated.timing(animMap.current[route.key], {
          toValue: route.key === activeKey ? 1 : 0,
          duration: FADE_MS,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ),
    ).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeKey]);

  return (
    <View
      style={[
        s.bar,
        {
          backgroundColor: isDark ? colors.tabBar : colors.navGlass,
          bottom: insets.bottom + 10,
          borderWidth: isDark ? 0 : 1,
          borderColor: isDark ? colors.tabBarBorder : colors.primaryBorder,
          shadowColor: isDark ? "#000" : colors.shadow,
          shadowOpacity: isDark ? 0.28 : 0.14,
          shadowRadius: isDark ? 22 : 32,
          shadowOffset: { width: 0, height: isDark ? 10 : 18 },
        },
      ]}
    >
      {!isDark ? <View pointerEvents="none" style={s.lightPillHighlight} /> : null}
      {/* ── Pill indicator layer ──────────────────────────────────────────── */}
      <View style={s.pillLayer} pointerEvents="none">
        {routes.map(route => {
          const anim = animMap.current[route.key];
          return (
            <View key={route.key} style={s.pillCell}>
              <Animated.View
                style={[
                  s.pill,
                  {
                    backgroundColor: colors.tabBarActive,
                    shadowColor:     colors.tabBarActive,
                    opacity:         anim,
                  },
                ]}
              />
            </View>
          );
        })}
      </View>

      {/* ── Tab row ──────────────────────────────────────────────────────── */}
      <View style={s.row}>
        {routes.map((route, index) => {
          const tab         = TABS[index];
          const anim        = animMap.current[route.key];
          const isAssistant = tab.name === "assistant";

          const dimOpacity = anim.interpolate({
            inputRange:  [0, 1],
            outputRange: [1, 0],
          });

          const onPress = () => {
            const event = navigation.emit({
              type: "tabPress",
              target: route.key,
              canPreventDefault: true,
            });
            if (route.key !== activeKey && !event.defaultPrevented) {
              navigation.navigate(route.name as never);
            }
          };

          // Two Animated.Text layers stacked — inactive fades out, active in.
          // labelStack stretches to the full cell width so the absolute overlay
          // centers correctly regardless of label string length.
          const LabelLayers = (
            <View style={s.labelStack}>
              <Animated.Text
                style={[s.label, { color: colors.tabBarInactive, opacity: dimOpacity }]}
                numberOfLines={1}
              >
                {tab.label}
              </Animated.Text>
              <Animated.Text
                style={[s.label, s.labelActiveOverlay, { color: colors.tabBarActive, opacity: anim }]}
                numberOfLines={1}
              >
                {tab.label}
              </Animated.Text>
            </View>
          );

          return (
            <TouchableOpacity
              key={route.key}
              style={isAssistant ? s.assistantTabItem : s.tabItem}
              onPress={onPress}
              onLongPress={() =>
                navigation.emit({ type: "tabLongPress", target: route.key })
              }
              activeOpacity={0.75}
              accessibilityRole="tab"
              accessibilityState={{ selected: route.key === activeKey }}
              accessibilityLabel={tab.label}
            >
              {index > 0 && (
                <View style={[s.sep, isAssistant && { top: 22 }]} />
              )}

              {isAssistant ? (
                <>
                  <View style={s.assistantIconNudge}>
                    <HeliosEnergyCore size={56} state="idle" interactive={false} glowInset={4} />
                  </View>
                  {/* Label pinned to match the baseline of other tab labels */}
                  <View style={s.assistantLabelWrap}>{LabelLayers}</View>
                </>
              ) : (
                <>
                  {/* Two icon layers crossfade — active fades over inactive */}
                  <View style={s.iconWrap}>
                    <Animated.View style={{ opacity: dimOpacity }}>
                      <HeliosIcon name={tab.icon} color={colors.tabBarInactive} size={ICON_SIZE} />
                    </Animated.View>
                    <Animated.View style={[StyleSheet.absoluteFillObject, { opacity: anim }]}>
                      <HeliosIcon name={tab.icon} color={colors.tabBarActive} size={ICON_SIZE} />
                    </Animated.View>
                  </View>
                  {LabelLayers}
                </>
              )}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  // LOCKED DESIGN CONTRACT
  // The values below define the approved HELIOS navigation pill. Keep visual
  // adjustments in protected icon assets, not by moving or scaling the tab bar.

  // ── Floating pill ──────────────────────────────────────────────────────────
  // No overflow:"hidden" — it would clip the Energy Core's blurred glow layers.
  // borderRadius alone is enough to clip the background fill to a capsule.
  bar: {
    position: "absolute",
    left: 10,
    right: 10,
    borderRadius: 41,
    elevation: 20,
  },
  lightPillHighlight: {
    position: "absolute",
    top: 1,
    left: 18,
    right: 18,
    height: 1,
    backgroundColor: "rgba(255,255,255,0.92)",
    borderRadius: 1,
  },

  // ── Pill indicator ─────────────────────────────────────────────────────────
  // paddingHorizontal + gap must mirror the row exactly — the dot needs to
  // center over its tab item at any pill width.
  pillLayer: {
    position: "absolute",
    top: 0, left: 0, right: 0,
    height: PILL_H,
    flexDirection: "row",
    paddingHorizontal: 8,
    gap: 8,
  },
  pillCell: { flex: 1, alignItems: "center" },
  pill: {
    width: PILL_W,
    height: PILL_H,
    borderRadius: PILL_H / 2,
    shadowOpacity: 0.85,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },

  // ── Tab row ────────────────────────────────────────────────────────────────
  // paddingHorizontal === gap (8) so left-edge → first icon, icon → icon, and
  // last icon → right-edge are all the same distance — equal on every side.
  row: {
    flexDirection: "row",
    height: TAB_ROW_HEIGHT,
    paddingHorizontal: 8,
    gap: 8,
  },

  // Icons start at y = 16; labels follow at y = 16 + 26 + 10 = 52.
  tabItem: {
    flex: 1,
    alignItems: "center",
    justifyContent: "flex-start",
    paddingTop: 16,
    gap: 10,
  },

  // LOCKED — Energy Core position. Do not adjust without design approval.
  // marginTop: -8 raises the oversized artwork to visually align with other icons.
  assistantTabItem: {
    flex: 1,
    alignItems: "center",
    justifyContent: "flex-start",
    paddingTop: 0,
    marginTop: -8,
    gap: 10,
  },
  assistantIconNudge: {
    transform: [{ translateY: 5 }],
  },

  // Pins the Assistant label to the same baseline as all other tab labels.
  // y_label = paddingTop(16) + icon(26) + gap(10) = 52
  // bottom  = TAB_ROW_HEIGHT(82) − y_label(52) − labelHeight(13) = 17
  assistantLabelWrap: {
    position: "absolute",
    bottom: 17,
    left: 0,
    right: 0,
    alignItems: "center",
  },

  // ── Dividers ───────────────────────────────────────────────────────────────
  // left: -4 = half of gap(8) — centers the line in the inter-item space.
  // 25% white: visible enough to organize, quiet enough to recede.
  sep: {
    position: "absolute",
    left: -4,
    top: 14,
    width: 1,
    height: 50,
    backgroundColor: "rgba(255,255,255,0.35)",
  },

  // ── Icon crossfade ─────────────────────────────────────────────────────────
  iconWrap: {
    width:  ICON_SIZE,
    height: ICON_SIZE,
  },

  // ── Label crossfade ────────────────────────────────────────────────────────
  // alignSelf:"stretch" makes the stack span the full cell width so the
  // absolute overlay can use left:0/right:0 and textAlign:"center" to stay
  // optically centered for any label length (Home, Calendar, More, etc.)
  labelStack: {
    alignSelf: "stretch",
    alignItems: "center",
  },
  labelActiveOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    textAlign: "center",
    fontWeight: "600",
  },

  label: {
    fontSize: 11,
    letterSpacing: 0.1,
    fontWeight: "400",
    textAlign: "center",
  },
});

// ── Layout root ───────────────────────────────────────────────────────────────

export default function TabsLayout() {
  const isAuthenticated    = useAuthStore((s) => s.accessToken !== null);
  const accessToken        = useAuthStore((s) => s.accessToken);
  const router             = useRouter();
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
      tabBar={(props) => <HeliosTabBar {...props} />}
      screenOptions={{ headerShown: false }}
    >
      <Tabs.Screen name="index"     options={{ title: "Home" }} />
      <Tabs.Screen name="assistant" options={{ title: "Assistant" }} />
      <Tabs.Screen name="goals"     options={{ title: "Goals" }} />
      <Tabs.Screen name="tasks"     options={{ title: "Tasks" }} />
      <Tabs.Screen name="calendar"  options={{ title: "Calendar" }} />
      <Tabs.Screen name="more"      options={{ title: "More" }} />

      <Tabs.Screen name="analytics"             options={{ href: null, title: "Analytics" }} />
      <Tabs.Screen name="agents"                options={{ href: null, title: "Agents" }} />
      <Tabs.Screen name="autonomy"              options={{ href: null, title: "Smart Automations" }} />
      <Tabs.Screen name="assistant-settings"    options={{ href: null, title: "Assistant Settings" }} />
      <Tabs.Screen name="assistant-permissions" options={{ href: null, title: "Assistant Permissions" }} />
      <Tabs.Screen name="developer-options"     options={{ href: null, title: "Developer Options" }} />
      <Tabs.Screen name="audit-log"             options={{ href: null, title: "Audit Log" }} />
      <Tabs.Screen name="email"                 options={{ href: null, title: "Email" }} />
      <Tabs.Screen name="memory"                options={{ href: null, title: "Memory" }} />
      <Tabs.Screen name="notifications"         options={{ href: null, title: "Queue" }} />
      <Tabs.Screen name="profile"               options={{ href: null, title: "Profile" }} />
      <Tabs.Screen name="integrations"          options={{ href: null, title: "Integrations" }} />
      <Tabs.Screen name="life-area"             options={{ href: null, title: "Life Area" }} />
      <Tabs.Screen name="change-password"       options={{ href: null, title: "Change Password" }} />
      <Tabs.Screen name="change-email"          options={{ href: null, title: "Change Email" }} />
    </Tabs>
  );
}
