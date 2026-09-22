// OAuth access token for the Google Sheets API, via a long-lived refresh
// token — not a service-account key file. This org's Cloud policy
// (iam.disableServiceAccountKeyCreation) blocks downloading service-account
// JSON keys, so this follows the same shape as this project's sibling
// `kpi`'s Asana integration (api/asana-authorize.js / api/asana-callback.js):
// a one-time browser consent (see api/google-authorize.js) yields a refresh
// token, stored as GOOGLE_REFRESH_TOKEN, that this module silently exchanges
// for short-lived access tokens forever after.

const TOKEN_URL = 'https://oauth2.googleapis.com/token';

let cachedToken = null; // { token, expiresAt }

async function getAccessToken() {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 30_000) {
    return cachedToken.token;
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REFRESH_TOKEN not set — visit /api/google-authorize once to bootstrap');
  }

  const r = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
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
