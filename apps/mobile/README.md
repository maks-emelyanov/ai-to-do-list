# Todo App Mobile Auth

This Expo app uses Firebase Authentication as the identity authority, with one
app-owned auth screen and a hosted Firebase auth relay for web and browser
handoffs. Production auth requires an EAS development/custom client or a built
app; Expo Go is only useful for unrelated UI work.

## Run

```bash
npm install
npx expo start
```

Useful local checks:

```bash
npm run lint
npx tsc --noEmit
```

## Final Architecture

The app UI owns the provider picker. The auth screen calls the unified auth
service only:

- `signInWithProvider(provider)`
- `sendEmailLink(email?)`
- `completeIncomingAuthUrl(url)`
- `signOut()`

Provider-specific details stay behind that service in `src/auth/auth-service.ts`
and `src/lib/social-auth.ts`.

Firebase Auth is the single identity backend. Native providers sign into
Firebase directly when a secure native path exists. Hosted browser flows sign
into Firebase on the hosted page, call `/auth/exchange` for a short-lived
one-time exchange code, and the app redeems that code at `/auth/session` for a
Firebase custom token. Exchange codes are bound to provider, state, platform,
and return target.

The hosted auth page is a generated-config static app. Terraform renders
`apps/auth-web/public/auth-config.js` before Firebase Hosting deploy, using the
environment's Firebase web config, canonical auth domain, redirect domains,
allowed return hosts, and Google web client ID.

Firebase Dynamic Links are not used. Email actions and hosted callbacks use
Firebase Hosting paths plus Android App Links and iOS Universal Links:

```text
https://<auth-canonical-domain>/auth/provider-callback
https://<auth-canonical-domain>/__/auth/action
https://<auth-canonical-domain>/__/auth/links
```

Keep `/__/auth/handler` browser-owned for Firebase web redirect completion.

## Provider Matrix

| Flow | Web | iOS | Android |
| --- | --- | --- | --- |
| Email link | Hosted page collects email and completes with Firebase JS. | App collects email, sends Firebase email link, Universal Link opens app, app completes with Firebase. Hosted page is fallback/completion. | App collects email, sends Firebase email link, App Link opens app, app completes with Firebase. Hosted page is fallback/completion. |
| Google | Hosted page uses Google Identity Services, Firebase credential, exchange-code relay. | App uses `expo-auth-session` PKCE with the iOS Google client, then Firebase credential. | App uses `@react-native-google-signin/google-signin`, then Firebase credential. |
| Apple | Hosted page uses Firebase redirect with `apple.com`. | App uses `expo-apple-authentication` and the native Apple button. | Apple is hidden unless enabled; when enabled it routes through hosted relay/web flow. |
| Microsoft | Hosted page uses Firebase redirect with `microsoft.com`. | App uses `expo-auth-session` PKCE, then Firebase credential. | App uses `expo-auth-session` PKCE, then Firebase credential. |
| Sign out | Firebase sign-out. | Firebase sign-out. | Firebase sign-out plus native Google account-selection cleanup. |

## Environment

Read these values from Terraform outputs after applying `infra/live/<env>`:

