/**
 * HeliosEnergyCore — approved PNG based HELIOS identity mark.
 *
 * The visible Energy Core uses the approved transparent PNG as the source of
 * truth. Animated wave layers float above the static image at low opacity.
 * An invisible layout wrapper (10px larger than the artwork on each side)
 * gives scaled wave layers room to glow around the Energy Core without being
 * clipped by heroOrbArea or heroCard's overflow:hidden.
 */

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
  /**
   * Dev-only: when true shows the invisible layout frame as a red border with
   * layer labels so you can verify the animation is rendering. Set to false
   * (default) in production — the frame structure is preserved but invisible.
   */
  debugAnimationFrame?: boolean;
};

type AnimationConfig = {
  scaleDuration: number;
  opacityDuration: number;
  driftDuration: number;
};

const APPROVED_CORE = require("../../assets/design/branding/helios-energy-core-transparent.png");
const APPROVED_WAVES = require("../../assets/design/branding/helios-energy-core-waves.png");
const ARTWORK_ASPECT_RATIO = 434 / 400;

// Extra space (per side) around the artwork inside the layout wrapper.
// This gives the scaled wave layers room to glow without being clipped.
const GLOW_INSET = 10;

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
  debugAnimationFrame = false,
}: Props) {
  const config = useMemo(() => resolveAnimationConfig(state), [state]);
  const artworkHeight = size / ARTWORK_ASPECT_RATIO;

  // Wrapper is GLOW_INSET px larger on each side than the artwork so scaled
  // wave layers have room to be visible without leaving heroOrbArea/heroCard.
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

  const scaleLayerOpacity = scalePulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.22, 0.42],
  });
  const scaleLayerScale = scalePulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.08],
  });
  const opacityLayerOpacity = opacityPulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.20, 0.40],
  });
  const driftOpacity = drift.interpolate({
    inputRange: [0, 1],
    outputRange: [0.18, 0.36],
  });
  const driftRotate = drift.interpolate({
    inputRange: [0, 1],
    outputRange: ["-3deg", "3deg"],
  });
  const driftScale = drift.interpolate({
    inputRange: [0, 1],
    outputRange: [1.015, 1.08],
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
    : {
        accessibilityLabel: "HELIOS energy core",
      };

  return (
    /**
     * Invisible layout wrapper — GLOW_INSET px larger than the artwork on each
     * side so the scaled wave layers have room to glow around the Energy Core.
     * borderWidth:hairline + borderColor:transparent preserves the same native
     * UIView border layer structure that existed in the debug state (where the
     * red border made this wrapper visible), ensuring the same compositing path
     * that allowed useNativeDriver animations to render through heroCard's
     * overflow:hidden. When debugAnimationFrame=true the border and labels
     * become visible so you can inspect the glow bounds.
     */
    <View
      style={[
        styles.outerWrapper,
        {
          width: wrapperWidth,
          height: wrapperHeight,
          borderWidth: 2,
          borderColor: debugAnimationFrame ? "red" : "transparent",
        },
      ]}
    >
      {debugAnimationFrame && (
        <Text style={styles.debugLabel} numberOfLines={1}>
          glow frame {wrapperWidth}×{Math.round(wrapperHeight)}
        </Text>
      )}

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
          {/* ── 1. Static approved image — bottom of stack ──────────────── */}
          {/* The H and orbital design stay perfectly still at full opacity. */}
          <Image
            source={APPROVED_CORE}
            style={styles.image}
            resizeMode="contain"
            accessibilityIgnoresInvertColors
          />

          {/* ── 2-4. Animated wave layers — above the static image ───────── */}
          {/* Low opacity so the static design shows through. The 10px GLOW_INSET
              space around the artwork inside the wrapper lets these layers be
              visible as a moving glow ring when they scale/drift outward.   */}
          {debugAnimationFrame && (
            <Text style={[styles.debugLayerLabel, { top: 2 }]}>drift</Text>
          )}
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

          {debugAnimationFrame && (
            <Text style={[styles.debugLayerLabel, { top: 14 }]}>opacity</Text>
          )}
          <Animated.Image
            source={APPROVED_WAVES}
            style={[
              styles.image,
              {
                opacity: opacityLayerOpacity,
                transform: [{ scale: 1.06 }],
              },
            ]}
            resizeMode="contain"
            accessibilityIgnoresInvertColors
          />

          {debugAnimationFrame && (
            <Text style={[styles.debugLayerLabel, { top: 26 }]}>scale</Text>
          )}
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
  debugLabel: {
    position: "absolute",
    top: -16,
    left: 0,
    color: "red",
    fontSize: 9,
    fontWeight: "700",
    zIndex: 999,
  },
  debugLayerLabel: {
    position: "absolute",
    left: 2,
    color: "red",
    fontSize: 8,
    fontWeight: "700",
    zIndex: 999,
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
