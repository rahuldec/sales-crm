// Sends email via ZeptoMail — same transactional account as the `kpi`
// project (ZEPTOMAIL_URL / ZEPTOMAIL_TOKEN / ZEPTOMAIL_SENDER env vars are
// shared, not new credentials), same request shape as kpi/api/daily-digest.js's
// sendEmail().

async function sendEmail({ to, cc = [], subject, html, senderName }) {
  const toList = Array.isArray(to) ? to : [to];
  const r = await fetch(process.env.ZEPTOMAIL_URL || 'https://api.zeptomail.in/v1.1/email', {
    method: 'POST',
    headers: {
      Authorization: process.env.ZEPTOMAIL_TOKEN || '',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: { address: process.env.ZEPTOMAIL_SENDER || '', name: senderName || 'Okie Dokie Sales' },
      to: toList.map(address => ({ email_address: { address } })),
      cc: cc.map(address => ({ email_address: { address } })),
      subject,
      htmlbody: html,
    }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    throw new Error(`ZeptoMail answered ${r.status}: ${JSON.stringify(data)}`);
  }
  return data;
}

module.exports = { sendEmail };
