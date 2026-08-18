const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { issueToken } = require('../lib/token');

const SECRET = process.env.JWT_SECRET || 'change_this_secret_in_production_dev_only';

function getBaseUrl(req) {
  return process.env.PUBLIC_URL || `${req.protocol}://${req.get('host')}`;
}

function getFrontendUrl(req) {
  return process.env.FRONTEND_URL || getBaseUrl(req);
}

// Short-lived signed nonce used as OAuth `state`, avoiding a session store.
function signState() {
  return jwt.sign({ purpose: 'oauth-state' }, SECRET, { expiresIn: '10m' });
}

function verifyState(state) {
  try {
    return jwt.verify(state, SECRET).purpose === 'oauth-state';
  } catch {
    return false;
  }
}

function decodeIdToken(idToken) {
  return JSON.parse(Buffer.from(idToken.split('.')[1], 'base64').toString('utf8'));
}

async function findOrCreateSsoUser(db, { provider, providerId, email, name }) {
  let result = await db.query('SELECT * FROM users WHERE provider = $1 AND provider_id = $2', [provider, providerId]);
  if (result.rows.length > 0) return result.rows[0];

  // Link to an existing local/other-provider account with the same email
  // (safe here: both Google and Microsoft verify email ownership at their end).
  result = await db.query('SELECT * FROM users WHERE email = $1', [email]);
  if (result.rows.length > 0) {
    const existing = result.rows[0];
    await db.query('UPDATE users SET provider = $1, provider_id = $2 WHERE id = $3', [provider, providerId, existing.id]);
    return { ...existing, provider, provider_id: providerId };
  }

  const countResult = await db.query('SELECT COUNT(*)::int AS count FROM users');
  const role = countResult.rows[0].count === 0 ? 'admin' : 'user';
  const insertResult = await db.query(
    'INSERT INTO users (email, name, role, provider, provider_id) VALUES ($1, $2, $3, $4, $5) RETURNING *',
    [email, name, role, provider, providerId]
  );
  return insertResult.rows[0];
}

router.get('/providers', (req, res) => {
  res.json({
    google: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
    microsoft: !!(process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET),
  });
});

// ---- Google ----

router.get('/google', (req, res) => {
  if (!process.env.GOOGLE_CLIENT_ID) return res.status(404).json({ error: 'Google SSO non configuré' });
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: `${getBaseUrl(req)}/api/auth/google/callback`,
    response_type: 'code',
    scope: 'openid email profile',
    state: signState(),
    prompt: 'select_account',
  });
  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
});

router.get('/google/callback', async (req, res) => {
  const frontend = getFrontendUrl(req);
  try {
    const { code, state } = req.query;
    if (!code || !verifyState(state)) throw new Error('invalid_state');
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect_uri: `${getBaseUrl(req)}/api/auth/google/callback`,
        grant_type: 'authorization_code',
      }),
    });
    const tokenData = await tokenRes.json();
    if (!tokenData.id_token) throw new Error('no_id_token');
    const payload = decodeIdToken(tokenData.id_token);
    if (payload.email_verified === false) throw new Error('email_not_verified');
    const user = await findOrCreateSsoUser(req.app.locals.db, {
      provider: 'google',
      providerId: payload.sub,
      email: payload.email,
      name: payload.name || payload.email,
    });
    res.redirect(`${frontend}/auth/callback#token=${issueToken(user)}`);
  } catch (err) {
    res.redirect(`${frontend}/login?error=sso`);
  }
});

// ---- Microsoft (Entra ID / Microsoft 365) ----
// 'common' tenant accepts both personal Microsoft accounts and work/school (M365) accounts.

router.get('/microsoft', (req, res) => {
  if (!process.env.MICROSOFT_CLIENT_ID) return res.status(404).json({ error: 'Microsoft SSO non configuré' });
  const params = new URLSearchParams({
    client_id: process.env.MICROSOFT_CLIENT_ID,
    redirect_uri: `${getBaseUrl(req)}/api/auth/microsoft/callback`,
    response_type: 'code',
    response_mode: 'query',
    scope: 'openid email profile',
    state: signState(),
  });
  const tenant = process.env.MICROSOFT_TENANT_ID || 'common';
  res.redirect(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize?${params}`);
});

router.get('/microsoft/callback', async (req, res) => {
  const frontend = getFrontendUrl(req);
  try {
    const { code, state } = req.query;
    if (!code || !verifyState(state)) throw new Error('invalid_state');
    const tenant = process.env.MICROSOFT_TENANT_ID || 'common';
    const tokenRes = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: process.env.MICROSOFT_CLIENT_ID,
        client_secret: process.env.MICROSOFT_CLIENT_SECRET,
        redirect_uri: `${getBaseUrl(req)}/api/auth/microsoft/callback`,
        grant_type: 'authorization_code',
      }),
    });
    const tokenData = await tokenRes.json();
    if (!tokenData.id_token) throw new Error('no_id_token');
    const payload = decodeIdToken(tokenData.id_token);
    const email = payload.email || payload.preferred_username;
    if (!email) throw new Error('no_email');
    const user = await findOrCreateSsoUser(req.app.locals.db, {
      provider: 'microsoft',
      providerId: payload.oid || payload.sub,
      email,
      name: payload.name || email,
    });
    res.redirect(`${frontend}/auth/callback#token=${issueToken(user)}`);
  } catch (err) {
    res.redirect(`${frontend}/login?error=sso`);
  }
});

module.exports = router;
