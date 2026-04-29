import React from 'react';
import { ActivityIndicator, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '../auth/auth-context';
import { useTheme } from '../hooks/use-theme';
import { AuthScreen } from './auth-screen';
import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';

export function AuthGate({ children }: { children: React.ReactNode }) {
  const { isLoading, user } = useAuth();
  const theme = useTheme();

  if (isLoading) {
    return (
      <ThemedView style={styles.loadingContainer}>
        <SafeAreaView style={styles.loadingContent}>
          <ActivityIndicator color={theme.text} />
          <ThemedText type="small" themeColor="textSecondary">
            Checking your session
          </ThemedText>
        </SafeAreaView>
      </ThemedView>
    );
  }

  if (!user) {
    return <AuthScreen />;
  }

  return children;
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
  },
  loadingContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
});
