// Called once right after login: resolves the caller's Zoho identity to
// their registry row (lib/registry.js) and tells the frontend what to show
// — its own manager tabs, a Master tab, both, or neither. This is the only
// place the frontend learns its own roles; it never gets another tenant's
// name, email, or bridge credentials.

const { verifyZohoIdentity } = require('../lib/zoho');
const { getTenantByEmail } = require('../lib/registry');

module.exports = async function handler(req, res) {
  try {
    const { email, name } = await verifyZohoIdentity(req);
    const tenant = await getTenantByEmail(email);
    if (!tenant || (!tenant.isManager && !tenant.isHead)) {
      res.status(200).json({ ok: true, registered: false });
      return;
    }
    res.status(200).json({
      ok: true,
      registered: true,
      name: tenant.name || name,
      isManager: tenant.isManager,
      isHead: tenant.isHead,
    });
  } catch (err) {
    console.error('api/whoami error:', err);
    res.status(401).json({ error: String(err.message || err) });
  }
};
