-- ===========================================================================
-- THE BACKLOG'S OPEN ITEMS, ON THE TRACKER.
--
-- The user, 2026-09-08: "Add all backlog Items to Tracker".
--
-- Every item from `docs/BACKLOG.md`'s OPEN ITEMS index, as at the day the
-- Tracker shipped. Seeding it in SQL rather than by hand is the only way the
-- rows reach the live database at all -- and it means the list arrives the same
-- on every project, rather than depending on who typed it in.
--
-- ONLY WHAT IS OPEN. The backlog is 2,000 lines and most of it is the record of
-- decisions already made -- reasoning, warnings, what was applied when. That
-- belongs where it is. What moves here is the part with something still to do:
-- copying the rest would bury the fifteen live items under two hundred settled
-- ones, and a tracker nobody can scan is a tracker nobody reads.
--
-- SO THE TWO ARE NOT THE SAME LIST AND SHOULD NOT BECOME ONE. The backlog keeps
-- the reasoning; the tracker keeps what is being worked on now. An item finished
-- here does not delete its entry there.
--
-- `owner` IS WHO IT IS WITH, not who will do it -- "You", "Decision", "Claude".
-- That is the question a shared list is actually asked ("what is waiting on
-- me?"), and it is the backlog index's own grouping.
--
-- IDEMPOTENT BY TITLE. The bundles are replayed one at a time and re-run freely,
-- so every insert is guarded: running this twice does not give anybody a second
-- copy of the same task, and an item somebody has since EDITED or CLOSED is left
-- exactly as they left it.
-- ===========================================================================

do $seed$
declare
  seeded int := 0;
  r      record;
begin
  if to_regclass('public.tracker_items') is null then
    raise notice 'tracker_items is missing -- run tracker.sql first';
    return;
  end if;

  for r in
    select * from (values
      -- ---- waiting on the user ------------------------------------------
      (10, 'The PM count is short',
           '7,029 rows in pm_calls where two years at 10,000/yr should be ~20,000 — about a third. Whatever loaded it stopped early or was filtered. Find out BEFORE nine years of history load through the same path, or the backfill silently loses two thirds of itself.',
           'You', 'Data'),
      (20, 'PM rows measure ~2x field-call rows',
           '2,088 bytes/row against field_calls'' 1,124, for tables with IDENTICAL columns (the 0040 split). Either PM complaint text really is twice as long, or pm_calls is carrying bloat. Across 150,000 calls that is 170 MB vs 310 MB of rows — 140 MB on a 500 MB allowance.',
           'You', 'Storage'),
      (30, 'handstock_period.closed_through — is a period closed?',
           'While it is NULL, handstock_cutoff() is -infinity and EVERY row of spare_issue_history + spare_consumption_history (68 MB) still feeds live hand stock. Nothing there is safe to move until a period is closed. Hand stock is derived, never stored, so removing source rows changes balances with no error and no warning.',
           'You', 'Spares'),
      (40, 'What six AppSheet columns held',
           'CALL DETAILS, VISIT REMARKS, CHANGE PRODUCT?, SEND EMAIL FOR DEFECTIVE SPARE, SL NO(T), Complaint. They are in the DCCR export as blank columns so WRR-2026 keeps its shape. Two sample rows from the old sheet would settle it. Three are near-duplicates of columns that ARE exported, which is where a wrong guess would go unnoticed.',
           'You', 'Reliability'),
      (50, 'Four objectives still typed, and the CPX rule',
           'FFR field failures, PM Calls, Installation call, b.Customer feedback have no formula yet. public.feedback exists but nothing says how a score is derived from it. Also the CPX failure rule, which was deferred.',
           'You', 'Objectives'),
      (60, 'Call Update and Cancelled Calls — the legacy files',
           'Should update status, complaint details and allocated-to on EXISTING calls. Needs an update-only import mode: an upsert on ucn would INSERT a stub call for any UCN not in the register. Calls also live in three tables, so it must route by looking the UCN up rather than trusting the picker; and cancellation should go through cancel_call(), which checks the permission and insists on a reason. Waiting on: the files (or their headers), and whether a blank cell clears a field or leaves it.',
           'You', 'Data'),

      -- ---- waiting on a decision -----------------------------------------
      (70, 'Supabase Pro, or split across projects?',
           'Nine years of history is ~300 MB of rows and ~1.25 GB with this project''s indexing. The free tier cannot hold it even split three ways. Pro is 8 GB for about $25/mo and keeps everything joinable, RLS working, and the apply bundles meaningful. Splitting a validated quality system across databases nobody can join costs more than the subscription.',
           'Decision', 'Storage'),
      (80, 'REINDEX the fat tables',
           'Index bloat is real here: record_audit holds 8 MB of indexes over 792 kB of rows. Likely 30–60 MB back for no behaviour change and no risk. reindex index concurrently does not block writes.',
           'Decision', 'Storage'),

      -- ---- waiting on me -------------------------------------------------
      (90, 'The reliability export itself',
           'reliability_wrr (WRR-2026 columns 1–14) and DCCR_EXPORT_COLUMNS (15–67) are both ready and both verified against the workbook. Nothing yet WRITES the file. src/lib/xlsx.ts already makes multi-sheet workbooks.',
           'Claude', 'Reliability'),
      (100, 'has_perm() returns NULL with no signed-in user',
           'my_extra_perms() returns NULL, so has_perm() does, so `if not has_perm(...)` never fires and execution falls through into the write. Fixed in the two functions 0139 touched; 15 OTHER MIGRATIONS still use the bare pattern. Latent rather than exploitable — execute is granted to `authenticated` only — but that is a second lock, not a reason to leave the first open.',
           'Claude', 'Security'),

      -- ---- long-standing --------------------------------------------------
      (110, 'Audit Mode rules', 'Carried in the backlog since before this round.', '', 'Compliance'),
      (120, 'The security migration (D-2 / D-3 / D-4)', 'Carried in the backlog since before this round.', '', 'Security'),
      (130, 'A CI workflow', 'Nothing runs the check scripts or the SQL suites automatically; every round is verified by hand.', '', 'Ops'),
      (140, 'Two data uploads still outstanding',
            'The 77 missing yearly consumptions (delete + re-upload the four files per _yearly_consumption_check.sql, to 39,801 total with 12,015 in 2024), and the Ownership Transfer upload.',
            'You', 'Data'),
      (150, 'engineer_stock needs security_invoker',
            'Carried in the backlog: a view over RLS-protected tables that does not apply RLS to the reader.', 'Claude', 'Security')
    ) as t(ord, title, detail, owner, area)
  loop
    if not exists (select 1 from public.tracker_items i where i.title = r.title) then
      insert into public.tracker_items (title, detail, owner, area, status, sort_order)
           values (r.title, r.detail, r.owner, r.area, 'Open', r.ord);
      seeded := seeded + 1;
    end if;
  end loop;

  raise notice 'Tracker: % backlog item(s) added (% already there)',
    seeded, 15 - seeded;
end $seed$;
