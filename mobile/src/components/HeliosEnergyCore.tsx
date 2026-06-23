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

  const spinDuration  = useMemo(() => SPIN_SPEED[state],  [state]);
  const pulseDuration = useMemo(() => PULSE_SPEED[state], [state]);

  // spin  — continuous 0→1 linear (maps to 0°→360°, no visual snap at loop end)
  // pulse — 0→1→0 ease-in-out (scale breathe)
  const spin  = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;
  const touch = useRef(new Animated.Value(0)).current;

  const spinRef  = useRef<Animated.CompositeAnimation | null>(null);
  const pulseRef = useRef<Animated.CompositeAnimation | null>(null);

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
          {/* Static base — H stays perfectly still */}
          <Image
            source={APPROVED_CORE}
            style={[styles.image, { opacity: 0.92 }]}
            resizeMode="contain"
            accessibilityIgnoresInvertColors
          />

          {/* Forward-spinning wave layer + scale pulse */}
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

          {/* Counter-spinning wave layer — static opacity, creates depth */}
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
