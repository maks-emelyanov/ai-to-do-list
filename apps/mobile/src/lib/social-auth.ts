import * as AppleAuthentication from 'expo-apple-authentication';
import * as Application from 'expo-application';
import * as AuthSession from 'expo-auth-session';
import * as Crypto from 'expo-crypto';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import {
  GoogleSignin,
  isErrorWithCode,
  statusCodes,
} from '@react-native-google-signin/google-signin';
import {
  GoogleAuthProvider,
  OAuthProvider,
  isSignInWithEmailLink,
  signInWithCredential,
  signInWithCustomToken,
  signInWithEmailLink as firebaseSignInWithEmailLink,
} from 'firebase/auth';
import { Platform } from 'react-native';

import { auth } from './firebase';

WebBrowser.maybeCompleteAuthSession();

export type HostedAuthProviderId =
  | 'apple'
  | 'emailLink'
  | 'google'
  | 'microsoft';
export type SocialAuthProviderId = Exclude<HostedAuthProviderId, 'emailLink'>;

const HOSTED_AUTH_CALLBACK_SCHEME = 'mobile';
const HOSTED_AUTH_CALLBACK_PATH = 'auth/provider-callback';
const NATIVE_OAUTH_CALLBACK_PATH = 'oauthredirect';
const GOOGLE_OAUTH_SCOPES = ['openid', 'profile', 'email'];
const MICROSOFT_OAUTH_SCOPES = ['openid', 'profile', 'email'];
const GOOGLE_IOS_CLIENT_ID_SUFFIX = '.apps.googleusercontent.com';
const GOOGLE_DISCOVERY = {
  authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenEndpoint: 'https://oauth2.googleapis.com/token',
  revocationEndpoint: 'https://oauth2.googleapis.com/revoke',
};
let isNativeGoogleSignInConfigured = false;

type AuthCode =
  | 'auth/invalid-action-code'
  | 'auth/invalid-credential'
  | 'auth/invalid-email'
  | 'auth/missing-oauth-client-id'
  | 'auth/missing-oauth-redirect-uri'
  | 'auth/missing-hosted-auth-url'
  | 'auth/operation-not-supported-in-this-environment'
  | 'auth/popup-closed-by-user';
type HostedAuthExchangeContext = {
  code: string;
  platform: 'native' | 'web';
  provider: HostedAuthProviderId;
  returnTo: string;
  state: string;
};

function createAuthError(code: AuthCode, message: string) {
  return Object.assign(new Error(message), { code });
}

function isHostedAuthProviderId(
  provider: unknown,
): provider is HostedAuthProviderId {
  return (
    provider === 'apple' ||
    provider === 'emailLink' ||
    provider === 'google' ||
    provider === 'microsoft'
  );
}

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export function createHostedAuthState() {
  return bytesToHex(Crypto.getRandomBytes(16));
}

