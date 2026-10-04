// Talks to a Google Sheets tab through its Apps Script web app bridge
// (apps-script/Code.gs), instead of calling the Sheets API directly — this
// org's Cloud policy blocks service-account keys, and a personal-account
// OAuth flow would need periodic re-authorization until Google verifies the
// app. The Apps Script bridge runs permanently as whoever deployed it, with
// no token to renew.
//
// Multi-tenant: every call takes a `bridge` ({ url, token }) identifying
// WHICH deployment to hit — a manager's own data-sheet bridge, or the
// Master Control registry's bridge (lib/registry.js calls call() directly
// with its own bridge for that). Nothing here reads which tenant to use
// from an env var anymore — that's resolved per-request by the caller
// (api/sheet.js etc.) from the logged-in user's identity, never from a
// client-supplied parameter.
//
// Apps Script web apps always answer HTTP 200 (no API to set another status
// from doGet/doPost), so every call here checks the JSON body's `error`
// field rather than trusting response.ok.

const https = require('node:https');

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

// POST to url and return the Location header from the 302 redirect, without
// following it. Uses node:https directly because fetch(redirect:'manual') on
// Node ≤20 (Vercel's default runtime) creates an opaque redirect response
// where headers are inaccessible — the raw http module has no such restriction.
function postForLocation(url, body, headers, timeoutMs) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const reqBody = Buffer.from(body || '');
    const options = {
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      method: 'POST',
      headers: {
        ...headers,
        'Content-Length': reqBody.length,
      },
    };
    const req = https.request(options, (res) => {
      if (res.headers.location) {
        // We only need the Location header; drain body to release the socket.
        res.resume();
        resolve({ location: res.headers.location, status: res.statusCode });
      } else {
        // No redirect — collect body so the caller can try to parse it.
        const chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => resolve({ body: Buffer.concat(chunks).toString(), status: res.statusCode }));
      }
    });
    const timer = setTimeout(() => { req.destroy(); reject(new Error('timeout')); }, timeoutMs);
    req.on('error', err => { clearTimeout(timer); reject(err); });
    req.on('close', () => clearTimeout(timer));
    req.write(reqBody);
    req.end();
  });
}

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
const REQUEST_TIMEOUT_MS = 8_000;

async function callOnce(url, options) {
  const ua = { 'User-Agent': 'sales-crm-bridge/1.0' };
  const isPost = options.method === 'POST' || options.method === 'DELETE';

  if (isPost) {
    // Step 1 — POST via node:https so we can access the Location header on the
    // 302 redirect without it being hidden behind an opaque redirect response
    // (fetch(redirect:'manual') on Node ≤20 creates an opaque response where
    // headers are inaccessible; the raw https module has no such restriction).
    let hop1;
    try {
      hop1 = await postForLocation(
        url,
        options.body || '',
        { ...ua, ...(options.headers || {}) },
        REQUEST_TIMEOUT_MS,
      );
    } catch (err) {
      if (err.message === 'timeout') throw new TransportError(`Apps Script bridge timed out after ${REQUEST_TIMEOUT_MS / 1000}s`);
      throw new TransportError(`Apps Script bridge unreachable: ${err.message}`);
    }

    if (!hop1.location) {
      // No redirect — parse whatever came back directly.
      let data;
      try { data = JSON.parse(hop1.body || ''); } catch (_) {
        throw new TransportError(`Apps Script bridge unreachable (HTTP ${hop1.status}, non-JSON response)`);
      }
      if (data.error) throw new Error(`Apps Script bridge: ${data.error}`);
      return data;
    }

    // Step 2 — follow the echo URL with a clean GET (no body, no Content-Type).
    const controller2 = new AbortController();
    const timer2 = setTimeout(() => controller2.abort(), REQUEST_TIMEOUT_MS);
    let r;
    try {
      r = await fetch(hop1.location, { method: 'GET', signal: controller2.signal, headers: ua });
    } catch (err) {
      clearTimeout(timer2);
      if (err.name === 'AbortError') throw new TransportError(`Apps Script bridge timed out after ${REQUEST_TIMEOUT_MS / 1000}s`);
      throw new TransportError(`Apps Script bridge unreachable: ${err.message}`);
    }
    clearTimeout(timer2);

    const text = await r.text();
    let data;
    try { data = JSON.parse(text); } catch (_) {
      throw new TransportError(`Apps Script bridge unreachable (HTTP ${r.status}, non-JSON response)`);
    }
    if (data.error) throw new Error(`Apps Script bridge: ${data.error}`);
    return data;
  }

  // GET — no redirect involved, fetch works fine.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let r;
  try {
    r = await fetch(url, { ...options, signal: controller.signal, headers: { ...ua, ...(options.headers || {}) } });
  } catch (err) {
    clearTimeout(timer);
    if (err.name === 'AbortError') throw new TransportError(`Apps Script bridge timed out after ${REQUEST_TIMEOUT_MS / 1000}s`);
    throw new TransportError(`Apps Script bridge unreachable: ${err.message}`);
  }
  clearTimeout(timer);

  const text = await r.text();
  let data;
  try { data = JSON.parse(text); } catch (_) {
    throw new TransportError(`Apps Script bridge unreachable (HTTP ${r.status}, non-JSON response)`);
  }
  if (data.error) throw new Error(`Apps Script bridge: ${data.error}`);
  return data;
}

