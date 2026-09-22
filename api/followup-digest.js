// Daily digest of deals whose "Next Follow-up Date" is today or already
// past, emailed to the sales rep(s) — same idea as kpi/api/daily-digest.js's
// compliance digest, pointed at this sheet's follow-up column instead. The
// HTML template below is deliberately the same one kpi's digest uses (same
// masthead/eyebrow/divider/section/table shapes, same palette) so the two
// emails read as the same product family.
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

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

// Same single-accent-plus-semantic-colors approach as kpi/api/daily-digest.js.
const ACCENT = '#B5501C';
const RED = '#A82A1C';

const STYLE = `
    * { margin:0; padding:0; box-sizing:border-box;
        font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif; }
    body { background:#F5F4F1; padding:40px 16px; color:#1D1D1F; }
    .email-container { max-width:600px; width:100%; margin:0 auto; background:#FFFFFF;
      border:1px solid #E5E3DE; border-radius:12px; padding:36px 32px; }
    .masthead { text-align:center; margin-bottom:28px; }
    .masthead .eyebrow { font-size:11px; font-weight:600; letter-spacing:.12em; text-transform:uppercase;
      color:${ACCENT}; margin:0 0 10px; }
    .masthead h1 { font-size:23px; font-weight:600; letter-spacing:-.01em; color:#1D1D1F; margin:0 0 6px; }
    .masthead .date { font-size:14px; color:#6E6E73; margin:0; }
    .divider { border:none; border-top:1px solid #E5E3DE; margin:32px 0; }
    .kpi-table { width:100%; border-collapse:collapse; font-size:14px; }
    .kpi-table th { text-align:left; padding:0 0 8px; font-size:10.5px; font-weight:600; letter-spacing:.04em;
      text-transform:uppercase; color:#8A8A8F; border-bottom:1px solid #E5E3DE; }
    .kpi-table td { padding:10px 8px 10px 0; border-bottom:1px solid #EFEDE8; vertical-align:top; }
    .kpi-table tr:last-child td { border-bottom:none; }
    .text-danger { color:${RED}; font-weight:600; }
    .person-name { font-weight:600; color:#1D1D1F; }
    .stage-note { font-size:12px; color:#8A8A8F; margin-top:2px; }
    .footer p { margin:0; font-size:12px; color:#8A8A8F; text-align:center; }
    .footer a { color:${ACCENT}; text-decoration:none; }
    @media (max-width:480px) {
      .email-container { padding:28px 20px; }
      .masthead h1 { font-size:20px; }
    }`;

// renderDigest is only ever called with at least one due row — the handler
// below returns early (no email sent at all) when there's nothing due, so
// there's no "nothing due" state for this to render.
function renderDigest(dueRows, fullDate) {
  const rowsHtml = dueRows.map(r => {
    const contact = r['Decision Maker'] || r['2nd Level Contact Person'] || '—';
    const stage = r['Sales Stage'] || '—';
    return `<tr>` +
      `<td><div class="person-name">${escapeHtml(r['Institution Name'] || '')}</div>` +
      `<div class="stage-note">${escapeHtml(stage)}</div></td>` +
      `<td class="text-danger">${escapeHtml(r['Next Follow-up Date'] || '')}</td>` +
      `<td>${escapeHtml(contact)}</td>` +
      `<td>${escapeHtml(r['Mobile No.'] || '—')}</td>` +
      `</tr>`;
  }).join('');

  // The masthead's own "Follow-ups Due Today" title already says what this
  // email is — a second "FOLLOW-UPS DUE" section header right below it was
  // redundant, straight into the table now.
  const section = `<table class="kpi-table"><tr><th>Institution</th><th>Due</th><th>Contact</th><th>Mobile</th></tr>${rowsHtml}</table>`;

  return `<!DOCTYPE html><html><head><meta charset="utf-8">` +
    `<title>OD Sales Team &middot; Follow-ups Due</title><style>${STYLE}</style></head><body>` +
    `<div class="email-container">` +
    `<div class="masthead"><p class="eyebrow">OD Sales Team</p>` +
    `<h1>Follow-ups Due Today</h1><p class="date">${fullDate}</p></div>` +
    `<hr class="divider">` +
    `<div>${section}</div>` +
    `<hr class="divider">` +
    `<div class="footer"><p>Automated email from OD Sales Team.</p></div>` +
    `</div></body></html>`;
}

module.exports = async function handler(req, res) {
  try {
    const { rows } = await getRows();
    const cutoff = startOfTodayIST();
    const due = rows.filter(r => {
      const d = parseSheetDate(r['Next Follow-up Date']);
      return d && d.getTime() <= cutoff.getTime() && !/deal won/i.test(r['Sales Stage'] || '');
    }).sort((a, b) => parseSheetDate(a['Next Follow-up Date']) - parseSheetDate(b['Next Follow-up Date']));

    const fullDate = new Date().toLocaleDateString('en-GB', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata',
    });

    if (due.length === 0) {
      res.status(200).json({ ok: true, sent: false, reason: 'No follow-ups due' });
      return;
    }

    const split = v => String(v || '').split(',').map(s => s.trim()).filter(Boolean);
    const testTo = req.query && req.query.test;
    // A test send goes ONLY to the address given in ?test= — no cc/bcc, so
    // trying this out never accidentally emails the real recipient list.
    const to = testTo ? [testTo] : split(process.env.FOLLOWUP_DIGEST_TO);
    const cc = testTo ? [] : split(process.env.FOLLOWUP_DIGEST_CC);
    const bcc = testTo ? [] : split(process.env.FOLLOWUP_DIGEST_BCC);
    if (to.length === 0) {
      res.status(200).json({ ok: true, sent: false, reason: 'FOLLOWUP_DIGEST_TO not set' });
      return;
    }

    await sendEmail({
      to, cc, bcc,
      subject: `${due.length} sales follow-up${due.length === 1 ? '' : 's'} due today`,
      html: renderDigest(due, fullDate),
    });

    res.status(200).json({ ok: true, sent: true, count: due.length });
  } catch (err) {
    console.error('api/followup-digest error:', err);
    res.status(500).json({ error: String(err.message || err) });
  }
};
