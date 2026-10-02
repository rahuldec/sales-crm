// Head-only rollup: every manager's rows, fetched in parallel from
// OD-MASTER's own IMPORTRANGE-mirrored tabs (lib/registry.js's
// getTenantMirror — faster and less flaky than calling out to each
// manager's separate bridge, and this view is read-only anyway), for the
// frontend's Master tab to compute per-manager (and combined) KPIs from —
// the same computeKpis() logic the Overview tab already uses, just run once
// per tenant instead of once for "the current user's own sheet".

const { getCredentials, getTenantMirror } = require('../lib/registry');
const { getRows } = require('../lib/sheets');
const { requireHead } = require('../lib/auth');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  try {
    await requireHead(req);

    const credentials = await getCredentials();
    const managers = credentials.filter(t => t.bridge.url && t.bridge.token && t.tenant);

    const results = await Promise.all(managers.map(async t => {
      try {
        const visitsBridge = { url: t.bridge.url, token: t.bridge.token, params: { sheet: 'Visits', requireColumn: 'Institution Name' } };
        const [leadsData, visitsData] = await Promise.all([
          getTenantMirror(t.tenant),
          getRows(visitsBridge).catch(() => ({ rows: [] })),
        ]);
        return { name: t.tenant, ok: true, headers: leadsData.headers, rows: leadsData.rows, visits: visitsData.rows || [] };
      } catch (err) {
        return { name: t.tenant, ok: false, error: String(err.message || err) };
      }
    }));

    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({ tenants: results });
  } catch (err) {
    console.error('api/master error:', err);
    res.status(err.status || 500).json({ error: String(err.message || err) });
  }
};
