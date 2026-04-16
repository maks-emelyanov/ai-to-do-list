import React from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Card } from '@ui/card';
import { VStack } from '@ui/vstack';
import { BottomTabInset, MaxContentWidth, Spacing } from '../constants/theme';
import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';

type TabScreenShellProps = {
  children: React.ReactNode;
  description: string;
  eyebrow: string;
  title: string;
};

export function TabScreenShell({
  children,
  description,
  eyebrow,
  title,
}: TabScreenShellProps) {
  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}>
          <VStack className="gap-5">
            <Card className="rounded-[32px] p-6" style={styles.heroCard}>
              <VStack className="gap-3">
                <ThemedText type="smallBold" themeColor="textSecondary">
                  {eyebrow}
                </ThemedText>
                <ThemedText type="title" style={styles.title}>
                  {title}
                </ThemedText>
                <ThemedText themeColor="textSecondary">{description}</ThemedText>
              </VStack>
            </Card>

            {children}
          </VStack>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
  },
  safeArea: {
    flex: 1,
    width: '100%',
    maxWidth: MaxContentWidth,
  },
  scrollContent: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
    paddingBottom: BottomTabInset + Spacing.five,
  },
  heroCard: {
    borderWidth: 0,
  },
  title: {
    fontSize: 34,
    lineHeight: 38,
  },
});
