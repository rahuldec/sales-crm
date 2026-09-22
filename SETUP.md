# Setup guide

## 1. Google OAuth (read/write access to the sheet)

This project's Cloud org has a policy (`iam.disableServiceAccountKeyCreation`) that blocks downloading service-account JSON keys — Google's own recommended default. So instead of a service account, this uses a normal OAuth client and a one-time consent flow that yields a long-lived refresh token — the same pattern the sibling `kpi` project uses for its Asana integration (`api/asana-authorize.js` / `api/asana-callback.js`).

### 1.1 Create the OAuth client

1. [Google Cloud Console](https://console.cloud.google.com/) → your project (e.g. "OD CRM") → **APIs & Services → Library** → enable **Google Sheets API** (if not already).
2. **APIs & Services → OAuth consent screen**:
   - User type: **Internal** if this is a Google Workspace account on `okiedokiepay.com` (recommended — no Google verification needed, tokens don't expire after 7 days). Only choose "External" + "Testing" if Internal isn't available, and be aware testing-mode refresh tokens expire after 7 days.
   - Fill in the required app name/support email, add scope `https://www.googleapis.com/auth/spreadsheets`, save.
3. **APIs & Services → Credentials → Create Credentials → OAuth client ID**:
   - Application type: **Web application**.
   - Name: e.g. `Sales CRM`.
   - **Authorized redirect URIs** — add both, so it works locally and in prod:
     - `http://localhost:3000/api/google-callback`
     - `https://<your-vercel-domain>/api/google-callback`
4. Save. Note the **Client ID** and **Client Secret**.

### 1.2 Set env vars, then bootstrap the refresh token

1. Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` (from step 1.1) in `.env` (local) and Vercel (prod) — see §3 below.
2. Visit `/api/google-authorize` in a browser (locally: `http://localhost:3000/api/google-authorize`; in prod: `https://<your-vercel-domain>/api/google-authorize`), signed in as an account that has (or will have) edit access to the sheet.
3. Approve the consent screen. You'll land on `/api/google-callback`, which prints a line like:
   ```
   GOOGLE_REFRESH_TOKEN=1//0g...
   ```
4. Copy that into `.env` / Vercel as `GOOGLE_REFRESH_TOKEN`. It's shown once — if you lose it, just revisit `/api/google-authorize` again.

### 1.3 Share the sheet

Open the **["OD - Sales Ashish"](https://docs.google.com/spreadsheets/d/1qnb4o7rl47po5wf2GQN8B_gsxifkq1LEm3AMNd45lKw/edit)** spreadsheet → **Share** → add the Google account you authorized in step 1.2 with **Editor** access (if it doesn't already have it).

**Do not paste `GOOGLE_CLIENT_SECRET` or `GOOGLE_REFRESH_TOKEN` anywhere outside your local `.env` and Vercel's environment variables.**

## 2. ZeptoMail (email)

Reuse the same account already set up for the `kpi` project — copy its `ZEPTOMAIL_URL`, `ZEPTOMAIL_TOKEN`, and `ZEPTOMAIL_SENDER` values from `kpi`'s Vercel environment variables (Vercel dashboard → kpi project → Settings → Environment Variables) into this project's env vars. No new ZeptoMail signup needed.

## 3. Environment variables

Copy `.env.example` to `.env` for local dev, and set the same keys in Vercel (**Project Settings → Environment Variables**) for production:

```
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REFRESH_TOKEN=
SALES_SHEET_ID=1qnb4o7rl47po5wf2GQN8B_gsxifkq1LEm3AMNd45lKw
SALES_SHEET_TAB=Sales Data
ZEPTOMAIL_URL=
ZEPTOMAIL_TOKEN=
ZEPTOMAIL_SENDER=
FOLLOWUP_DIGEST_TO=
```

`FOLLOWUP_DIGEST_TO` is a comma-separated list of who should get the daily "follow-ups due" email (e.g. the sales rep's address).

## 4. Deploy

Same flow as `kpi`: push this repo to GitHub, import it into Vercel, set the env vars above (client ID/secret can go in before the refresh token exists — bootstrap the refresh token against the deployed URL per §1.2, then add it and redeploy). The `vercel.json` cron (`/api/followup-digest`, 03:30 UTC / ~9:00am IST, Mon–Sat) is picked up automatically.

## 5. Verify

- Open the deployed (or local) URL — the Overview tab should show live numbers from the sheet, not an error banner.
- Edit a deal and confirm the change appears in the actual Google Sheet.
- Add a new deal and confirm a new row appears in the sheet.
- From the Follow-ups tab, send a test email to yourself and confirm it arrives and "Last Interaction Date" updates on that row.
- Hit `/api/followup-digest?test=you@example.com` directly to preview the daily digest without mailing the real recipient list.
