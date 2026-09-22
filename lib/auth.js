// Combines HTTP Basic Auth parsing with lib/registry.js's Credentials
// lookup into the two checks api routes actually need. Throws on any
// failure — callers catch once and respond 401/403, so a wrong password or
// a manager trying to reach a head-only route never gets further than here.
//
// Plain username/password (Basic Auth), not Zoho — the frontend sends this
// on every request (see public/index.html's authedFetch), and every route
// re-checks it against the Credentials tab itself rather than trusting a
// session or anything the client claims about who it is.

const { findByCredentials } = require('./registry');

function parseBasicAuth(req) {
  const auth = req.headers.authorization || req.headers.Authorization;
  const m = /^Basic (.+)$/i.exec(auth || '');
  if (!m) {
    const err = new Error('Missing credentials');
    err.status = 401;
    throw err;
  }
  const decoded = Buffer.from(m[1], 'base64').toString('utf8');
  const sep = decoded.indexOf(':');
  if (sep === -1) {
    const err = new Error('Malformed credentials');
    err.status = 401;
    throw err;
  }
  return { username: decoded.slice(0, sep), password: decoded.slice(sep + 1) };
}

async function authenticate(req) {
  const { username, password } = parseBasicAuth(req);
  const tenant = await findByCredentials(username, password);
  if (!tenant) {
    const err = new Error('Invalid username or password');
    err.status = 401;
    throw err;
  }
  return tenant;
}

// For api/sheet.js, api/email.js — resolves the caller to their OWN
// tenant's bridge. A client can never pass "whose data do you want" as a
// parameter; it's always the tenant tied to the credentials that were sent.
async function requireManager(req) {
  const tenant = await authenticate(req);
  if (!tenant.bridge.url || !tenant.bridge.token) {
    const err = new Error(`This account (${tenant.tenant || tenant.user}) has no sheet of its own to manage`);
    err.status = 403;
    throw err;
  }
  return tenant;
}

// For api/master.js — the caller must be a head; which tenants they get
// back is resolved server-side from the registry, never supplied by the
// client.
async function requireHead(req) {
  const tenant = await authenticate(req);
  if (!tenant.isHead) {
    const err = new Error('This account does not have master dashboard access');
    err.status = 403;
    throw err;
  }
  return tenant;
}

module.exports = { authenticate, requireManager, requireHead };
