#!/usr/bin/env node
/* Local dev server — static files + /api/* handlers, no Vercel CLI.
   Usage: node scripts/dev-server.js
   Optional: PORT=3000 node scripts/dev-server.js
   Loads .env.local then .env from the project root (KEY=value, # comments).
   Adapted from ../kpi/scripts/dev-server.js. */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const ROOT = path.join(__dirname, '..');
const PORT = Number(process.env.PORT) || 3000;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function loadEnv(file) {
  const p = path.join(ROOT, file);
  try {
    for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let val = trimmed.slice(eq + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) ||
          (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
      if (!(key in process.env)) process.env[key] = val;
    }
  } catch (_) { /* optional file */ }
}

loadEnv('.env.local');
loadEnv('.env');

const API_HANDLERS = {
  '/api/sheet': require(path.join(ROOT, 'api', 'sheet.js')),
  '/api/email': require(path.join(ROOT, 'api', 'email.js')),
  '/api/followup-digest': require(path.join(ROOT, 'api', 'followup-digest.js')),
};

function safePath(urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0]);
  const normalized = path.normalize(decoded).replace(/^(\.\.(\/|\\|$))+/, '');
  const full = path.join(ROOT, normalized);
  if (!full.startsWith(ROOT + path.sep) && full !== ROOT) return null;
  return full;
}

function serveStatic(req, res, filePath) {
  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
    fs.createReadStream(filePath).pipe(res);
  });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => { data += chunk; });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const parsed = new URL(req.url, `http://localhost:${PORT}`);

  const handler = API_HANDLERS[parsed.pathname];
  if (handler) {
    const query = {};
    parsed.searchParams.forEach((v, k) => { query[k] = v; });
    let body = '';
    if (req.method === 'POST') body = await readBody(req);
    const fakeReq = { method: req.method, query, body };
    const fakeRes = {
      _status: 200,
      status(code) { this._status = code; return this; },
      setHeader(k, v) { res.setHeader(k, v); },
      json(obj) {
        res.writeHead(this._status, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(obj));
      },
    };
    try {
      await handler(fakeReq, fakeRes);
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: String(err.message || err) }));
    }
    return;
  }

  let filePath = safePath(parsed.pathname === '/' ? '/index.html' : parsed.pathname);
  if (!filePath) {
    res.writeHead(400);
    res.end('Bad request');
    return;
  }
  serveStatic(req, res, filePath);
});

server.listen(PORT, () => {
  console.log(`sales-crm dev server: http://localhost:${PORT}`);
});
