-- ===========================================================================
-- THE TRACKER CATCHES UP — the points open at the end of 2026-09-09.
--
-- The user: "then list the Pending points and update the tracker."
--
-- ADDITIVE AND IDEMPOTENT BY TITLE, like 0144 and 0150. Nothing is closed,
-- renamed or deleted: an item somebody has edited, re-owned or marked Done is
-- left exactly as they left it, and running the bundle twice adds nothing.
--
-- "Done" stays a judgement the people using the list make. A row closed by SQL
-- is a row somebody has to re-open to argue with -- and the two lists are
-- deliberately different: the backlog records what shipped and why, the Tracker
-- records what is being worked on.
--
-- WHAT IS NOT HERE: everything already seeded by 0144 and 0150 (the parked
-- decisions, the 13485 findings). This adds only what became open since, or
-- what was open all along and had never been written down.
--
-- ONE ITEM WAS REMOVED BEFORE THIS FILE EVER RAN (2026-09-09): "Confirm the
-- super-admin revocation actually took". The user pasted the _status.sql output
-- the same evening and row 118 read `yes`, so the question was answered before
-- the seed could ask it. Seeding an answered item as Open would put a job on
-- somebody's list that is already done -- and closing it here in SQL would break
-- this file's own rule that Done is the reader's judgement. So it is simply not
-- seeded. (If an earlier copy of 0157 had already run somewhere, the row exists
-- and is Open; tick it.)
-- ===========================================================================

do $seed$
declare
  seeded int := 0;
  total  int := 0;
  r      record;
begin
  if to_regclass('public.tracker_items') is null then
    raise notice 'tracker_items is missing -- run tracker.sql first';
    return;
  end if;

  for r in
    select * from (values
      -- ---- verification the user can close in a minute ---------------------
      (310, 'Assign the Zoho Migration role to a login',
            'The role exists and is a read-only clone of Technical Support, but nobody holds it. It is in the User Master role dropdown. Kept separate from Technical Support on purpose: it ends when the migration does, so revoking it is one tick and leaves the support login alone.',
            'Rithi Admin', 'Access'),

      -- ---- parked, with the reason it is parked ---------------------------
      (320, 'Un-park the auto-apply pipeline (one character)',
            'CI/CD to apply migrations is BUILT and merged but parked. It failed on an unencoded "@" in the database password -- psql read the tail of the password as part of the hostname, so it never reached the database. Percent-encode it (@ -> %40) in the SUPABASE_DB_URL secret, then Actions -> Apply database migrations -> mode baseline with baseline_through set to the last migration really applied, then mode apply. WARNING: a fragment of the password reached a PUBLIC Actions log before the scrubber was fixed -- reset the database password and delete those runs when picking this up.',
            'Rithi Admin', 'Infrastructure'),

      -- ---- design settled, not built --------------------------------------
      -- PHASE 1 SHIPPED THE SAME DAY THIS FILE WAS WRITTEN (v0.9.182), so the
      -- item is what is LEFT rather than what was asked for. Rewritten rather
      -- than closed: the work did not finish, it moved on a phase.
      (330, 'Indoor Service: Phase 2 (the call loop) and Phase 3 (QC criteria)',
            'Phase 1 shipped on 2026-09-09 (v0.9.182): the register, both axes, all six activities, the page and the permissions -- run indoor.sql. PHASE 2 is the loop with the call: the transfer of 4.5.1 keeping ONE call and ONE UCN, a chip on the call saying it is at Indoor Service, and the completion report of 4.5.7 closing it. This is SR-044, the one requirement in section L still Absent. PHASE 3 is QC that means something: indoor_job_checks already holds parameter / expected / measured / verdict / instrument / calibration due, so it needs the per-product REFERENCE MEASUREMENTS, which do not exist as data. Until then SR-043 is closed in form and not in substance, and that difference is the whole of SR-006.',
            'Claude', 'Indoor Service'),
      (340, 'DECISION: who may condemn a unit, and where a salvaged part goes',
            'From the Indoor activity work, and STILL OPEN after Phase 1 -- which settled only the reversible half of each. Condemning is now its own permission (indoor.condemn), enforced by a trigger and granted to ADMIN ALONE, so nobody can scrap a machine by accident; but WHO SHOULD hold it is the question, and scrapping CUSTOMER property in particular cannot be an engineer''s own decision. A salvaged part is RECORDED with its condition grade and destination and credited to NO stock balance, because a harvested part entering stock under its normal code is indistinguishable from new -- the register already holds a refurbished part under its own code (URS-027), and salvage should do the same or the grade means nothing. No balance moves until this is answered.',
            'Decision', 'Indoor Service'),

      -- ---- open data questions --------------------------------------------
      (350, 'Party spellings: run the tidy-up, or leave it',
            'A party spelled two ways showed no products, because products carried CAPITALS while the party row was Title Case. The register is CORRECT without any SQL -- the lookups match case-insensitively as of v0.9.174. _party_name_normalise.sql is an optional tidy-up (dry run by default) that aligns the stored spellings so exports and groupings agree too, and separately lists products whose party has no row at all.',
            'Rithi Admin', 'Data'),
      (360, 'The spare_bulk_approval suite emits an unlabelled error',
            'Pre-existing, and reproduces identically against main''s own migrations, so it is not from any recent change -- but by this project''s convention every error a suite prints should be one labelled "expect ERROR", and this one is not. "Nothing selected" at line 135, where the fixture''s BA-R2 lines appear not to exist.',
            'Claude', 'Testing')
    ) as t(ord, title, detail, owner, area)
  loop
    total := total + 1;
    if not exists (select 1 from public.tracker_items i where i.title = r.title) then
      insert into public.tracker_items (title, detail, owner, area, status, sort_order)
           values (r.title, r.detail, r.owner, r.area, 'Open', r.ord);
      seeded := seeded + 1;
    end if;
  end loop;

  raise notice 'Tracker: % of % item(s) added (% already there)', seeded, total, total - seeded;
end $seed$;
