-- ===========================================================================
-- FEEDBACK: AN INDEX FOR EVERY WAY A SCREEN LOOKS IT UP (2026-10-05).
--
-- The user's pg_stat_statements export ("Supabase - RootCause") put the
-- feedback lookup BY CALL NUMBER at the top by disk reads: 1,087 calls, 2.66
-- million blocks read -- about 2,450 per call, i.e. the whole table every
-- time -- at ~665 ms each. The table had indexes on its key (ucn_key), entry_at
-- and imported_from, and none on the three columns the app filters or sorts by:
--
--   call_number = $1 ORDER BY created_at DESC   the call's feedback (supabase.ts)
--   serial = $1                                  a machine's feedback (history)
--   ORDER BY created_at DESC, id DESC            the Customer Feedback register
--
-- Each was a sequential scan, plus a sort of every row for the register's
-- pages (~5.8-7.1 s each). These three indexes serve them as written.
--
-- Nothing is read or written differently and no policy changes: an index only
-- changes how a row is found. `if not exists` guards a NAME, and these names
-- are new, so nothing older can be standing in for them.
-- ===========================================================================

create index if not exists feedback_call_number_created_idx
  on public.feedback (call_number, created_at desc);
create index if not exists feedback_serial_idx
  on public.feedback (serial);
create index if not exists feedback_created_id_idx
  on public.feedback (created_at desc, id desc);

analyze public.feedback;
