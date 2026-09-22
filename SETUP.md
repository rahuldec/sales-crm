# Setup guide

This app is multi-tenant: each sales manager has their own Google Sheet, their own Apps Script bridge, and one row in a shared **Master Control** registry sheet that tells the app which bridge belongs to whom. Logging in with Zoho decides what you see — your own sheet if you're a manager, a rollup across everyone if you're a head, both if you're both.

## 1. One-time: Zoho login

The app reuses the sibling `kpi` project's existing Zoho OAuth client rather than registering a new one.

1. In the [Zoho API Console](https://api-console.zoho.in/), open that same client `kpi` already uses (Client ID `1000.6XOPXM5YDUATFMNXLRPIF45156MZSU`).
2. Add this app's URLs to its **Authorized Redirect URIs** / **JavaScript Domains**, alongside kpi's existing ones:
   - `https://odcrm.vercel.app/`
   - `http://localhost:3000/`

No new env var for this — the client ID is hardcoded in `public/zoho-auth.js` (same as `kpi`'s `lib/zoho-auth.js` pattern).

## 2. One-time: Master Control registry sheet

1. Create a new Google Sheet, e.g. "OD Sales CRM — Master Control".
2. Add a tab named exactly **`Tenants`** with this header row (order doesn't matter, spelling does):
   ```
   Name | Login Email | Is Manager | Is Head | Sheet Bridge URL | Sheet Bridge Token | Digest To | Digest CC | Digest BCC
   ```
3. Deploy its Apps Script bridge — same steps as any manager's sheet (§3 below), except after pasting [`apps-script/Code.gs`](./apps-script/Code.gs), also add two more Script Properties:
   - `SHEET` = `Tenants`
   - `REQUIRE_COLUMN` = `Name`
   
   (These tell the shared script template to read the `Tenants` tab and treat a row as real once its `Name` column is filled, instead of the data-sheet defaults of `Sales Data` / `Institution Name`.)
4. Copy that deployment's URL/token into `REGISTRY_URL` / `REGISTRY_TOKEN` (env vars — see §5).

**`Is Manager`** and **`Is Head`** are `Y`/`N`. A pure head with no sheet of their own leaves the bridge/digest columns blank. Someone who's both gets `Y` in both columns and fills in everything.

## 3. Per sales manager (repeat for each one)

1. Copy the existing template sheet (**File → Make a copy** on ["OD - Sales Ashish"](https://docs.google.com/spreadsheets/d/1qnb4o7rl47po5wf2GQN8B_gsxifkq1LEm3AMNd45lKw/edit)) for the new manager, rename it.
2. Open it → **Extensions → Apps Script** → delete the placeholder contents → paste in [`apps-script/Code.gs`](./apps-script/Code.gs).
3. **Project Settings → Script Properties → Add script property** → key `TOKEN`, value: a random secret (ask Claude to generate one).
4. **Deploy → New deployment** → **Web app** → Execute as **Me**, Who has access **Anyone** → **Deploy** → authorize when prompted.
5. Copy the Web app URL (ends in `/exec`).
6. Add a row to the Master Control sheet's `Tenants` tab: their name, their Zoho login email, `Is Manager` = `Y`, this bridge's URL + token, and their `Digest To` (usually their own email) — `Digest CC`/`BCC` optional.

No code change or redeploy needed for this step — the app picks up the new row the next time it refreshes its registry cache (~60 seconds).

### 3.1 Redeploying after an `apps-script/Code.gs` edit

Paste the update into that deployment's Apps Script project, then **Deploy → Manage deployments → (pencil icon) → New version → Deploy** — editing the code alone doesn't change the live `/exec` URL's behavior until you redeploy a new version. Each manager's deployment (and the registry's) needs this done separately; they don't share code automatically.

### 3.2 Security note

Every bridge URL is only as private as its token. None of them are ever sent to a browser (the backend calls them server-to-server, resolved per-request from whoever is logged in) — but treat the Master Control sheet itself as sensitive: it holds every manager's bridge credentials in one place, so only admins should have access to it.

## 4. ZeptoMail (email)

Reuse the same account already set up for the `kpi` project — copy its `ZEPTOMAIL_URL`, `ZEPTOMAIL_TOKEN`, and `ZEPTOMAIL_SENDER` values from `kpi`'s Vercel environment variables into this project's env vars. No new ZeptoMail signup needed.

## 5. Environment variables

Copy `.env.example` to `.env` for local dev, and set the same keys in Vercel (**Project Settings → Environment Variables**) for production:

```
REGISTRY_URL=
REGISTRY_TOKEN=
ZEPTOMAIL_URL=
ZEPTOMAIL_TOKEN=
ZEPTOMAIL_SENDER=
```

That's it for production — there's no `APPS_SCRIPT_URL`/`FOLLOWUP_DIGEST_TO` env vars anymore; every manager's bridge and digest recipients live in the Master Control sheet instead (§2–3).

For **local dev only**, also set `DEV_BYPASS_EMAIL` to one of your registry's Login Email values — this skips the real Zoho login on `localhost` and resolves identity as that email instead (see `lib/zoho.js`), so you can exercise the app without a live OAuth round-trip. Never set this in Vercel.

## 6. Deploy

Same flow as `kpi`: push this repo to GitHub, import it into Vercel, set the env vars above, deploy. The `vercel.json` cron (`/api/followup-digest`, 02:30 UTC / 8:00am IST, Mon–Sat) sends one digest per manager automatically, using that tenant row's own `Digest To`/`CC`/`BCC`.

## 7. Verify

- Sign in as a manager — you should see Overview/Deals/Follow-ups scoped to their own sheet only, never another manager's data.
- Sign in as a head — you should see only the Master tab, with a combined total plus one block per manager.
- Sign in as an email not in the registry — you should get the "No access yet" screen.
- Edit a deal and confirm the change appears in the actual Google Sheet (not someone else's).
- Hit `/api/followup-digest?test=you@example.com` directly to preview every manager's digest without mailing the real recipient lists.
- Clean up any test rows added to real sheets during verification before calling this done.