function getEnv(name: string) {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function requireNativeProvider(provider: SocialAuthProviderId) {
  if (Platform.OS === 'web') {
    throw createAuthError(
      'auth/operation-not-supported-in-this-environment',
      `${provider} sign-in should use the hosted auth page on web.`,
    );
  }
}

function getDefaultNativeOAuthRedirectUri() {
  const applicationId = Application.applicationId?.trim();

  if (!applicationId) {
    return AuthSession.makeRedirectUri({
      path: NATIVE_OAUTH_CALLBACK_PATH,
      scheme: HOSTED_AUTH_CALLBACK_SCHEME,
    });
  }

  return `${applicationId}:/${NATIVE_OAUTH_CALLBACK_PATH}`;
}

function getGoogleIosClientId() {
  const clientId = getEnv('EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID');

  if (!clientId) {
    throw createAuthError(
      'auth/missing-oauth-client-id',
      'iOS Google sign-in needs EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID configured for the AuthSession flow.',
    );
  }

  return clientId;
}

function getGoogleWebClientId() {
  const clientId = getEnv('EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID');

  if (!clientId) {
    throw createAuthError(
      'auth/missing-oauth-client-id',
      'Google sign-in needs EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID configured for the native Google Sign-In flow.',
    );
  }

  return clientId;
}

function getGoogleIosReverseClientScheme(clientId: string) {
  if (!clientId.endsWith(GOOGLE_IOS_CLIENT_ID_SUFFIX)) {
    return undefined;
  }

  return `com.googleusercontent.apps.${clientId.slice(
    0,
    -GOOGLE_IOS_CLIENT_ID_SUFFIX.length,
  )}`;
}

function getGoogleIosRedirectUri(clientId: string) {
  const redirectUri =
    getEnv('EXPO_PUBLIC_GOOGLE_IOS_REDIRECT_URI') ??
    getEnv('EXPO_PUBLIC_GOOGLE_NATIVE_REDIRECT_URI');

  if (redirectUri) {
    return redirectUri;
  }

  const reverseClientScheme = getGoogleIosReverseClientScheme(clientId);

  if (!reverseClientScheme) {
    throw createAuthError(
      'auth/missing-oauth-redirect-uri',
      'iOS Google sign-in needs EXPO_PUBLIC_GOOGLE_IOS_REDIRECT_URI when the iOS client ID is not a standard Google client ID.',
    );
  }

  return `${reverseClientScheme}:/${NATIVE_OAUTH_CALLBACK_PATH}`;
}

function configureNativeGoogleSignIn() {
  if (isNativeGoogleSignInConfigured) {
    return;
  }

  GoogleSignin.configure({
    offlineAccess: false,
    webClientId: getGoogleWebClientId(),
  });
  isNativeGoogleSignInConfigured = true;
}

async function clearNativeGoogleSignInAccountSelection() {
  if (Platform.OS !== 'android') {
    return;
  }

  configureNativeGoogleSignIn();

  if (!GoogleSignin.hasPreviousSignIn()) {
    return;
  }

  await GoogleSignin.signOut();
}

function getMicrosoftClientId() {
  const clientId = getEnv('EXPO_PUBLIC_MICROSOFT_CLIENT_ID');

  if (!clientId) {
    throw createAuthError(
      'auth/missing-oauth-client-id',
      'Microsoft sign-in needs EXPO_PUBLIC_MICROSOFT_CLIENT_ID configured for the native OAuth flow.',
    );
  }

  return clientId;
}

function getMicrosoftDiscovery() {
  const tenant = getEnv('EXPO_PUBLIC_MICROSOFT_TENANT_ID') ?? 'common';
  const authority = `https://login.microsoftonline.com/${tenant}/oauth2/v2.0`;

  return {
    authorizationEndpoint: `${authority}/authorize`,
    tokenEndpoint: `${authority}/token`,
  };
}

function getMicrosoftNativeRedirectUri() {
  return (
    getEnv('EXPO_PUBLIC_MICROSOFT_NATIVE_REDIRECT_URI') ??
    getEnv('EXPO_PUBLIC_AUTH_NATIVE_OAUTH_REDIRECT_URI') ??
    getDefaultNativeOAuthRedirectUri()
  );
}

function getMicrosoftOAuthScopes() {
  if (getEnv('EXPO_PUBLIC_MICROSOFT_REQUEST_OFFLINE_ACCESS') === 'true') {
    return [...MICROSOFT_OAUTH_SCOPES, 'offline_access'];
  }

  return MICROSOFT_OAUTH_SCOPES;
}

function requireSuccessfulAuthSessionResult(
  result: AuthSession.AuthSessionResult,
) {
  if (result.type === 'cancel' || result.type === 'dismiss') {
    throw createAuthError(
      'auth/popup-closed-by-user',
      'Sign-in was cancelled.',
    );
  }

  if (result.type === 'error') {
    throw createAuthError(
      'auth/invalid-credential',
      result.params.error_description ??
        result.params.error ??
        result.error?.message ??
        'The sign-in provider did not accept this request.',
    );
  }

  if (result.type !== 'success') {
    throw createAuthError(
      'auth/operation-not-supported-in-this-environment',
      'This sign-in flow is not available on this device.',
    );
  }

  return result;
}

function requireOAuthState(
  params: Record<string, string>,
  expectedState: string,
) {
  if (params.state !== expectedState) {
    throw createAuthError(
      'auth/invalid-action-code',
      'The sign-in response did not match this session.',
    );
  }
}

function requireAuthCode(params: Record<string, string>) {
  if (!params.code) {
    throw createAuthError(
      'auth/invalid-credential',
      'The sign-in provider did not return an authorization code.',
    );
  }

  return params.code;
}

function requireCodeVerifier(request: AuthSession.AuthRequest) {
  if (!request.codeVerifier) {
    throw createAuthError(
      'auth/invalid-credential',
      'The sign-in request did not include a PKCE verifier.',
    );
  }

  return request.codeVerifier;
}

function isAppleCancellation(error: unknown) {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'ERR_REQUEST_CANCELED'
  );
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
      }),
  );
}

