// Reads/writes the caller's own "Visits" tab — visit history (institution,
// date, distance in km, notes) tracked separately from the main lead
// pipeline so it doesn't clutter the "Sales Data" columns. Same bridge (and
// same deployment) as api/sheet.js, just pointed at a different tab via
// bridge.params — apps-script/Code.gs's sheet_() auto-creates the tab with
// the right header row the first time anything asks for it, so there's no
// separate per-manager setup step for this.
//
// GET    /api/visits                  -> { headers, rows }  (all visits)
// POST   /api/visits { fields }       -> log a new visit
// DELETE /api/visits { _row }         -> remove a logged visit

const { getRows, appendRow, deleteRow } = require('../lib/sheets');
const { requireManager } = require('../lib/auth');

function visitsBridge(tenant) {
  return { ...tenant.bridge, params: { sheet: 'Visits', requireColumn: 'Institution Name' } };
}

module.exports = async function handler(req, res) {
  try {
    const tenant = await requireManager(req);
    const bridge = visitsBridge(tenant);

    if (req.method === 'GET') {
      const data = await getRows(bridge);
      res.setHeader('Cache-Control', 'no-store');
      res.status(200).json(data);
      return;
    }

    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      if (!body.fields || typeof body.fields !== 'object') {
        res.status(400).json({ error: 'Missing "fields" object' });
        return;
      }
      const result = await appendRow(bridge, body.fields);
      res.status(200).json({ ok: true, result });
      return;
    }

    if (req.method === 'DELETE') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      if (!body._row) {
        res.status(400).json({ error: 'Missing "_row"' });
        return;
      }
      const result = await deleteRow(bridge, Number(body._row));
      res.status(200).json({ ok: true, result });
      return;
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('api/visits error:', err);
    res.status(err.status || 500).json({ error: String(err.message || err) });
  }
};
