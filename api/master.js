// Head-only rollup: every manager's rows, fetched in parallel, for the
// frontend's Master tab to compute per-manager (and combined) KPIs from —
// the same computeKpis() logic the Overview tab already uses, just run once
// per tenant instead of once for "the current user's own sheet".

const { getRows } = require('../lib/sheets');
const { getTenants } = require('../lib/registry');
const { requireHead } = require('../lib/auth');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  try {
    await requireHead(req);

    const tenants = (await getTenants()).filter(t => t.isManager && t.bridge.url && t.bridge.token);

    const results = await Promise.all(tenants.map(async t => {
      try {
        const { headers, rows } = await getRows(t.bridge);
        return { name: t.name, ok: true, headers, rows };
      } catch (err) {
        // One manager's bridge being down (or newly added and not yet
        // deployed) shouldn't blank out everyone else's numbers.
        return { name: t.name, ok: false, error: String(err.message || err) };
      }
    }));

    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({ tenants: results });
  } catch (err) {
    console.error('api/master error:', err);
    res.status(err.status || 500).json({ error: String(err.message || err) });
  }
};