export function getHostedAuthCallbackUrl() {
  if (Platform.OS === 'android') {
    const androidCallbackUrl =
      process.env.EXPO_PUBLIC_AUTH_ANDROID_CALLBACK_URL ??
      new URL(
        `/${HOSTED_AUTH_CALLBACK_PATH}`,
        `https://${getFirebaseAuthDomain()}`,
      ).toString();

    return androidCallbackUrl;
  }

  return Linking.createURL(HOSTED_AUTH_CALLBACK_PATH, {
    scheme: HOSTED_AUTH_CALLBACK_SCHEME,
  });
}

function getHostedAuthUrl() {
  const hostedAuthUrl =
    process.env.EXPO_PUBLIC_AUTH_WEB_URL ??
    process.env.EXPO_PUBLIC_AUTH_EMAIL_LINK_NATIVE_CONTINUE_URL;

  if (!hostedAuthUrl) {
    throw createAuthError(
      'auth/missing-hosted-auth-url',
      'Hosted auth needs EXPO_PUBLIC_AUTH_WEB_URL or EXPO_PUBLIC_AUTH_EMAIL_LINK_NATIVE_CONTINUE_URL.',
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
      'The auth server did not accept this sign-in response.',
    );
  }

  return payload.token;
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
      ]),
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
  const parsedCandidates = [path, hostAndPath];

  if (
    parsedCandidates.some((candidate) => candidate.includes('/__/auth/handler'))
  ) {
    return '/__/auth/handler';
  }

  if (
    parsedCandidates.some((candidate) => candidate.includes('/__/auth/links'))
  ) {
    return '/__/auth/links';
  }

  if (
    parsedCandidates.some((candidate) => candidate.includes('/__/auth/action'))
  ) {
    return '/__/auth/action';
  }

  if (url.includes('/__/auth/handler')) {
    return '/__/auth/handler';
  }

  if (url.includes('/__/auth/links')) {
    return '/__/auth/links';
  }

  if (url.includes('/__/auth/action')) {
    return '/__/auth/action';
  }

  return null;
}

function getRawUrlSearchParams(url: string) {
  try {
    return new URL(url).searchParams;
  } catch {
    const [, query = ''] = url.split('?');
    const [search] = query.split('#');

    return new URLSearchParams(search);
  }
}

