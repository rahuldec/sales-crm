# OD Sales CRM

A lightweight CRM for the institution sales pipeline (colleges/schools), reading and writing directly against the **"OD - Sales Ashish"** Google Sheet — no separate database. Built the same way as the sibling [`kpi`](../kpi) project: a single static `index.html` plus dependency-free Vercel serverless functions, no build step, no framework.

## What it does

- **Overview** — KPI tiles and funnel/pipeline charts computed live from the sheet (replaces the sheet's old manually-updated "Dashboard" tab).
- **Deals** — filterable table of every row in "Sales Data"; click a row to edit it in place.
- **Follow-ups** — deals whose "Next Follow-up Date" is due or overdue, with one-click email to the recorded contact.
- **New deal** — appends a row to the sheet.
- Edits and new deals write straight back to the live Google Sheet via a small Apps Script bound to the spreadsheet itself (`apps-script/Code.gs`) — not a service-account key (blocked by this org's Cloud policy) or an OAuth flow (would need weekly re-auth until Google verifies the app). See SETUP.md.
- Outbound email (compose modal + a daily follow-up digest cron) goes through ZeptoMail — the same transactional account already configured for `kpi`.

## Setup

See **[SETUP.md](./SETUP.md)** for deploying the Apps Script bridge, ZeptoMail env vars, and Vercel deploy steps.

## Local development

```bash
node scripts/dev-server.js
```

Reads `.env.local` then `.env` from the project root, serves `index.html` and the `/api/*` handlers on `http://localhost:3000` — no Vercel CLI needed.

## Known gap

There is **no login** in this first version — anyone with the URL can edit deal data and send email as Okie Dokie to real institution contacts. Treat the deployed URL as unlisted (don't link it anywhere public) until a login gate is added.
