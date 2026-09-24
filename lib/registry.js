// Reads the OD-MASTER spreadsheet's "Credentials" tab (columns: tenant,
// User, password, Sheet Bridge URL, Sheet Bridge Token, Is Head) through
// its own Apps Script bridge (MASTER_URL/MASTER_TOKEN — a single
// deployment on OD-MASTER that also serves the Master view's per-manager
// mirrored tabs, see apps-script/Code.gs's header comment and
// lib/sheets.js's `params` support).
//
// Plain username/password, not Zoho — a manager's own bridge URL/token
// (for their read+write dashboard) never leave this sheet or reach the
// browser; the frontend only ever learns its own tenant name/role via
// api/whoami.js, never another tenant's credentials.

const { call, getRows } = require('./sheets');

const CACHE_MS = 60_000;
let cache = null; // { at, rows }

function truthy(v) {
  return /^(y|yes|true|1)$/i.test(String(v || '').trim());
}

function masterBridge(extraParams) {
  const url = process.env.MASTER_URL;
  const token = process.env.MASTER_TOKEN;
  if (!url || !token) {
    throw new Error('MASTER_URL / MASTER_TOKEN not set — see SETUP.md');
  }
  return { url, token, params: extraParams };
}

async function getCredentials() {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.rows;

  let rows;
  try {
    ({ rows } = await call(masterBridge({ sheet: 'Credentials', requireColumn: 'User' })));
  } catch (err) {
    // Distinct from "wrong password" — api/whoami.js defaults a thrown
    // error's status to 401, which would otherwise make a transient
    // MASTER bridge failure (it's known to be occasionally slow or
    // briefly unreachable) look exactly like actually-wrong credentials
    // to the frontend, which reacts to a real 401 by wiping the user's
    // stored session and forcing them to log back in from scratch.
    const wrapped = new Error(`Could not reach the Credentials sheet: ${err.message}`);
    wrapped.status = 503;
    throw wrapped;
  }
  const parsed = rows.map(r => ({
    tenant: r.tenant || '',
    user: String(r.User || '').trim(),
    password: String(r.password || ''),
    isHead: truthy(r['Is Head']),
    bridge: { url: r['Sheet Bridge URL'] || '', token: r['Sheet Bridge Token'] || '' },
    // Optional — blank until added to the Credentials tab. Only meaningful
    // for a manager row; api/followup-digest.js skips a tenant with none set.
    digestTo: r['Digest To'] || '',
    digestCc: r['Digest CC'] || '',
    digestBcc: r['Digest BCC'] || '',
  }));

  cache = { at: Date.now(), rows: parsed };
  return parsed;
}

// Case-insensitive on the username, exact match on password — this is a
// plaintext-in-a-sheet credential store (no hashing), a deliberate
// simplicity tradeoff for a small internal tool; treat the Credentials tab
// itself as sensitive (admin-only access), same as any other secret store.
async function findByCredentials(username, password) {
  const rows = await getCredentials();
  const needle = String(username || '').trim().toLowerCase();
  return rows.find(r => r.user.toLowerCase() === needle && r.password === password) || null;
}

// For the Master rollup view: reads a manager's own tab INSIDE OD-MASTER
// (an IMPORTRANGE-fed mirror of their original sheet, read-only) rather
// than calling out to that manager's separate bridge — faster, and avoids
// N times the Apps Script flakiness for a view that only ever reads.
async function getTenantMirror(tenantName) {
  return getRows(masterBridge({ sheet: tenantName, requireColumn: 'Institution Name' }));
}

module.exports = { getCredentials, findByCredentials, getTenantMirror };
