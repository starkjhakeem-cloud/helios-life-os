import React, { memo, useCallback, useEffect, useMemo, useRef } from "react";
import {
  Alert,
  Animated,
  Easing,
  Image,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import * as Haptics from "expo-haptics";
import { useTheme } from "../theme/ThemeContext";

export type CoreState =
  | "idle"
  | "thinking"
  | "generating"
  | "listening"
  | "speaking"
  | "attention"
  | "critical"
  | "offline";

type Props = {
  size?: number;
  state?: CoreState;
  showParticles?: boolean;
  interactive?: boolean;
  glowInset?: number;
  onPress?: () => void;
  onLongPress?: () => void;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  forceDark?: boolean;
};

const APPROVED_CORE  = require("../../assets/design/branding/helios-energy-core-transparent.png");
const APPROVED_WAVES = require("../../assets/design/branding/helios-energy-core-waves.png");
const ARTWORK_ASPECT_RATIO = 434 / 400;
const GLOW_INSET = 10;

// ── Per-state speed tables ────────────────────────────────────────────────────
//
// OUTER and COUNTER use irrational ratios (√2 ≈ 1.414) so the two rings
// never fully re-align within any observable timeframe.

const OUTER_SPEED: Record<CoreState, number> = {
  idle:       26000,
  thinking:   13500,
  generating: 10200,
  listening:  17000,
  speaking:   14800,
  attention:  15500,
  critical:    7800,
  offline:    42000,
};

const COUNTER_SPEED: Record<CoreState, number> = {
  idle:       18400,
  thinking:    9500,
  generating:  7200,
  listening:  12000,
  speaking:   10500,
  attention:  11000,
  critical:    5500,
  offline:    30000,
};

const PULSE_SPEED: Record<CoreState, number> = {
  idle:       4350,   // half-cycle; full breath = 8700ms
  thinking:   2700,
  generating: 2250,
  listening:  3750,
  speaking:   3000,
  attention:  3300,
  critical:   2100,
  offline:    7500,
};

const RING_GLOW_SPEED: Record<CoreState, number> = {
  idle:        4550,  // half-cycle; full breath = 9100ms
  thinking:    2500,
  generating:  2000,
  listening:   1100,
  speaking:    2200,
  attention:   3000,
  critical:    1500,
  offline:     7000,
};

const RING_GLOW_RANGE: Record<CoreState, [number, number]> = {
  idle:       [0.72, 0.95],
  thinking:   [0.85, 1.00],
  generating: [0.90, 1.00],
  listening:  [0.75, 0.95],
  speaking:   [0.78, 1.00],
  attention:  [0.82, 1.00],
  critical:   [0.92, 1.00],
  offline:    [0.50, 0.65],
};

// ── Helper: read internal value without subscribing ───────────────────────────

function getVal(v: Animated.Value): number {
  return (v as unknown as { _value?: number })?._value ?? 0;
}

// ── Smooth spin restart ───────────────────────────────────────────────────────
//
// On state change we must NOT setValue(0). Instead:
//   1. Let the animation finish its current partial arc (proportional duration).
//   2. Silently reset to 0 (visually identical — 360° = 0°).
//   3. Loop at the new speed.
//
// On first start we skip the partial-arc step.

function smartSpin(
  value: Animated.Value,
  ref: React.MutableRefObject<Animated.CompositeAnimation | null>,
  duration: number,
  first: boolean,
) {
  ref.current?.stop();

  function loop() {
    ref.current = Animated.loop(
      Animated.timing(value, {
        toValue: 1,
        duration,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    ref.current.start();
  }

  if (first) {
    loop();
    return;
  }

  const v         = getVal(value);
  const remaining = 1 - v;

  if (remaining < 0.015) {
    // Already at end of cycle — clean handoff
    value.setValue(0);
    loop();
    return;
  }

  // Proportional arc to reach exactly 360° (= 0°), then continue at new speed
  Animated.timing(value, {
    toValue: 1,
    duration: remaining * duration,
    easing: Easing.linear,
    useNativeDriver: true,
  }).start(({ finished }) => {
    if (!finished) return;
    value.setValue(0); // 360° = 0° — no visual discontinuity
    loop();
  });
}

// ── Component ─────────────────────────────────────────────────────────────────

function HeliosEnergyCore({
  size = 142,
  state = "idle",
  interactive = true,
  glowInset,
  onPress,
  onLongPress,
  accessibilityLabel,
  accessibilityHint,
  forceDark,
}: Props) {
  const { isDark: themeIsDark } = useTheme();
  const isDark = forceDark ?? themeIsDark;
  const effectiveGlowInset = glowInset ?? GLOW_INSET;
  const artworkHeight      = size / ARTWORK_ASPECT_RATIO;
  const wrapperWidth       = size + effectiveGlowInset * 2;
  const wrapperHeight      = artworkHeight + effectiveGlowInset * 2;
  const centerSize         = Math.min(size, artworkHeight) * 0.48;
  const centerHSize        = centerSize * 0.62;

  // ── Animated values ─────────────────────────────────────────────────────────
  //
  // All values start at exactly 0. Animated.loop resets each child timing to
  // its _fromValue (the value at the moment start() was first called). If that
  // is anything other than 0, the loop snaps back to a non-zero angle on every
  // restart — a visible stutter every cycle. Starting at 0 means the reset is
  // 360°→0°, which is visually identical. Desynchronisation comes from the
  // irrational ratio between OUTER_SPEED and COUNTER_SPEED, not phase offsets.

  const spin1     = useRef(new Animated.Value(0)).current;
  const spin2     = useRef(new Animated.Value(0)).current;
  const pulse     = useRef(new Animated.Value(0)).current;
  const ringGlow  = useRef(new Animated.Value(0)).current;
  const floatAnim = useRef(new Animated.Value(0)).current;
  const touch     = useRef(new Animated.Value(0)).current;

  const spin1Ref    = useRef<Animated.CompositeAnimation | null>(null);
  const spin2Ref    = useRef<Animated.CompositeAnimation | null>(null);
  const pulseRef    = useRef<Animated.CompositeAnimation | null>(null);
  const ringGlowRef = useRef<Animated.CompositeAnimation | null>(null);
  const floatRef    = useRef<Animated.CompositeAnimation | null>(null);
  const isFirstRun  = useRef(true);

  // ── Float: one permanent loop, independent of state ─────────────────────────
  //
  // Duration (31s full cycle) is a non-integer multiple of every other duration,
  // so float never synchronises with orbital rings or the pulse.

  useEffect(() => {
    floatRef.current = Animated.loop(
      Animated.sequence([
        Animated.timing(floatAnim, {
          toValue: 1,
          duration: 15500,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(floatAnim, {
          toValue: 0,
          duration: 15500,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    floatRef.current.start();
    return () => floatRef.current?.stop();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Orbital + breath: smooth speed change on state transition ───────────────

  useEffect(() => {
    const first       = isFirstRun.current;
    isFirstRun.current = false;

    const outerDur   = OUTER_SPEED[state];
    const counterDur = COUNTER_SPEED[state];
    const pulseDur   = PULSE_SPEED[state];
    const glowDur    = RING_GLOW_SPEED[state];

    // Orbital rings: proportional-arc handoff (never setValue(0) mid-cycle)
    smartSpin(spin1, spin1Ref, outerDur, first);
    smartSpin(spin2, spin2Ref, counterDur, first);
    const spin1Loop = spin1Ref.current;
    const spin2Loop = spin2Ref.current;

    // Breath animations: stop and restart from current value — no hard reset.
    // ease-in-out at the extremes means the transition is imperceptible.
    pulseRef.current?.stop();
    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: pulseDur,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: pulseDur,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    pulseRef.current = pulseLoop;
    pulseLoop.start();

    ringGlowRef.current?.stop();
    const ringGlowLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(ringGlow, {
          toValue: 1,
          duration: glowDur,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(ringGlow, {
          toValue: 0,
          duration: glowDur,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    ringGlowRef.current = ringGlowLoop;
    ringGlowLoop.start();

    return () => {
      spin1Loop?.stop();
      spin2Loop?.stop();
      pulseLoop.stop();
      ringGlowLoop.stop();
    };
  }, [state]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Touch handlers ───────────────────────────────────────────────────────────

  const handlePress = useCallback(() => {
    if (Platform.OS === "ios") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    onPress?.();
  }, [onPress]);

  const handlePressIn = useCallback(() => {
    Animated.spring(touch, { toValue: 1, useNativeDriver: true, speed: 22, bounciness: 6 }).start();
  }, [touch]);

  const handlePressOut = useCallback(() => {
    Animated.spring(touch, { toValue: 0, useNativeDriver: true, speed: 18, bounciness: 5 }).start();
  }, [touch]);

  const handleLongPress = useCallback(() => {
    if (Platform.OS === "ios") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    if (onLongPress) onLongPress();
    else Alert.alert("HELIOS", "Voice mode coming soon.");
  }, [onLongPress]);

  // ── Derived interpolations ───────────────────────────────────────────────────
  //
  // Both orbital outputs are exact multiples of 360°, so the loop-restart
  // visual position (value snaps 1→0) maps identically — no jump.

  const rotate1 = useMemo(() =>
    spin1.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] }),
    [spin1],
  );

  const rotate2 = useMemo(() =>
    spin2.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "-360deg"] }),
    [spin2],
  );

  // Core breathe: 1.5% scale — perceptible only as a living quality, not motion
  const pulseScale = useMemo(() =>
    pulse.interpolate({ inputRange: [0, 1], outputRange: [1.0, 1.015] }),
    [pulse],
  );

  // Sharp ring opacity — rises on inhale, dims on exhale
  const pulseOpacity = useMemo(() =>
    pulse.interpolate({ inputRange: [0, 1], outputRange: [0.45, 0.72] }),
    [pulse],
  );

  // Ring glow bloom opacity — re-derived when state range changes
  const ringGlowOpacity = useMemo(() =>
    ringGlow.interpolate({ inputRange: [0, 1], outputRange: RING_GLOW_RANGE[state] }),
    [ringGlow, state],
  );

  // Vertical float: 3px up/down arc — never synchronised with orbital period
  const floatY = useMemo(() =>
    floatAnim.interpolate({ inputRange: [0, 1], outputRange: [0, -3] }),
    [floatAnim],
  );

  const touchScale = useMemo(() =>
    touch.interpolate({ inputRange: [0, 1], outputRange: [1, 1.018] }),
    [touch],
  );

  // ── Render ───────────────────────────────────────────────────────────────────

  const Container = interactive && (onPress || onLongPress) ? TouchableOpacity : View;
  const containerProps = interactive && (onPress || onLongPress)
    ? {
        onPress: handlePress,
        onPressIn: handlePressIn,
        onPressOut: handlePressOut,
        onLongPress: handleLongPress,
        activeOpacity: 0.92,
        accessibilityLabel: accessibilityLabel ?? "HELIOS energy core",
        accessibilityRole: "button" as const,
        accessibilityHint: accessibilityHint ?? "Tap to view assistant status. Long press for voice mode.",
      }
    : { accessibilityLabel: accessibilityLabel ?? "HELIOS energy core" };

  return (
    // collapsable={false} — required on every wrapper. Without it React Native
    // flattens invisible Views into their parent's native layer, removing the
    // compositing context that lets useNativeDriver animations render through
    // heroCard's overflow:hidden. This was why the red debug border worked —
    // a visible border prevented flattening. collapsable={false} does the same
    // without any visible style dependency.
    <View
      collapsable={false}
      style={[styles.outerWrapper, { width: wrapperWidth, height: wrapperHeight }]}
    >
      <Container
        // @ts-ignore — collapsable is valid on all host components
        collapsable={false}
        style={[styles.container, { width: size, height: artworkHeight }]}
        {...containerProps}
      >
        {/* All layers share the same core transform: touch press + pulse breathe + float.
            Individual wave layers only carry their own rotation — nothing else. */}
        <Animated.View
          collapsable={false}
          style={[
            styles.artworkFrame,
            {
              width: size,
              height: artworkHeight,
              transform: [
                { scale: touchScale },
                { scale: pulseScale },
                { translateY: floatY },
              ],
            },
          ]}
          pointerEvents="none"
        >
          {/* Static base — H stays perfectly still */}
          <Image
            source={APPROVED_CORE}
            style={[styles.image, { opacity: isDark ? 0.92 : 0.64 }]}
            resizeMode="contain"
            accessibilityIgnoresInvertColors
          />

          {!isDark && (
            <View style={styles.lightCenterLayer} pointerEvents="none">
              <View
                style={[
                  styles.lightCenterGlow,
                  {
                    width: centerSize * 1.36,
                    height: centerSize * 1.36,
                    borderRadius: centerSize * 0.68,
                  },
                ]}
              />
              <View
                style={[
                  styles.lightCenterOuter,
                  {
                    width: centerSize * 1.08,
                    height: centerSize * 1.08,
                    borderRadius: centerSize * 0.54,
                  },
                ]}
              />
              <View
                style={[
                  styles.lightCenterDisc,
                  {
                    width: centerSize,
                    height: centerSize,
                    borderRadius: centerSize * 0.5,
                  },
                ]}
              >
                <View style={styles.lightCenterHighlight} />
                <View style={styles.lightCenterInnerGlow} />
                <Text
                  style={[
                    styles.lightCenterH,
                    {
                      fontSize: centerHSize,
                      lineHeight: centerHSize * 1.02,
                    },
                  ]}
                >
                  H
                </Text>
              </View>
            </View>
          )}

          {/* ── CW orbital ring — outer bloom ── */}
          <Animated.Image
            source={APPROVED_WAVES}
            blurRadius={20}
            style={[styles.image, { opacity: ringGlowOpacity, transform: [{ rotate: rotate1 }] }]}
            resizeMode="contain"
            accessibilityIgnoresInvertColors
          />
          {/* ── CW orbital ring — inner glow ── */}
          <Animated.Image
            source={APPROVED_WAVES}
            blurRadius={10}
            style={[styles.image, { opacity: ringGlowOpacity, transform: [{ rotate: rotate1 }] }]}
            resizeMode="contain"
            accessibilityIgnoresInvertColors
          />
          {/* ── CW orbital ring — sharp edge (opacity tracks pulse) ── */}
          <Animated.Image
            source={APPROVED_WAVES}
            style={[styles.image, { opacity: pulseOpacity, transform: [{ rotate: rotate1 }] }]}
            resizeMode="contain"
            accessibilityIgnoresInvertColors
          />

          {/* ── CCW orbital ring — outer bloom ── */}
          <Animated.Image
            source={APPROVED_WAVES}
            blurRadius={20}
            style={[styles.image, { opacity: ringGlowOpacity, transform: [{ rotate: rotate2 }] }]}
            resizeMode="contain"
            accessibilityIgnoresInvertColors
          />
          {/* ── CCW orbital ring — inner glow ── */}
          <Animated.Image
            source={APPROVED_WAVES}
            blurRadius={10}
            style={[styles.image, { opacity: ringGlowOpacity, transform: [{ rotate: rotate2 }] }]}
            resizeMode="contain"
            accessibilityIgnoresInvertColors
          />
          {/* ── CCW orbital ring — sharp edge (static opacity; counterpoint) ── */}
          <Animated.Image
            source={APPROVED_WAVES}
            style={[styles.image, { opacity: 0.35, transform: [{ rotate: rotate2 }] }]}
            resizeMode="contain"
            accessibilityIgnoresInvertColors
          />
        </Animated.View>
      </Container>
    </View>
  );
}

export default memo(HeliosEnergyCore);

const styles = StyleSheet.create({
  outerWrapper: {
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
    overflow: "visible",
    backgroundColor: "rgba(0,0,0,0.001)",
  },
  container: {
    alignItems: "center",
    justifyContent: "center",
    overflow: "visible",
  },
  artworkFrame: {
    alignItems: "center",
    justifyContent: "center",
    overflow: "visible",
  },
  image: {
    ...StyleSheet.absoluteFillObject,
    width: "100%",
    height: "100%",
  },
  lightCenterLayer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 2,
  },
  lightCenterGlow: {
    position: "absolute",
    backgroundColor: "rgba(255,255,255,0.46)",
    shadowColor: "#8b5cf6",
    shadowOpacity: 0.16,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 0 },
  },
  lightCenterOuter: {
    position: "absolute",
    backgroundColor: "rgba(248,245,255,0.78)",
    borderWidth: 1,
    borderColor: "rgba(168,85,247,0.24)",
    shadowColor: "#a78bfa",
    shadowOpacity: 0.22,
    shadowRadius: 15,
    shadowOffset: { width: 0, height: 0 },
  },
  lightCenterDisc: {
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.96)",
    borderWidth: 1,
    borderColor: "rgba(124,58,237,0.42)",
    shadowColor: "#ffffff",
    shadowOpacity: 0.68,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
  },
  lightCenterHighlight: {
    position: "absolute",
    top: "7%",
    left: "12%",
    right: "12%",
    height: "44%",
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.72)",
  },
  lightCenterInnerGlow: {
    position: "absolute",
    left: "10%",
    right: "10%",
    bottom: "8%",
    height: "46%",
    borderRadius: 999,
    backgroundColor: "rgba(221,214,254,0.42)",
  },
  lightCenterH: {
    color: "#7c3aed",
    fontWeight: "900",
    letterSpacing: 0,
    textAlign: "center",
    textShadowColor: "rgba(124,58,237,0.26)",
    textShadowRadius: 5,
    textShadowOffset: { width: 0, height: 0 },
  },
});
