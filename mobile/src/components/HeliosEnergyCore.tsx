import React, { memo, useCallback, useEffect, useMemo, useRef } from "react";
import {
  Alert,
  Animated,
  Easing,
  Image,
  Platform,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import { Circle, Defs, RadialGradient, Stop, Svg } from "react-native-svg";
import * as Haptics from "expo-haptics";

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
  onPress?: () => void;
  onLongPress?: () => void;
};

const APPROVED_CORE = require("../../assets/design/branding/helios-energy-core-transparent.png");
const APPROVED_WAVES = require("../../assets/design/branding/helios-energy-core-waves.png");
const ARTWORK_ASPECT_RATIO = 434 / 400;
const GLOW_INSET = 10;

// ms per full 360° rotation
const SPIN_SPEED: Record<CoreState, number> = {
  idle:       9000,
  thinking:   5000,
  generating: 4000,
  listening:  7000,
  speaking:   5500,
  attention:  6000,
  critical:   3500,
  offline:   14000,
};

// ms per pulse half-cycle
const PULSE_SPEED: Record<CoreState, number> = {
  idle:       3000,
  thinking:   1800,
  generating: 1500,
  listening:  2500,
  speaking:   2000,
  attention:  2200,
  critical:   1400,
  offline:    5000,
};

// Ring glow breath — ms per half-cycle and [min, max] opacity for the blurred ring twin.
// Glow twins share the ring's own transform so the bloom stays welded to the path.
const RING_GLOW_SPEED: Record<CoreState, number> = {
  idle:        4000,  // slow, steady
  thinking:    2200,  // energetic
  generating:  1800,  // most active
  listening:    700,  // fast ripple reacting to sound
  speaking:    1900,  // breathing rhythm
  attention:   2600,
  critical:    1200,  // intense
  offline:     6000,  // barely alive
};

// [resting opacity, peak opacity] — peak ≈ 115% of resting for most states
const RING_GLOW_RANGE: Record<CoreState, [number, number]> = {
  idle:       [0.58, 0.67],
  thinking:   [0.72, 0.86],
  generating: [0.78, 0.95],
  listening:  [0.62, 0.70],
  speaking:   [0.65, 0.78],
  attention:  [0.70, 0.83],
  critical:   [0.80, 1.00],
  offline:    [0.36, 0.40],
};

