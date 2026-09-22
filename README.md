# OD Sales CRM

A multi-tenant CRM for institution sales pipelines (colleges/schools) — each sales manager has their own Google Sheet, no separate database. Built the same way as the sibling [`kpi`](../kpi) project: a single static `index.html` plus dependency-free Vercel serverless functions, no build step, no framework.

## What it does

- **Login (Zoho)** — decides what you see: your own sheet if you're a manager, a rollup across every manager if you're a head, both if you're both. An email not registered gets a "no access" screen.
- **Overview** — KPI tiles and funnel/pipeline charts computed live from your sheet.
- **Deals** — filterable, sortable table of every row; click one to edit it in place.
- **Follow-ups** — deals whose "Next Follow-up Date" is due or overdue, with one-click email to the recorded contact.
- **New deal** — a short step-by-step wizard, appends a row to your sheet.
- **Master** (heads only) — one KPI block per manager plus a combined total, pulled from every manager's sheet in parallel.
- Every manager's sheet has its own small Apps Script bridge (`apps-script/Code.gs`, deployed per-sheet) — not a service-account key (blocked by this org's Cloud policy) or a per-user OAuth flow (would need weekly re-auth until Google verifies the app). A shared **Master Control** registry sheet maps each login email to their own bridge, so onboarding a manager is a new row in a sheet, not a code change. See SETUP.md.
- Outbound email (compose modal + a daily per-manager follow-up digest cron) goes through ZeptoMail — the same transactional account already configured for `kpi`.

## Setup

See **[SETUP.md](./SETUP.md)** for the Zoho login, Master Control registry, per-manager Apps Script bridges, ZeptoMail env vars, and Vercel deploy steps.

## Local development

```bash
node scripts/dev-server.js
```

Reads `.env.local` then `.env` from the project root, serves `index.html` and the `/api/*` handlers on `http://localhost:3000` — no Vercel CLI needed. Set `DEV_BYPASS_EMAIL` in `.env`/`.env.local` to test as a specific registry email without a live Zoho login (see SETUP.md §5).
