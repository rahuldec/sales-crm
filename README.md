# OD Sales CRM

A multi-tenant CRM for institution sales pipelines (colleges/schools) — each sales manager has their own Google Sheet, no separate database. Built the same way as the sibling [`kpi`](../kpi) project: a single static `index.html` plus dependency-free Vercel serverless functions, no build step, no framework.

## What it does

- **Login (username/password)** — checked against OD-MASTER's `Credentials` tab, decides what you see: your own sheet if you're a manager, a rollup across every manager if you're a head, both if you're both. A wrong username/password just fails to sign in.
- **Overview** — KPI tiles and funnel/pipeline charts computed live from your sheet.
- **Deals** — filterable, sortable table of every row; click one to edit it in place.
- **Follow-ups** — deals whose "Next Follow-up Date" is due or overdue, with one-click email to the recorded contact.
- **New deal** — a short step-by-step wizard, appends a row to your sheet.
- **Master** (heads only) — one KPI block per manager plus a combined total, read from OD-MASTER's IMPORTRANGE-mirrored per-manager tabs.
- Every manager's sheet has its own small Apps Script bridge (`apps-script/Code.gs`, deployed per-sheet) — not a service-account key (blocked by this org's Cloud policy) or a per-user OAuth flow (would need weekly re-auth until Google verifies the app). A shared **OD-MASTER** spreadsheet holds the `Credentials` tab (login + each manager's bridge URL/token) so onboarding a manager is a new row in a sheet, not a code change. See SETUP.md.
- Outbound email (compose modal + a daily per-manager follow-up digest cron) goes through ZeptoMail — the same transactional account already configured for `kpi`.

## Setup

See **[SETUP.md](./SETUP.md)** for the OD-MASTER sheet, Credentials tab schema, per-manager Apps Script bridges, ZeptoMail env vars, and Vercel deploy steps.

## Local development

```bash
node scripts/dev-server.js
```

Reads `.env.local` then `.env` from the project root, serves `index.html` and the `/api/*` handlers on `http://localhost:3000` — no Vercel CLI needed.
