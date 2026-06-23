/**
 * HeliosEnergyCore — asset-backed HELIOS identity mark.
 *
 * The approved artwork in mobile/assets/design/branding/helios-energy-core-reference.png
 * is the source of truth. The app renders a transparent derivative so the
 * center H stays fixed and only the derived wave layer animates above it.
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
  waveDriftSpeed: number;
  counterWaveDriftSpeed: number;
  pulseSpeed: number;
  waveOpacity: number;
};

const ARTWORK = require("../../assets/design/branding/helios-energy-core-transparent.png");
const WAVE_LAYER = require("../../assets/design/branding/helios-energy-core-waves.png");
const ARTWORK_ASPECT_RATIO = 434 / 400;

function resolveAnimationConfig(state: CoreState): AnimationConfig {
  switch (state) {
    case "thinking":
      return { waveDriftSpeed: 12000, counterWaveDriftSpeed: 17000, pulseSpeed: 2600, waveOpacity: 0.24 };
    case "generating":
      return { waveDriftSpeed: 9000, counterWaveDriftSpeed: 13000, pulseSpeed: 1800, waveOpacity: 0.30 };
    case "listening":
      return { waveDriftSpeed: 15000, counterWaveDriftSpeed: 21000, pulseSpeed: 3000, waveOpacity: 0.22 };
    case "speaking":
      return { waveDriftSpeed: 11000, counterWaveDriftSpeed: 16000, pulseSpeed: 2200, waveOpacity: 0.26 };
    case "attention":
      return { waveDriftSpeed: 12000, counterWaveDriftSpeed: 17000, pulseSpeed: 2200, waveOpacity: 0.20 };
    case "critical":
      return { waveDriftSpeed: 9000, counterWaveDriftSpeed: 12000, pulseSpeed: 1400, waveOpacity: 0.18 };
    case "offline":
      return { waveDriftSpeed: 24000, counterWaveDriftSpeed: 32000, pulseSpeed: 5200, waveOpacity: 0.08 };
    case "idle":
      return { waveDriftSpeed: 18000, counterWaveDriftSpeed: 26000, pulseSpeed: 4200, waveOpacity: 0.18 };
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
  const waveDrift = useRef(new Animated.Value(0)).current;
  const counterWaveDrift = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;
  const touch = useRef(new Animated.Value(0)).current;
  const waveDriftLoopRef = useRef<Animated.CompositeAnimation | null>(null);
  const counterWaveDriftLoopRef = useRef<Animated.CompositeAnimation | null>(null);
  const pulseLoopRef = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    waveDriftLoopRef.current?.stop();
    counterWaveDriftLoopRef.current?.stop();
    pulseLoopRef.current?.stop();
    waveDrift.setValue(0);
    counterWaveDrift.setValue(0);

    const waveDriftLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(waveDrift, {
          toValue: 1,
          duration: config.waveDriftSpeed,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(waveDrift, {
          toValue: 0,
          duration: config.waveDriftSpeed,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    const counterWaveDriftLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(counterWaveDrift, {
          toValue: 1,
          duration: config.counterWaveDriftSpeed,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(counterWaveDrift, {
          toValue: 0,
          duration: config.counterWaveDriftSpeed,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: config.pulseSpeed,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: config.pulseSpeed,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );

    waveDriftLoopRef.current = waveDriftLoop;
    counterWaveDriftLoopRef.current = counterWaveDriftLoop;
    pulseLoopRef.current = pulseLoop;
    waveDriftLoop.start();
    counterWaveDriftLoop.start();
    pulseLoop.start();

    return () => {
      waveDriftLoopRef.current?.stop();
      counterWaveDriftLoopRef.current?.stop();
      pulseLoopRef.current?.stop();
    };
  }, [
    config.counterWaveDriftSpeed,
    config.pulseSpeed,
    config.waveDriftSpeed,
    counterWaveDrift,
    pulse,
    waveDrift,
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

  const waveRotate = waveDrift.interpolate({
    inputRange: [0, 1],
    outputRange: ["-3.6deg", "3.6deg"],
  });
  const counterWaveRotate = counterWaveDrift.interpolate({
    inputRange: [0, 1],
    outputRange: ["2.6deg", "-2.6deg"],
  });
  const waveTranslateX = waveDrift.interpolate({
    inputRange: [0, 1],
    outputRange: [-1.4, 1.4],
  });
  const waveTranslateY = waveDrift.interpolate({
    inputRange: [0, 1],
    outputRange: [0.8, -0.8],
  });
  const counterWaveTranslateX = counterWaveDrift.interpolate({
    inputRange: [0, 1],
    outputRange: [1, -1],
  });
  const counterWaveTranslateY = counterWaveDrift.interpolate({
    inputRange: [0, 1],
    outputRange: [-0.7, 0.7],
  });
  const waveOpacity = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [config.waveOpacity * 0.45, config.waveOpacity],
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
        <Image
          source={ARTWORK}
          style={styles.image}
          resizeMode="contain"
          accessibilityIgnoresInvertColors
        />
        <Animated.Image
          source={WAVE_LAYER}
          style={[
            styles.waveLayer,
            {
              opacity: waveOpacity,
              transform: [
                { translateX: waveTranslateX },
                { translateY: waveTranslateY },
                { scale: 1.018 },
                { rotate: waveRotate },
              ],
            },
          ]}
          resizeMode="contain"
          accessibilityIgnoresInvertColors
        />
        <Animated.Image
          source={WAVE_LAYER}
          style={[
            styles.waveLayer,
            {
              opacity: config.waveOpacity * 0.45,
              transform: [
                { translateX: counterWaveTranslateX },
                { translateY: counterWaveTranslateY },
                { scale: 0.996 },
                { rotate: counterWaveRotate },
              ],
            },
          ]}
          resizeMode="contain"
          accessibilityIgnoresInvertColors
        />
      </Animated.View>
    </Container>
  );
}

export default memo(HeliosEnergyCore);

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
  },
  artworkFrame: {
    alignItems: "center",
    justifyContent: "center",
  },
  image: {
    ...StyleSheet.absoluteFillObject,
    width: "100%",
    height: "100%",
  },
  waveLayer: {
    ...StyleSheet.absoluteFillObject,
    width: "100%",
    height: "100%",
  },
});
