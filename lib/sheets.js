// Talks to the "Sales Data" tab through a Google Apps Script web app
// (apps-script/Code.gs) bound to the spreadsheet, instead of calling the
// Sheets API directly — this org's Cloud policy blocks service-account
// keys, and a personal-account OAuth flow would need periodic
// re-authorization until Google verifies the app. The Apps Script bridge
// runs permanently as whoever deployed it, with no token to renew.
//
// Apps Script web apps always answer HTTP 200 (no API to set another status
// from doGet/doPost), so every call here checks the JSON body's `error`
// field rather than trusting response.ok.

function scriptUrl() {
  const url = process.env.APPS_SCRIPT_URL;
  if (!url) throw new Error('APPS_SCRIPT_URL not set — see SETUP.md §1');
  return url;
}

function token() {
  const t = process.env.APPS_SCRIPT_TOKEN;
  if (!t) throw new Error('APPS_SCRIPT_TOKEN not set — see SETUP.md §1');
  return t;
}

async function call(options) {
  const url = `${scriptUrl()}${scriptUrl().includes('?') ? '&' : '?'}token=${encodeURIComponent(token())}`;
  const r = await fetch(url, options);
  const data = await r.json().catch(() => ({}));
  if (!r.ok || data.error) {
    throw new Error(`Apps Script bridge: ${data.error || r.status}`);
  }
  return data;
}

// Returns { headers: string[], rows: Array<{ _row, ...fieldsByHeader }> }.
async function getRows() {
  return call();
}

// fields: partial { header: value } to merge into row `rowNumber`. The
// script does its own read-modify-write server-side so unmentioned columns
// are preserved untouched.
async function updateRow(rowNumber, fields) {
  const data = await call({
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ _row: rowNumber, fields }),
  });
  return data.result;
}

// fields: { header: value } for a brand-new row, appended after the last
// row currently in the tab.
async function appendRow(fields) {
  const data = await call({
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields }),
  });
  return data.result;
}

module.exports = { getRows, updateRow, appendRow };
