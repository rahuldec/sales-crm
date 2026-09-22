// Server-side Zoho identity check, reused by every protected API route
// (api/sheet.js, api/email.js, api/whoami.js, api/master.js) — NOT the same
// thing as api/zoho-user.js, which is the browser-facing profile proxy
// zoho-auth.js calls once during the login handshake. This is the
// per-request "who is actually calling this API" check: the frontend sends
// its stored Zoho access token on every call, and this re-verifies it
// against Zoho directly rather than trusting anything the client claims —
// a request can say whatever tenant it wants in its own JS state, but it
// can't forge a Zoho token for someone else's account.

const ALLOWED_ACCOUNTS = /^https:\/\/accounts\.zoho(\.[a-z]{2,3})?(\.cloud\.ca)?$/;

async function verifyZohoIdentity(req) {
  // Local-dev-only escape hatch: with DEV_BYPASS_EMAIL set in .env (never in
  // Vercel's env — there's no reason to), a request that actually arrived
  // on localhost (checked from the request itself, not just the env var
  // being set, so a stray env var left on a real deployment can't do
  // anything) skips real Zoho verification and is treated as that email.
  // Lets the multi-tenant server logic be tested without a live Zoho OAuth
  // round-trip for every registry row.
  const host = req.headers.host || '';
  if (process.env.DEV_BYPASS_EMAIL && /^localhost(:\d+)?$/.test(host)) {
    return { email: process.env.DEV_BYPASS_EMAIL.toLowerCase().trim(), name: 'Dev Bypass' };
  }

  const auth = req.headers.authorization || req.headers.Authorization;
  if (!auth || !/^Zoho-oauthtoken /i.test(auth)) {
    throw new Error('Missing Zoho access token');
  }
  const accounts = (req.query && req.query.accounts) || 'https://accounts.zoho.in';
  if (!ALLOWED_ACCOUNTS.test(accounts)) {
    throw new Error('Invalid accounts URL');
  }
  const r = await fetch(accounts + '/oauth/user/info', { headers: { Authorization: auth } });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    throw new Error(`Zoho rejected this session (${r.status})`);
  }
  const email = String(data.Email || data.email || '').toLowerCase().trim();
  if (!email) {
    throw new Error('Zoho profile had no email');
  }
  return { email, name: data.Display_Name || data.display_name || data.First_Name || 'User' };
}

module.exports = { verifyZohoIdentity };
