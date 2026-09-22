// Reads and writes the "Sales Data" tab. Runs server-side (Vercel function
// / local dev-server) because the service-account key must never reach the
// browser — same rationale as kpi/api/data.js keeping the Asana secrets
// server-side.
//
// GET  /api/sheet                          -> { headers, rows }
// POST /api/sheet { _row, fields }         -> update existing row
// POST /api/sheet { fields }  (no _row)    -> append a new deal

const { getRows, updateRow, appendRow } = require('../lib/sheets');

module.exports = async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const data = await getRows();
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
      const result = _row ? await updateRow(Number(_row), fields) : await appendRow(fields);
      res.status(200).json({ ok: true, result });
      return;
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('api/sheet error:', err);
    res.status(500).json({ error: String(err.message || err) });
  }
};
