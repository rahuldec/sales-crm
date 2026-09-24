// Google Apps Script web app bridging one tab of whichever spreadsheet this
// is deployed on to the sales-crm backend, in place of calling the Sheets
// API directly. Runs permanently as whoever deploys it (Extensions -> Apps
// Script, in the sheet itself) — no OAuth token to renew, no service-account
// key (blocked by this org's Cloud policy).
//
// One template, two kinds of deployment:
//  - Each sales manager's own original spreadsheet gets its own deployment,
//    serving its one fixed "Sales Data" tab (the default below) — used for
//    that manager's own read+write dashboard.
//  - The OD-MASTER spreadsheet gets ONE deployment that serves MULTIPLE
//    tabs dynamically (its "Credentials" tab for login, plus one
//    IMPORTRANGE-mirrored read-only tab per manager for the Master rollup
//    view) — which tab to read is passed per-request as ?sheet=, not fixed
//    at deploy time. Every deployment is independent — its own URL, its
//    own token, its own Script Properties — the code is just shared.
//
// Deploy: open this script from the sheet's Extensions -> Apps Script menu,
// paste this file in, then Deploy -> New deployment -> type "Web app" ->
// Execute as "Me" -> Who has access "Anyone" -> Deploy. Copy the resulting
// .../exec URL into this bridge's URL (see SETUP.md).
//
// Protected by a shared secret checked against a Script Property, since
// Apps Script web apps don't expose inbound request headers to doGet/doPost
// — the secret travels as a ?token= query param instead (this URL is only
// ever called server-side, from Vercel, never from a browser, so the
// browser never sees the token). Set it once via Project Settings -> Script
// Properties -> add key "TOKEN" with this deployment's bridge token.
//
// Two more overrides, each checkable per-request via a query param
// (?sheet=, ?requireColumn=) OR fixed once via a same-named Script
// Property — the query param wins if both are given. Script Properties
// are what a single-tab manager deployment uses (set once, forget it);
// query params are what OD-MASTER's one multi-tab deployment uses (a
// different tab per call, from lib/registry.js on the Node side).
//   "SHEET" (default "Sales Data")
//   "REQUIRE_COLUMN" (default "Institution Name") — a row only counts as
//     real data once that column is non-empty, filtering out trailing
//     blank sheet rows.
//
// A manager's deployment also serves a second tab, "Visits" (?sheet=Visits)
// — visit history (institution, date, km, notes), kept off the main "Sales
// Data" tab so it doesn't clutter the per-lead columns. No manual setup
// needed: sheet_() below creates it with the right header row the first
// time anything asks for it.

var VISITS_SHEET_NAME = 'Visits';
var VISITS_HEADERS = ['Institution Name', 'Visit Date', 'Distance (km)', 'Notes'];

function scriptProp_(key, fallback) {
  return PropertiesService.getScriptProperties().getProperty(key) || fallback;
}

function param_(e, key, fallback) {
  return (e.parameter && e.parameter[key]) || scriptProp_(toScriptPropKey_(key), fallback);
}

