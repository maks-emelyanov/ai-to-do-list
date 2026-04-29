const express = require('express');
const admin = require('firebase-admin');

const app = express();
const port = Number(process.env.PORT || 8080);
const allowedOrigins = new Set(
  (process.env.AUTH_WEB_ORIGINS || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
);

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

function applyCors(req, res, next) {
  const origin = req.get('origin');

  if (origin && (allowedOrigins.has('*') || allowedOrigins.has(origin))) {
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

initializeFirebaseAdmin();
app.disable('x-powered-by');
app.use(applyCors);
app.use(express.json({ limit: '8kb' }));

app.get('/healthz', (_req, res) => {
  res.json({ ok: true });
});

app.post('/auth/exchange', async (req, res) => {
  const { idToken } = req.body || {};

  if (typeof idToken !== 'string' || idToken.length === 0) {
    res.status(400).json({ error: 'missing-id-token' });
    return;
  }

  try {
    const decoded = await admin.auth().verifyIdToken(idToken, true);
    await admin.auth().getUser(decoded.uid);

    const firebaseProvider = decoded.firebase?.sign_in_provider;
    const customToken = await admin.auth().createCustomToken(decoded.uid, {
      hostedAuthProvider: firebaseProvider || 'unknown',
    });

    res.json({ token: customToken });
  } catch (error) {
    console.error('Unable to exchange Firebase ID token', error);
    res.status(401).json({ error: 'invalid-id-token' });
  }
});

app.listen(port, () => {
  console.log(`Auth exchange API listening on ${port}`);
});
