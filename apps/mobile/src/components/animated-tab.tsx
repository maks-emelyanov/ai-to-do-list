import React, { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

type AnimatedTabIconProps = {
  color: string;
  focused: boolean;
  icon: LucideIcon;
};

type AnimatedTabLabelProps = {
  children: React.ReactNode;
  color: string;
  focused: boolean;
};

const TIMING_CONFIG = {
  duration: 220,
  easing: Easing.out(Easing.cubic),
} as const;

export function AnimatedTabIcon({ color, focused, icon: Icon }: AnimatedTabIconProps) {
  const progress = useSharedValue(focused ? 1 : 0);

  useEffect(() => {
    progress.value = withTiming(focused ? 1 : 0, TIMING_CONFIG);
  }, [focused, progress]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: interpolate(progress.value, [0, 1], [1, 1.08]) },
      { translateY: interpolate(progress.value, [0, 1], [2, 0]) },
    ],
    opacity: interpolate(progress.value, [0, 1], [0.84, 1]),
  }));

  return (
    <Animated.View style={[styles.iconContainer, animatedStyle]}>
      <Icon color={color} size={20} strokeWidth={2.25} />
    </Animated.View>
  );
}

export function AnimatedTabLabel({
  children,
  color,
  focused,
}: AnimatedTabLabelProps) {
  const progress = useSharedValue(focused ? 1 : 0);

  useEffect(() => {
    progress.value = withTiming(focused ? 1 : 0, TIMING_CONFIG);
  }, [focused, progress]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 1], [0.72, 1]),
    transform: [{ translateY: interpolate(progress.value, [0, 1], [2, 0]) }],
  }));

  return (
    <Animated.Text style={[styles.label, { color }, animatedStyle]}>
      {children}
    </Animated.Text>
  );
}

const styles = StyleSheet.create({
  iconContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
    marginTop: 2,
  },
});
