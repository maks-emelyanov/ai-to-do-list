const express = require('express');
const admin = require('firebase-admin');
const crypto = require('node:crypto');

const app = express();
const port = Number(process.env.PORT || 8080);
const exchangeCodeTtlMs = readBoundedNumber(
  'AUTH_EXCHANGE_CODE_TTL_MS',
  120000,
  15000,
  300000
);
const rateLimitWindowMs = readBoundedNumber(
  'AUTH_RATE_LIMIT_WINDOW_MS',
  60000,
  1000,
  3600000
);
const exchangeRateLimit = readBoundedNumber(
  'AUTH_EXCHANGE_RATE_LIMIT',
  20,
  1,
  1000
);
const sessionRateLimit = readBoundedNumber(
  'AUTH_SESSION_RATE_LIMIT',
  30,
  1,
  1000
);
const exchangeCodeCollection =
  process.env.AUTH_EXCHANGE_CODE_COLLECTION || 'authExchangeCodes';
const allowedOrigins = new Set(
  (process.env.AUTH_WEB_ORIGINS || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
);
const supportedProviders = new Set([
  'apple',
  'emailLink',
  'google',
  'microsoft',
]);
const supportedPlatforms = new Set(['native', 'web']);
const firebaseProviderByHostedProvider = {
  apple: 'apple.com',
  emailLink: 'password',
  google: 'google.com',
  microsoft: 'microsoft.com',
};
const rateLimitBuckets = new Map();
let rateLimitCleanupCounter = 0;

function readBoundedNumber(name, defaultValue, min, max) {
  const configured = Number(process.env[name] || defaultValue);
  const bounded = Number.isFinite(configured)
    ? Math.min(Math.max(configured, min), max)
    : defaultValue;

  return Math.floor(bounded);
}

function initializeFirebaseAdmin() {
  if (admin.apps.length > 0) {
    return;
  }

  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  const projectId = process.env.FIREBASE_PROJECT_ID;

  if (serviceAccountJson) {
    admin.initializeApp({
      credential: admin.credential.cert(JSON.parse(serviceAccountJson)),
      projectId,
    });
    return;
  }

  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId,
  });
}

function getExchangeCodeCollection() {
  return admin.firestore().collection(exchangeCodeCollection);
}

function createHttpError(status, code, message) {
  return Object.assign(new Error(message || code), { code, status });
}

function createExchangeCode() {
  return crypto.randomBytes(32).toString('base64url');
}

function hashExchangeCode(code) {
  return crypto.createHash('sha256').update(code).digest('hex');
}

function hashBindingValue(value) {
  return crypto.createHash('sha256').update(value).digest('base64url');
}

function safeEqualHash(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string') {
    return false;
  }

  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  return (
    leftBuffer.length === rightBuffer.length &&
    crypto.timingSafeEqual(leftBuffer, rightBuffer)
  );
}

function normalizeProvider(provider) {
  if (typeof provider !== 'string') {
    return null;
  }

  const normalized = provider.trim();

  return supportedProviders.has(normalized) ? normalized : null;
}

function normalizePlatform(platform) {
  if (typeof platform !== 'string') {
    return null;
  }

  const normalized = platform.trim();

  return supportedPlatforms.has(normalized) ? normalized : null;
}

function normalizeState(state) {
  if (typeof state !== 'string') {
    return null;
  }

  const normalized = state.trim();

  return normalized.length >= 16 && normalized.length <= 256
    ? normalized
    : null;
}

function normalizeReturnTo(returnTo) {
  if (typeof returnTo !== 'string' || returnTo.length > 2048) {
    return null;
  }

  try {
    const parsed = new URL(returnTo);

    if (!['http:', 'https:', 'mobile:'].includes(parsed.protocol)) {
      return null;
    }

    return parsed.toString();
  } catch {
    return null;
  }
}

