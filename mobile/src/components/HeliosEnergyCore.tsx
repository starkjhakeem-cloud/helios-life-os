/**
 * HeliosEnergyCore — approved PNG based HELIOS identity mark.
 *
 * collapsable={false} on every wrapper View prevents React Native's view
 * flattening optimizer from merging these into their parent's native layer.
 * The red debug border worked because a visible border forced a real UIView;
 * without it the wrapper collapsed, removing the compositing layer that lets
 * useNativeDriver animations render through heroCard's overflow:hidden.
 */

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

type AnimationConfig = {
  duration: number;
};

const APPROVED_CORE = require("../../assets/design/branding/helios-energy-core-transparent.png");
const APPROVED_WAVES = require("../../assets/design/branding/helios-energy-core-waves.png");
const ARTWORK_ASPECT_RATIO = 434 / 400;
const GLOW_INSET = 10;

function resolveAnimationConfig(state: CoreState): AnimationConfig {
  switch (state) {
    case "thinking":   return { duration: 4000 };
    case "generating": return { duration: 3500 };
    case "listening":  return { duration: 5000 };
    case "speaking":   return { duration: 4200 };
    case "attention":  return { duration: 4500 };
    case "critical":   return { duration: 3500 };
    case "offline":    return { duration: 7000 };
    case "idle":       return { duration: 5000 };
  }
}

function HeliosEnergyCore({
  size = 142,
  state = "idle",
  interactive = true,
  onPress,
  onLongPress,
}: Props) {
  const config = useMemo(() => resolveAnimationConfig(state), [state]);
  const artworkHeight = size / ARTWORK_ASPECT_RATIO;
  const wrapperWidth = size + GLOW_INSET * 2;
  const wrapperHeight = artworkHeight + GLOW_INSET * 2;

  const scalePulse = useRef(new Animated.Value(0)).current;
  const opacityPulse = useRef(new Animated.Value(0)).current;
  const drift = useRef(new Animated.Value(0)).current;
  const touch = useRef(new Animated.Value(0)).current;
  const scaleLoopRef = useRef<Animated.CompositeAnimation | null>(null);
  const opacityLoopRef = useRef<Animated.CompositeAnimation | null>(null);
  const driftLoopRef = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    scaleLoopRef.current?.stop();
    opacityLoopRef.current?.stop();
    driftLoopRef.current?.stop();
    scalePulse.setValue(0);
    opacityPulse.setValue(0);
    drift.setValue(0);

    const make = (value: Animated.Value, dur: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(value, {
            toValue: 1,
            duration: dur,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(value, {
            toValue: 0,
            duration: dur,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
      );

    const driftLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(drift, {
          toValue: 1,
          duration: config.duration,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(drift, {
          toValue: 0,
          duration: config.duration,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );

    scaleLoopRef.current = make(scalePulse, config.duration);
    opacityLoopRef.current = make(opacityPulse, Math.round(config.duration * 1.2));
    driftLoopRef.current = driftLoop;
    scaleLoopRef.current.start();
    opacityLoopRef.current.start();
    driftLoopRef.current.start();

    return () => {
      scaleLoopRef.current?.stop();
      opacityLoopRef.current?.stop();
      driftLoopRef.current?.stop();
    };
  }, [config.duration, drift, opacityPulse, scalePulse]);

  const handlePress = useCallback(() => {
    if (Platform.OS === "ios") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
    onPress?.();
  }, [onPress]);

  const handlePressIn = useCallback(() => {
    Animated.spring(touch, { toValue: 1, useNativeDriver: true, speed: 22, bounciness: 6 }).start();
  }, [touch]);

  const handlePressOut = useCallback(() => {
    Animated.spring(touch, { toValue: 0, useNativeDriver: true, speed: 18, bounciness: 5 }).start();
  }, [touch]);

  const handleLongPress = useCallback(() => {
    if (Platform.OS === "ios") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    }
    if (onLongPress) {
      onLongPress();
    } else {
      Alert.alert("HELIOS", "Voice mode coming soon.");
    }
  }, [onLongPress]);

  const waveOpacity = scalePulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.45, 0.75],
  });
  const waveScale = scalePulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1.0, 1.08],
  });
  const opacityLayerOpacity = opacityPulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.45, 0.75],
  });
  const driftOpacity = drift.interpolate({
    inputRange: [0, 1],
    outputRange: [0.45, 0.75],
  });
  const driftRotate = drift.interpolate({
    inputRange: [0, 1],
    outputRange: ["-3deg", "3deg"],
  });
  const driftScale = drift.interpolate({
    inputRange: [0, 1],
    outputRange: [1.0, 1.08],
  });
  const driftTranslateX = drift.interpolate({
    inputRange: [0, 1],
    outputRange: [-2.5, 2.5],
  });
  const driftTranslateY = drift.interpolate({
    inputRange: [0, 1],
    outputRange: [1.6, -1.6],
  });
  const touchScale = touch.interpolate({
    inputRange: [0, 1],
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
    // collapsable={false} — forces a real native UIView even with no visible
    // border/background. Without this, RN flattens this wrapper into heroCard's
    // layer and the useNativeDriver animations lose their compositing context.
    <View
      collapsable={false}
      style={[styles.outerWrapper, { width: wrapperWidth, height: wrapperHeight }]}
    >
      <Container
        // @ts-ignore — collapsable is valid on View; TS typing is incomplete
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
          {/* Static approved image — bottom, keeps H perfectly still at 0.92
              opacity so animated wave layers above it remain perceptible.    */}
          <Image
            source={APPROVED_CORE}
            style={[styles.image, { opacity: 0.92 }]}
            resizeMode="contain"
            accessibilityIgnoresInvertColors
          />

          {/* Drift layer — translates, rotates, and scales above the static base */}
          <Animated.Image
            source={APPROVED_WAVES}
            style={[
              styles.image,
              {
                opacity: driftOpacity,
                transform: [
                  { translateX: driftTranslateX },
                  { translateY: driftTranslateY },
                  { scale: driftScale },
                  { rotate: driftRotate },
                ],
              },
            ]}
            resizeMode="contain"
            accessibilityIgnoresInvertColors
          />

          {/* Opacity pulse layer — breathes in/out above the static base */}
          <Animated.Image
            source={APPROVED_WAVES}
            style={[styles.image, { opacity: opacityLayerOpacity, transform: [{ scale: 1.04 }] }]}
            resizeMode="contain"
            accessibilityIgnoresInvertColors
          />

          {/* Scale pulse layer — grows and shrinks above the static base */}
          <Animated.Image
            source={APPROVED_WAVES}
            style={[styles.image, { opacity: waveOpacity, transform: [{ scale: waveScale }] }]}
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
    // Invisible 1-alpha background forces a real backing store on iOS,
    // complementing collapsable={false} to prevent layer flattening.
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
