// Daily digest of deals whose "Next Follow-up Date" is today or already
// past, emailed to the sales rep(s) — same idea as kpi/api/daily-digest.js's
// compliance digest, pointed at this sheet's follow-up column instead.
//
// Scheduled via vercel.json's `crons`. Also callable directly (e.g.
// `curl /api/followup-digest?test=you@example.com`) to preview without
// mailing the real recipient list — see the `test` param below.

const { getRows } = require('../lib/sheets');
const { sendEmail } = require('../lib/email');

// Sheet dates are typed as "5/8/2026" (D/M/YYYY) or "August 26" — tolerate
// both; anything unparseable is treated as no date (excluded, not crashed on).
function parseSheetDate(raw) {
  if (!raw) return null;
  const s = String(raw).trim();
  const dmy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (dmy) {
    const [, d, m, y] = dmy;
    const year = y.length === 2 ? 2000 + Number(y) : Number(y);
    return new Date(Date.UTC(year, Number(m) - 1, Number(d)));
  }
  const parsed = new Date(s);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function startOfTodayIST() {
  const now = new Date();
  const ist = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  return new Date(Date.UTC(ist.getFullYear(), ist.getMonth(), ist.getDate()));
}

function renderDigest(dueRows) {
  const rows = dueRows.map(r => `
    <tr>
      <td style="padding:8px;border-bottom:1px solid #eee;">${r['Institution Name'] || ''}</td>
      <td style="padding:8px;border-bottom:1px solid #eee;">${r['Sales Stage'] || ''}</td>
      <td style="padding:8px;border-bottom:1px solid #eee;">${r['Next Follow-up Date'] || ''}</td>
      <td style="padding:8px;border-bottom:1px solid #eee;">${r['Decision Maker'] || r['2nd Level Contact Person'] || ''}</td>
      <td style="padding:8px;border-bottom:1px solid #eee;">${r['Mobile No.'] || ''}</td>
    </tr>`).join('');
  return `
    <div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;">
      <h2>Follow-ups due (${dueRows.length})</h2>
      <table style="width:100%;border-collapse:collapse;font-size:14px;">
        <thead><tr style="text-align:left;background:#f5f5f5;">
          <th style="padding:8px;">Institution</th><th style="padding:8px;">Stage</th>
          <th style="padding:8px;">Follow-up date</th><th style="padding:8px;">Contact</th><th style="padding:8px;">Mobile</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

module.exports = async function handler(req, res) {
  try {
    const { rows } = await getRows();
    const cutoff = startOfTodayIST();
    const due = rows.filter(r => {
      const d = parseSheetDate(r['Next Follow-up Date']);
      return d && d.getTime() <= cutoff.getTime() && !/deal won/i.test(r['Sales Stage'] || '');
    });

    if (due.length === 0) {
      res.status(200).json({ ok: true, sent: false, reason: 'No follow-ups due' });
      return;
    }

    const testTo = req.query && req.query.test;
    const to = testTo ? [testTo] : String(process.env.FOLLOWUP_DIGEST_TO || '').split(',').map(s => s.trim()).filter(Boolean);
    if (to.length === 0) {
      res.status(200).json({ ok: true, sent: false, reason: 'FOLLOWUP_DIGEST_TO not set' });
      return;
    }

    await sendEmail({
      to,
      subject: `${due.length} sales follow-up${due.length === 1 ? '' : 's'} due today`,
      html: renderDigest(due),
    });

    res.status(200).json({ ok: true, sent: true, count: due.length });
  } catch (err) {
    console.error('api/followup-digest error:', err);
    res.status(500).json({ error: String(err.message || err) });
  }
};
