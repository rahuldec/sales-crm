// Step 2 of the one-time Google OAuth bootstrap — see api/google-authorize.js.
// Google redirects here with ?code=... after consent; this exchanges it for
// a refresh token and prints it once. Copy the value into
// GOOGLE_REFRESH_TOKEN in Vercel -> Settings -> Environment Variables (and
// GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET alongside it, from the same OAuth
// client), then redeploy. This page shows it exactly once and stores it
// nowhere — losing it means repeating /api/google-authorize, not recovering
// it from anywhere. Same shape as kpi/api/asana-callback.js.
//
// This route needs no auth of its own: the `code` it receives is single-use,
// short-lived, and only redeemable by whoever holds GOOGLE_CLIENT_SECRET
// (this deployment) — the same protection any OAuth callback relies on.
module.exports = async (req, res) => {
  const q = req.query && Object.keys(req.query).length
    ? req.query
    : Object.fromEntries(new URL(req.url, 'http://x').searchParams);

  res.setHeader('Content-Type', 'text/plain; charset=utf-8');

  if (q.error) return res.status(400).send(`Google returned an error: ${q.error}`);
  if (!q.code) return res.status(400).send('No ?code= on this request — start at /api/google-authorize instead.');

  const clientId = process.env.GOOGLE_CLIENT_ID || '';
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET || '';
  if (!clientId || !clientSecret)
    return res.status(500).send('GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are not set on this deployment.');

  // Must compute the exact same redirect_uri as api/google-authorize.js
  // used to start the flow, or Google refuses the token exchange.
  const isLocalhost = /^localhost(:\d+)?$/.test(req.headers.host || '');
  const proto = req.headers['x-forwarded-proto'] || (isLocalhost ? 'http' : 'https');
  const redirectUri = `${proto}://${req.headers.host}/api/google-callback`;

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    code: q.code,
  });

  let json;
  try {
    const r = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    json = await r.json().catch(() => ({}));
    if (!r.ok)
      return res.status(502).send(`Google token exchange failed: ${json.error_description || json.error || r.status}`);
  } catch (e) {
    return res.status(502).send(`Could not reach Google: ${e.message}`);
  }

  if (!json.refresh_token) {
    return res.status(200).send(
      'Google did not return a refresh_token (only an access token). This usually means consent was\n' +
      'already granted previously without a prompt. Revoke access at https://myaccount.google.com/permissions\n' +
      'for this app, then revisit /api/google-authorize to force a fresh consent screen.\n'
    );
  }

  return res.status(200).send(
    'Success. Copy the line below into Vercel -> Settings -> Environment Variables\n' +
    'as GOOGLE_REFRESH_TOKEN, then redeploy. This is shown once and not stored anywhere\n' +
    'by this app — if you lose it, just revisit /api/google-authorize to get a new one.\n\n' +
    `GOOGLE_REFRESH_TOKEN=${json.refresh_token}\n`
  );
};
