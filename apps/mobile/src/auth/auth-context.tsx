import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Linking from 'expo-linking';
import {
  onAuthStateChanged,
  sendEmailVerification,
  signOut as firebaseSignOut,
  type User,
} from 'firebase/auth';

import { auth } from '../lib/firebase';
import {
  completeHostedAuthSignIn,
  createHostedAuthState,
  createHostedAuthUrl,
  getFirebaseAuthBrowserUrl,
  isFirebaseEmailActionLink,
  isFirebaseRedirectHelper,
  isHostedAuthCallback,
  openHostedAuthPage,
  openHostedAuthSession,
  type SocialAuthProviderId,
} from '../lib/social-auth';

const HOSTED_AUTH_STATE_STORAGE_KEY = 'todoapp.hostedAuthState';
const FIREBASE_AUTH_BROWSER_FORWARD_STORAGE_KEY = 'todoapp.firebaseAuthBrowserForward';
const FIREBASE_AUTH_BROWSER_FORWARD_TTL_MS = 15_000;

type AuthErrorState = {
  code: string;
  message: string;
};

function createAuthErrorState(code: string, message: string): AuthErrorState {
  return { code, message };
}

function toAuthErrorState(error: unknown): AuthErrorState {
  if (typeof error === 'object' && error) {
    const code =
      'code' in error && typeof error.code === 'string' ? error.code : 'auth/unknown';
    const message =
      'message' in error && typeof error.message === 'string'
        ? error.message
        : 'Something went wrong. Try again.';

    return { code, message };
  }

  return {
    code: 'auth/unknown',
    message: 'Something went wrong. Try again.',
  };
}

async function wasFirebaseAuthUrlForwardedRecently(browserUrl: string) {
  const rawForward = await AsyncStorage.getItem(FIREBASE_AUTH_BROWSER_FORWARD_STORAGE_KEY);

  if (!rawForward) {
    return false;
  }

  try {
    const forward = JSON.parse(rawForward) as { openedAt?: number; url?: string };

    return (
      forward.url === browserUrl &&
      typeof forward.openedAt === 'number' &&
      Date.now() - forward.openedAt < FIREBASE_AUTH_BROWSER_FORWARD_TTL_MS
    );
  } catch {
    await AsyncStorage.removeItem(FIREBASE_AUTH_BROWSER_FORWARD_STORAGE_KEY);
    return false;
  }
}

async function markFirebaseAuthUrlForwarded(browserUrl: string) {
  await AsyncStorage.setItem(
    FIREBASE_AUTH_BROWSER_FORWARD_STORAGE_KEY,
    JSON.stringify({ openedAt: Date.now(), url: browserUrl })
  );
}

