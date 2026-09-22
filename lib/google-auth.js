// Service-account OAuth for the Google Sheets API, hand-rolled — no
// `googleapis`/`google-auth-library` dependency, matching the rest of this
// project (and its sibling `kpi`) staying on Node built-ins only.
//
// Flow: sign a JWT with the service account's private key (RS256, via
// Node's built-in `crypto`), exchange it at Google's token endpoint for a
// short-lived OAuth access token, and reuse that token across requests
// until shortly before it expires — same cached-token shape as `kpi`'s
// `cachedAsanaToken` in api/data.js.

const crypto = require('crypto');

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SCOPE = 'https://www.googleapis.com/auth/spreadsheets';

let cachedToken = null; // { token, expiresAt }

function base64url(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function signJwt(email, privateKeyPem) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claims = {
    iss: email,
    scope: SCOPE,
    aud: TOKEN_URL,
    iat: now,
    exp: now + 3600,
  };
  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(claims))}`;
  const signature = crypto.sign('RSA-SHA256', Buffer.from(signingInput), privateKeyPem);
  return `${signingInput}.${signature.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}`;
}

// GOOGLE_SERVICE_ACCOUNT_KEY is stored with literal \n escapes (Vercel env
// vars are single-line) — swap them back to real newlines before signing.
function loadCredentials() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const rawKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!email || !rawKey) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_SERVICE_ACCOUNT_KEY not set');
  }
  return { email, privateKey: rawKey.replace(/\\n/g, '\n') };
}

async function getAccessToken() {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 30_000) {
    return cachedToken.token;
  }
  const { email, privateKey } = loadCredentials();
  const assertion = signJwt(email, privateKey);
  const r = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });
  const data = await r.json();
  if (!r.ok) {
    throw new Error(`Google token endpoint answered ${r.status}: ${JSON.stringify(data)}`);
  }
  cachedToken = { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return cachedToken.token;
}

module.exports = { getAccessToken };
