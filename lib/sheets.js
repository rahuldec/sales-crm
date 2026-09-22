// Thin Google Sheets API v4 REST helpers for the "Sales Data" tab.
//
// Rows are addressed by their actual sheet row number (`_row`, 1-indexed,
// header is row 1) rather than any synthetic id — that's the one identity
// Sheets itself guarantees stays put as long as no one deletes/reorders
// rows out from under the app. updateRow() does a read-modify-write of the
// full row so a save from a form that only shows some columns never
// clobbers the columns it doesn't render.

const { getAccessToken } = require('./google-auth');

const API_ROOT = 'https://sheets.googleapis.com/v4/spreadsheets';

function sheetId() {
  const id = process.env.SALES_SHEET_ID;
  if (!id) throw new Error('SALES_SHEET_ID not set');
  return id;
}

function tabName() {
  return process.env.SALES_SHEET_TAB || 'Sales Data';
}

// A1 column letters go A..Z then AA..AZ etc. — the sheet currently has ~27
// columns, comfortably inside single/double-letter range.
function colLetter(n) {
  let s = '';
  n += 1;
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

async function api(path, options = {}) {
  const token = await getAccessToken();
  const r = await fetch(`${API_ROOT}/${sheetId()}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const data = await r.json();
  if (!r.ok) {
    throw new Error(`Sheets API answered ${r.status}: ${JSON.stringify(data)}`);
  }
  return data;
}

// The sheet has two columns literally both titled "Designation" (one for
// the Decision Maker, one for the 2nd Level Contact Person) — mapping by
// header name would let the second silently clobber the first. Disambiguate
// repeats as "Designation", "Designation (2)", "Designation (3)", ...
function dedupeHeaders(headers) {
  const seen = new Map();
  return headers.map(h => {
    if (!h) return h;
    const count = (seen.get(h) || 0) + 1;
    seen.set(h, count);
    return count === 1 ? h : `${h} (${count})`;
  });
}

// Returns { headers: string[], rows: Array<{ _row, ...fieldsByHeader }> }.
async function getRows() {
  const range = encodeURIComponent(`'${tabName()}'`);
  const data = await api(`/values/${range}?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING`);
  const values = data.values || [];
  const headers = dedupeHeaders((values[0] || []).map(h => String(h || '').trim()));
  const rows = values.slice(1).map((row, i) => {
    const obj = { _row: i + 2 };
    headers.forEach((h, ci) => {
      if (!h) return;
      obj[h] = row[ci] === undefined ? '' : row[ci];
    });
    return obj;
  }).filter(r => Object.keys(r).length > 1 && r['Institution Name']);
  return { headers, rows };
}

// fields: partial { header: value } to merge into row `rowNumber`. Reads
// the current row first so unmentioned columns are preserved untouched.
async function updateRow(rowNumber, fields) {
  const { headers } = await getRows();
  const rawRange = `'${tabName()}'!A${rowNumber}:${colLetter(headers.length - 1)}${rowNumber}`;
  const range = encodeURIComponent(rawRange);
  const current = await api(`/values/${range}?valueRenderOption=UNFORMATTED_VALUE`);
  const currentRow = (current.values && current.values[0]) || [];
  const merged = headers.map((h, ci) => {
    if (Object.prototype.hasOwnProperty.call(fields, h)) return fields[h];
    return currentRow[ci] === undefined ? '' : currentRow[ci];
  });
  await api(`/values/${range}?valueInputOption=USER_ENTERED`, {
    method: 'PUT',
    body: JSON.stringify({ range: rawRange, values: [merged] }),
  });
  return { _row: rowNumber, ...fields };
}

// fields: { header: value } for a brand-new row, appended after the last
// row currently in the tab.
async function appendRow(fields) {
  const { headers } = await getRows();
  const row = headers.map(h => (Object.prototype.hasOwnProperty.call(fields, h) ? fields[h] : ''));
  const range = encodeURIComponent(`'${tabName()}'!A1`);
  await api(`/values/${range}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`, {
    method: 'POST',
    body: JSON.stringify({ values: [row] }),
  });
  return fields;
}

module.exports = { getRows, updateRow, appendRow };