// bridge: { url, token, params? } for the specific deployment to call.
// `params` (e.g. { sheet: 'Ashish' }) is only needed against OD-MASTER's
// one multi-tab deployment, which tab to read isn't fixed at deploy time —
// see apps-script/Code.gs's header comment. A manager's own single-tab
// bridge never needs it.
async function call(bridge, options = {}) {
  if (!bridge || !bridge.url || !bridge.token) {
    throw new Error('Missing bridge { url, token } for this tenant');
  }
  let url = bridge.url;
  const joiner = () => (url.includes('?') ? '&' : '?');
  url += `${joiner()}token=${encodeURIComponent(bridge.token)}`;
  for (const [key, value] of Object.entries(bridge.params || {})) {
    url += `${joiner()}${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
  }
  // Writes (POST/DELETE) get more attempts than reads — a failed write
  // leaves the sheet unchanged (TransportError means our script never ran),
  // so retrying is safe, and the user is waiting on a save.
  const isWrite = options.method === 'POST' || options.method === 'DELETE';
  const attempts = isWrite ? 5 : 3;
  for (let i = 0; i < attempts; i++) {
    try {
      return await callOnce(url, options);
    } catch (err) {
      const isLastAttempt = i === attempts - 1;
      if (!(err instanceof TransportError) || isLastAttempt) throw err;
      await sleep(500 * (i + 1));
    }
  }
}

// Returns { headers: string[], rows: Array<{ _row, ...fieldsByHeader }> }.
async function getRows(bridge) {
  return call(bridge);
}

// fields: partial { header: value } to merge into row `rowNumber`. The
// script does its own read-modify-write server-side so unmentioned columns
// are preserved untouched.
async function updateRow(bridge, rowNumber, fields) {
  const data = await call(bridge, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ _row: rowNumber, fields }),
  });
  return data.result;
}

// fields: { header: value } for a brand-new row, appended after the last
// row currently in the tab.
async function appendRow(bridge, fields) {
  const data = await call(bridge, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields }),
  });
  return data.result;
}

// Hard delete — removes the row from the sheet entirely (not reversible
// from this app; the sheet's own Version History is the only way back).
async function deleteRow(bridge, rowNumber) {
  const data = await call(bridge, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ _row: rowNumber, _delete: true }),
  });
  return data.result;
}

module.exports = { call, getRows, updateRow, appendRow, deleteRow };