function getNestedFirebaseAuthLink(url: string) {
  if (getFirebaseAuthPath(url) !== '/__/auth/links') {
    return null;
  }

  const wrapperParams = getRawUrlSearchParams(url);
  const link =
    wrapperParams.get('link') ?? wrapperParams.get('deep_link_id') ?? null;

  if (!link) {
    return null;
  }

  try {
    const nestedLink = new URL(link);

    ['apiKey', 'mode', 'oobCode', 'continueUrl', 'lang', 'tenantId'].forEach(
      (key) => {
        const value = wrapperParams.get(key);

        if (value && !nestedLink.searchParams.has(key)) {
          nestedLink.searchParams.set(key, value);
        }
      },
    );

    const normalizedLink = nestedLink.toString();

    return normalizedLink === url ? null : normalizedLink;
  } catch {
    return link === url ? null : link;
  }
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

function getFirebaseAuthBrowserUrlInternal(
  url: string,
  depth = 0,
): string | null {
  if (depth > 3) {
    return null;
  }

  const nestedLink = getNestedFirebaseAuthLink(url);

  if (nestedLink) {
    return getFirebaseAuthBrowserUrlInternal(nestedLink, depth + 1);
  }

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

export function isFirebaseEmailActionLink(url: string) {
  const browserUrl = getFirebaseAuthBrowserUrl(url) ?? url;
  const params = getResponseParams(browserUrl);

  return (
    getFirebaseAuthPath(browserUrl) === '/__/auth/action' &&
    (params.mode === 'signIn' || typeof params.oobCode === 'string')
  );
}

export function getFirebaseAuthBrowserUrl(url: string) {
  return getFirebaseAuthBrowserUrlInternal(url);
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

function requireExpectedState(
  params: Record<string, string | undefined>,
  expectedState: string | null,
) {
  if (!expectedState || params.state !== expectedState) {
    throw createAuthError(
      'auth/invalid-action-code',
      'The sign-in response did not match this session.',
    );
  }
}

function throwIfProviderError(params: Record<string, string | undefined>) {
  if (!params.error) {
    return;
  }

  if (params.error === 'access_denied') {
    throw createAuthError(
      'auth/popup-closed-by-user',
      'Sign-in was cancelled.',
    );
  }

  throw createAuthError(
    'auth/invalid-credential',
    params.error_description ||
      'The sign-in provider did not accept this request.',
  );
}

async function signInWithHostedExchangeCode(
  params: Record<string, string | undefined>,
) {
  const provider = params.provider;

  if (!isHostedAuthProviderId(provider)) {
    throw createAuthError(
      'auth/invalid-credential',
      'The hosted auth page returned an unknown sign-in provider.',
    );
  }

  if (!params.code) {
    throw createAuthError(
      'auth/invalid-credential',
      'The hosted auth page did not return an auth exchange code.',
    );
  }

  if (!params.state) {
    throw createAuthError(
      'auth/invalid-action-code',
      'The hosted auth page did not return a matching state.',
    );
  }

  await signInWithCustomToken(
    auth,
    await exchangeHostedAuthCode({
      code: params.code,
      platform: Platform.OS === 'web' ? 'web' : 'native',
      provider,
      returnTo: getHostedAuthCallbackUrl(),
      state: params.state,
    }),
  );
}

export async function completeHostedAuthSignIn(
  url: string,
  expectedState: string | null,
) {
  const params = getResponseParams(url);

  requireExpectedState(params, expectedState);
  throwIfProviderError(params);
  await signInWithHostedExchangeCode(params);

  return true;
}

export async function openHostedAuthSession(url: string) {
  const result = await WebBrowser.openAuthSessionAsync(
    url,
    getHostedAuthCallbackUrl(),
  );

  if (result.type === 'cancel' || result.type === 'dismiss') {
    throw createAuthError(
      'auth/popup-closed-by-user',
      'Sign-in was cancelled.',
    );
  }

  if (result.type !== 'success' || !result.url) {
    throw createAuthError(
      'auth/operation-not-supported-in-this-environment',
      'This sign-in flow is not available on this device.',
    );
  }

  return result.url;
}

export async function openHostedAuthPage(url: string) {
  await WebBrowser.openBrowserAsync(url);
}

export async function completeEmailLinkSignIn(email: string, url: string) {
  const trimmedEmail = email.trim();

  if (!trimmedEmail) {
    throw createAuthError(
      'auth/invalid-email',
      'Enter the email address that requested this sign-in link.',
    );
  }

  const emailLinkUrl = getFirebaseAuthBrowserUrl(url) ?? url;

  if (!isSignInWithEmailLink(auth, emailLinkUrl)) {
    throw createAuthError(
      'auth/invalid-action-code',
      'That sign-in link is invalid or expired.',
    );
  }

  await firebaseSignInWithEmailLink(auth, trimmedEmail, emailLinkUrl);
}

export async function signInWithGoogleProvider() {
  requireNativeProvider('google');

  if (Platform.OS === 'android') {
    configureNativeGoogleSignIn();
    await GoogleSignin.hasPlayServices({
      showPlayServicesUpdateDialog: true,
    });
    await clearNativeGoogleSignInAccountSelection();

    try {
      const result = await GoogleSignin.signIn();

      if (result.type === 'cancelled') {
        throw createAuthError(
          'auth/popup-closed-by-user',
          'Sign-in was cancelled.',
        );
      }

      const tokens = await GoogleSignin.getTokens();
      const idToken = result.data.idToken ?? tokens.idToken;

      if (!idToken && !tokens.accessToken) {
        throw createAuthError(
          'auth/invalid-credential',
          'Google did not return a token Firebase can use.',
        );
      }

      await signInWithCredential(
        auth,
        GoogleAuthProvider.credential(
          idToken ?? null,
          tokens.accessToken ?? null,
        ),
      );
    } catch (error) {
      if (
        isErrorWithCode(error) &&
        error.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE
      ) {
        throw createAuthError(
          'auth/operation-not-supported-in-this-environment',
          'Google Play services are not available on this device.',
        );
      }

      throw error;
    }

    return;
  }

  if (Platform.OS !== 'ios') {
    throw createAuthError(
      'auth/operation-not-supported-in-this-environment',
      'Google sign-in is only available on supported Android and iOS devices.',
    );
  }

  const clientId = getGoogleIosClientId();
  const redirectUri = getGoogleIosRedirectUri(clientId);
  const state = createHostedAuthState();
  const request = await AuthSession.loadAsync(
    {
      clientId,
      prompt: AuthSession.Prompt.SelectAccount,
      redirectUri,
      responseType: AuthSession.ResponseType.Code,
      scopes: GOOGLE_OAUTH_SCOPES,
      state,
      usePKCE: true,
    },
    GOOGLE_DISCOVERY,
  );
  const result = requireSuccessfulAuthSessionResult(
    await request.promptAsync(GOOGLE_DISCOVERY),
  );

  requireOAuthState(result.params, state);

  const tokenResponse = await AuthSession.exchangeCodeAsync(
    {
      clientId,
      code: requireAuthCode(result.params),
      extraParams: {
        code_verifier: requireCodeVerifier(request),
      },
      redirectUri,
      scopes: GOOGLE_OAUTH_SCOPES,
    },
    GOOGLE_DISCOVERY,
  );

  if (!tokenResponse.idToken && !tokenResponse.accessToken) {
    throw createAuthError(
      'auth/invalid-credential',
      'Google did not return a token Firebase can use.',
    );
  }

  await signInWithCredential(
    auth,
    GoogleAuthProvider.credential(
      tokenResponse.idToken ?? null,
      tokenResponse.accessToken ?? null,
    ),
  );
}

export async function signOutFromGoogleProvider() {
  await clearNativeGoogleSignInAccountSelection();
}

export async function signInWithAppleProvider() {
  requireNativeProvider('apple');

  if (
    Platform.OS !== 'ios' ||
    !(await AppleAuthentication.isAvailableAsync())
  ) {
    throw createAuthError(
      'auth/operation-not-supported-in-this-environment',
      'Apple sign-in is only available on supported iOS devices.',
    );
  }

  const rawNonce = createHostedAuthState();
  const hashedNonce = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    rawNonce,
  );
  const state = createHostedAuthState();

  try {
    const appleCredential = await AppleAuthentication.signInAsync({
      nonce: hashedNonce,
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
      ],
      state,
    });

    if (appleCredential.state !== state) {
      throw createAuthError(
        'auth/invalid-action-code',
        'The Apple sign-in response did not match this session.',
      );
    }

    if (!appleCredential.identityToken) {
      throw createAuthError(
        'auth/invalid-credential',
        'Apple did not return an identity token Firebase can use.',
      );
    }

    const provider = new OAuthProvider('apple.com');

    await signInWithCredential(
      auth,
      provider.credential({ idToken: appleCredential.identityToken, rawNonce }),
    );
  } catch (error) {
    if (isAppleCancellation(error)) {
      throw createAuthError(
        'auth/popup-closed-by-user',
        'Sign-in was cancelled.',
      );
    }

    throw error;
  }
}

export async function signInWithMicrosoftProvider() {
  requireNativeProvider('microsoft');

  const clientId = getMicrosoftClientId();
  const discovery = getMicrosoftDiscovery();
  const redirectUri = getMicrosoftNativeRedirectUri();
  const scopes = getMicrosoftOAuthScopes();
  const state = createHostedAuthState();
  const request = await AuthSession.loadAsync(
    {
      clientId,
      prompt: AuthSession.Prompt.SelectAccount,
      redirectUri,
      responseType: AuthSession.ResponseType.Code,
      scopes,
      state,
      usePKCE: true,
    },
    discovery,
  );
  const result = requireSuccessfulAuthSessionResult(
    await request.promptAsync(discovery),
  );

  requireOAuthState(result.params, state);

  const tokenResponse = await AuthSession.exchangeCodeAsync(
    {
      clientId,
      code: requireAuthCode(result.params),
      extraParams: {
        code_verifier: requireCodeVerifier(request),
      },
      redirectUri,
      scopes,
    },
    discovery,
  );

  if (!tokenResponse.idToken && !tokenResponse.accessToken) {
    throw createAuthError(
      'auth/invalid-credential',
      'Microsoft did not return a token Firebase can use.',
    );
  }

  const provider = new OAuthProvider('microsoft.com');

  await signInWithCredential(
    auth,
    provider.credential({
      accessToken: tokenResponse.accessToken,
      idToken: tokenResponse.idToken,
    }),
  );
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
