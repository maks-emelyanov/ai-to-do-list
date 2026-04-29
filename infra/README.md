# Firebase Auth Infrastructure

This directory contains a Terraform module and Terragrunt live stack for managing the Firebase project/Auth configuration and the Cloud Run auth exchange API used by the app.

The stack uses Google Cloud's Identity Platform resources because Terraform-managed Firebase Authentication is exposed through GCIP. A billing-enabled Google Cloud project is required for this path.

## Layout

- `modules/firebase-auth`: reusable Terraform module for the Firebase project, Firebase Web App, Auth configuration, Artifact Registry, and Cloud Run auth API.
- `live/root.hcl`: shared Terragrunt settings and remote state template.
- `live/dev/terragrunt.hcl`: dev environment inputs.

## Prerequisites

- Terraform `>= 1.6`
- Terragrunt `>= 0.55`
- Node.js/npm available locally. The stack uses `npx --yes firebase-tools` to
  deploy Firebase Hosting without requiring a global Firebase CLI install.
- Google Cloud credentials available to Terraform, for example:

```bash
gcloud auth application-default login
```

- Permissions to create/manage projects, enable APIs, attach billing, and configure Identity Platform.
- `gcloud` installed locally. The dev stack uses Cloud Build through `gcloud builds submit` to build `apps/auth-api`.
- A GCS bucket for remote state. Create it before running Terragrunt, then update `infra/live/root.hcl`.

## Configure Dev

Copy the sample inputs and fill in your real project/billing details:

```bash
cp infra/live/dev/env.hcl.example infra/live/dev/env.hcl
```

At minimum, set:

- `project_id`
- `project_name`
- `billing_account`
- either `folder_id` or `org_id`, if creating a new project
- app display names and package/bundle IDs, if you want Firebase Android/iOS app registrations for deep links or future native integrations

The checked-in default enables email/password sign-in and disables anonymous and phone sign-in.

Regional infrastructure is standardized on `us-east1`. The module validates
that regional resources use only that region, and the dev Terragrunt stack
passes `us-east1` automatically.

Google and Microsoft sign-in provider credentials can come from either process
env or Google Secret Manager:

- `GOOGLE_AUTH_PROVIDER_CLIENT_ID`
- `GOOGLE_AUTH_PROVIDER_CLIENT_SECRET`
- Secret Manager fallback: `google-auth-provider-client-id`
- Secret Manager fallback: `google-auth-provider-client-secret`
- `MICROSOFT_AUTH_PROVIDER_CLIENT_ID`
- `MICROSOFT_AUTH_PROVIDER_CLIENT_SECRET`
- Secret Manager fallback: `microsoft-auth-provider-client-id`
- Secret Manager fallback: `microsoft-auth-provider-client-secret`

For Google, `GOOGLE_AUTH_PROVIDER_CLIENT_ID` must be the OAuth **Client ID**
for a **Web application** client, not the OAuth client resource UUID and not an
Android/iOS client ID. It should look like
`PROJECT_NUMBER-random.apps.googleusercontent.com`. The matching authorized
redirect URI in Google Cloud must include:

```text
https://PROJECT_ID.firebaseapp.com/__/auth/handler
```

The hosted auth page canonicalizes the `web.app` Firebase Hosting domain to
`firebaseapp.com` before starting Google sign-in, so native builds can continue
opening either Firebase Hosting domain while Google receives the allowed
`firebaseapp.com` redirect URI.

The dev stack defaults `ENABLE_GOOGLE_AUTH_PROVIDER` to `true`. Export
`ENABLE_GOOGLE_AUTH_PROVIDER=false` if you need to plan or apply with the
provider disabled.

The dev stack defaults `ENABLE_MICROSOFT_AUTH_PROVIDER` to `false`. Export
`ENABLE_MICROSOFT_AUTH_PROVIDER=true` only after the Microsoft OAuth client ID
and secret are available.

Apple sign-in is controlled by `ENABLE_APPLE_AUTH_PROVIDER` and uses
`APPLE_AUTH_PROVIDER_SERVICES_ID` plus the generated Apple client secret from
`infra/scripts/apple-client-secret.mjs`.

## Android Fingerprints

The dev stack registers the local Android debug keystore fingerprints and the current EAS Build default keystore fingerprints for `com.maks.todoapp`.

These fingerprints are still useful when you want the Firebase Android app registration to match local debug builds or EAS builds for app links and related Android configuration.

To add additional EAS build fingerprints, export the SHA values before planning or applying:

```bash
export EAS_ANDROID_SHA1_HASHES="AA:BB:CC:..."
export EAS_ANDROID_SHA256_HASHES="11:22:33:..."
```

Multiple fingerprints can be comma-separated. Colons and uppercase letters are accepted; the module normalizes them before sending them to Firebase.

Get the EAS fingerprints with:

```bash
cd apps/mobile
npx eas-cli credentials
```

Choose Android, select the `com.maks.todoapp` app, then show the keystore credentials and copy the SHA-1 and SHA-256 fingerprints.

If the Firebase Android app already exists outside Terraform, import it before applying. The current app ID is `1:322657163839:android:b0d0619a8d46149dc5b68a`:

```bash
cd infra/live/dev
terragrunt import \
  'google_firebase_android_app.android[0]' \
  'projects/synthetic-song-473914-h5/androidApps/1:322657163839:android:b0d0619a8d46149dc5b68a'
```

After applying new SHA fingerprints, rebuild the Android app if you are testing updated app-link or auth behavior against a fresh build.

## Run

From the dev live directory:

```bash
cd infra/live/dev
terragrunt init
terragrunt plan
terragrunt apply
```

The apply builds `apps/auth-api`, pushes it to the `us-east1` Artifact Registry
repository, deploys the `todoapp-auth-api` Cloud Run service in `us-east1`, and
deploys Firebase Hosting for `apps/auth-web/public`.
The module grants Cloud Build permissions to both Google Cloud's legacy Cloud
Build service account and the Compute Engine default service account, since
newer projects may run default builds as the compute service account. Those
grants include read access to the Cloud Build source archive bucket and write
access to the auth API Artifact Registry repository.
To force a new image tag for the same source, set:

```bash
export AUTH_API_IMAGE_TAG="$(git rev-parse --short HEAD)"
```

## Outputs

After apply, use:

```bash
terragrunt output
```

The `firebase_web_config` output contains the client config values for the Expo app's `EXPO_PUBLIC_FIREBASE_*` variables.

The module can also output Firebase Android and Apple app IDs when those registrations are enabled, but it no longer emits native service files because the mobile app uses the JS Firebase SDK plus browser-backed auth sessions.

The `auth_api_service_url` and `auth_api_container_image` outputs identify the
deployed auth exchange service. Firebase Hosting serves the static auth page and
is deployed by the dev Terragrunt stack after Cloud Run is ready, so the
`/auth/exchange` rewrite can reach Cloud Run in `us-east1`.
