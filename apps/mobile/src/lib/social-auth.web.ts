import { signInWithCustomToken } from 'firebase/auth';

import { auth } from './firebase';

export type HostedAuthProviderId = 'apple' | 'emailLink' | 'google' | 'microsoft';
export type SocialAuthProviderId = Exclude<HostedAuthProviderId, 'emailLink'>;

type AuthCode =
  | 'auth/invalid-action-code'
  | 'auth/invalid-credential'
  | 'auth/missing-hosted-auth-url'
  | 'auth/popup-closed-by-user';

function createAuthError(code: AuthCode, message: string) {
  return Object.assign(new Error(message), { code });
}

export function createHostedAuthState() {
  const bytes = new Uint8Array(16);
  window.crypto.getRandomValues(bytes);

  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function getHostedAuthUrl() {
  const hostedAuthUrl =
    process.env.EXPO_PUBLIC_AUTH_WEB_URL ??
    process.env.EXPO_PUBLIC_AUTH_EMAIL_LINK_WEB_CONTINUE_URL;

  if (!hostedAuthUrl) {
    throw createAuthError(
      'auth/missing-hosted-auth-url',
      'Hosted auth needs EXPO_PUBLIC_AUTH_WEB_URL.'
    );
  }

  return hostedAuthUrl;
}

export function getHostedAuthCallbackUrl() {
  return window.location.origin + window.location.pathname;
}

function parseParamString(value: string | undefined) {
  if (!value) {
    return {};
  }

  return Object.fromEntries(new URLSearchParams(value).entries());
}

export function getResponseParams(url: string) {
  const parsed = new URL(url);

  return {
    ...Object.fromEntries(parsed.searchParams.entries()),
    ...parseParamString(parsed.hash.replace(/^#/, '')),
  };
}

export function isHostedAuthCallback(url: string) {
  const params = getResponseParams(url);

  return (
    params.provider === 'google' ||
    params.provider === 'apple' ||
    params.provider === 'microsoft' ||
    params.provider === 'emailLink'
  );
}

export function isFirebaseRedirectHelper(url: string) {
  const parsed = new URL(url);

  return (
    parsed.pathname === '/__/auth/handler' &&
    parsed.searchParams.get('authType') === 'signInViaRedirect' &&
    parsed.searchParams.has('redirectUrl')
  );
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

  hostedAuthUrl.searchParams.set('platform', 'web');
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

export async function openHostedAuthSession(url: string): Promise<string> {
  window.location.assign(url);
  return new Promise(() => {});
}
