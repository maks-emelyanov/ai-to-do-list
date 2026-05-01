import {
  GoogleAuthProvider,
  signInWithCredential,
  signInWithCustomToken,
} from 'firebase/auth';

import { auth } from './firebase';

export type HostedAuthProviderId =
  | 'apple'
  | 'emailLink'
  | 'google'
  | 'microsoft';
export type SocialAuthProviderId = Exclude<HostedAuthProviderId, 'emailLink'>;

type AuthCode =
  | 'auth/invalid-action-code'
  | 'auth/invalid-credential'
  | 'auth/missing-hosted-auth-url'
  | 'auth/missing-oauth-client-id'
  | 'auth/operation-not-supported-in-this-environment'
  | 'auth/popup-blocked'
  | 'auth/popup-closed-by-user';
type HostedAuthExchangeContext = {
  code: string;
  platform: 'web';
  provider: HostedAuthProviderId;
  returnTo: string;
  state: string;
};
type GoogleTokenResponse = {
  access_token?: string;
  error?: string;
  error_description?: string;
};
type GoogleTokenError = {
  message?: string;
  type?: string;
};
type GoogleOAuth2Api = {
  initTokenClient: (options: {
    callback: (response: GoogleTokenResponse) => void;
    client_id: string;
    error_callback?: (response: GoogleTokenError) => void;
    scope: string;
  }) => {
    requestAccessToken: (options?: { prompt?: string }) => void;
  };
};

declare global {
  interface Window {
    google?: {
      accounts?: {
        oauth2?: GoogleOAuth2Api;
      };
    };
  }
}

const GOOGLE_IDENTITY_SCRIPT_URL = 'https://accounts.google.com/gsi/client';
let googleIdentityScriptPromise: Promise<void> | null = null;

function createAuthError(code: AuthCode, message: string) {
  return Object.assign(new Error(message), { code });
}

function getGoogleWebClientId() {
  const clientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID?.trim();

  if (!clientId) {
    throw createAuthError(
      'auth/missing-oauth-client-id',
      'Google sign-in needs EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID configured.'
    );
  }

  return clientId;
}

