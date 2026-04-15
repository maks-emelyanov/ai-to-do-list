import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import React from 'react';
import { useColorScheme } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import AppTabs from '@/components/app-tabs';

import { GluestackUIProvider } from '@/components/ui/gluestack-ui-provider';
import '@/src/global.css';

export default function TabLayout() {
  const colorScheme = useColorScheme();
  return (
    
    <GluestackUIProvider mode="dark">
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <AnimatedSplashOverlay />
      <AppTabs />
    </ThemeProvider>
    </GluestackUIProvider>
  
  );
}
