import React, { useEffect, useMemo, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Easing, Platform, StyleSheet, Text, View } from "react-native";
import * as Haptics from "expo-haptics";

import { useTheme } from "../theme/ThemeContext";
import HeliosEnergyCore from "./HeliosEnergyCore";
import { getLaunchExperiencePlan } from "./launchExperienceTiming";

let launchExperienceReserved = false;

type Props = {
  onComplete?: () => void;
};

function reserveColdLaunchPlayback(): boolean {
  if (launchExperienceReserved) return false;
  launchExperienceReserved = true;
  return true;
}

export function resetLaunchExperienceForTests() {
  launchExperienceReserved = false;
}

export default function LaunchExperience({ onComplete }: Props) {
  const { colors } = useTheme();
  const shouldPlay = useRef(reserveColdLaunchPlayback()).current;
  const [visible, setVisible] = useState(shouldPlay);
  const [reducedMotion, setReducedMotion] = useState<boolean | null>(null);

  const overlayOpacity = useRef(new Animated.Value(1)).current;
  const pointOpacity = useRef(new Animated.Value(0)).current;
  const identityOpacity = useRef(new Animated.Value(0)).current;
  const coreOpacity = useRef(new Animated.Value(0)).current;
  const glowOpacity = useRef(new Animated.Value(0)).current;
  const pulseOpacity = useRef(new Animated.Value(0)).current;
  const pulseScale = useRef(new Animated.Value(0.92)).current;
  const hapticPlayed = useRef(false);

  const plan = useMemo(
    () => getLaunchExperiencePlan(reducedMotion ?? false),
    [reducedMotion],
  );

  useEffect(() => {
    if (!shouldPlay) return undefined;

    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (mounted) setReducedMotion(enabled);
      })
      .catch(() => {
        if (mounted) setReducedMotion(false);
      });

    return () => {
      mounted = false;
    };
  }, [shouldPlay]);

  useEffect(() => {
    if (!visible || reducedMotion === null) return undefined;

    function finish() {
      setVisible(false);
      onComplete?.();
    }

    function triggerHaptic() {
      if (hapticPlayed.current || !plan.shouldHaptic || Platform.OS !== "ios") return;
      hapticPlayed.current = true;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }

    const reveal = Animated.timing(overlayOpacity, {
      toValue: 0,
      duration: plan.revealMs,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });

    const animation = reducedMotion
      ? Animated.parallel([
          Animated.sequence([
            Animated.delay(plan.wakeMs),
            Animated.timing(pointOpacity, {
              toValue: 1,
              duration: plan.pointFadeMs,
              easing: Easing.out(Easing.cubic),
              useNativeDriver: true,
            }),
          ]),
          Animated.sequence([
            Animated.delay(plan.wakeMs + plan.pointFadeMs),
            Animated.timing(identityOpacity, {
              toValue: 1,
              duration: plan.identityFadeMs,
              easing: Easing.out(Easing.cubic),
              useNativeDriver: true,
            }),
          ]),
          Animated.sequence([Animated.delay(plan.revealDelayMs), reveal]),
        ])
      : Animated.parallel([
          Animated.sequence([
            Animated.delay(plan.wakeMs),
            Animated.timing(pointOpacity, {
              toValue: 1,
              duration: plan.pointFadeMs,
              easing: Easing.out(Easing.cubic),
              useNativeDriver: true,
            }),
          ]),
          Animated.sequence([
            Animated.delay(plan.wakeMs + plan.pointFadeMs),
            Animated.timing(identityOpacity, {
              toValue: 1,
              duration: plan.identityFadeMs,
              easing: Easing.out(Easing.cubic),
              useNativeDriver: true,
            }),
          ]),
          Animated.sequence([
            Animated.delay(plan.wakeMs + plan.pointFadeMs + 90),
            Animated.timing(coreOpacity, {
              toValue: 1,
              duration: plan.coreFadeMs,
              easing: Easing.out(Easing.cubic),
              useNativeDriver: true,
            }),
          ]),
          Animated.sequence([
            Animated.delay(plan.pulseDelayMs - plan.glowBuildMs),
            Animated.timing(glowOpacity, {
              toValue: 1,
              duration: plan.glowBuildMs,
              easing: Easing.inOut(Easing.cubic),
              useNativeDriver: true,
            }),
          ]),
          Animated.sequence([
            Animated.delay(plan.pulseDelayMs),
            Animated.parallel([
              Animated.sequence([
                Animated.timing(pulseOpacity, {
                  toValue: 1,
                  duration: plan.pulseMs * 0.36,
                  easing: Easing.out(Easing.cubic),
                  useNativeDriver: true,
                }),
                Animated.timing(pulseOpacity, {
                  toValue: 0,
                  duration: plan.pulseMs * 0.64,
                  easing: Easing.out(Easing.cubic),
                  useNativeDriver: true,
                }),
              ]),
              Animated.timing(pulseScale, {
                toValue: 1,
                duration: plan.pulseMs,
                easing: Easing.out(Easing.cubic),
                useNativeDriver: true,
              }),
            ]),
          ]),
          Animated.sequence([Animated.delay(plan.revealDelayMs), reveal]),
        ]);

    const hapticTimer = plan.shouldHaptic
      ? setTimeout(triggerHaptic, plan.pulseDelayMs)
      : undefined;

    animation.start(({ finished }) => {
      if (finished) finish();
    });

    return () => {
      if (hapticTimer) clearTimeout(hapticTimer);
      animation.stop();
    };
  }, [
    coreOpacity,
    glowOpacity,
    identityOpacity,
    onComplete,
    overlayOpacity,
    plan,
    pointOpacity,
    pulseOpacity,
    pulseScale,
    reducedMotion,
    visible,
  ]);

  if (!visible) return null;

  const coreScale = coreOpacity.interpolate({
    inputRange: [0, 1],
    outputRange: [0.985, 1],
  });

  const pulseRingScale = pulseScale.interpolate({
    inputRange: [0.92, 1],
    outputRange: [0.88, 1.42],
  });

  const pulseRingOpacity = pulseOpacity.interpolate({
    inputRange: [0, 0.36, 1],
    outputRange: [0, 0.28, 0],
  });

  return (
    <Animated.View
      pointerEvents="auto"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.overlay, { opacity: overlayOpacity }]}
    >
      <View style={styles.centerStage}>
        <Animated.View
          pointerEvents="none"
          style={[
            styles.ambientGlow,
            {
              opacity: glowOpacity,
              shadowColor: colors.accent,
            },
          ]}
        />

        {reducedMotion ? (
          <Animated.View style={[styles.reducedCore, { opacity: identityOpacity }]}>
            <View style={[styles.reducedPoint, { backgroundColor: colors.accent }]} />
            <Text style={styles.reducedH}>H</Text>
          </Animated.View>
        ) : (
          <>
            <Animated.View
              pointerEvents="none"
              style={[
                styles.pulseRing,
                {
                  borderColor: colors.accentCyan,
                  opacity: pulseRingOpacity,
                  transform: [{ scale: pulseRingScale }],
                },
              ]}
            />
            <Animated.View
              style={[
                styles.coreWrap,
                {
                  opacity: coreOpacity,
                  transform: [{ scale: coreScale }],
                },
              ]}
            >
              <HeliosEnergyCore
                size={176}
                state="idle"
                showParticles={false}
                interactive={false}
                glowInset={12}
                forceDark
                accessibilityLabel="HELIOS waking up"
              />
            </Animated.View>
            <Animated.View
              pointerEvents="none"
              style={[styles.point, { backgroundColor: colors.accent, opacity: pointOpacity }]}
            />
            <Animated.Text
              pointerEvents="none"
              style={[styles.identity, { opacity: identityOpacity }]}
            >
              H
            </Animated.Text>
          </>
        )}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#000000",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1000,
  },
  centerStage: {
    width: 260,
    height: 260,
    alignItems: "center",
    justifyContent: "center",
  },
  ambientGlow: {
    position: "absolute",
    width: 172,
    height: 172,
    borderRadius: 86,
    backgroundColor: "rgba(168, 85, 247, 0.08)",
    shadowOpacity: 0.38,
    shadowRadius: 34,
    shadowOffset: { width: 0, height: 0 },
  },
  coreWrap: {
    alignItems: "center",
    justifyContent: "center",
  },
  point: {
    position: "absolute",
    width: 6,
    height: 6,
    borderRadius: 3,
    shadowColor: "#a855f7",
    shadowOpacity: 0.9,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
  },
  identity: {
    position: "absolute",
    color: "#ffffff",
    fontSize: 38,
    lineHeight: 42,
    fontWeight: "900",
    letterSpacing: 0,
  },
  pulseRing: {
    position: "absolute",
    width: 172,
    height: 172,
    borderRadius: 86,
    borderWidth: 1,
    shadowColor: "#22d3ee",
    shadowOpacity: 0.24,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 0 },
  },
  reducedCore: {
    width: 96,
    height: 96,
    alignItems: "center",
    justifyContent: "center",
  },
  reducedPoint: {
    position: "absolute",
    width: 8,
    height: 8,
    borderRadius: 4,
    opacity: 0.72,
  },
  reducedH: {
    color: "#ffffff",
    fontSize: 36,
    lineHeight: 40,
    fontWeight: "900",
    letterSpacing: 0,
  },
});
