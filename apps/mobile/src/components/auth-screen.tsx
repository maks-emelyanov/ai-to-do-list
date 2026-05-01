import * as AppleAuthentication from 'expo-apple-authentication';
import React, { useEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, ButtonSpinner, ButtonText } from '@ui/button';
import { Card } from '@ui/card';
import { HStack } from '@ui/hstack';
import { Input, InputField } from '@ui/input';
import { VStack } from '@ui/vstack';
import { MaxContentWidth, Spacing } from '../constants/theme';
import { useAuth } from '../auth/auth-context';
import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';

type ProviderId = 'apple' | 'google' | 'microsoft';
type PendingAction = ProviderId | 'email-link' | null;
const isGoogleAuthEnabled =
  process.env.EXPO_PUBLIC_ENABLE_GOOGLE_AUTH_PROVIDER === 'true';
const isAppleAuthEnabled =
  process.env.EXPO_PUBLIC_ENABLE_APPLE_AUTH_PROVIDER === 'true';
const isMicrosoftAuthEnabled =
  process.env.EXPO_PUBLIC_ENABLE_MICROSOFT_AUTH_PROVIDER === 'true';

const errorMessages: Record<string, string> = {
  'auth/account-exists-with-different-credential':
    'That email already uses a different sign-in method.',
  'auth/cancelled-popup-request': 'Sign-in was cancelled.',
  'auth/email-already-in-use': 'That email already has an account.',
  'auth/google-redirect-helper-failed':
    'Google sign-in was redirected back to the app before the hosted auth page could finish.',
  'auth/hosted-auth-redirect-helper-opened-in-app':
    "Android opened Firebase's web sign-in redirect in the app before the hosted auth page could finish. Reinstall the app or clear Android app-link settings for this app, then try again.",
  'auth/hosted-auth-redirect-helper-failed':
    'Sign-in was redirected back to the app before the hosted auth page could finish.',
  'auth/custom-token-mismatch':
    'The auth server returned a token for a different Firebase project.',
  'auth/invalid-custom-token':
    'The auth server returned an invalid Firebase sign-in token.',
  'auth/invalid-credential': 'That sign-in response was incomplete or invalid.',
  'auth/invalid-email': 'Enter a valid email address.',
  'auth/invalid-action-code': 'That sign-in link is invalid or expired.',
  'auth/missing-hosted-auth-url':
    'Sign-in needs the hosted auth page URL in the app env.',
  'auth/missing-oauth-client-id':
    'This sign-in provider needs a native OAuth client ID in the app env.',
  'auth/missing-oauth-redirect-uri':
    'This sign-in provider needs a native OAuth redirect URI in the app env.',
  'auth/network-request-failed':
    'The network request failed. Check your connection and try again.',
  'auth/operation-not-allowed':
    'This sign-in method is not enabled for this Firebase project.',
  'auth/operation-not-supported-in-this-environment':
    'That sign-in method is not available on this device.',
  'auth/popup-blocked': 'Your browser blocked the sign-in popup.',
  'auth/popup-closed-by-user': 'Sign-in was cancelled.',
  'auth/requires-recent-login': 'Sign in again before changing this setting.',
  'auth/too-many-requests': 'Too many attempts. Wait a bit and try again.',
  'auth/user-disabled': 'This account has been disabled.',
};

function getErrorMessage(error: unknown) {
  if (typeof error === 'object' && error && 'code' in error) {
    const code = String(error.code);
    if (errorMessages[code]) {
      return errorMessages[code];
    }

    if (
      'message' in error &&
      typeof error.message === 'string' &&
      error.message
    ) {
      return error.message;
    }

    return 'Something went wrong. Try again.';
  }

  return 'Something went wrong. Try again.';
}

