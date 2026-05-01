import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import React, { useEffect } from 'react';
import { Platform, useColorScheme } from 'react-native';
import * as WebBrowser from 'expo-web-browser';

import { AnimatedSplashOverlay } from '../components/animated-icon';
import { AuthGate } from '../components/auth-gate';
import AppTabs from '../components/app-tabs';
import { AuthProvider } from '../auth/auth-context';

import { GluestackUIProvider } from '@ui/gluestack-ui-provider';
import '@/global.css';

export default function TabLayout() {
  const colorScheme = useColorScheme();

  useEffect(() => {
    if (Platform.OS === 'web') {
      return;
    }

    void WebBrowser.warmUpAsync();

    return () => {
      void WebBrowser.coolDownAsync();
    };
  }, []);

  return (
    <GluestackUIProvider mode={colorScheme === 'dark' ? 'dark' : 'light'}>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <AuthProvider>
          <AnimatedSplashOverlay />
          <AuthGate>
            <AppTabs />
          </AuthGate>
        </AuthProvider>
      </ThemeProvider>
    </GluestackUIProvider>
  );
}
