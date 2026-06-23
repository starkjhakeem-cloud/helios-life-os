/**
 * HeliosEnergyCore — approved PNG based HELIOS identity mark.
 *
 * The visible Energy Core uses the approved transparent PNG as the source of
 * truth. Animated wave layers are rendered BELOW the static image so they
 * extend visibly outside its bounds as a moving glow ring. The H stays still.
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
  scaleDuration: number;
  opacityDuration: number;
  driftDuration: number;
};

const APPROVED_CORE = require("../../assets/design/branding/helios-energy-core-transparent.png");
const APPROVED_WAVES = require("../../assets/design/branding/helios-energy-core-waves.png");
const ARTWORK_ASPECT_RATIO = 434 / 400;

function resolveAnimationConfig(state: CoreState): AnimationConfig {
  switch (state) {
    case "thinking":
      return { scaleDuration: 5600, opacityDuration: 6800, driftDuration: 8200 };
    case "generating":
      return { scaleDuration: 5000, opacityDuration: 6200, driftDuration: 7600 };
    case "listening":
      return { scaleDuration: 6400, opacityDuration: 7600, driftDuration: 9000 };
    case "speaking":
      return { scaleDuration: 5400, opacityDuration: 6600, driftDuration: 8000 };
    case "attention":
      return { scaleDuration: 5600, opacityDuration: 7000, driftDuration: 8400 };
    case "critical":
      return { scaleDuration: 5000, opacityDuration: 6200, driftDuration: 7600 };
    case "offline":
      return { scaleDuration: 9000, opacityDuration: 9000, driftDuration: 9000 };
    case "idle":
      return { scaleDuration: 6800, opacityDuration: 8000, driftDuration: 9000 };
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

    const scaleLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(scalePulse, {
          toValue: 1,
          duration: config.scaleDuration,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(scalePulse, {
          toValue: 0,
          duration: config.scaleDuration,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    const opacityLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacityPulse, {
          toValue: 1,
          duration: config.opacityDuration,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(opacityPulse, {
          toValue: 0,
          duration: config.opacityDuration,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    const driftLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(drift, {
          toValue: 1,
          duration: config.driftDuration,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(drift, {
          toValue: 0,
          duration: config.driftDuration,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );

    scaleLoopRef.current = scaleLoop;
    opacityLoopRef.current = opacityLoop;
    driftLoopRef.current = driftLoop;
    scaleLoop.start();
    opacityLoop.start();
    driftLoop.start();

    return () => {
      scaleLoopRef.current?.stop();
      opacityLoopRef.current?.stop();
      driftLoopRef.current?.stop();
    };
  }, [
    config.driftDuration,
    config.opacityDuration,
    config.scaleDuration,
    drift,
    opacityPulse,
    scalePulse,
  ]);

  const handlePress = useCallback(() => {
    if (Platform.OS === "ios") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
    onPress?.();
  }, [onPress]);

  const handlePressIn = useCallback(() => {
    Animated.spring(touch, {
      toValue: 1,
      useNativeDriver: true,
      speed: 22,
      bounciness: 6,
    }).start();
  }, [touch]);

  const handlePressOut = useCallback(() => {
    Animated.spring(touch, {
      toValue: 0,
      useNativeDriver: true,
      speed: 18,
      bounciness: 5,
    }).start();
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

  // Wave layers scale to 1.14x so the outer orbital ring tips (~10px) extend
  // visibly outside the static image bounds as animated glow.
  const scaleLayerOpacity = scalePulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.28, 0.52],
  });
  const scaleLayerScale = scalePulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.14],
  });
  const opacityLayerOpacity = opacityPulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.22, 0.48],
  });
  const driftOpacity = drift.interpolate({
    inputRange: [0, 1],
    outputRange: [0.22, 0.42],
  });
  const driftRotate = drift.interpolate({
    inputRange: [0, 1],
    outputRange: ["-4deg", "4deg"],
  });
  const driftScale = drift.interpolate({
    inputRange: [0, 1],
    outputRange: [1.02, 1.14],
  });
  const driftTranslateX = drift.interpolate({
    inputRange: [0, 1],
    outputRange: [-3.5, 3.5],
  });
  const driftTranslateY = drift.interpolate({
    inputRange: [0, 1],
    outputRange: [2, -2],
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
    : {
        accessibilityLabel: "HELIOS energy core",
      };

  return (
    // Permanent invisible wrapper — explicit overflow:visible so scaled wave
    // layers are never clipped by the layout system or heroCard's overflow:hidden.
    <View style={[styles.outerWrapper, { width: size, height: artworkHeight }]}>
      <Container
        style={[styles.container, { width: size, height: artworkHeight }]}
        {...containerProps}
      >
        <Animated.View
          style={[
            styles.artworkFrame,
            {
              width: size,
              height: artworkHeight,
              transform: [{ scale: touchScale }],
            },
          ]}
          pointerEvents="none"
        >
          {/* Wave layers first = bottom of stack.
              At 1.14x scale these extend ~10px outside the static image so
              the outer orbital ring tips are visible as animated glow. */}
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
          <Animated.Image
            source={APPROVED_WAVES}
            style={[
              styles.image,
              {
                opacity: opacityLayerOpacity,
                transform: [{ scale: 1.10 }],
              },
            ]}
            resizeMode="contain"
            accessibilityIgnoresInvertColors
          />
          <Animated.Image
            source={APPROVED_WAVES}
            style={[
              styles.image,
              {
                opacity: scaleLayerOpacity,
                transform: [{ scale: scaleLayerScale }],
              },
            ]}
            resizeMode="contain"
            accessibilityIgnoresInvertColors
          />
          {/* Static core image last = top of stack. Covers wave layers at the
              center so the H and grey circle remain perfectly still. */}
          <Image
            source={APPROVED_CORE}
            style={styles.image}
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
