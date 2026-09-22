// Google Apps Script web app bridging the "Sales Data" tab to the sales-crm
// backend, in place of calling the Sheets API directly. Bound to the
// "OD - Sales Ashish" spreadsheet and runs permanently as whoever deploys
// it (Extensions -> Apps Script, in the sheet itself) — no OAuth token to
// renew, no service-account key (blocked by this org's Cloud policy).
//
// Deploy: open this script from the sheet's Extensions -> Apps Script menu,
// paste this file in, then Deploy -> New deployment -> type "Web app" ->
// Execute as "Me" -> Who has access "Anyone" -> Deploy. Copy the resulting
// .../exec URL into APPS_SCRIPT_URL (see SETUP.md).
//
// Protected by a shared secret checked against a Script Property, since
// Apps Script web apps don't expose inbound request headers to doGet/doPost
// — the secret travels as a ?token= query param instead (this URL is only
// ever called server-side, from Vercel, never from a browser, so the
// browser never sees the token). Set it once via Project Settings -> Script
// Properties -> add key "TOKEN" with the same value as APPS_SCRIPT_TOKEN.

var SHEET_NAME = 'Sales Data';

function checkToken_(e) {
  var expected = PropertiesService.getScriptProperties().getProperty('TOKEN');
  if (!expected) throw new Error('TOKEN script property not set');
  if (!e.parameter.token || e.parameter.token !== expected) {
    throw new Error('Unauthorized');
  }
}

// The sheet has two columns literally both titled "Designation" (Decision
// Maker's and the 2nd Level Contact Person's) — disambiguate repeats as
// "Designation", "Designation (2)", ... so the second never silently
// clobbers the first when mapped into an object by header name.
function dedupeHeaders_(headers) {
  var seen = {};
  return headers.map(function (h) {
    if (!h) return h;
    var count = (seen[h] || 0) + 1;
    seen[h] = count;
    return count === 1 ? h : h + ' (' + count + ')';
  });
}

function sheet_() {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  if (!sh) throw new Error('Sheet tab "' + SHEET_NAME + '" not found');
  return sh;
}

function getRows_() {
  var sh = sheet_();
  var values = sh.getDataRange().getValues();
  var headers = dedupeHeaders_((values[0] || []).map(function (h) { return String(h || '').trim(); }));
  var rows = values.slice(1).map(function (row, i) {
    var obj = { _row: i + 2 };
    headers.forEach(function (h, ci) {
      if (!h) return;
      obj[h] = row[ci] === undefined ? '' : row[ci];
    });
    return obj;
  }).filter(function (r) { return Object.keys(r).length > 1 && r['Institution Name']; });
  return { headers: headers, rows: rows };
}

function updateRow_(rowNumber, fields) {
  var sh = sheet_();
  var headers = getRows_().headers;
  var range = sh.getRange(rowNumber, 1, 1, headers.length);
  var current = range.getValues()[0];
  var merged = headers.map(function (h, ci) {
    return Object.prototype.hasOwnProperty.call(fields, h) ? fields[h] : current[ci];
  });
  range.setValues([merged]);
  var result = { _row: rowNumber };
  Object.keys(fields).forEach(function (k) { result[k] = fields[k]; });
  return result;
}

function appendRow_(fields) {
  var sh = sheet_();
  var headers = getRows_().headers;
  var row = headers.map(function (h) {
    return Object.prototype.hasOwnProperty.call(fields, h) ? fields[h] : '';
  });
  sh.appendRow(row);
  return fields;
}

function jsonOut_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// Apps Script web apps always answer HTTP 200 (there is no API to set a
// different status code from doGet/doPost) — callers must check the JSON
// body's `error` field rather than the HTTP status. lib/sheets.js on the
// Node side does exactly that.
function doGet(e) {
  try {
    checkToken_(e);
    return jsonOut_(getRows_());
  } catch (err) {
    return jsonOut_({ error: String(err.message || err) });
  }
}

function doPost(e) {
  try {
    checkToken_(e);
    var body = JSON.parse((e.postData && e.postData.contents) || '{}');
    var result = body._row ? updateRow_(Number(body._row), body.fields || {}) : appendRow_(body.fields || {});
    return jsonOut_({ ok: true, result: result });
  } catch (err) {
    return jsonOut_({ error: String(err.message || err) });
  }
}
