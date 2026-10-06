-- ===========================================================================
-- PM CALLS: NEWEST REGISTRATION FIRST.
--
-- The user, 2026-10-06: "Sort the PM Calls in Newest to Oldest based on Call
-- Registration Date. -- Table, Database". The register used to be read by
-- `id` -- the order the rows were INSERTED -- and a PM month is bulk-loaded
-- and back-dated, so that is the order of the uploads, not of the calls.
--
-- A table has no stored order; a query does. The PM register is now READ
-- newest registration first: reg_at desc, then reg_date desc, then id desc
-- (src/lib/supabase.ts orderCalls), and this index serves exactly that order,
-- so each page of 1,000 is an index scan rather than a sort of the whole
-- table. reg_at is the registration date-time (0050 fills it from reg_date
-- where absent); NULLS LAST so a call missing it sits at the end, not the top.
--
-- 0050's pm_calls_reg_idx (reg_date, reg_at desc) is LEFT: it serves the bulk
-- uploader's "latest registration in a month" lookup, a different question.
-- ===========================================================================

create index if not exists pm_calls_reg_at_desc_idx
  on public.pm_calls (reg_at desc nulls last, reg_date desc nulls last, id desc);