function loadScript(src: string) {
  return new Promise<void>((resolve, reject) => {
    const existingScript = document.querySelector(`script[src="${src}"]`);

    if (existingScript) {
      if (window.google?.accounts?.oauth2) {
        resolve();
        return;
      }

      existingScript.addEventListener('load', () => resolve(), { once: true });
      existingScript.addEventListener('error', reject, { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.defer = true;
    script.addEventListener('load', () => resolve(), { once: true });
    script.addEventListener('error', reject, { once: true });
    document.head.appendChild(script);
  });
}

async function loadGoogleOAuth2() {
  if (window.google?.accounts?.oauth2) {
    return window.google.accounts.oauth2;
  }

  googleIdentityScriptPromise ??= loadScript(GOOGLE_IDENTITY_SCRIPT_URL);
  await googleIdentityScriptPromise;

  if (!window.google?.accounts?.oauth2) {
    throw createAuthError(
      'auth/operation-not-supported-in-this-environment',
      'Unable to load Google sign-in.'
    );
  }

  return window.google.accounts.oauth2;
}

async function requestGoogleAccessToken() {
  const googleOAuth2 = await loadGoogleOAuth2();

  return new Promise<string>((resolve, reject) => {
    const tokenClient = googleOAuth2.initTokenClient({
      client_id: getGoogleWebClientId(),
      scope: 'openid email profile',
      callback: (response) => {
        if (response.error) {
          reject(
            createAuthError(
              'auth/invalid-credential',
              response.error_description || response.error
            )
          );
          return;
        }

        if (!response.access_token) {
          reject(
            createAuthError(
              'auth/invalid-credential',
              'Google sign-in did not return an access token.'
            )
          );
          return;
        }

        resolve(response.access_token);
      },
      error_callback: (response) => {
        const errorType = response.type ?? '';

        reject(
          createAuthError(
            errorType === 'popup_closed'
              ? 'auth/popup-closed-by-user'
              : errorType === 'popup_failed_to_open'
                ? 'auth/popup-blocked'
              : 'auth/operation-not-supported-in-this-environment',
            response.message || errorType || 'Unable to open Google sign-in.'
          )
        );
      },
    });

    tokenClient.requestAccessToken({ prompt: 'select_account' });
  });
}

if (typeof window !== 'undefined') {
  void loadGoogleOAuth2().catch(() => {});
}

function isHostedAuthProviderId(
  provider: unknown
): provider is HostedAuthProviderId {
  return (
    provider === 'apple' ||
    provider === 'emailLink' ||
    provider === 'google' ||
    provider === 'microsoft'
  );
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

function getHostedAuthSessionUrl() {
  return new URL('/auth/session', getHostedAuthUrl()).toString();
}

async function exchangeHostedAuthCode(context: HostedAuthExchangeContext) {
  const response = await fetch(getHostedAuthSessionUrl(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(context),
  });
  const payload = (await response.json().catch(() => ({}))) as {
    error?: unknown;
    token?: unknown;
  };

  if (!response.ok || typeof payload.token !== 'string') {
    const code =
      payload.error === 'expired-exchange-code' ||
      payload.error === 'invalid-exchange-code'
        ? 'auth/invalid-action-code'
        : 'auth/invalid-credential';

    throw createAuthError(
      code,
      'The auth server did not accept this sign-in response.'
    );
  }

  return payload.token;
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

export function isFirebaseEmailActionLink() {
  return false;
}

export function getFirebaseAuthBrowserUrl() {
  return null;
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

function requireExpectedState(
  params: Record<string, string | undefined>,
  expectedState: string | null
) {
  if (!params.state) {
    throw createAuthError(
      'auth/invalid-action-code',
      'The sign-in response did not match this session.'
    );
  }

  if (params.state === expectedState) {
    return;
  }

  if (!expectedState && params.provider === 'emailLink') {
    return;
  }

  throw createAuthError(
    'auth/invalid-action-code',
    'The sign-in response did not match this session.'
  );
}

function throwIfProviderError(params: Record<string, string | undefined>) {
  if (!params.error) {
    return;
  }

  if (params.error === 'access_denied') {
    throw createAuthError(
      'auth/popup-closed-by-user',
      'Sign-in was cancelled.'
    );
  }

  throw createAuthError(
    'auth/invalid-credential',
    params.error_description ||
      'The sign-in provider did not accept this request.'
  );
}

async function signInWithHostedExchangeCode(
  params: Record<string, string | undefined>
) {
  const provider = params.provider;

  if (!isHostedAuthProviderId(provider)) {
    throw createAuthError(
      'auth/invalid-credential',
      'The hosted auth page returned an unknown sign-in provider.'
    );
  }

  if (!params.code) {
    throw createAuthError(
      'auth/invalid-credential',
      'The hosted auth page did not return an auth exchange code.'
    );
  }

  if (!params.state) {
    throw createAuthError(
      'auth/invalid-action-code',
      'The hosted auth page did not return a matching state.'
    );
  }

  await signInWithCustomToken(
    auth,
    await exchangeHostedAuthCode({
      code: params.code,
      platform: 'web',
      provider,
      returnTo: getHostedAuthCallbackUrl(),
      state: params.state,
    })
  );
}

export async function completeHostedAuthSignIn(
  url: string,
  expectedState: string | null
) {
  const params = getResponseParams(url);

  requireExpectedState(params, expectedState);
  throwIfProviderError(params);
  await signInWithHostedExchangeCode(params);

  return true;
}

export async function openHostedAuthSession(url: string): Promise<string> {
  window.location.assign(url);
  return new Promise(() => {});
}

export async function openHostedAuthPage(url: string): Promise<void> {
  window.location.assign(url);
  return new Promise(() => {});
}

export async function completeEmailLinkSignIn() {
  throw createAuthError(
    'auth/operation-not-supported-in-this-environment',
    'Email link sign-in completion should use the hosted auth page on web.'
  );
}

export async function signInWithGoogleProvider() {
  const accessToken = await requestGoogleAccessToken();

  await signInWithCredential(
    auth,
    GoogleAuthProvider.credential(null, accessToken)
  );
}

export async function signInWithAppleProvider() {
  throw createAuthError(
    'auth/operation-not-supported-in-this-environment',
    'Apple sign-in should use the hosted auth page on web.'
  );
}

export async function signInWithMicrosoftProvider() {
  throw createAuthError(
    'auth/operation-not-supported-in-this-environment',
    'Microsoft sign-in should use the hosted auth page on web.'
  );
}

export async function signOutFromGoogleProvider() {}
