import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import {
  sendSignInLinkToEmail,
  signOut as firebaseSignOut,
  type ActionCodeSettings,
} from 'firebase/auth';

import { auth } from '../lib/firebase';
import {
  completeEmailLinkSignIn as completeEmailLinkSignInWithFirebase,
  completeHostedAuthSignIn,
  createHostedAuthState,
  createHostedAuthUrl,
  getFirebaseAuthBrowserUrl,
  isFirebaseEmailActionLink,
  isFirebaseRedirectHelper,
  isHostedAuthCallback,
  openHostedAuthPage,
  openHostedAuthSession,
  signInWithAppleProvider,
  signInWithGoogleProvider,
  signInWithMicrosoftProvider,
  signOutFromGoogleProvider,
  type SocialAuthProviderId,
} from '../lib/social-auth';

const HOSTED_AUTH_STATE_STORAGE_KEY = 'todoapp.hostedAuthState';
const FIREBASE_AUTH_BROWSER_FORWARD_STORAGE_KEY =
  'todoapp.firebaseAuthBrowserForward';
const FIREBASE_AUTH_BROWSER_FORWARD_TTL_MS = 15_000;
const EMAIL_FOR_SIGN_IN_STORAGE_KEY = 'todoapp.emailForSignIn';

export type AuthSignInProviderId = SocialAuthProviderId;

export type IncomingAuthUrlResult =
  | { type: 'none' }
  | { type: 'openedHostedAuthPage' }
  | { type: 'pendingEmailLink'; emailLink: string }
  | { type: 'signedIn' };

function createAuthError(code: string, message: string) {
  return Object.assign(new Error(message), { code });
}

