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

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

// Thrown only for the transport-level failure below, so call() knows it's
// safe to retry — our script never ran, so a retry can't double-execute a
// write. A real error our script *did* run and report (e.g. "TOKEN script
// property not set", or any doGet/doPost failure) comes back as valid JSON
// with an `error` field and is thrown as a plain Error instead — never
// retried, since retrying wouldn't help and, for a write, could risk
// re-applying something that already partially happened.
class TransportError extends Error {}

// Google's redirect hop has also been observed to just hang rather than
// 404 — with no timeout, a single fetch() can block the request forever
// (a real incident: the dashboard sat on "Loading…" indefinitely). Both
// failure modes happen before our script runs (same as the 404 case
// below), so an abort here is just as safe to retry.
const REQUEST_TIMEOUT_MS = 20_000;

async function callOnce(url, options) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let r;
  try {
    // Apps Script's redirect from script.google.com to the actual
    // script.googleusercontent.com execution URL 404s on Node's fetch,
    // which sends no User-Agent by default — curl (which defaults to
    // "curl/...") and every browser work fine. An explicit User-Agent
    // fixes most of it, but that hop is also just intermittently flaky on
    // Google's side (observed ~1 in 5 requests still 404 even with a
    // User-Agent set) — see the retry loop in call() below. Either way
    // this response is Google's own HTML error page, not JSON from our
    // script.
    r = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: { 'User-Agent': 'sales-crm-bridge/1.0', ...(options.headers || {}) },
    });
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new TransportError(`Apps Script bridge timed out after ${REQUEST_TIMEOUT_MS / 1000}s`);
    }
    throw new TransportError(`Apps Script bridge unreachable: ${err.message}`);
  } finally {
    clearTimeout(timer);
  }
  const text = await r.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch (_) {
    throw new TransportError(`Apps Script bridge unreachable (HTTP ${r.status}, non-JSON response)`);
  }
  if (data.error) {
    throw new Error(`Apps Script bridge: ${data.error}`);
  }
  return data;
}

async function call(options = {}) {
  const url = `${scriptUrl()}${scriptUrl().includes('?') ? '&' : '?'}token=${encodeURIComponent(token())}`;
  const attempts = 3;
  for (let i = 0; i < attempts; i++) {
    try {
      return await callOnce(url, options);
    } catch (err) {
      const isLastAttempt = i === attempts - 1;
      if (!(err instanceof TransportError) || isLastAttempt) throw err;
      await sleep(400 * (i + 1));
    }
  }
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
