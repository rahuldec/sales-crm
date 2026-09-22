// Combines lib/zoho.js (who is this, really) with lib/registry.js (what are
// they allowed to see) into the two checks api routes actually need.
// Throws on any failure — callers catch once and respond 401/403, so an
// unregistered email or a manager trying to reach a head-only route never
// gets further than here.

const { verifyZohoIdentity } = require('./zoho');
const { getTenantByEmail } = require('./registry');

// For api/sheet.js, api/email.js — resolves the caller to their OWN tenant
// row and bridge. A client can never pass "whose data do you want" as a
// parameter; it's always derived from the verified Zoho email.
async function requireManager(req) {
  const { email } = await verifyZohoIdentity(req);
  const tenant = await getTenantByEmail(email);
  if (!tenant || !tenant.isManager) {
    const err = new Error('This account is not set up as a sales manager');
    err.status = 403;
    throw err;
  }
  if (!tenant.bridge.url || !tenant.bridge.token) {
    const err = new Error(`No sheet bridge configured for ${tenant.name || email} in the registry`);
    err.status = 500;
    throw err;
  }
  return tenant;
}

// For api/master.js — the caller must be a head; the tenant list they get
// back is every OTHER manager's data, resolved server-side, never supplied
// by the client.
async function requireHead(req) {
  const { email } = await verifyZohoIdentity(req);
  const tenant = await getTenantByEmail(email);
  if (!tenant || !tenant.isHead) {
    const err = new Error('This account does not have master dashboard access');
    err.status = 403;
    throw err;
  }
  return tenant;
}

module.exports = { requireManager, requireHead };