function getEnv(name: string) {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function getHost(value: string | undefined) {
  if (!value) {
    return undefined;
  }

  try {
    return new URL(value.includes('://') ? value : `https://${value}`)
      .hostname;
  } catch {
    return undefined;
  }
}

function isDefaultFirebaseHostingDomain(host: string) {
  return host.endsWith('.firebaseapp.com') || host.endsWith('.web.app');
}

function getEmailActionLinkDomain() {
  const linkDomain = getHost(getEnv('EXPO_PUBLIC_FIREBASE_AUTH_LINK_DOMAIN'));

  if (!linkDomain || isDefaultFirebaseHostingDomain(linkDomain)) {
    return undefined;
  }

  return linkDomain;
}

function requireEmail(email: string | undefined) {
  const trimmedEmail = email?.trim();

  if (!trimmedEmail) {
    throw createAuthError(
      'auth/invalid-email',
      'Enter a valid email address.',
    );
  }

  return trimmedEmail;
}

async function getStoredHostedAuthState() {
  if (Platform.OS === 'web') {
    return window.sessionStorage.getItem(HOSTED_AUTH_STATE_STORAGE_KEY);
  }

  return AsyncStorage.getItem(HOSTED_AUTH_STATE_STORAGE_KEY);
}

async function setStoredHostedAuthState(state: string) {
  if (Platform.OS === 'web') {
    window.sessionStorage.setItem(HOSTED_AUTH_STATE_STORAGE_KEY, state);
    return;
  }

  await AsyncStorage.setItem(HOSTED_AUTH_STATE_STORAGE_KEY, state);
}

async function clearStoredHostedAuthState() {
  if (Platform.OS === 'web') {
    window.sessionStorage.removeItem(HOSTED_AUTH_STATE_STORAGE_KEY);
    return;
  }

  await AsyncStorage.removeItem(HOSTED_AUTH_STATE_STORAGE_KEY);
}

async function clearFirebaseAuthBrowserForward() {
  if (Platform.OS === 'web') {
    return;
  }

  await AsyncStorage.removeItem(FIREBASE_AUTH_BROWSER_FORWARD_STORAGE_KEY);
}

async function getStoredEmailForSignIn() {
  if (Platform.OS === 'web') {
    return null;
  }

  return AsyncStorage.getItem(EMAIL_FOR_SIGN_IN_STORAGE_KEY);
}

async function setStoredEmailForSignIn(email: string) {
  if (Platform.OS === 'web') {
    return;
  }

  await AsyncStorage.setItem(EMAIL_FOR_SIGN_IN_STORAGE_KEY, email);
}

async function clearStoredEmailForSignIn() {
  if (Platform.OS === 'web') {
    return;
  }

  await AsyncStorage.removeItem(EMAIL_FOR_SIGN_IN_STORAGE_KEY);
}

async function wasFirebaseAuthUrlForwardedRecently(browserUrl: string) {
  const rawForward = await AsyncStorage.getItem(
    FIREBASE_AUTH_BROWSER_FORWARD_STORAGE_KEY,
  );

  if (!rawForward) {
    return false;
  }

  try {
    const forward = JSON.parse(rawForward) as {
      openedAt?: number;
      url?: string;
    };

    return (
      forward.url === browserUrl &&
      typeof forward.openedAt === 'number' &&
      Date.now() - forward.openedAt < FIREBASE_AUTH_BROWSER_FORWARD_TTL_MS
    );
  } catch {
    await clearFirebaseAuthBrowserForward();
    return false;
  }
}

async function markFirebaseAuthUrlForwarded(browserUrl: string) {
  await AsyncStorage.setItem(
    FIREBASE_AUTH_BROWSER_FORWARD_STORAGE_KEY,
    JSON.stringify({ openedAt: Date.now(), url: browserUrl }),
  );
}

function clearWebCallbackUrl() {
  if (Platform.OS !== 'web') {
    return;
  }

  window.history.replaceState({}, document.title, window.location.pathname);
}

async function completeHostedCallback(url: string) {
  try {
    await completeHostedAuthSignIn(url, await getStoredHostedAuthState());
    await clearStoredHostedAuthState();
    await clearFirebaseAuthBrowserForward();
    clearWebCallbackUrl();
  } catch (error) {
    await clearStoredHostedAuthState();
    clearWebCallbackUrl();
    throw error;
  }
}

async function startHostedAuth(provider?: AuthSignInProviderId) {
  const state = createHostedAuthState();
  const mode = provider ? undefined : 'email-link';
  const hostedAuthUrl = createHostedAuthUrl({ mode, provider, state });
  const shouldCompleteFromLinking =
    Platform.OS === 'android' || (Platform.OS !== 'web' && !provider);

  await setStoredHostedAuthState(state);
  await clearFirebaseAuthBrowserForward();

  try {
    if (shouldCompleteFromLinking) {
      await openHostedAuthPage(hostedAuthUrl);
      return;
    }

    await completeHostedAuthSignIn(
      await openHostedAuthSession(hostedAuthUrl),
      state,
    );
    await clearStoredHostedAuthState();
  } catch (error) {
    await clearStoredHostedAuthState();
    throw error;
  }
}

function createEmailActionCodeSettings(url: string): ActionCodeSettings {
  const actionCodeSettings: ActionCodeSettings = {
    handleCodeInApp: true,
    url,
  };
  const androidPackageName = getEnv('EXPO_PUBLIC_ANDROID_PACKAGE_NAME');
  const iosBundleId = getEnv('EXPO_PUBLIC_IOS_BUNDLE_ID');
  const linkDomain = getEmailActionLinkDomain();

  if (androidPackageName) {
    actionCodeSettings.android = {
      installApp: true,
      packageName: androidPackageName,
    };
  }

  if (iosBundleId) {
    actionCodeSettings.iOS = { bundleId: iosBundleId };
  }

  if (linkDomain) {
    actionCodeSettings.linkDomain = linkDomain;
  }

  return actionCodeSettings;
}

async function sendNativeEmailLink(email: string) {
  const trimmedEmail = requireEmail(email);
  const state = createHostedAuthState();
  const hostedAuthUrl = createHostedAuthUrl({
    mode: 'email-link',
    state,
  });

  await setStoredHostedAuthState(state);
  await setStoredEmailForSignIn(trimmedEmail);
  await clearFirebaseAuthBrowserForward();

  try {
    await sendSignInLinkToEmail(
      auth,
      trimmedEmail,
      createEmailActionCodeSettings(hostedAuthUrl),
    );
  } catch (error) {
    await clearStoredHostedAuthState();
    await clearStoredEmailForSignIn();
    throw error;
  }
}

export async function completeIncomingAuthUrl(
  url: string | null,
): Promise<IncomingAuthUrlResult> {
  if (!url) {
    return { type: 'none' };
  }

  if (Platform.OS !== 'web' && isFirebaseRedirectHelper(url)) {
    const browserUrl = getFirebaseAuthBrowserUrl(url);

    if (browserUrl && !(await wasFirebaseAuthUrlForwardedRecently(browserUrl))) {
      await markFirebaseAuthUrlForwarded(browserUrl);
      await openHostedAuthPage(browserUrl);

      return { type: 'openedHostedAuthPage' };
    }

    throw createAuthError(
      'auth/hosted-auth-redirect-helper-opened-in-app',
      "Android opened Firebase's web sign-in redirect in the app before the hosted auth page could finish. Reinstall the app or clear Android app-link settings for this app, then try again.",
    );
  }

  if (Platform.OS !== 'web' && isFirebaseEmailActionLink(url)) {
    const emailLink = getFirebaseAuthBrowserUrl(url) ?? url;
    const storedEmail = await getStoredEmailForSignIn();

    await clearFirebaseAuthBrowserForward();

    if (storedEmail) {
      await completeEmailLinkSignInWithFirebase(storedEmail, emailLink);
      await clearStoredHostedAuthState();
      await clearStoredEmailForSignIn();

      return { type: 'signedIn' };
    }

    return {
      emailLink,
      type: 'pendingEmailLink',
    };
  }

  if (isHostedAuthCallback(url)) {
    await completeHostedCallback(url);

    return { type: 'signedIn' };
  }

  return { type: 'none' };
}

export async function sendEmailLink(email?: string) {
  if (Platform.OS === 'web') {
    await startHostedAuth();
    return;
  }

  await sendNativeEmailLink(requireEmail(email));
}

export async function signInWithProvider(provider: AuthSignInProviderId) {
  if (Platform.OS === 'web') {
    if (provider === 'google') {
      await signInWithGoogleProvider();
      return;
    }

    await startHostedAuth(provider);
    return;
  }

  if (provider === 'apple') {
    if (Platform.OS === 'ios') {
      await signInWithAppleProvider();
    } else {
      await startHostedAuth(provider);
    }

    return;
  }

  if (provider === 'microsoft') {
    await signInWithMicrosoftProvider();
    return;
  }

  await signInWithGoogleProvider();
}

export async function completeEmailLinkSignIn(
  email: string,
  pendingEmailLink: string | null,
) {
  if (!pendingEmailLink) {
    throw createAuthError(
      'auth/invalid-action-code',
      'Open a sign-in link from your email first.',
    );
  }

  await completeEmailLinkSignInWithFirebase(email, pendingEmailLink);
  await clearStoredHostedAuthState();
  await clearFirebaseAuthBrowserForward();
  await clearStoredEmailForSignIn();
}

export async function signOut() {
  await signOutFromGoogleProvider().catch(() => {});
  await clearStoredEmailForSignIn();
  await firebaseSignOut(auth);
}
