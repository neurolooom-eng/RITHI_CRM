-- ===========================================================================
-- GO-LIVE RESET — empty the TEST data, keep the people and the setup.
--
-- For the cutover from testing to production: the schema stays exactly as it
-- is, User Master and access stay as they are, and every record produced while
-- testing is removed so the fresh upload starts on an empty register.
--
-- ⚠️  IRREVERSIBLE. Take a backup first (Supabase → Database → Backups, or
--     `pg_dump`). Nothing below can be undone from inside the app.
--
-- ⚠️  Run it in the Supabase SQL EDITOR, not from the app. `0049` blocks the
--     application role from deleting quality records on purpose. This uses
--     TRUNCATE, which the SQL editor runs as the owner and which does not fire
--     that row trigger — deliberate, and the reason it is a separate script you
--     run by hand rather than anything the app can do.
--
-- KEPT, on purpose:
--   profiles · user_directory     the User Master and who signs in
--   app_roles · app_super_admins  Roles & Permissions, as you have tuned it
--   app_settings · sla_rules      Admin Config and the SLA targets
--   master_lists                  WHICH value lists exist (their definitions).
--                                 The VALUES in them are cleared below — the
--                                 registry is setup, the values are data.
--
-- Sections 1-3 are the reset. Section 4 is a judgement call and is commented
-- out — read it before deciding.
-- ===========================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. Everything the testing produced: calls, visits, spares, stock, feedback.
--
-- One TRUNCATE, so foreign keys between them are satisfied at the end of the
-- statement rather than one table at a time. RESTART IDENTITY puts each table's
-- OWN id sequence back to 1 — but not the three shared ones, which section 3
-- has to reset by hand. See there.
-- ---------------------------------------------------------------------------
truncate table
  public.field_calls,
  public.installation_calls,
  public.pm_calls,
  public.call_requests,
  public.pending_registrations,
  public.call_reviews,
  public.reports,
  public.feedback,
  public.spare_requests,
  public.spare_request_lines,
  public.spare_dispatches,
  public.spare_dispatch_lines,
  public.spare_consumption,
  public.material_returns,
  public.stock_transfers,
  public.stock_transfer_lines,
  public.notifications
restart identity;

-- ---------------------------------------------------------------------------
-- 2. The registers and masters you are about to re-upload.
--
-- Leave this block out if the parties / products / parts already in the project
-- are the real ones and only the CALLS were test data.
-- ---------------------------------------------------------------------------
truncate table
  public.parties,
  public.products,
  public.parts,
  public.masters,
  public.sale_entries,
  public.sale_items,
  public.contract_entries,
  public.contract_items
restart identity;

-- ---------------------------------------------------------------------------
-- 3. The numbering, so production does not carry on from the test series.
--
-- (a) These counter TABLES are themselves the series: emptying them makes the
--     next call CL<yy>00001, the next spare OR-YYMM-0001, and the same for DC,
--     MRN and stock transfers. next_direct_call_number() re-seeds itself from
--     `calls`, which is empty after section 1, so it restarts cleanly.
-- ---------------------------------------------------------------------------
truncate table
  public.call_number_seq,
  public.spare_or_counters,
  public.spare_dispatch_counters,
  public.material_return_counters,
  public.stock_transfer_counters;

-- (b) Three SEQUENCES that TRUNCATE ... RESTART IDENTITY cannot reach, because
--     they are not owned by the column that uses them. Without these the test
--     run's count stays visible in production:
--
--       ucn_seq          the last 4 digits of EVERY UCN (YYMMDD<T>nnnn), so a
--                        fresh project would open at ...F0042 instead of F0001
--       call_req_seq     the request REQID (R1, R2, …)
--       call_split_id_seq  the id shared by field / installation / pm calls, so
--                        that `calls` (their union view) has unique ids — 0040
--                        made it shared on purpose, which is why it is unowned
--
--     `false` means "the NEXT value is 1", not "skip 1".
select setval('public.ucn_seq',           1, false);
select setval('public.call_req_seq',      1, false);
select setval('public.call_split_id_seq', 1, false);

commit;

-- ---------------------------------------------------------------------------
-- 3c. AFTER THE RESET, IF YOU RAN SECTION 2: re-seed the values a MIGRATION
--     put in `masters`, which section 2 cleared along with the test ones.
--     0046 seeds the Daily Call Review's two per-product lists (DCCR Complaint
--     Grouping, Root Cause Key Word) — without them the review's dropdowns come
--     up empty, which does not look like a data problem when it happens.
--
--     Re-run `supabase/apply/daily_review.sql`. It is idempotent, so it only
--     puts the seeded values back.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 4. JUDGEMENT CALLS — uncomment what you want gone. Each is left ON by
--    default because none of it is obviously test data.
-- ---------------------------------------------------------------------------

-- The audit trail and the database's own before/after record. A production
-- system arguably wants these to START at go-live rather than carry the
-- testing noise — but they are the compliance record, so this is quality's
-- call, not a default.
-- truncate table public.audit_log, public.record_audit restart identity;

-- Executed IQ / OQ / PQ results. If they were executed against test data they
-- are test evidence and the package has to be re-executed on production anyway.
-- truncate table public.validation_results restart identity;

-- Knowledge Base articles, the service-manual / QMS shelf, and the how-to
-- guide screenshots. These are usually REAL content someone wrote or uploaded,
-- not test data — clear them only if you know they were trials.
-- truncate table public.kb_articles, public.documents restart identity;
-- truncate table public.help_screenshots;

-- ---------------------------------------------------------------------------
-- 5. What is left. Run this after, to confirm the reset did what you expect.
-- ---------------------------------------------------------------------------
select 'field_calls' as t, count(*) from public.field_calls
union all select 'installation_calls', count(*) from public.installation_calls
union all select 'pm_calls',           count(*) from public.pm_calls
union all select 'call_requests',      count(*) from public.call_requests
union all select 'reports',            count(*) from public.reports
union all select 'spare_requests',     count(*) from public.spare_requests
union all select 'spare_consumption',  count(*) from public.spare_consumption
union all select 'parties',            count(*) from public.parties
union all select 'products',           count(*) from public.products
union all select 'parts',              count(*) from public.parts
union all select 'masters',            count(*) from public.masters
union all select '-- KEPT --',         null
union all select 'profiles',           count(*) from public.profiles
union all select 'user_directory',     count(*) from public.user_directory
union all select 'app_roles',          count(*) from public.app_roles
union all select 'master_lists',       count(*) from public.master_lists
union all select 'documents',          count(*) from public.documents
union all select 'kb_articles',        count(*) from public.kb_articles
order by 1;
