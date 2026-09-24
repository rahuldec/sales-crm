// Reads and writes the caller's OWN sheet — never a client-supplied one.
// Runs server-side (Vercel function / local dev-server) because bridge
// tokens must never reach the browser, same rationale as kpi/api/data.js
// keeping the Asana secrets server-side.
//
// GET    /api/sheet                          -> { headers, rows, dropdowns }
// POST   /api/sheet { _row, fields }         -> update existing row
// POST   /api/sheet { fields }  (no _row)    -> append a new deal
// DELETE /api/sheet { _row }                 -> hard-delete a row (irreversible)
//
// Every call requires valid credentials (see lib/auth.js's requireManager)
// — the bridge to use is resolved from the caller's own Credentials row,
// not from anything the request itself claims.

const { getRows, updateRow, appendRow, deleteRow } = require('../lib/sheets');
const { requireManager } = require('../lib/auth');

module.exports = async function handler(req, res) {
  try {
    const tenant = await requireManager(req);

    if (req.method === 'GET') {
      const data = await getRows(tenant.bridge);
      res.setHeader('Cache-Control', 'no-store');
      res.status(200).json(data);
      return;
    }

    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      const { _row, fields } = body;
      if (!fields || typeof fields !== 'object') {
        res.status(400).json({ error: 'Missing "fields" object' });
        return;
      }
      const result = _row ? await updateRow(tenant.bridge, Number(_row), fields) : await appendRow(tenant.bridge, fields);
      res.status(200).json({ ok: true, result });
      return;
    }

    if (req.method === 'DELETE') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      if (!body._row) {
        res.status(400).json({ error: 'Missing "_row"' });
        return;
      }
      const result = await deleteRow(tenant.bridge, Number(body._row));
      res.status(200).json({ ok: true, result });
      return;
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('api/sheet error:', err);
    res.status(err.status || 500).json({ error: String(err.message || err) });
  }
};
