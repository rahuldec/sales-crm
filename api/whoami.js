// Called once right after login: resolves the caller's username/password
// (HTTP Basic Auth) against the Credentials tab (lib/registry.js) and tells
// the frontend what to show — its own manager tabs, a Master tab, both, or
// a straight rejection for wrong credentials. This is the only place the
// frontend learns its own tenant/roles; it never gets another tenant's
// name or bridge credentials.

const { authenticate } = require('../lib/auth');

module.exports = async function handler(req, res) {
  try {
    const tenant = await authenticate(req);
    res.status(200).json({
      ok: true,
      name: tenant.tenant || tenant.user,
      isManager: !!(tenant.bridge.url && tenant.bridge.token),
      isHead: tenant.isHead,
    });
  } catch (err) {
    console.error('api/whoami error:', err);
    res.status(err.status || 401).json({ error: String(err.message || err) });
  }
};
