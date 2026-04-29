# Auth Exchange API

Small Cloud Run service that converts a Firebase client ID token from the
hosted auth page into a Firebase custom token for the Expo app.

## Local

```bash
npm install
cp env.example .env
npm run dev
```

For local development, set `FIREBASE_SERVICE_ACCOUNT_JSON` to a service account
JSON string, or use `GOOGLE_APPLICATION_CREDENTIALS`.

## Deploy

The Terragrunt stack in `infra/live/dev` builds and deploys this service to
Cloud Run as `todoapp-auth-api` in `us-east1`. Keep minimum instances at `0`.

The service account needs permission to mint Firebase custom tokens. The
simplest setup is either:

- run with a service account key via `FIREBASE_SERVICE_ACCOUNT_JSON`, or
- run on Cloud Run with Application Default Credentials and grant the runtime
  service account Firebase Auth access plus permission to sign tokens for
  itself, typically `Firebase Authentication Admin` and
  `Service Account Token Creator`.

Firebase Hosting can route the same-origin exchange path with the rewrite in
the repo root `firebase.json`.
