# Auth Exchange API

Small Cloud Run service that turns a Firebase client ID token from the hosted
auth page into a short-lived exchange code, then lets the Expo app redeem that
code once for a Firebase custom token.

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

The service stores exchange codes in Firestore with an `expiresAt` timestamp.
Terraform configures Firestore TTL cleanup for that field. Codes are single-use,
short-lived, and bound to the provider, state, platform, and return target that
created them. The service stores hashed state/return-target bindings instead of
raw callback URLs.

The broker also applies small in-memory, per-instance fixed-window rate limits
to `/auth/exchange` and `/auth/session`. Tune `AUTH_RATE_LIMIT_WINDOW_MS`,
`AUTH_EXCHANGE_RATE_LIMIT`, and `AUTH_SESSION_RATE_LIMIT` for deployed traffic.
The default exchange code TTL is 120 seconds and can be overridden with
`AUTH_EXCHANGE_CODE_TTL_MS` within the service clamp.

Its service account needs permission to read/write those code documents and mint
Firebase custom tokens. The simplest setup is either:

- run with a service account key via `FIREBASE_SERVICE_ACCOUNT_JSON`, or
- run on Cloud Run with Application Default Credentials and grant the runtime
  service account Firebase Auth access, Firestore access, and permission to sign
  tokens for itself, typically `Firebase Authentication Admin`, `Cloud Datastore
  User`, and `Service Account Token Creator`.

Firebase Hosting routes the same-origin exchange and session paths with the
rewrites in the repo root `firebase.json`.
