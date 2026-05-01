const appJson = require('./app.json');

const DEFAULT_AUTH_HOST = 'synthetic-song-473914-h5.firebaseapp.com';
const GOOGLE_IOS_CLIENT_ID_SUFFIX = '.apps.googleusercontent.com';
const AUTH_LINK_PATHS = [
  '/auth/provider-callback',
  '/__/auth/action',
  '/__/auth/links',
];

function getEnv(name) {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function getHost(value) {
  if (!value) {
    return undefined;
  }

  try {
    return new URL(value.includes('://') ? value : `https://${value}`).hostname;
  } catch {
    return undefined;
  }
}

function getUrlScheme(value) {
  return value?.match(/^([a-z][a-z0-9+.-]*):/i)?.[1];
}

function getNativeUrlScheme(value) {
  const scheme = getUrlScheme(value);

  return scheme && !['http', 'https'].includes(scheme) ? scheme : undefined;
}

function getGoogleIosReverseClientScheme(clientId) {
  if (!clientId?.endsWith(GOOGLE_IOS_CLIENT_ID_SUFFIX)) {
    return undefined;
  }

  return `com.googleusercontent.apps.${clientId.slice(
    0,
    -GOOGLE_IOS_CLIENT_ID_SUFFIX.length,
  )}`;
}

function getGoogleIosUrlScheme() {
  return (
    getNativeUrlScheme(getEnv('EXPO_PUBLIC_GOOGLE_IOS_REDIRECT_URI')) ??
    getNativeUrlScheme(getEnv('EXPO_PUBLIC_GOOGLE_NATIVE_REDIRECT_URI')) ??
    getGoogleIosReverseClientScheme(getEnv('EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID'))
  );
}

function getMicrosoftNativeUrlScheme(fallbackScheme) {
  return (
    getNativeUrlScheme(getEnv('EXPO_PUBLIC_MICROSOFT_NATIVE_REDIRECT_URI')) ??
    getNativeUrlScheme(getEnv('EXPO_PUBLIC_AUTH_NATIVE_OAUTH_REDIRECT_URI')) ??
    fallbackScheme
  );
}

function toArray(value) {
  if (Array.isArray(value)) {
    return value;
  }

  return value ? [value] : [];
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function getAuthLinkHosts(baseConfig) {
  const configuredHosts = [
    getEnv('EXPO_PUBLIC_FIREBASE_AUTH_LINK_DOMAIN'),
    getEnv('EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN'),
    getEnv('EXPO_PUBLIC_AUTH_WEB_URL'),
    getEnv('EXPO_PUBLIC_AUTH_EMAIL_LINK_NATIVE_CONTINUE_URL'),
    DEFAULT_AUTH_HOST,
  ].map(getHost);
  const existingHosts =
    baseConfig.android?.intentFilters
      ?.flatMap((filter) => filter.data ?? [])
      .map((data) => data.host) ?? [];

  return unique([...configuredHosts, ...existingHosts]);
}

function createAndroidIntentFilters(baseConfig, authHosts) {
  const passthroughFilters =
    baseConfig.android?.intentFilters?.filter((filter) => !filter.autoVerify) ??
    [];
  const data = authHosts.flatMap((host) =>
    AUTH_LINK_PATHS.map((pathPrefix) => ({
      scheme: 'https',
      host,
      pathPrefix,
    })),
  );

  return [
    ...passthroughFilters,
    {
      action: 'VIEW',
      autoVerify: true,
      data,
      category: ['BROWSABLE', 'DEFAULT'],
    },
  ];
}

module.exports = () => {
  const baseConfig = JSON.parse(JSON.stringify(appJson.expo));
  const authHosts = getAuthLinkHosts(baseConfig);
  const androidPackage =
    getEnv('EXPO_PUBLIC_ANDROID_PACKAGE_NAME') ??
    baseConfig.android?.package;
  const iosBundleIdentifier =
    getEnv('EXPO_PUBLIC_IOS_BUNDLE_ID') ?? baseConfig.ios?.bundleIdentifier;
  const microsoftAndroidUrlScheme = getMicrosoftNativeUrlScheme(androidPackage);
  const microsoftIosUrlScheme =
    getMicrosoftNativeUrlScheme(iosBundleIdentifier);
  const iosUrlSchemes = unique([
    ...toArray(baseConfig.ios?.scheme),
    getGoogleIosUrlScheme(),
    microsoftIosUrlScheme,
  ]);
  const androidUrlSchemes = unique([
    ...toArray(baseConfig.android?.scheme),
    microsoftAndroidUrlScheme,
  ]);

  return {
    ...baseConfig,
    ios: {
      ...baseConfig.ios,
      bundleIdentifier: iosBundleIdentifier,
      usesAppleSignIn: true,
      ...(iosUrlSchemes.length > 0
        ? {
            scheme:
              iosUrlSchemes.length === 1 ? iosUrlSchemes[0] : iosUrlSchemes,
          }
        : {}),
      associatedDomains: unique([
        ...(baseConfig.ios?.associatedDomains ?? []),
        ...authHosts.map((host) => `applinks:${host}`),
      ]),
    },
    android: {
      ...baseConfig.android,
      package: androidPackage,
      ...(androidUrlSchemes.length > 0
        ? {
            scheme:
              androidUrlSchemes.length === 1
                ? androidUrlSchemes[0]
                : androidUrlSchemes,
          }
        : {}),
      intentFilters: createAndroidIntentFilters(baseConfig, authHosts),
    },
  };
};
