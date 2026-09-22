# Setup guide

## 1. Google Apps Script bridge (read/write access to the sheet)

This project's Cloud org blocks service-account JSON keys (`iam.disableServiceAccountKeyCreation`), and a personal Google account's OAuth tokens would expire every 7 days until the app passes Google's verification review. Both are sidestepped by attaching a small script directly to the spreadsheet — it runs permanently as whoever deploys it, with nothing to renew. The backend calls it instead of the Sheets API.

### 1.1 Deploy the script

1. Open the **["OD - Sales Ashish"](https://docs.google.com/spreadsheets/d/1qnb4o7rl47po5wf2GQN8B_gsxifkq1LEm3AMNd45lKw/edit)** spreadsheet (you need at least Editor access).
2. **Extensions → Apps Script**. This opens a script editor bound to this spreadsheet.
3. Delete the placeholder `Code.gs` contents and paste in the contents of [`apps-script/Code.gs`](./apps-script/Code.gs) from this repo.
4. **Project Settings** (gear icon, left sidebar) → **Script Properties** → **Add script property** → key `TOKEN`, value: a random secret (ask Claude to generate one, or use any long random string — same value goes into `APPS_SCRIPT_TOKEN` below).
5. **Deploy → New deployment** → gear icon next to "Select type" → **Web app**.
   - Execute as: **Me** (your account).
   - Who has access: **Anyone**. (This just means anyone *with the exact secret URL + token* can call it — see the security note below.)
   - **Deploy**. Authorize the requested permissions when prompted (this is you granting the script — not Claude, not a third party — access to this one spreadsheet).
6. Copy the **Web app URL** (ends in `/exec`) — that's `APPS_SCRIPT_URL`.

### 1.2 Security note

The deployed URL is only as private as the token appended to it. It's never sent to a browser (the backend calls it server-to-server), but treat both `APPS_SCRIPT_URL` and `APPS_SCRIPT_TOKEN` like credentials — local `.env` and Vercel env vars only, never committed or pasted anywhere public.

### 1.3 Redeploying after a script edit

If you ever change `apps-script/Code.gs`, paste the update into the same Apps Script project, then **Deploy → Manage deployments → (pencil icon) → New version → Deploy** — editing the code alone doesn't update the live `/exec` URL's behavior until you redeploy a new version.

## 2. ZeptoMail (email)

Reuse the same account already set up for the `kpi` project — copy its `ZEPTOMAIL_URL`, `ZEPTOMAIL_TOKEN`, and `ZEPTOMAIL_SENDER` values from `kpi`'s Vercel environment variables (Vercel dashboard → kpi project → Settings → Environment Variables) into this project's env vars. No new ZeptoMail signup needed.

## 3. Environment variables

Copy `.env.example` to `.env` for local dev, and set the same keys in Vercel (**Project Settings → Environment Variables**) for production:

```
APPS_SCRIPT_URL=
APPS_SCRIPT_TOKEN=
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
