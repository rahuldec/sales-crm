# Setup guide

This app is multi-tenant: each sales manager has their own Google Sheet and their own Apps Script bridge. One spreadsheet — **OD-MASTER** — ties it together: a `Credentials` tab (username/password + role + each manager's bridge URL/token) for login, and one `IMPORTRANGE`-mirrored tab per manager (a live read-only copy of their sheet) for the Master rollup view. Logging in decides what you see — your own sheet if you're a manager, a rollup across everyone if you're a head, both if you're both.

## 1. One-time: OD-MASTER sheet

You already have this sheet: <https://docs.google.com/spreadsheets/d/127_uLgReuTyCgez6fQ3-esFGg11f8kgSql48k2bgNOI/edit>

1. On its **`Credentials`** tab, make sure the header row has exactly these columns (order doesn't matter, spelling does):
   ```
   tenant | User | password | Sheet Bridge URL | Sheet Bridge Token | Is Head | Digest To | Digest CC | Digest BCC
   ```
   `tenant`, `User`, and `password` already exist. Add `Sheet Bridge URL`, `Sheet Bridge Token`, and `Is Head` as new columns. `Digest To`/`Digest CC`/`Digest BCC` are optional — only needed if you want the daily follow-up digest email to go out for that manager.
2. One row per person who logs in:
   - **A sales manager**: `tenant` = their name (also the tab name used for their Master-view mirror, e.g. `Ashish`), `User`/`password` = their login, `Sheet Bridge URL`/`Sheet Bridge Token` = their own sheet's Apps Script bridge (§3), `Is Head` = blank/`N`.
   - **A head** (e.g. Jatin): `User`/`password` = their login, `Is Head` = `Y`, everything else blank — a head has no sheet of their own.
3. For each manager, add a tab to OD-MASTER named exactly after their `tenant` value (e.g. `Ashish`), containing an `IMPORTRANGE` formula that mirrors their sheet's data range. This tab is what the Master rollup view reads — it's read-only (IMPORTRANGE-fed cells can't be edited directly), which is fine since the Master view never writes.
4. Deploy **one** Apps Script bridge on OD-MASTER itself (**Extensions → Apps Script**, on OD-MASTER, not on a manager's sheet) — paste in the current [`apps-script/Code.gs`](./apps-script/Code.gs), set a `TOKEN` Script Property, deploy as a web app (Execute as **Me**, access **Anyone**) — same steps as §3 below. This one deployment serves the `Credentials` tab and every manager's mirror tab, selected per-request via a `?sheet=` query param the app already sends — no extra Script Properties needed for this one.
5. Copy that deployment's URL/token into `MASTER_URL` / `MASTER_TOKEN` (env vars — see §5).

Old `Sales Data`/`Dashboard` tabs already on OD-MASTER are leftovers — ignore them, nothing reads them.

## 2. Security note

The `Credentials` tab holds every manager's bridge URL/token *and* everyone's plaintext password — treat OD-MASTER itself as sensitive (admin-only sharing access), same as any other secret store. Login is plain HTTP Basic Auth re-verified against this tab on every request; there's no hashing, a deliberate simplicity tradeoff for a small internal tool.

## 3. Per sales manager (repeat for each one)

Unchanged from before — each manager's own sheet needs its own bridge, independent of OD-MASTER's:

1. Copy the existing template sheet (**File → Make a copy** on ["OD - Sales Ashish"](https://docs.google.com/spreadsheets/d/1qnb4o7rl47po5wf2GQN8B_gsxifkq1LEm3AMNd45lKw/edit)) for the new manager, rename it.
2. Open it → **Extensions → Apps Script** → delete the placeholder contents → paste in [`apps-script/Code.gs`](./apps-script/Code.gs).
3. **Project Settings → Script Properties → Add script property** → key `TOKEN`, value: a random secret (ask Claude to generate one).
4. **Deploy → New deployment** → **Web app** → Execute as **Me**, Who has access **Anyone** → **Deploy** → authorize when prompted.
5. Copy the Web app URL (ends in `/exec`).
6. In OD-MASTER's `Credentials` tab, add/update that manager's row with this URL + token in `Sheet Bridge URL`/`Sheet Bridge Token`.
7. Add an `IMPORTRANGE` tab for them on OD-MASTER (§1 step 3) so the Master rollup view can see their data too.

Ashish's existing deployment doesn't need to change — the current `apps-script/Code.gs` is backward compatible with it (new query-param support only changes behavior when a param is actually sent, which per-manager deployments never receive).

### 3.1 Redeploying after an `apps-script/Code.gs` edit

Paste the update into that deployment's Apps Script project, then **Deploy → Manage deployments → (pencil icon) → New version → Deploy** — editing the code alone doesn't change the live `/exec` URL's behavior until you redeploy a new version. Each deployment (every manager's, and OD-MASTER's) needs this done separately; they don't share code automatically.

## 4. ZeptoMail (email)

Reuse the same account already set up for the `kpi` project — copy its `ZEPTOMAIL_URL`, `ZEPTOMAIL_TOKEN`, and `ZEPTOMAIL_SENDER` values from `kpi`'s Vercel environment variables into this project's env vars. No new ZeptoMail signup needed.

## 5. Environment variables

Copy `.env.example` to `.env` for local dev, and set the same keys in Vercel (**Project Settings → Environment Variables**) for production:

```
MASTER_URL=
MASTER_TOKEN=
ZEPTOMAIL_URL=
ZEPTOMAIL_TOKEN=
ZEPTOMAIL_SENDER=
```

That's it — no Zoho client, no per-manager env vars. Every manager's own bridge URL/token lives in OD-MASTER's `Credentials` tab (§1), resolved per-login.

## 6. Deploy

Same flow as `kpi`: push this repo to GitHub, import it into Vercel, set the env vars above, deploy. The `vercel.json` cron (`/api/followup-digest`, 02:30 UTC / 8:00am IST, Mon–Sat) sends one digest per manager automatically, using that manager's row's `Digest To`/`CC`/`BCC` from the `Credentials` tab.

## 7. Verify

- Sign in as a manager (their `Credentials` username/password) — you should see Overview/Deals/Follow-ups scoped to their own sheet only, never another manager's data.
- Sign in as a head (e.g. Jatin) — you should see only the Master tab, with one block per manager.
- Sign in with a wrong password or an unregistered username — you should get a sign-in error, not the dashboard.
- Edit a deal and confirm the change appears in the actual Google Sheet (not someone else's, and not the IMPORTRANGE mirror — writes go to the manager's own sheet via their own bridge).
- Hit `/api/followup-digest?test=you@example.com` directly to preview every manager's digest without mailing the real recipient lists.
- Clean up any test rows added to real sheets during verification before calling this done.
