import * as Crypto from 'expo-crypto';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { signInWithCustomToken } from 'firebase/auth';

import { auth } from './firebase';

WebBrowser.maybeCompleteAuthSession();

export type HostedAuthProviderId = 'apple' | 'emailLink' | 'google' | 'microsoft';
export type SocialAuthProviderId = Exclude<HostedAuthProviderId, 'emailLink'>;

const HOSTED_AUTH_CALLBACK_SCHEME = 'mobile';

type AuthCode =
  | 'auth/invalid-action-code'
  | 'auth/invalid-credential'
  | 'auth/missing-hosted-auth-url'
  | 'auth/operation-not-supported-in-this-environment'
  | 'auth/popup-closed-by-user';

function createAuthError(code: AuthCode, message: string) {
  return Object.assign(new Error(message), { code });
}

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export function createHostedAuthState() {
  return bytesToHex(Crypto.getRandomBytes(16));
}

function decodeUrlComponent(value: string) {
  return decodeURIComponent(value.replace(/\+/g, '%20'));
}

function parseParamString(value: string | undefined) {
  if (!value) {
    return {};
  }

  return Object.fromEntries(
    value
      .split('&')
      .filter(Boolean)
      .map((entry) => {
        const [rawKey, rawValue = ''] = entry.split('=');
        return [decodeUrlComponent(rawKey), decodeUrlComponent(rawValue)];
      })
  );
}

export function getHostedAuthCallbackUrl() {
  return Linking.createURL('auth/provider-callback', { scheme: HOSTED_AUTH_CALLBACK_SCHEME });
}

function getHostedAuthUrl() {
  const hostedAuthUrl =
    process.env.EXPO_PUBLIC_AUTH_WEB_URL ??
    process.env.EXPO_PUBLIC_AUTH_EMAIL_LINK_NATIVE_CONTINUE_URL;

  if (!hostedAuthUrl) {
    throw createAuthError(
      'auth/missing-hosted-auth-url',
      'Hosted auth needs EXPO_PUBLIC_AUTH_WEB_URL or EXPO_PUBLIC_AUTH_EMAIL_LINK_NATIVE_CONTINUE_URL.'
    );
  }

  return hostedAuthUrl;
}

export function getResponseParams(url: string) {
  const parsed = Linking.parse(url);
  const [withoutHash] = url.split('#');
  const fragment = url.slice(withoutHash.length + 1);

  return {
    ...Object.fromEntries(
      Object.entries(parsed.queryParams ?? {}).map(([key, value]) => [
        key,
        Array.isArray(value) ? value[0] : value,
      ])
    ),
    ...parseParamString(fragment),
  };
}

export function isHostedAuthCallback(url: string) {
  const parsed = Linking.parse(url);
  const params = getResponseParams(url);

  return (
    parsed.path === 'auth/provider-callback' ||
    (parsed.hostname === 'auth' && parsed.path === 'provider-callback') ||
    params.provider === 'google' ||
    params.provider === 'apple' ||
    params.provider === 'microsoft' ||
    params.provider === 'emailLink'
  );
}

function getFirebaseAuthPath(url: string) {
  const parsed = Linking.parse(url);
  const path = parsed.path ? `/${parsed.path.replace(/^\/+/, '')}` : '';
  const hostAndPath = parsed.hostname ? `/${parsed.hostname}${path}` : path;
  const candidates = [path, hostAndPath, url];

  if (candidates.some((candidate) => candidate.includes('/__/auth/handler'))) {
    return '/__/auth/handler';
  }

  if (candidates.some((candidate) => candidate.includes('/__/auth/action'))) {
    return '/__/auth/action';
  }

  if (candidates.some((candidate) => candidate.includes('/__/auth/links'))) {
    return '/__/auth/links';
  }

  return null;
}

function getFirebaseAuthDomain() {
  const authDomain = process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN;

  if (authDomain) {
    return authDomain.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  }

  return new URL(getHostedAuthUrl()).hostname;
}

export function isFirebaseRedirectHelper(url: string) {
  const params = getResponseParams(url);

  return (
    getFirebaseAuthPath(url) === '/__/auth/handler' &&
    params.authType === 'signInViaRedirect' &&
    typeof params.redirectUrl === 'string'
  );
}