type AuthContextValue = {
  authError: AuthErrorState | null;
  clearAuthError: () => void;
  isLoading: boolean;
  refreshUser: () => Promise<void>;
  sendVerificationEmail: () => Promise<void>;
  signInWithApple: () => Promise<void>;
  signInWithEmailLink: () => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signInWithMicrosoft: () => Promise<void>;
  signOut: () => Promise<void>;
  user: User | null;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [authError, setAuthError] = useState<AuthErrorState | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    return onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setIsLoading(false);
    });
  }, []);

  useEffect(() => {
    async function handleUrl(url: string | null) {
      if (!url) {
        return;
      }

      if (Platform.OS !== 'web' && isFirebaseRedirectHelper(url)) {
        const browserUrl = getFirebaseAuthBrowserUrl(url);

        if (browserUrl && !(await wasFirebaseAuthUrlForwardedRecently(browserUrl))) {
          await markFirebaseAuthUrlForwarded(browserUrl);
          setAuthError(null);
          await openHostedAuthPage(browserUrl);
          return;
        }

        setAuthError(
          createAuthErrorState(
            'auth/hosted-auth-redirect-helper-opened-in-app',
            "Android opened Firebase's web sign-in redirect in the app before the hosted auth page could finish. Reinstall the app or clear Android app-link settings for this app, then try again."
          )
        );

        return;
      }

      if (Platform.OS !== 'web' && isFirebaseEmailActionLink(url)) {
        const browserUrl = getFirebaseAuthBrowserUrl(url);

        if (browserUrl && !(await wasFirebaseAuthUrlForwardedRecently(browserUrl))) {
          await markFirebaseAuthUrlForwarded(browserUrl);
          setAuthError(null);
          await openHostedAuthPage(browserUrl);
          return;
        }

        setAuthError(
          createAuthErrorState(
            'auth/email-link-opened-in-app',
            'This email sign-in link opened in the app before the hosted auth page could finish. Open the link in your browser, or reinstall the app to clear stale Android app-link handling.'
          )
        );

        return;
      }

      if (isHostedAuthCallback(url)) {
        try {
          const expectedState =
            Platform.OS === 'web'
              ? window.sessionStorage.getItem(HOSTED_AUTH_STATE_STORAGE_KEY)
              : await AsyncStorage.getItem(HOSTED_AUTH_STATE_STORAGE_KEY);

          await completeHostedAuthSignIn(url, expectedState);

          if (Platform.OS === 'web') {
            window.sessionStorage.removeItem(HOSTED_AUTH_STATE_STORAGE_KEY);
            window.history.replaceState({}, document.title, window.location.pathname);
          } else {
            await AsyncStorage.removeItem(HOSTED_AUTH_STATE_STORAGE_KEY);
            await AsyncStorage.removeItem(FIREBASE_AUTH_BROWSER_FORWARD_STORAGE_KEY);
          }

          setAuthError(null);
        } catch (error) {
          if (Platform.OS === 'web') {
            window.sessionStorage.removeItem(HOSTED_AUTH_STATE_STORAGE_KEY);
          } else {
            await AsyncStorage.removeItem(HOSTED_AUTH_STATE_STORAGE_KEY);
          }

          setAuthError(toAuthErrorState(error));
        }

        return;
      }
    }

    if (Platform.OS === 'web') {
      void handleUrl(window.location.href);
      return;
    }

    void Linking.getInitialURL().then(handleUrl);

    const subscription = Linking.addEventListener('url', (event) => {
      void handleUrl(event.url);
    });

    return () => subscription.remove();
  }, []);

  async function signInWithHostedAuth(provider?: SocialAuthProviderId) {
    const state = createHostedAuthState();
    const mode = provider ? undefined : 'email-link';
    const hostedAuthUrl = createHostedAuthUrl({ mode, provider, state });
    const shouldCompleteFromLinking =
      Platform.OS === 'android' || (Platform.OS !== 'web' && !provider);

    if (Platform.OS === 'web') {
      window.sessionStorage.setItem(HOSTED_AUTH_STATE_STORAGE_KEY, state);
    } else {
      await AsyncStorage.setItem(HOSTED_AUTH_STATE_STORAGE_KEY, state);
      await AsyncStorage.removeItem(FIREBASE_AUTH_BROWSER_FORWARD_STORAGE_KEY);
    }

    try {
      if (shouldCompleteFromLinking) {
        await openHostedAuthPage(hostedAuthUrl);
        setAuthError(null);
        return;
      }

      const callbackUrl = await openHostedAuthSession(hostedAuthUrl);
      await completeHostedAuthSignIn(callbackUrl, state);

      if (Platform.OS === 'web') {
        window.sessionStorage.removeItem(HOSTED_AUTH_STATE_STORAGE_KEY);
      } else {
        await AsyncStorage.removeItem(HOSTED_AUTH_STATE_STORAGE_KEY);
      }

      setAuthError(null);
    } catch (error) {
      if (Platform.OS === 'web') {
        window.sessionStorage.removeItem(HOSTED_AUTH_STATE_STORAGE_KEY);
      } else {
        await AsyncStorage.removeItem(HOSTED_AUTH_STATE_STORAGE_KEY);
      }

      throw error;
    }
  }

  const value = useMemo<AuthContextValue>(
    () => ({
      authError,
      clearAuthError: () => {
        setAuthError(null);
      },
      isLoading,
      refreshUser: async () => {
        if (!auth.currentUser) {
          return;
        }

        await auth.currentUser.reload();
        setUser(auth.currentUser);
      },
      sendVerificationEmail: async () => {
        if (!auth.currentUser) {
          return;
        }

        await sendEmailVerification(auth.currentUser);
      },
      signInWithApple: async () => {
        await signInWithHostedAuth('apple');
      },
      signInWithEmailLink: async () => {
        await signInWithHostedAuth();
      },
      signInWithGoogle: async () => {
        await signInWithHostedAuth('google');
      },
      signInWithMicrosoft: async () => {
        await signInWithHostedAuth('microsoft');
      },
      signOut: async () => {
        await firebaseSignOut(auth);
      },
      user,
    }),
    [authError, isLoading, user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);

  if (!value) {
    throw new Error('useAuth must be used inside AuthProvider.');
  }

  return value;
}