function normalizeExchangeContext({ provider, platform, returnTo, state }) {
  const normalizedProvider = normalizeProvider(provider);
  const normalizedPlatform = normalizePlatform(platform);
  const normalizedReturnTo = normalizeReturnTo(returnTo);
  const normalizedState = normalizeState(state);

  if (
    !normalizedProvider ||
    !normalizedPlatform ||
    !normalizedReturnTo ||
    !normalizedState
  ) {
    throw createHttpError(
      400,
      'missing-auth-context',
      'The auth exchange request is missing required context.'
    );
  }

  return {
    platform: normalizedPlatform,
    provider: normalizedProvider,
    returnTo: normalizedReturnTo,
    state: normalizedState,
  };
}

function firebaseProviderMatches(decodedProvider, hostedProvider) {
  const expectedProvider = firebaseProviderByHostedProvider[hostedProvider];

  if (hostedProvider === 'emailLink') {
    return (
      decodedProvider === expectedProvider || decodedProvider === 'emailLink'
    );
  }

  return decodedProvider === expectedProvider;
}

function exchangeBindingMatches(data, context) {
  return (
    data.provider === context.provider &&
    data.platform === context.platform &&
    safeEqualHash(data.stateHash, hashBindingValue(context.state)) &&
    safeEqualHash(data.returnToHash, hashBindingValue(context.returnTo))
  );
}

async function createHostedAuthExchangeCode({
  platform,
  provider,
  returnTo,
  state,
  uid,
}) {
  const code = createExchangeCode();
  const expiresAt = admin.firestore.Timestamp.fromMillis(
    Date.now() + exchangeCodeTtlMs
  );

  await getExchangeCodeCollection().doc(hashExchangeCode(code)).create({
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    expiresAt,
    platform,
    provider,
    returnToHash: hashBindingValue(returnTo),
    stateHash: hashBindingValue(state),
    uid,
  });

  return code;
}

async function consumeHostedAuthExchangeCode({ code, context }) {
  const docRef = getExchangeCodeCollection().doc(hashExchangeCode(code));

  const result = await admin.firestore().runTransaction(async (transaction) => {
    const snapshot = await transaction.get(docRef);

    if (!snapshot.exists) {
      throw createHttpError(
        401,
        'invalid-exchange-code',
        'The auth exchange code is invalid or already used.'
      );
    }

    const data = snapshot.data() || {};
    const expiresAtMs =
      typeof data.expiresAt?.toMillis === 'function'
        ? data.expiresAt.toMillis()
        : 0;

    transaction.delete(docRef);

    if (expiresAtMs <= Date.now()) {
      return {
        error: createHttpError(
          401,
          'expired-exchange-code',
          'The auth exchange code expired.'
        ),
      };
    }

    if (typeof data.uid !== 'string' || data.uid.length === 0) {
      return {
        error: createHttpError(
          401,
          'invalid-exchange-code',
          'The auth exchange code is invalid.'
        ),
      };
    }

    if (!exchangeBindingMatches(data, context)) {
      return {
        error: createHttpError(
          401,
          'invalid-exchange-code',
          'The auth exchange code does not match this session.'
        ),
      };
    }

    return {
      provider: context.provider,
      uid: data.uid,
    };
  });

  if ('error' in result) {
    throw result.error;
  }

  return result;
}

function isAllowedOrigin(origin) {
  if (allowedOrigins.has('*') || allowedOrigins.has(origin)) {
    return true;
  }

  try {
    const { hostname } = new URL(origin);
    return hostname === 'localhost' || hostname === '127.0.0.1';
  } catch {
    return false;
  }
}

function applyCors(req, res, next) {
  const origin = req.get('origin');

  if (origin && isAllowedOrigin(origin)) {
    res.set('Access-Control-Allow-Origin', origin);
    res.set('Vary', 'Origin');
    res.set('Access-Control-Allow-Headers', 'Content-Type');
    res.set('Access-Control-Allow-Methods', 'POST,OPTIONS');
  }

  if (req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }

  next();
}