- `auth_hosting_url` -> `EXPO_PUBLIC_AUTH_WEB_URL`
- `firebase_web_config.api_key` -> `EXPO_PUBLIC_FIREBASE_API_KEY`
- `firebase_web_config.auth_domain` -> `EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN`
- `firebase_web_config.project_id` -> `EXPO_PUBLIC_FIREBASE_PROJECT_ID`
- `firebase_web_config.storage_bucket` -> `EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET`
- `firebase_web_config.messaging_sender_id` -> `EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
- `firebase_web_config.app_id` -> `EXPO_PUBLIC_FIREBASE_APP_ID`

Provider flags:

```bash
EXPO_PUBLIC_ENABLE_GOOGLE_AUTH_PROVIDER=true
EXPO_PUBLIC_ENABLE_APPLE_AUTH_PROVIDER=true
EXPO_PUBLIC_ENABLE_MICROSOFT_AUTH_PROVIDER=true
```

Native identifiers:

```bash
EXPO_PUBLIC_ANDROID_PACKAGE_NAME=com.maks.todoapp
EXPO_PUBLIC_IOS_BUNDLE_ID=com.anonymous.mobile
```

Provider client IDs and redirects:

```bash
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=000000000000-web.apps.googleusercontent.com
EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=000000000000-ios.apps.googleusercontent.com
EXPO_PUBLIC_GOOGLE_IOS_REDIRECT_URI=com.googleusercontent.apps.000000000000-ios:/oauthredirect
EXPO_PUBLIC_MICROSOFT_CLIENT_ID=00000000-0000-0000-0000-000000000000
EXPO_PUBLIC_MICROSOFT_TENANT_ID=common
EXPO_PUBLIC_MICROSOFT_NATIVE_REDIRECT_URI=
EXPO_PUBLIC_MICROSOFT_REQUEST_OFFLINE_ACCESS=false
```

`EXPO_PUBLIC_FIREBASE_AUTH_LINK_DOMAIN` is optional and should be set only for a
custom Firebase Hosting action-link domain. Default `firebaseapp.com` and
`web.app` action link domains are selected by Firebase automatically.

Add the same values to the matching EAS environment for every build profile.
Rebuild after changing OAuth, link-domain, package, bundle, or URL-scheme
values because native callback config is compiled into the app.

## Provider Registration

Firebase Auth:

- Enable Email/Password and passwordless email link sign-in.
- Enable Google, Apple, and Microsoft only when their provider credentials are
  configured.
- Terraform manages Firebase authorized domains from `auth_canonical_domain`,
  `auth_redirect_domains`, and `authorized_domains`.

Google:

- Hosted web Google uses the Firebase/Google web OAuth client ID rendered into
  `auth-config.js`.
- Android Google requires an Android OAuth client for the installed package and
  each signing certificate.
- iOS Google requires an iOS OAuth client for the iOS bundle ID.

Apple:

- iOS native Apple requires the Apple capability, `ios.usesAppleSignIn`, and a
  real Apple Team ID in `apple-app-site-association`.
- Web/Android relay requires Apple configured in Firebase Auth.

Microsoft:

- Native Microsoft uses PKCE and state.
- Register each platform's exact native redirect URI in Microsoft Entra under
  mobile/desktop redirects.
- `offline_access` is not requested unless
  `EXPO_PUBLIC_MICROSOFT_REQUEST_OFFLINE_ACCESS=true`.

## Verification Checklist

Local automated checks run during Phase 10:

- [x] `npm run lint` in `apps/mobile` completed with 0 errors and existing UI
  import warnings.
- [x] `npx tsc --noEmit` in `apps/mobile` passed.
- [x] `node --check apps/auth-api/src/server.js` passed.
- [x] `node --check apps/auth-web/scripts/render-auth-config.mjs` passed.
- [x] Hosted auth config render smoke test passed with sample generated config.
- [x] `terraform fmt -check` for the Firebase auth module passed.
- [x] Terragrunt HCL format checks for `infra/live/dev` passed.
- [x] `terraform validate` for `infra/modules/firebase-auth` passed after
  provider initialization.
- [x] Repo search found no stale Dynamic Links setup language; docs now state
  explicitly that Firebase Dynamic Links are not used.
- [x] Repo search found no old hardcoded Firebase project ID, web client ID, or
  API key in hosted auth code or auth docs.

Manual runtime matrix to complete against a deployed environment:

- [ ] Web email link: hosted page sends link, link returns to hosted page,
  `/auth/exchange` creates code, `/auth/session` creates app session.
- [ ] iOS email link: app sends link, Universal Link opens app, app completes
  sign-in without a second provider chooser.
- [ ] Android email link: app sends link, App Link opens app, app completes
  sign-in without a second provider chooser.
- [ ] Web Google: hosted page signs in with Google and relays through one-time
  exchange code.
- [ ] iOS Google: app AuthSession PKCE flow signs into Firebase directly.
- [ ] Android Google: native Google Sign-In SDK signs into Firebase directly.
- [ ] Web Apple: hosted Firebase redirect signs in with Apple.
- [ ] iOS Apple: native Apple button signs into Firebase directly.
- [ ] Android Apple: button is hidden when disabled, or routes to hosted relay
  when enabled.
- [ ] Web Microsoft: hosted Firebase redirect signs in with Microsoft.
- [ ] iOS Microsoft: app AuthSession PKCE flow signs into Firebase directly.
- [ ] Android Microsoft: app AuthSession PKCE flow signs into Firebase directly.
- [ ] Sign-out clears Firebase state on all platforms and Android Google
  account selection on Android.

Known gaps before release:

- `apps/auth-web/public/.well-known/apple-app-site-association` still contains
  `YOUR_TEAM_ID.com.anonymous.mobile`; replace it with the real Apple Team ID
  and bundle ID before iOS Universal Links can pass.
- Runtime provider checks require deployed Firebase Hosting, Cloud Run,
  Firebase Auth provider credentials, registered OAuth redirect URIs, and real
  iOS/Android builds. They cannot be fully completed by local lint/type checks.
- The broker rate limiter is per Cloud Run instance. Add an edge/shared limiter
  if abuse protection needs to be global.
