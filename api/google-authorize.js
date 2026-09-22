// Step 1 of the one-time Google OAuth bootstrap for lib/google-auth.js.
// Visit this route once in a browser, approve the consent screen, and Google
// redirects to /api/google-callback with a code that gets exchanged for the
// refresh token this app runs on long-term. See api/asana-authorize.js in
// the sibling `kpi` project for the same pattern against a different API.
//
// The Google OAuth client's "Authorized redirect URIs" must list this
// deployment's own /api/google-callback URL exactly, or Google refuses with
// a redirect_uri_mismatch — add it in Google Cloud Console -> APIs &
// Services -> Credentials -> (this OAuth client).
//
// access_type=offline + prompt=consent are both required to actually get a
// refresh_token back — Google only issues one on a consent prompt, and
// silently omits it on a repeat authorization without prompt=consent.
module.exports = async (req, res) => {
  const clientId = process.env.GOOGLE_CLIENT_ID || '';
  if (!clientId) {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.status(500).send('GOOGLE_CLIENT_ID is not set on this deployment.');
  }

  // Vercel always sets x-forwarded-proto; local dev-server.js never does, so
  // fall back to http for localhost specifically rather than defaulting to
  // https everywhere — a plain http local redirect_uri must match what's
  // registered in the Google OAuth client exactly, scheme included.
  const isLocalhost = /^localhost(:\d+)?$/.test(req.headers.host || '');
  const proto = req.headers['x-forwarded-proto'] || (isLocalhost ? 'http' : 'https');
  const redirectUri = `${proto}://${req.headers.host}/api/google-callback`;

  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'https://www.googleapis.com/auth/spreadsheets');
  url.searchParams.set('access_type', 'offline');
  url.searchParams.set('prompt', 'consent');

  res.writeHead(302, { Location: url.toString() });
  res.end();
};
