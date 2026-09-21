# Deploy "CallReg" — the RITHI CRM ↔ Google Sheet bridge (one-time, ~3 min)

`CallReg` is a **standalone** Google Apps Script project (kept separate, not
pasted inside the sheet). It reads and writes your **Call Register**
spreadsheet by ID, so the RITHI CRM app can load calls and register new ones
with a UCN. The Sheet stays the single source of truth.

Nothing here exposes a Google password. The only thing the app stores is the
Web App URL you paste at the end.

## Steps

1. Go to **https://script.google.com** → **New project**.
2. Rename the project to **CallReg** (click the title, top-left).
3. Delete the sample code, then **paste the entire contents of
   `apps-script/CallReg.gs`** from this repo. Click 💾 save.
4. Check the `SPREADSHEET_ID` line near the top. It is already set to your
   `26 v1 - F_I Call Register` sheet:
   `1aMSnQV4TIWC2FuZfXxBIcLTxTk_I52wRr6AZgNIFv_I`
   (If you ever point CallReg at a different sheet, replace this with the ID
   from that sheet's URL: `.../spreadsheets/d/<ID>/edit`.)
5. Click **Deploy → New deployment**.
   - Gear ⚙️ next to "Select type" → **Web app**.
   - **Description:** `CallReg`
   - **Execute as:** **Me** (so it can open and write the sheet with your access).
   - **Who has access:** **Anyone**.
     > Lets the app call it without a Google login. The URL is a long,
     > unguessable string. Treat it like a password — anyone with it can
     > read/add calls in that sheet.
   - Click **Deploy**.
6. First time, Google asks you to **authorize** — approve it (you may see an
   "unverified app" screen → **Advanced → Go to CallReg (unsafe)** → **Allow**;
   this is normal for your own script). It will ask for permission to see and
   manage your spreadsheets — that is the `openById` call.
7. Copy the **Web app URL** (ends in `/exec`).
8. In RITHI CRM: **Settings → Google Sheet Connection**, paste the URL, click
   **Test**, then **Save**. Open **Service Calls → Field Call Register** — your
   existing field calls load, and **+ New Field Call** writes straight into the
   sheet with a fresh UCN.

## If you change the CallReg script later

Re-deploy the **same** deployment (Deploy → Manage deployments → ✏️ edit →
Version: New version → Deploy) so the URL stays the same. A *new* deployment
gives a new URL you'd have to re-paste in Settings.

## Where uploaded documents are stored

Everything the app uploads goes into the **"Reports" shared drive**
(`DRIVE_ROOT_ID` in `CallReg.gs`), and into the folder that matches what the
document *is*:

| Document | Folder |
| --- | --- |
| A Field call's service report | `Field Reports` |
| An Installation call's report | `Installation Reports` |
| A PM call's report | `PM Reports` |
| Request Call Registration → KYC | `KYC` |
| Request Call Registration → Installation Report | `Additional Reports` |

**The folders are found by NAME, not by a pasted id.** A shared drive's
subfolder ids cannot be read from outside the drive, so an id copied off a
screenshot is a guess — and a wrong one does not fail, it files the document
somewhere nobody thinks to look. Each id is resolved once and remembered in a
script property (`folder_field`, `folder_kyc`, …); rename or move a folder in
Drive and the remembered id stops resolving, so it is dropped and looked up
again by name.

**Rename a folder in Drive and you must rename it in two places** —
`DRIVE_FOLDERS` in `CallReg.gs` and `DRIVE_FOLDER_NAMES` in
`src/lib/drivefolders.ts`. `npm run check:ui` compares them word for word,
because a rename on one side alone silently files documents in the drive root.

**The account this is deployed as must be a member of that shared drive.** It
is deployed "Execute as: **Me**", so if that account loses access every upload
falls back to the drive root, and then to the old flat folder — never to an
error, because losing an engineer's signed report is worse than filing it one
level up. Delete the `folder_*` script properties after changing the account,
so the ids are resolved afresh.

**The old flat folder (`REPORT_FOLDER_ID`) is still read and no longer
written.** Every report uploaded before the re-route lives in it, and it stays
in `_isAppDocument()`'s list for exactly that reason — drop it and all of them
stop opening in the app.

## Showing reports inside the app (`drivefile`)

The app renders a service report in a viewer rather than sending you to Drive.
It gets the bytes from **this script**, not from Drive — because "Execute as:
**Me**" means the script can open the reports folder even where a domain policy
forbids link sharing, which is exactly the case it was written for. The person
reading a report needs **no Google account**.

**It only serves the app's own folders.** `_isAppDocument()` checks the file's
PARENTS against the five mapped folders, the shared drive's root, the old flat
folder and the request-documents folder where one is set — and refuses anything
else, so the action can never become a reader for the rest of the Drive
account. Do not relax that check.

**It is an open endpoint, like the rest of this script.** Anyone who can reach
the `/exec` URL can ask for a file *if they know its id* — which is, in effect,
the "anyone with the link" a domain policy forbids, arrived at from another
direction. If that is not acceptable, set a **Script property `ACCESS_TOKEN`**
(Project Settings → Script properties): every request then has to carry a
matching `?token=`, and nothing reaches the files without it.

Files over **10 MB** are refused with a message rather than attempted; the
viewer offers "Open in Drive" for those.

## What CallReg does

- **UCN** matches your sheet exactly: `26` + month letter (A=Jan … L=Dec) +
  day + type letter (**F**=Field, **I**=Installation) + a 4-digit number that
  restarts each day per type — e.g. `26A02F0001`.
- Finds the register automatically (the tab whose header row has a
  **UC Number** column), so tab renames don't break it.
- Adds are serialised with a lock so two people can't grab the same UCN.