export function isFirebaseEmailActionLink(url: string) {
  const params = getResponseParams(url);

  return (
    ['/__/auth/action', '/__/auth/links'].includes(getFirebaseAuthPath(url) ?? '') &&
    (params.mode === 'signIn' || typeof params.oobCode === 'string')
  );
}

export function getFirebaseAuthBrowserUrl(url: string) {
  const path = getFirebaseAuthPath(url);

  if (!path) {
    return null;
  }

  try {
    const parsed = new URL(url);

    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return parsed.toString();
    }

    const browserUrl = new URL(`https://${getFirebaseAuthDomain()}${path}`);
    browserUrl.search = parsed.search;
    browserUrl.hash = parsed.hash;

    return browserUrl.toString();
  } catch {
    const browserUrl = new URL(`https://${getFirebaseAuthDomain()}${path}`);
    const params = getResponseParams(url);

    Object.entries(params).forEach(([key, value]) => {
      if (value) {
        browserUrl.searchParams.set(key, value);
      }
    });

    return browserUrl.toString();
  }
}

export function createHostedAuthUrl({
  mode,
  provider,
  returnTo = getHostedAuthCallbackUrl(),
  state,
}: {
  mode?: string;
  provider?: SocialAuthProviderId;
  returnTo?: string;
  state: string;
}) {
  const hostedAuthUrl = new URL(getHostedAuthUrl());

  hostedAuthUrl.searchParams.set('platform', 'native');
  hostedAuthUrl.searchParams.set('returnTo', returnTo);
  hostedAuthUrl.searchParams.set('state', state);

  if (mode) {
    hostedAuthUrl.searchParams.set('mode', mode);
  }

  if (provider) {
    hostedAuthUrl.searchParams.set('provider', provider);
  }

  return hostedAuthUrl.toString();
}

function requireExpectedState(params: Record<string, string | undefined>, expectedState: string | null) {
  if (!expectedState || params.state !== expectedState) {
    throw createAuthError('auth/invalid-action-code', 'The sign-in response did not match this session.');
  }
}

function throwIfProviderError(params: Record<string, string | undefined>) {
  if (!params.error) {
    return;
  }

  if (params.error === 'access_denied') {
    throw createAuthError('auth/popup-closed-by-user', 'Sign-in was cancelled.');
  }

  throw createAuthError(
    'auth/invalid-credential',
    params.error_description || 'The sign-in provider did not accept this request.'
  );
}

async function signInWithHostedCustomToken(params: Record<string, string | undefined>) {
  if (!['apple', 'emailLink', 'google', 'microsoft'].includes(params.provider ?? '')) {
    throw createAuthError(
      'auth/invalid-credential',
      'The hosted auth page returned an unknown sign-in provider.'
    );
  }

  if (!params.token) {
    throw createAuthError(
      'auth/invalid-credential',
      'The hosted auth page did not return a Firebase custom token.'
    );
  }

  await signInWithCustomToken(auth, params.token);
}

export async function completeHostedAuthSignIn(url: string, expectedState: string | null) {
  const params = getResponseParams(url);

  requireExpectedState(params, expectedState);
  throwIfProviderError(params);
  await signInWithHostedCustomToken(params);

  return true;
}

export async function openHostedAuthSession(url: string) {
  const result = await WebBrowser.openAuthSessionAsync(url, getHostedAuthCallbackUrl());

  if (result.type === 'cancel' || result.type === 'dismiss') {
    throw createAuthError('auth/popup-closed-by-user', 'Sign-in was cancelled.');
  }

  if (result.type !== 'success' || !result.url) {
    throw createAuthError(
      'auth/operation-not-supported-in-this-environment',
      'This sign-in flow is not available on this device.'
    );
  }

  return result.url;
}

export async function openHostedAuthPage(url: string) {
  await WebBrowser.openBrowserAsync(url);
}

export async function signInWithHostedProvider(provider: SocialAuthProviderId) {
  const state = createHostedAuthState();
  const url = createHostedAuthUrl({ provider, state });
  const callbackUrl = await openHostedAuthSession(url);

  await completeHostedAuthSignIn(callbackUrl, state);
}

export async function signInWithHostedEmailLink() {
  const state = createHostedAuthState();
  const url = createHostedAuthUrl({ mode: 'email-link', state });
  const callbackUrl = await openHostedAuthSession(url);

  await completeHostedAuthSignIn(callbackUrl, state);
}
