// Reads the Master Control sheet's "Tenants" tab through its own Apps
// Script bridge (REGISTRY_URL/REGISTRY_TOKEN — a separate deployment from
// any manager's own data-sheet bridge, see apps-script/Code.gs's header
// comment). This is the only thing that decides who can see what: a Zoho
// login email that isn't a row here gets no access to anything, and a
// manager's own bridge URL/token never leave this sheet or reach the
// browser — the frontend only ever learns its own name/roles via
// api/whoami.js, never another tenant's credentials.

const { call } = require('./sheets');

const CACHE_MS = 60_000;
let cache = null; // { at, tenants }

function truthy(v) {
  return /^(y|yes|true|1)$/i.test(String(v || '').trim());
}

async function getTenants() {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.tenants;

  const url = process.env.REGISTRY_URL;
  const token = process.env.REGISTRY_TOKEN;
  if (!url || !token) {
    throw new Error('REGISTRY_URL / REGISTRY_TOKEN not set — see SETUP.md');
  }

  const { rows } = await call({ url, token });
  const tenants = rows.map(r => ({
    name: r.Name || '',
    email: String(r['Login Email'] || '').toLowerCase().trim(),
    isManager: truthy(r['Is Manager']),
    isHead: truthy(r['Is Head']),
    bridge: { url: r['Sheet Bridge URL'] || '', token: r['Sheet Bridge Token'] || '' },
    digestTo: r['Digest To'] || '',
    digestCc: r['Digest CC'] || '',
    digestBcc: r['Digest BCC'] || '',
  }));

  cache = { at: Date.now(), tenants };
  return tenants;
}

async function getTenantByEmail(email) {
  const tenants = await getTenants();
  const needle = String(email || '').toLowerCase().trim();
  return tenants.find(t => t.email === needle) || null;
}

module.exports = { getTenants, getTenantByEmail };