export function AuthScreen() {
  const {
    authError,
    clearAuthError,
    completeEmailLinkSignIn,
    pendingEmailLink,
    sendEmailLink,
    signInWithProvider,
  } = useAuth();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [isNativeAppleSignInAvailable, setIsNativeAppleSignInAvailable] =
    useState(Platform.OS !== 'ios');
  const isNativeAuth = Platform.OS !== 'web';
  const isCompletingEmailLink = pendingEmailLink !== null;
  const shouldShowEmailInput = isNativeAuth || isCompletingEmailLink;

  const copy = useMemo(
    () => {
      if (isCompletingEmailLink) {
        return {
          action: 'Finish sign-in',
          description: 'Enter the email address that requested this sign-in link.',
          title: 'Finish sign-in.',
        };
      }

      if (isNativeAuth) {
        return {
          action: 'Send sign-in link',
          description: 'Enter your email and open the secure link on this device.',
          title: 'Welcome back.',
        };
      }

      return {
        action: 'Continue with email',
        description:
          'Open the secure hosted sign-in page to choose email-link or a provider.',
        title: 'Welcome back.',
      };
    },
    [isCompletingEmailLink, isNativeAuth],
  );
  const isBusy = pendingAction !== null;
  const canSubmitEmailLink =
    !shouldShowEmailInput || email.trim().length > 0;
  const shouldShowAppleButton =
    isAppleAuthEnabled &&
    (Platform.OS !== 'ios' || isNativeAppleSignInAvailable);
  const providerButtons = [
    isGoogleAuthEnabled ? 'google' : null,
    shouldShowAppleButton ? 'apple' : null,
    isMicrosoftAuthEnabled ? 'microsoft' : null,
  ].filter(Boolean) as ProviderId[];
  const displayError = error ?? (authError ? getErrorMessage(authError) : null);

  useEffect(() => {
    if (Platform.OS !== 'ios' || !isAppleAuthEnabled) {
      return;
    }

    let isMounted = true;

    AppleAuthentication.isAvailableAsync()
      .then((isAvailable) => {
        if (isMounted) {
          setIsNativeAppleSignInAvailable(isAvailable);
        }
      })
      .catch(() => {
        if (isMounted) {
          setIsNativeAppleSignInAvailable(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  async function handleSubmit() {
    clearAuthError();
    setError(null);
    setNotice(null);
    setPendingAction('email-link');

    try {
      if (isCompletingEmailLink) {
        await completeEmailLinkSignIn(email);
        setEmail('');
      } else {
        await sendEmailLink(isNativeAuth ? email : undefined);

        if (isNativeAuth) {
          setNotice('Sign-in link sent. Open it on this device to finish.');
        }
      }
    } catch (nextError) {
      setError(getErrorMessage(nextError));
    } finally {
      setPendingAction(null);
    }
  }

  async function handleProviderSignIn(provider: ProviderId) {
    clearAuthError();
    setError(null);
    setNotice(null);
    setPendingAction(provider);

    try {
      await signInWithProvider(provider);
    } catch (nextError) {
      setError(getErrorMessage(nextError));
    } finally {
      setPendingAction(null);
    }
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.keyboardView}
        >
          <VStack className="gap-6" style={styles.content}>
            <VStack className="gap-3">
              <ThemedText type="smallBold" themeColor="textSecondary">
                Todo App
              </ThemedText>
              <ThemedText type="title" style={styles.title}>
                {copy.title}
              </ThemedText>
              <ThemedText themeColor="textSecondary">
                {copy.description}
              </ThemedText>
            </VStack>

            <Card className="rounded-[28px] p-5" style={styles.card}>
              <VStack className="gap-4">
                {displayError ? (
                  <ThemedText type="small" style={styles.errorText}>
                    {displayError}
                  </ThemedText>
                ) : null}

                {notice ? (
                  <ThemedText type="small" style={styles.noticeText}>
                    {notice}
                  </ThemedText>
                ) : null}

                {shouldShowEmailInput ? (
                  <Input
                    className="rounded-full"
                    isDisabled={isBusy}
                    size="xl"
                    variant="rounded"
                  >
                    <InputField
                      autoCapitalize="none"
                      autoComplete="email"
                      autoCorrect={false}
                      editable={!isBusy}
                      keyboardType="email-address"
                      onChangeText={setEmail}
                      onSubmitEditing={() => {
                        if (!isBusy && canSubmitEmailLink) {
                          void handleSubmit();
                        }
                      }}
                      placeholder="Email address"
                      returnKeyType="go"
                      textContentType="emailAddress"
                      value={email}
                    />
                  </Input>
                ) : null}

                <Button
                  action="primary"
                  className="rounded-full"
                  disabled={isBusy || !canSubmitEmailLink}
                  onPress={handleSubmit}
                  size="xl"
                >
                  {pendingAction === 'email-link' ? <ButtonSpinner /> : null}
                  <ButtonText>{copy.action}</ButtonText>
                </Button>

                {providerButtons.length > 0 ? (
                  <HStack className="items-center gap-3">
                    <ThemedView
                      type="backgroundSelected"
                      style={styles.divider}
                    />
                    <ThemedText type="small" themeColor="textSecondary">
                      or
                    </ThemedText>
                    <ThemedView
                      type="backgroundSelected"
                      style={styles.divider}
                    />
                  </HStack>
                ) : null}

                {isGoogleAuthEnabled ? (
                  <Button
                    action="secondary"
                    className="rounded-full"
                    disabled={isBusy}
                    onPress={() => handleProviderSignIn('google')}
                    size="xl"
                  >
                    {pendingAction === 'google' ? <ButtonSpinner /> : null}
                    <ButtonText>Continue with Google</ButtonText>
                  </Button>
                ) : null}

                {shouldShowAppleButton ? (
                  Platform.OS === 'ios' ? (
                    <View
                      pointerEvents={isBusy ? 'none' : 'auto'}
                      style={[
                        styles.appleButtonContainer,
                        isBusy ? styles.disabledText : null,
                      ]}
                    >
                      <AppleAuthentication.AppleAuthenticationButton
                        buttonStyle={
                          AppleAuthentication.AppleAuthenticationButtonStyle
                            .BLACK
                        }
                        buttonType={
                          AppleAuthentication.AppleAuthenticationButtonType
                            .CONTINUE
                        }
                        cornerRadius={26}
                        onPress={() => handleProviderSignIn('apple')}
                        style={styles.appleButton}
                      />
                    </View>
                  ) : (
                    <Button
                      action="secondary"
                      className="rounded-full"
                      disabled={isBusy}
                      onPress={() => handleProviderSignIn('apple')}
                      size="xl"
                    >
                      {pendingAction === 'apple' ? <ButtonSpinner /> : null}
                      <ButtonText>Continue with Apple</ButtonText>
                    </Button>
                  )
                ) : null}

                {isMicrosoftAuthEnabled ? (
                  <Button
                    action="secondary"
                    className="rounded-full"
                    disabled={isBusy}
                    onPress={() => handleProviderSignIn('microsoft')}
                    size="xl"
                  >
                    {pendingAction === 'microsoft' ? <ButtonSpinner /> : null}
                    <ButtonText>Continue with Microsoft</ButtonText>
                  </Button>
                ) : null}
              </VStack>
            </Card>
          </VStack>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
  },
  safeArea: {
    flex: 1,
    width: '100%',
    maxWidth: MaxContentWidth,
  },
  keyboardView: {
    flex: 1,
    justifyContent: 'center',
  },
  content: {
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.five,
  },
  title: {
    fontSize: 38,
    lineHeight: 42,
  },
  card: {
    borderWidth: 0,
  },
  appleButton: {
    height: 52,
    width: '100%',
  },
  appleButtonContainer: {
    width: '100%',
  },
  errorText: {
    color: '#D92D20',
  },
  noticeText: {
    color: '#047857',
  },
  disabledText: {
    opacity: 0.5,
  },
  divider: {
    flex: 1,
    height: 1,
  },
});