function HeliosEnergyCore({
  size = 142,
  state = "idle",
  interactive = true,
  onPress,
  onLongPress,
}: Props) {
  const artworkHeight = size / ARTWORK_ASPECT_RATIO;
  const wrapperWidth  = size + GLOW_INSET * 2;
  const wrapperHeight = artworkHeight + GLOW_INSET * 2;

  const spinDuration      = useMemo(() => SPIN_SPEED[state],      [state]);
  const pulseDuration     = useMemo(() => PULSE_SPEED[state],     [state]);
  const ringGlowDuration  = useMemo(() => RING_GLOW_SPEED[state], [state]);
  const ringGlowRange     = useMemo(() => RING_GLOW_RANGE[state], [state]);

  // spin  — continuous 0→1 linear (maps to 0°→360°, no visual snap at loop end)
  // pulse — 0→1→0 ease-in-out (scale breathe)
  const spin  = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;
  const touch = useRef(new Animated.Value(0)).current;

  const spinRef  = useRef<Animated.CompositeAnimation | null>(null);
  const pulseRef = useRef<Animated.CompositeAnimation | null>(null);

  // Background radial glow — independent of state
  const glow    = useRef(new Animated.Value(0)).current;
  const glowRef = useRef<Animated.CompositeAnimation | null>(null);

  // Ring glow — drives the blurred "plasma bloom" twins on each wave layer
  const ringGlow    = useRef(new Animated.Value(0)).current;
  const ringGlowRef = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    spinRef.current?.stop();
    pulseRef.current?.stop();
    spin.setValue(0);
    pulse.setValue(0);

    spinRef.current = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: spinDuration,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );

    pulseRef.current = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: pulseDuration,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: pulseDuration,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );

    spinRef.current.start();
    pulseRef.current.start();

    return () => {
      spinRef.current?.stop();
      pulseRef.current?.stop();
    };
  }, [spinDuration, pulseDuration, spin, pulse]);

  useEffect(() => {
    ringGlowRef.current?.stop();
    ringGlow.setValue(0);
    ringGlowRef.current = Animated.loop(
      Animated.sequence([
        Animated.timing(ringGlow, {
          toValue: 1,
          duration: ringGlowDuration,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(ringGlow, {
          toValue: 0,
          duration: ringGlowDuration,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    ringGlowRef.current.start();
    return () => ringGlowRef.current?.stop();
  }, [ringGlow, ringGlowDuration]);

  useEffect(() => {
    glowRef.current = Animated.loop(
      Animated.sequence([
        Animated.timing(glow, {
          toValue: 1,
          duration: 3800,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(glow, {
          toValue: 0,
          duration: 3800,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    glowRef.current.start();
    return () => glowRef.current?.stop();
  }, [glow]);

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

  // Spin: forward rotation for primary wave layer
  const rotate = spin.interpolate({
    inputRange:  [0, 1],
    outputRange: ["0deg", "360deg"],
  });
  // Counter-spin: reverse, slightly slower — creates orbital interference pattern
  const counterRotate = spin.interpolate({
    inputRange:  [0, 1],
    outputRange: ["0deg", "-240deg"],
  });
  // Scale pulse: gentle breathe
  const pulseScale = pulse.interpolate({
    inputRange:  [0, 1],
    outputRange: [1.0, 1.06],
  });
  // Opacity pulse: brightens on inhale
  const pulseOpacity = pulse.interpolate({
    inputRange:  [0, 1],
    outputRange: [0.45, 0.70],
  });

  // Outer ambient — full orbital area, violet→blue, opacity exactly as specified
  const outerOpacity = glow.interpolate({
    inputRange:  [0, 1],
    outputRange: [0.18, 0.32],
  });
  const outerScale = glow.interpolate({
    inputRange:  [0, 1],
    outputRange: [1.00, 1.08],
  });
  // Mid violet — tighter, adds depth and saturation behind the waves
  const midOpacity = glow.interpolate({
    inputRange:  [0, 1],
    outputRange: [0.28, 0.50],
  });
  const midScale = glow.interpolate({
    inputRange:  [0, 1],
    outputRange: [1.00, 1.04],
  });
  // Inner core — focused bright point directly behind the H, contracts then blooms
  const coreOpacity = glow.interpolate({
    inputRange:  [0, 1],
    outputRange: [0.42, 0.70],
  });
  const coreScale = glow.interpolate({
    inputRange:  [0, 1],
    outputRange: [0.92, 1.00],
  });

  // Ring glow twin opacity — re-derived when state changes so range updates
  const ringGlowOpacity = useMemo(
    () => ringGlow.interpolate({ inputRange: [0, 1], outputRange: ringGlowRange }),
    [ringGlow, ringGlowRange],
  );

  const touchScale = touch.interpolate({
    inputRange:  [0, 1],
    outputRange: [1, 1.018],
  });

  const Container = interactive && (onPress || onLongPress) ? TouchableOpacity : View;
  const containerProps = interactive && (onPress || onLongPress)
    ? {
        onPress: handlePress,
        onPressIn: handlePressIn,
        onPressOut: handlePressOut,
        onLongPress: handleLongPress,
        activeOpacity: 0.92,
        accessibilityLabel: "HELIOS energy core",
        accessibilityRole: "button" as const,
        accessibilityHint: "Tap to view assistant status. Long press for voice mode.",
      }
    : { accessibilityLabel: "HELIOS energy core" };

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
        <Animated.View
          collapsable={false}
          style={[
            styles.artworkFrame,
            { width: size, height: artworkHeight, transform: [{ scale: touchScale }] },
          ]}
          pointerEvents="none"
        >
          {/* Layer 1 — outer ambient: violet→electric-blue, full orbital coverage */}
          <Animated.View
            style={{
              position: "absolute",
              width: size,
              height: size,
              opacity: outerOpacity,
              transform: [{ scale: outerScale }],
            }}
          >
            <Svg width={size} height={size}>
              <Defs>
                <RadialGradient id="glowOuter" cx="50%" cy="50%" rx="50%" ry="50%">
                  <Stop offset="0%"   stopColor="#6E4CFF" stopOpacity="0.90" />
                  <Stop offset="30%"  stopColor="#5A3FDB" stopOpacity="0.65" />
                  <Stop offset="62%"  stopColor="#38BDF8" stopOpacity="0.30" />
                  <Stop offset="100%" stopColor="#38BDF8" stopOpacity="0" />
                </RadialGradient>
              </Defs>
              <Circle cx={size / 2} cy={size / 2} r={size / 2} fill="url(#glowOuter)" />
            </Svg>
          </Animated.View>

          {/* Layer 2 — mid violet: saturates the core, adds depth behind the waves */}
          <Animated.View
            style={{
              position: "absolute",
              width: size,
              height: size,
              opacity: midOpacity,
              transform: [{ scale: midScale }],
            }}
          >
            <Svg width={size} height={size}>
              <Defs>
                <RadialGradient id="glowMid" cx="50%" cy="50%" rx="44%" ry="44%">
                  <Stop offset="0%"   stopColor="#7C3AED" stopOpacity="1.0" />
                  <Stop offset="48%"  stopColor="#6D28D9" stopOpacity="0.55" />
                  <Stop offset="100%" stopColor="#4C1D95" stopOpacity="0" />
                </RadialGradient>
              </Defs>
              <Circle cx={size / 2} cy={size / 2} r={size * 0.44} fill="url(#glowMid)" />
            </Svg>
          </Animated.View>

          {/* Layer 3 — inner core: tightest, brightest, contracts then blooms behind H */}
          <Animated.View
            style={{
              position: "absolute",
              width: size,
              height: size,
              opacity: coreOpacity,
              transform: [{ scale: coreScale }],
            }}
          >
            <Svg width={size} height={size}>
              <Defs>
                <RadialGradient id="glowCore" cx="50%" cy="50%" rx="28%" ry="28%">
                  <Stop offset="0%"   stopColor="#A78BFA" stopOpacity="1.0" />
                  <Stop offset="50%"  stopColor="#8B5CF6" stopOpacity="0.80" />
                  <Stop offset="100%" stopColor="#6E4CFF" stopOpacity="0" />
                </RadialGradient>
              </Defs>
              <Circle cx={size / 2} cy={size / 2} r={size * 0.28} fill="url(#glowCore)" />
            </Svg>
          </Animated.View>

          {/* Static base — H stays perfectly still */}
          <Image
            source={APPROVED_CORE}
            style={[styles.image, { opacity: 0.92 }]}
            resizeMode="contain"
            accessibilityIgnoresInvertColors
          />

          {/* Forward glow twin — blurred copy at same transform, bloom hugs the path */}
          <Animated.Image
            source={APPROVED_WAVES}
            blurRadius={8}
            style={[
              styles.image,
              {
                opacity: ringGlowOpacity,
                transform: [{ rotate }, { scale: pulseScale }],
              },
            ]}
            resizeMode="contain"
            accessibilityIgnoresInvertColors
          />
          {/* Forward sharp ring */}
          <Animated.Image
            source={APPROVED_WAVES}
            style={[
              styles.image,
              {
                opacity: pulseOpacity,
                transform: [{ rotate }, { scale: pulseScale }],
              },
            ]}
            resizeMode="contain"
            accessibilityIgnoresInvertColors
          />

          {/* Counter glow twin — blurred copy at same counter-rotation */}
          <Animated.Image
            source={APPROVED_WAVES}
            blurRadius={8}
            style={[
              styles.image,
              {
                opacity: ringGlowOpacity,
                transform: [{ rotate: counterRotate }],
              },
            ]}
            resizeMode="contain"
            accessibilityIgnoresInvertColors
          />
          {/* Counter sharp ring */}
          <Animated.Image
            source={APPROVED_WAVES}
            style={[
              styles.image,
              {
                opacity: 0.35,
                transform: [{ rotate: counterRotate }],
              },
            ]}
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
});
