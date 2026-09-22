// Google Apps Script web app bridging one tab of whichever spreadsheet this
// is deployed on to the sales-crm backend, in place of calling the Sheets
// API directly. Runs permanently as whoever deploys it (Extensions -> Apps
// Script, in the sheet itself) — no OAuth token to renew, no service-account
// key (blocked by this org's Cloud policy).
//
// One template, deployed once per sheet: each sales manager's own data
// sheet gets its own deployment (tab "Sales Data", the default below), and
// the Master Control registry sheet gets its own separate deployment (tab
// "Tenants" — set via the SHEET script property, see below). Every
// deployment is independent — its own URL, its own token, its own Script
// Properties — the code is just shared.
//
// Deploy: open this script from the sheet's Extensions -> Apps Script menu,
// paste this file in, then Deploy -> New deployment -> type "Web app" ->
// Execute as "Me" -> Who has access "Anyone" -> Deploy. Copy the resulting
// .../exec URL into this tenant's bridge URL (see SETUP.md).
//
// Protected by a shared secret checked against a Script Property, since
// Apps Script web apps don't expose inbound request headers to doGet/doPost
// — the secret travels as a ?token= query param instead (this URL is only
// ever called server-side, from Vercel, never from a browser, so the
// browser never sees the token). Set it once via Project Settings -> Script
// Properties -> add key "TOKEN" with this deployment's bridge token.
//
// Two more Script Properties are optional, only needed to point this same
// template at a differently-shaped tab (the registry): "SHEET" (default
// "Sales Data") and "REQUIRE_COLUMN" (default "Institution Name") — a row
// only counts as real data once that column is non-empty, filtering out
// trailing blank sheet rows.

function scriptProp_(key, fallback) {
  return PropertiesService.getScriptProperties().getProperty(key) || fallback;
}

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
  var name = scriptProp_('SHEET', 'Sales Data');
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!sh) throw new Error('Sheet tab "' + name + '" not found');
  return sh;
}

function getRows_() {
  var sh = sheet_();
  // getDisplayValues(), not getValues() — a date-formatted cell's raw value
  // is a JS Date object, which JSON-serializes to an ISO timestamp
  // ("2026-07-25T18:30:00.000Z") instead of the "July 26" text the sheet
  // (and this app's date parsing) actually shows. Display values match
  // exactly what a human sees in the cell, same as typing it in by hand.
  var values = sh.getDataRange().getDisplayValues();
  var headers = dedupeHeaders_((values[0] || []).map(function (h) { return String(h || '').trim(); }));
  var rows = values.slice(1).map(function (row, i) {
    var obj = { _row: i + 2 };
    headers.forEach(function (h, ci) {
      if (!h) return;
      obj[h] = row[ci] === undefined ? '' : row[ci];
    });
    return obj;
  }).filter(function (r) {
    var requireCol = scriptProp_('REQUIRE_COLUMN', 'Institution Name');
    return Object.keys(r).length > 1 && r[requireCol];
  });
  return { headers: headers, rows: rows };
}

function updateRow_(rowNumber, fields) {
  var sh = sheet_();
  var headers = getRows_().headers;
  var range = sh.getRange(rowNumber, 1, 1, headers.length);
  // getValues() (raw), not getDisplayValues(), for the columns this update
  // doesn't touch — writing a Date/Number back unchanged preserves its
  // exact type and formatting, whereas writing its display string back
  // would re-enter it as plain text and could reformat the cell.
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
