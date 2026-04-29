# Welcome to your Expo app 👋

This is an [Expo](https://expo.dev) project created with [`create-expo-app`](https://www.npmjs.com/package/create-expo-app).

## Get started

1. Install dependencies

   ```bash
   npm install
   ```

2. Start the app

   ```bash
   npx expo start
   ```

## Hosted auth setup

The app sends web, Android, and iOS users through the Firebase-hosted auth page.
Native builds open that page with Expo's browser-backed auth session API. The
hosted page completes Firebase sign-in in the browser, exchanges that Firebase
ID token with the auth API, and returns a Firebase custom token to the app.

1. Apply the Terragrunt stack from `infra/live/dev`. It builds `apps/auth-api`
   with Cloud Build, pushes the image to Artifact Registry, and deploys Cloud
   Run as `todoapp-auth-api` in `us-east1` with minimum instances at `0`, then
   deploys `apps/auth-web/public` to Firebase Hosting. The root `firebase.json`
   routes `/auth/exchange` to the Cloud Run service.
2. Set the hosted auth page URL in every app environment:

   ```bash
   EXPO_PUBLIC_AUTH_WEB_URL=https://auth.example.com
   ```

3. In Firebase Authentication, enable **Email/Password** and **Email link
   (passwordless sign-in)**.
4. Add the domains used by your email-link flow to **Authentication > Settings >
   Authorized domains**:
   - the hosted auth page domain from `EXPO_PUBLIC_AUTH_WEB_URL`
   - each web app origin that should complete email-link sign-in
5. Keep these app identifiers in sync with Firebase and the native app config:

   ```bash
   EXPO_PUBLIC_ANDROID_PACKAGE_NAME=com.maks.todoapp
   EXPO_PUBLIC_IOS_BUNDLE_ID=com.anonymous.mobile
   ```

6. Do not configure Android App Links or iOS Associated Domains for the Firebase
   Auth helper domain. Firebase's email action links and OAuth redirect helper
   URLs must stay in the browser-hosted auth flow. The app should receive only
   the final custom-scheme callback, for example
   `mobile://auth/provider-callback?...`.

## Social auth setup

The app uses one shared auth screen across web, Android, and iOS. Social sign-in
is handled without native Google, Apple, or Microsoft SDKs. Each provider starts
on the hosted auth page, completes with the Firebase Web SDK there, and then the
auth API mints a Firebase custom token that the app uses to create its session.

### Providers

1. In Firebase Authentication, enable every provider you want to show.
2. Enable matching app flags only after the provider is enabled in Firebase/Auth
   infrastructure:

   ```bash
   EXPO_PUBLIC_ENABLE_GOOGLE_AUTH_PROVIDER=true
   EXPO_PUBLIC_ENABLE_APPLE_AUTH_PROVIDER=true
   EXPO_PUBLIC_ENABLE_MICROSOFT_AUTH_PROVIDER=true
   ```

3. Add the same values to the matching EAS environment used by each build
   profile:

   ```bash
   eas env:create --environment development --name EXPO_PUBLIC_AUTH_WEB_URL --value https://auth.example.com
   eas env:create --environment preview --name EXPO_PUBLIC_AUTH_WEB_URL --value https://auth.example.com
   eas env:create --environment production --name EXPO_PUBLIC_AUTH_WEB_URL --value https://auth.example.com
   eas env:create --environment development --name EXPO_PUBLIC_ENABLE_GOOGLE_AUTH_PROVIDER --value true
   eas env:create --environment preview --name EXPO_PUBLIC_ENABLE_GOOGLE_AUTH_PROVIDER --value true
   eas env:create --environment production --name EXPO_PUBLIC_ENABLE_GOOGLE_AUTH_PROVIDER --value true
   eas env:create --environment development --name EXPO_PUBLIC_ENABLE_APPLE_AUTH_PROVIDER --value true
   eas env:create --environment preview --name EXPO_PUBLIC_ENABLE_APPLE_AUTH_PROVIDER --value true
   eas env:create --environment production --name EXPO_PUBLIC_ENABLE_APPLE_AUTH_PROVIDER --value true
   eas env:create --environment development --name EXPO_PUBLIC_ENABLE_MICROSOFT_AUTH_PROVIDER --value true
   eas env:create --environment preview --name EXPO_PUBLIC_ENABLE_MICROSOFT_AUTH_PROVIDER --value true
   eas env:create --environment production --name EXPO_PUBLIC_ENABLE_MICROSOFT_AUTH_PROVIDER --value true
   ```

4. Add both the hosted auth page domain and the deployed web app origin to
   Firebase Authentication > Settings > Authorized domains.

5. Add the hosted auth page's canonical Firebase Auth handler URL to the Google
   OAuth web client's authorized redirect URIs. For the dev project, this is
   `https://synthetic-song-473914-h5.firebaseapp.com/__/auth/handler`. The
   hosted page redirects `web.app` traffic to `firebaseapp.com` before starting
   Google sign-in so Google receives this canonical redirect URI.

6. Rebuild after updating the EAS environment so the hosted auth URL is
   compiled into the native app.

In the output, you'll find options to open the app in a

- [development build](https://docs.expo.dev/develop/development-builds/introduction/)
- [Android emulator](https://docs.expo.dev/workflow/android-studio-emulator/)
- [iOS simulator](https://docs.expo.dev/workflow/ios-simulator/)
- [Expo Go](https://expo.dev/go), a limited sandbox for trying out app development with Expo

You can start developing by editing the files inside the **app** directory. This project uses [file-based routing](https://docs.expo.dev/router/introduction).

## Get a fresh project

When you're ready, run:

```bash
npm run reset-project
```

This command will move the starter code to the **app-example** directory and create a blank **app** directory where you can start developing.

### Other setup steps

- To set up ESLint for linting, run `npx expo lint`, or follow our guide on ["Using ESLint and Prettier"](https://docs.expo.dev/guides/using-eslint/)
- If you'd like to set up unit testing, follow our guide on ["Unit Testing with Jest"](https://docs.expo.dev/develop/unit-testing/)
- Learn more about the TypeScript setup in this template in our guide on ["Using TypeScript"](https://docs.expo.dev/guides/typescript/)

## Learn more

To learn more about developing your project with Expo, look at the following resources:

- [Expo documentation](https://docs.expo.dev/): Learn fundamentals, or go into advanced topics with our [guides](https://docs.expo.dev/guides).
- [Learn Expo tutorial](https://docs.expo.dev/tutorial/introduction/): Follow a step-by-step tutorial where you'll create a project that runs on Android, iOS, and the web.

## Join the community

Join our community of developers creating universal apps.

- [Expo on GitHub](https://github.com/expo/expo): View our open source platform and contribute.
- [Discord community](https://chat.expo.dev): Chat with Expo users and ask questions.
