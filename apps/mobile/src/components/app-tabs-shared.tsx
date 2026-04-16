import { router, Tabs, usePathname } from 'expo-router';
import React, { useCallback, useMemo } from 'react';
import { Animated as RNAnimated, Easing, Platform, StyleSheet, useColorScheme } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Reanimated, {
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import {
  CalendarDays,
  CircleUserRound,
  ListTodo,
  LucideIcon,
  SunMedium,
} from 'lucide-react-native';

import { Colors } from '../constants/theme';
import { AnimatedTabIcon, AnimatedTabLabel } from './animated-tab';

type TabRoute = 'index' | 'tasks' | 'calendar' | 'profile';
type SwipeDirection = 'next' | 'previous';
type TabSceneInterpolationProps = {
  current: {
    progress: RNAnimated.Value;
  };
};

const TAB_ROUTES: { name: TabRoute; href: '/' | '/tasks' | '/calendar' | '/profile' }[] = [
  { name: 'index', href: '/' },
  { name: 'tasks', href: '/tasks' },
  { name: 'calendar', href: '/calendar' },
  { name: 'profile', href: '/profile' },
];

const TAB_CONFIG: Record<
  TabRoute,
  {
    label: string;
    icon: LucideIcon;
  }
> = {
  index: {
    label: 'Today',
    icon: SunMedium,
  },
  tasks: {
    label: 'Tasks',
    icon: ListTodo,
  },
  calendar: {
    label: 'Calendar',
    icon: CalendarDays,
  },
  profile: {
    label: 'Profile',
    icon: CircleUserRound,
  },
};

const TAB_TRANSITION_SPEC = {
  animation: 'timing',
  config: {
    duration: 260,
    easing: Easing.out(Easing.cubic),
  },
} as const;

const tabSceneStyleInterpolator = ({ current }: TabSceneInterpolationProps) => ({
  sceneStyle: {
    opacity: current.progress.interpolate({
      inputRange: [-1, -0.35, 0, 0.35, 1],
      outputRange: [0, 0.62, 1, 0.62, 0],
    }),
    transform: [
      {
        translateX: current.progress.interpolate({
          inputRange: [-1, 0, 1],
          outputRange: [-72, 0, 72],
        }),
      },
      {
        scale: current.progress.interpolate({
          inputRange: [-1, 0, 1],
          outputRange: [0.975, 1, 0.975],
        }),
      },
    ],
  },
});

const SWIPE_PREVIEW_SPRING = {
  damping: 18,
  stiffness: 180,
  mass: 0.8,
} as const;

export default function AppTabs() {
  const scheme = useColorScheme();
  const pathname = usePathname();
  const swipePreview = useSharedValue(0);
  const colors = Colors[scheme === 'unspecified' ? 'light' : scheme];
  const activeTabIndex = Math.max(
    0,
    TAB_ROUTES.findIndex((tab) => tab.href === pathname)
  );

  const swipeToTab = useCallback(
    (direction: SwipeDirection) => {
      const nextIndex = direction === 'next' ? activeTabIndex + 1 : activeTabIndex - 1;
      const nextTab = TAB_ROUTES[nextIndex];

      if (!nextTab) {
        return;
      }

      router.navigate(nextTab.href);
    },
    [activeTabIndex]
  );

  const swipePreviewStyle = useAnimatedStyle(() => {
    const translateX = interpolate(
      swipePreview.value,
      [-96, 0, 96],
      [-18, 0, 18],
      Extrapolation.CLAMP
    );
    const scale = interpolate(
      Math.abs(swipePreview.value),
      [0, 96],
      [1, 0.992],
      Extrapolation.CLAMP
    );

    return {
      transform: [{ translateX }, { scale }],
    };
  });

  const swipeGesture = useMemo(
    () =>
      Gesture.Pan()
        .enabled(Platform.OS !== 'web')
        .activeOffsetX([-40, 40])
        .failOffsetY([-24, 24])
        .onUpdate((event) => {
          swipePreview.value = Math.max(-96, Math.min(96, event.translationX));
        })
        .onEnd((event) => {
          const hasSwipeDistance = Math.abs(event.translationX) > 80;
          const hasSwipeVelocity = Math.abs(event.velocityX) > 500;

          swipePreview.value = withSpring(0, SWIPE_PREVIEW_SPRING);

          if (!hasSwipeDistance && !hasSwipeVelocity) {
            return;
          }

          const isVelocityDriven = Math.abs(event.velocityX) > Math.abs(event.translationX) * 4;
          const swipedLeft = isVelocityDriven ? event.velocityX < 0 : event.translationX < 0;

          runOnJS(swipeToTab)(swipedLeft ? 'next' : 'previous');
        })
        .onFinalize(() => {
          swipePreview.value = withSpring(0, SWIPE_PREVIEW_SPRING);
        }),
    [swipePreview, swipeToTab]
  );

  return (
    <GestureHandlerRootView style={styles.root}>
      <GestureDetector gesture={swipeGesture}>
        <Reanimated.View collapsable={false} style={[styles.root, swipePreviewStyle]}>
          <Tabs
            screenOptions={({ route }) => {
              const routeConfig = TAB_CONFIG[route.name as TabRoute];

              return {
                headerShown: false,
                animation: 'shift',
                sceneStyleInterpolator: tabSceneStyleInterpolator,
                transitionSpec: TAB_TRANSITION_SPEC,
                sceneStyle: {
                  backgroundColor: colors.background,
                },
                tabBarHideOnKeyboard: true,
                tabBarShowLabel: true,
                tabBarActiveTintColor: colors.text,
                tabBarInactiveTintColor: colors.textSecondary,
                tabBarStyle: [
                  styles.tabBar,
                  {
                    backgroundColor: colors.backgroundElement,
                    borderTopColor: 'transparent',
                    boxShadow:
                      scheme === 'dark'
                        ? '0 10px 20px rgba(0, 0, 0, 0.12)'
                        : '0 10px 20px rgba(15, 23, 42, 0.12)',
                  },
                ],
                tabBarItemStyle: styles.tabBarItem,
                tabBarLabel: ({ focused, color, children }) => (
                  <AnimatedTabLabel focused={focused} color={color}>
                    {typeof children === 'string' ? children : routeConfig.label}
                  </AnimatedTabLabel>
                ),
                tabBarIcon: ({ focused, color }) => (
                  <AnimatedTabIcon focused={focused} color={color} icon={routeConfig.icon} />
                ),
              };
            }}>
            <Tabs.Screen name="index" options={{ title: 'Today' }} />
            <Tabs.Screen name="tasks" options={{ title: 'Tasks' }} />
            <Tabs.Screen name="calendar" options={{ title: 'Calendar' }} />
            <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
          </Tabs>
        </Reanimated.View>
      </GestureDetector>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  tabBar: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: Platform.select({ ios: 24, default: 16 }),
    height: 72,
    paddingTop: 10,
    paddingBottom: 10,
    borderTopWidth: 0,
    borderRadius: 28,
    elevation: 0,
  },
  tabBarItem: {
    paddingVertical: 4,
  },
});
