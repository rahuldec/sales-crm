// Sends an ad-hoc email to an institution contact from the dashboard's
// compose modal, and — if the send is tied to a deal row — stamps that
// row's "Last Interaction Date", since sending an email is itself an
// interaction worth logging.
//
// Guardrail: only sends to an address that is actually present in that
// row's own "Email" column (or, with no _row, any address — used for the
// "send yourself a test" case) so the compose box can't be used as an open
// relay to arbitrary addresses typed into the browser.

const { getRows, updateRow } = require('../lib/sheets');
const { sendEmail } = require('../lib/email');

function today() {
  return new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit', timeZone: 'Asia/Kolkata' });
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const { to, subject, html, _row } = body;
    if (!to || !subject || !html) {
      res.status(400).json({ error: 'Missing "to", "subject" or "html"' });
      return;
    }

    if (_row) {
      const { rows } = await getRows();
      const row = rows.find(r => r._row === Number(_row));
      const knownEmails = [row && row.Email].filter(Boolean).map(e => String(e).toLowerCase().trim());
      if (!row || !knownEmails.includes(String(to).toLowerCase().trim())) {
        res.status(400).json({ error: 'Recipient is not this deal\'s recorded contact email' });
        return;
      }
    }

    await sendEmail({ to, subject, html });

    if (_row) {
      await updateRow(Number(_row), { 'Last Interaction Date': today() });
    }

    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('api/email error:', err);
    res.status(500).json({ error: String(err.message || err) });
  }
};
