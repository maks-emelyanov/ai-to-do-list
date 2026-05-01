import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { Platform } from 'react-native';
import * as Linking from 'expo-linking';
import {
  onAuthStateChanged,
  sendEmailVerification,
  type User,
} from 'firebase/auth';

import { auth } from '../lib/firebase';
import {
  completeEmailLinkSignIn as completeEmailLinkSignInWithService,
  completeIncomingAuthUrl,
  sendEmailLink as sendEmailLinkWithService,
  signInWithProvider as signInWithProviderWithService,
  signOut as signOutWithService,
  type AuthSignInProviderId,
} from './auth-service';

type AuthErrorState = {
  code: string;
  message: string;
};

function toAuthErrorState(error: unknown): AuthErrorState {
  if (typeof error === 'object' && error) {
    const code =
      'code' in error && typeof error.code === 'string'
        ? error.code
        : 'auth/unknown';
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

type AuthContextValue = {
  authError: AuthErrorState | null;
  clearAuthError: () => void;
  completeEmailLinkSignIn: (email: string) => Promise<void>;
  isLoading: boolean;
  pendingEmailLink: string | null;
  refreshUser: () => Promise<void>;
  sendEmailLink: (email?: string) => Promise<void>;
  sendVerificationEmail: () => Promise<void>;
  signInWithProvider: (provider: AuthSignInProviderId) => Promise<void>;
  signOut: () => Promise<void>;
  user: User | null;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [authError, setAuthError] = useState<AuthErrorState | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [pendingEmailLink, setPendingEmailLink] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    return onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setIsLoading(false);
    });
  }, []);

  useEffect(() => {
    async function handleUrl(url: string | null) {
      try {
        const result = await completeIncomingAuthUrl(url);

        if (result.type === 'pendingEmailLink') {
          setPendingEmailLink(result.emailLink);
          setAuthError(null);
          return;
        }

        if (result.type !== 'none') {
          setAuthError(null);
        }
      } catch (error) {
        setAuthError(toAuthErrorState(error));
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

  const sendEmailLink = useCallback(async (email?: string) => {
    setPendingEmailLink(null);
    await sendEmailLinkWithService(email);
    setAuthError(null);
  }, []);

  const signInWithProvider = useCallback(
    async (provider: AuthSignInProviderId) => {
      await signInWithProviderWithService(provider);
      setAuthError(null);
    },
    [],
  );

  const completeEmailLinkSignIn = useCallback(
    async (email: string) => {
      await completeEmailLinkSignInWithService(email, pendingEmailLink);
      setPendingEmailLink(null);
      setAuthError(null);
    },
    [pendingEmailLink],
  );

  const signOut = useCallback(async () => {
    await signOutWithService();
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      authError,
      clearAuthError: () => {
        setAuthError(null);
      },
      completeEmailLinkSignIn,
      isLoading,
      pendingEmailLink,
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
      sendEmailLink,
      signInWithProvider,
      signOut,
      user,
    }),
    [
      authError,
      completeEmailLinkSignIn,
      isLoading,
      pendingEmailLink,
      sendEmailLink,
      signInWithProvider,
      signOut,
      user,
    ],
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
