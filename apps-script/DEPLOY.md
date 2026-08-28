# Connect RITHI CRM to your Google Sheet (one-time, ~3 minutes)

This makes the **Field Call Register** in the app read from and write to your
real spreadsheet `26 v1 - F_I Call Register`. The Sheet stays the single source
of truth; the app just talks to it through a small script **you** own.

Nothing here exposes any Google password. The only thing the app stores is the
Web App URL you paste at the end.

## Steps

1. Open the spreadsheet in your browser.
2. Menu: **Extensions → Apps Script**. A script editor opens in a new tab.
3. Delete any code in the `Code.gs` file it shows, then **paste the entire
   contents of `apps-script/Code.gs`** from this repo. Click the 💾 save icon.
4. Click **Deploy → New deployment**.
   - Click the ⚙️ gear next to "Select type" → choose **Web app**.
   - **Description:** `RITHI CRM bridge`
   - **Execute as:** **Me** (your account — so it can write to the sheet).
   - **Who has access:** **Anyone**.
     > This lets the app call it without a Google login. The URL is a long,
     > unguessable string and only exposes the calls in this sheet. Treat the
     > URL like a password — anyone with it can read/add calls.
   - Click **Deploy**.
5. The first time, Google asks you to **authorize**. Approve it (you may see an
   "unverified app" screen → **Advanced → Go to … (unsafe)** → **Allow**; this
   is normal for your own script).
6. Copy the **Web app URL** it shows. It ends with `/exec`.
7. In RITHI CRM: **Settings → Google Sheet Connection**, paste the URL, click
   **Test**, then **Save**. Open **Service Calls → Field Call Register** — your
   existing field calls load, and **+ New Field Call** writes straight into the
   sheet with a fresh UCN.

## If you change the script later

Re-deploy the **same** deployment (Deploy → Manage deployments → ✏️ edit →
Version: New version → Deploy) so the URL stays the same. Creating a *new*
deployment gives a new URL you'd have to re-paste in Settings.

## What the script does

- **UCN** is generated to match your sheet exactly:
  `26` + month letter (A=Jan … L=Dec) + day + type letter (**F**=Field,
  **I**=Installation) + a 4-digit number that restarts each day per type —
  e.g. `26A02F0001`.
- It finds the register automatically (the sheet whose header row has a
  **UC Number** column), so tab renames don't break it.
- Adds are serialised with a lock so two people can't grab the same UCN.