function getClientIp(req) {
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

function cleanupRateLimitBuckets(now) {
  rateLimitCleanupCounter += 1;

  if (rateLimitCleanupCounter % 100 !== 0 && rateLimitBuckets.size < 10000) {
    return;
  }

  for (const [key, bucket] of rateLimitBuckets.entries()) {
    if (bucket.resetAt <= now) {
      rateLimitBuckets.delete(key);
    }
  }
}

function createRateLimiter({ limit, scope }) {
  return (req, res, next) => {
    const now = Date.now();
    const key = `${scope}:${getClientIp(req)}`;
    const bucket = rateLimitBuckets.get(key);

    cleanupRateLimitBuckets(now);

    if (!bucket || bucket.resetAt <= now) {
      rateLimitBuckets.set(key, {
        count: 1,
        resetAt: now + rateLimitWindowMs,
      });
      next();
      return;
    }

    if (bucket.count >= limit) {
      res.set('Retry-After', String(Math.ceil((bucket.resetAt - now) / 1000)));
      res.status(429).json({ error: 'rate-limited' });
      return;
    }

    bucket.count += 1;
    next();
  };
}

function getSafeErrorDetails(error) {
  if (!error || typeof error !== 'object') {
    return { name: typeof error };
  }

  return {
    code: typeof error.code === 'string' ? error.code : undefined,
    name: typeof error.name === 'string' ? error.name : undefined,
    status: Number.isFinite(Number(error.status))
      ? Number(error.status)
      : undefined,
  };
}

function logAuthError(message, error) {
  console.error(message, getSafeErrorDetails(error));
}

initializeFirebaseAdmin();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(applyCors);
app.use(express.json({ limit: '8kb' }));

app.get('/healthz', (_req, res) => {
  res.json({ ok: true });
});

app.post(
  '/auth/exchange',
  createRateLimiter({ limit: exchangeRateLimit, scope: 'exchange' }),
  async (req, res) => {
    const { idToken } = req.body || {};

    if (typeof idToken !== 'string' || idToken.length === 0) {
      res.status(400).json({ error: 'missing-id-token' });
      return;
    }

    let context;

    try {
      context = normalizeExchangeContext(req.body || {});
    } catch (error) {
      res.status(Number(error.status || 400)).json({
        error: error.code || 'missing-auth-context',
      });
      return;
    }

    try {
      const decoded = await admin.auth().verifyIdToken(idToken, true);
      await admin.auth().getUser(decoded.uid);

      if (
        !firebaseProviderMatches(
          decoded.firebase?.sign_in_provider,
          context.provider
        )
      ) {
        throw createHttpError(
          401,
          'invalid-id-token',
          'The Firebase ID token does not match the requested provider.'
        );
      }

      const code = await createHostedAuthExchangeCode({
        ...context,
        uid: decoded.uid,
      });

      res.json({
        code,
        expiresIn: Math.floor(exchangeCodeTtlMs / 1000),
      });
    } catch (error) {
      logAuthError('Unable to create auth exchange code', error);
      res.status(401).json({ error: 'invalid-id-token' });
    }
  }
);

app.post(
  '/auth/session',
  createRateLimiter({ limit: sessionRateLimit, scope: 'session' }),
  async (req, res) => {
    const { code } = req.body || {};

    if (typeof code !== 'string' || code.length === 0) {
      res.status(400).json({ error: 'missing-exchange-code' });
      return;
    }

    let context;

    try {
      context = normalizeExchangeContext(req.body || {});
    } catch (error) {
      res.status(Number(error.status || 400)).json({
        error: error.code || 'missing-auth-context',
      });
      return;
    }

    try {
      const { provider, uid } = await consumeHostedAuthExchangeCode({
        code,
        context,
      });
      await admin.auth().getUser(uid);

      const customToken = await admin.auth().createCustomToken(uid, {
        hostedAuthProvider: provider,
      });

      res.json({ token: customToken });
    } catch (error) {
      const status = Number(error.status || 401);
      const code = error.code || 'invalid-exchange-code';

      logAuthError(
        'Unable to exchange auth code for Firebase custom token',
        error
      );
      res.status(status).json({ error: code });
    }
  }
);

app.listen(port, () => {
  console.log(`Auth exchange API listening on ${port}`);
});
