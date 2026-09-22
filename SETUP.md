# Setup guide

## 1. Google service account (read/write access to the sheet)

1. Go to the [Google Cloud Console](https://console.cloud.google.com/), create a new project (or reuse an existing one) — e.g. "OD Sales CRM".
2. **APIs & Services → Library** → search **Google Sheets API** → **Enable**.
3. **APIs & Services → Credentials** → **Create Credentials → Service Account**.
   - Name it e.g. `sales-crm-sheets`.
   - No project role needed (access is granted by sharing the sheet directly, not IAM).
4. Open the new service account → **Keys** tab → **Add Key → Create new key → JSON**. This downloads a `.json` file — treat it like a password.
5. Open that JSON file and note two fields:
   - `client_email` → `GOOGLE_SERVICE_ACCOUNT_EMAIL`
   - `private_key` → `GOOGLE_SERVICE_ACCOUNT_KEY` (keep the `\n` sequences as literal two-character `\n` when pasting into a single-line env var — that's already how the JSON stores it)
6. Open the **["OD - Sales Ashish"](https://docs.google.com/spreadsheets/d/1qnb4o7rl47po5wf2GQN8B_gsxifkq1LEm3AMNd45lKw/edit)** spreadsheet → **Share** → add the service account's `client_email` (looks like `sales-crm-sheets@your-project.iam.gserviceaccount.com`) with **Editor** access.

**Do not paste the JSON key or its contents into a chat with Claude or anyone else** — put it directly into your local `.env` file and into Vercel's environment variables.

## 2. ZeptoMail (email)

Reuse the same account already set up for the `kpi` project — copy its `ZEPTOMAIL_URL`, `ZEPTOMAIL_TOKEN`, and `ZEPTOMAIL_SENDER` values from `kpi`'s Vercel environment variables (Vercel dashboard → kpi project → Settings → Environment Variables) into this project's env vars. No new ZeptoMail signup needed.

## 3. Environment variables

Copy `.env.example` to `.env` for local dev, and set the same keys in Vercel (**Project Settings → Environment Variables**) for production:

```
GOOGLE_SERVICE_ACCOUNT_EMAIL=
GOOGLE_SERVICE_ACCOUNT_KEY=
SALES_SHEET_ID=1qnb4o7rl47po5wf2GQN8B_gsxifkq1LEm3AMNd45lKw
SALES_SHEET_TAB=Sales Data
ZEPTOMAIL_URL=
ZEPTOMAIL_TOKEN=
ZEPTOMAIL_SENDER=
FOLLOWUP_DIGEST_TO=
```

`FOLLOWUP_DIGEST_TO` is a comma-separated list of who should get the daily "follow-ups due" email (e.g. the sales rep's address).

## 4. Deploy

Same flow as `kpi`: push this repo to GitHub, import it into Vercel, set the env vars above, deploy. The `vercel.json` cron (`/api/followup-digest`, 03:30 UTC / ~9:00am IST, Mon–Sat) is picked up automatically.

## 5. Verify

- Open the deployed (or local) URL — the Overview tab should show live numbers from the sheet, not an error banner.
- Edit a deal and confirm the change appears in the actual Google Sheet.
- Add a new deal and confirm a new row appears in the sheet.
- From the Follow-ups tab, send a test email to yourself and confirm it arrives and "Last Interaction Date" updates on that row.
- Hit `/api/followup-digest?test=you@example.com` directly to preview the daily digest without mailing the real recipient list.
