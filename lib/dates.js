// Date helpers shared between public/index.html (inline copy) and tests.
// index.html defines these inline so no bundler is needed; this file is the
// authoritative source — keep both in sync when either changes.

function parseSheetDate(raw) {
  if (!raw) return null;
  var s = String(raw).trim();
  var m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m) {
    var y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    return new Date(Date.UTC(y, Number(m[2]) - 1, Number(m[1])));
  }
  var d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

// Formats a sheet date string (D/M/YYYY) as DD/MM/YYYY for display.
// Returns the raw value unchanged when it cannot be parsed, and '—' for
// blank/null/undefined — matching the existing UI fallback convention.
function fmtSheetDate(raw) {
  var d = parseSheetDate(raw);
  if (!d) return raw || '—';
  var day = d.getUTCDate(), m = d.getUTCMonth() + 1, y = d.getUTCFullYear();
  return (day < 10 ? '0' : '') + day + '/' + (m < 10 ? '0' : '') + m + '/' + y;
}

module.exports = { parseSheetDate, fmtSheetDate };