function toScriptPropKey_(key) {
  // "requireColumn" -> "REQUIRE_COLUMN", "sheet" -> "SHEET"
  return key.replace(/([A-Z])/g, '_$1').toUpperCase();
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

function sheet_(e) {
  var name = param_(e, 'sheet', 'Sales Data');
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(name);
  if (!sh && name === VISITS_SHEET_NAME) {
    sh = ss.insertSheet(VISITS_SHEET_NAME);
    sh.getRange(1, 1, 1, VISITS_HEADERS.length).setValues([VISITS_HEADERS]);
  }
  if (!sh) throw new Error('Sheet tab "' + name + '" not found');
  return sh;
}

function headersOf_(sh) {
  var lastCol = sh.getLastColumn();
  if (lastCol === 0) return [];
  var firstRow = sh.getRange(1, 1, 1, lastCol).getDisplayValues()[0];
  return dedupeHeaders_(firstRow.map(function (h) { return String(h || '').trim(); }));
}

// Exposes each column's own dropdown (Data Validation "list of items" or
// "list from a range") straight from the sheet, so the portal's dropdown
// fields show every option the sheet allows — not just whichever ones
// happen to already appear in existing rows (which misses any option
// nobody has picked yet). A column with no validation (free text, e.g.
// Institution Name) is simply absent from the result — the portal falls
// back to its own already-used-values list for those.
function columnDropdowns_(sh, headers) {
  var result = {};
  var lastRow = sh.getLastRow();
  if (lastRow < 2 || headers.length === 0) return result;
  var validations = sh.getRange(2, 1, lastRow - 1, headers.length).getDataValidations();
  headers.forEach(function (h, ci) {
    if (!h || result[h]) return;
    for (var r = 0; r < validations.length; r++) {
      var dv = validations[r][ci];
      if (!dv) continue;
      var type = dv.getCriteriaType();
      var values = dv.getCriteriaValues();
      if (type === SpreadsheetApp.DataValidationCriteria.VALUE_IN_LIST) {
        result[h] = values[0];
        break;
      }
      if (type === SpreadsheetApp.DataValidationCriteria.VALUE_IN_RANGE) {
        var flat = values[0].getValues().reduce(function (acc, row) {
          row.forEach(function (v) { if (v !== '' && v !== null) acc.push(String(v)); });
          return acc;
        }, []);
        if (flat.length) result[h] = flat;
        break;
      }
    }
  });
  return result;
}

function getRows_(e) {
  var sh = sheet_(e);
  // getDisplayValues(), not getValues() — a date-formatted cell's raw value
  // is a JS Date object, which JSON-serializes to an ISO timestamp
  // ("2026-07-25T18:30:00.000Z") instead of the "July 26" text the sheet
  // (and this app's date parsing) actually shows. Display values match
  // exactly what a human sees in the cell, same as typing it in by hand.
  var values = sh.getDataRange().getDisplayValues();
  var headers = dedupeHeaders_((values[0] || []).map(function (h) { return String(h || '').trim(); }));
  var requireCol = param_(e, 'requireColumn', 'Institution Name');
  var rows = values.slice(1).map(function (row, i) {
    var obj = { _row: i + 2 };
    headers.forEach(function (h, ci) {
      if (!h) return;
      obj[h] = row[ci] === undefined ? '' : row[ci];
    });
    return obj;
  }).filter(function (r) {
    return Object.keys(r).length > 1 && r[requireCol];
  });
  return { headers: headers, rows: rows, dropdowns: columnDropdowns_(sh, headers) };
}

function updateRow_(e, rowNumber, fields) {
  var sh = sheet_(e);
  var headers = headersOf_(sh);
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

function appendRow_(e, fields) {
  var sh = sheet_(e);
  var headers = headersOf_(sh);
  var row = headers.map(function (h) {
    return Object.prototype.hasOwnProperty.call(fields, h) ? fields[h] : '';
  });
  sh.appendRow(row);
  return fields;
}

// Hard delete — actually removes the row from the sheet (not a soft
// "mark as deleted"), so this is irreversible from the portal itself; the
// sheet's own Version History (File -> Version history) is the only way
// back. rowNumber is a real sheet row (1-based, header is row 1), so 1 is
// refused same as anything past the last row.
function deleteRow_(e, rowNumber) {
  var sh = sheet_(e);
  if (!rowNumber || rowNumber < 2 || rowNumber > sh.getMaxRows()) {
    throw new Error('Invalid row number: ' + rowNumber);
  }
  sh.deleteRow(rowNumber);
  return { deleted: rowNumber };
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
    return jsonOut_(getRows_(e));
  } catch (err) {
    return jsonOut_({ error: String(err.message || err) });
  }
}

function doPost(e) {
  try {
    checkToken_(e);
    var body = JSON.parse((e.postData && e.postData.contents) || '{}');
    var result;
    if (body._delete && body._row) {
      result = deleteRow_(e, Number(body._row));
    } else if (body._row) {
      result = updateRow_(e, Number(body._row), body.fields || {});
    } else {
      result = appendRow_(e, body.fields || {});
    }
    return jsonOut_({ ok: true, result: result });
  } catch (err) {
    return jsonOut_({ error: String(err.message || err) });
  }
}
