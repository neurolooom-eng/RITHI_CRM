-- ===========================================================================
-- DELETE SPECIFIC CALLS — BY NAME, AND ONLY THE ONES THAT CARRY NO HISTORY.
--
-- Asked for after a round of testing left calls on the register that were never
-- real work.
--
-- READ THIS BEFORE RUNNING IT.
--
-- A CALL IS A QUALITY RECORD AND THE SYSTEM REFUSES TO DELETE ONE. `0049`'s
-- `block_hard_delete` trigger sits on every call table and stops the
-- APPLICATION (`current_user = 'authenticated'`) from deleting anything, at
-- all, ever. It deliberately allows a DBA in this editor to do it, because an
-- approved correction has to be possible -- and `record_audit_d` records it
-- either way. So this file works, and it is the ONLY way a call goes away.
--
-- NOTHING IN THE DATABASE PROTECTS THE CHILDREN. A call's visits, spares,
-- feedback and reviews are joined to it by the UCN as plain TEXT -- there is no
-- foreign key anywhere -- so deleting a call leaves them pointing at a UCN that
-- no longer exists, silently, and every count that reads them goes on counting.
--
-- SO THIS REFUSES ANY CALL THAT HAS CHILDREN, and names them instead. A test
-- call has none; a call that has a visit or a spare against it is not a test
-- call, whatever it was meant to be, and deleting it is a different decision
-- needing a different file. That rule is what makes this safe to hand over.
--
-- ---------------------------------------------------------------------------
-- HOW TO RUN IT
--
--   1. Put the UCNs in the list below. They are the RED badges on the register.
--   2. Run it AS IT IS. Nothing is deleted while `apply` is false -- it reports
--      what it found, what would go, and what it refuses.
--   3. CHECK EVERY ROW against the register: the party and the date are printed
--      so a UCN typed wrong shows up as a call you do not recognise, rather
--      than as a deletion you cannot undo.
--   4. Change `false` to `true` on the `apply` line and run it again.
--
-- ONE STATEMENT, ONE LIST, ONE FLAG -- deliberately. A preview in one file and
-- a delete in another is two lists that can differ, and the day they differ you
-- delete something you never looked at.
--
-- IT ALSO CLEARS `sale_items.inst_call` where it names a call being deleted.
-- Otherwise the machine keeps a UCN that no longer exists, and the Warranty
-- Register goes on believing it has its installation call -- so the
-- + Installation call button stays hidden for ever, which is exactly the fault
-- 0234 was written to end.
-- ===========================================================================

with ask as (
  select
    false as apply,                       -- <<<< SET TO true TO ACTUALLY DELETE
    array[
      -- The UCNs to remove. One per line. Nothing else is touched.
      'CHANGE-ME'
    ]::text[] as ucns
),

-- ---- what the register actually holds for those UCNs ----------------------
found as (
  select c.ucn, coalesce(nullif(btrim(c.call_number), ''), '(no call number)') as call_number,
         coalesce(nullif(btrim(c.party_name), ''), '(no party)') as party_name,
         c.call_type, c.reg_date
    from public.calls c, ask a
   where c.ucn = any(a.ucns)
),

-- ---- what hangs off each of them ------------------------------------------
-- Every table that carries a UCN, counted per call. `spare_consumption_history`
-- is in here too: it is the pre-2026 record and is exactly the kind of thing
-- somebody forgets exists.
kids as (
  select u.ucn, k.what, k.n from (select unnest(ucns) as ucn from ask) u
  cross join lateral (
    select 'visit (reports)' as what, count(*) as n from public.reports            t where t.ucn = u.ucn
    union all select 'spare request',        count(*) from public.spare_requests   t where t.ucn = u.ucn
    union all select 'spare consumed',       count(*) from public.spare_consumption t where t.ucn = u.ucn
    union all select 'spare consumed (history)', count(*) from public.spare_consumption_history t where t.ucn = u.ucn
    union all select 'customer feedback',    count(*) from public.feedback         t where t.ucn = u.ucn
    union all select 'daily call review',    count(*) from public.call_reviews     t where t.ucn = u.ucn
    union all select 'report review',        count(*) from public.call_report_reviews t where t.ucn = u.ucn
    union all select 'field failure report', count(*) from public.field_failure_reports t where t.ucn = u.ucn
    union all select 'indoor job',           count(*) from public.indoor_jobs      t where t.ucn = u.ucn
    union all select 'vigilance change',     count(*) from public.call_vigilance_changes t where t.ucn = u.ucn
    union all select 'complaint suggestion', count(*) from public.complaint_suggestions t where t.ucn = u.ucn
  ) k
  where k.n > 0
),
blocked as (select distinct ucn from kids),
-- A call is removable when the register HAS it and nothing hangs off it.
go as (select f.ucn from found f where f.ucn not in (select ucn from blocked)),

-- ---- the deletes ----------------------------------------------------------
-- Data-modifying CTEs always run, referenced or not -- `a.apply` is what makes
-- the dry run a dry run.
d_inst as (
  -- FIRST, and not last: a machine pointing at a call that has gone is worse
  -- than a machine pointing at nothing, because the register reads it as "this
  -- one has its installation call" for ever.
  -- RETURNING THE STORED VALUE, not `1`. `sale_item_inst_call_guard` (0234) can
  -- put the old value back, and the first version of this counted the rows it
  -- ASKED to change -- so it reported "1 machine cleared" over a machine still
  -- carrying the UCN. A report of what was attempted is not a report of what
  -- happened.
  update public.sale_items si set inst_call = ''
    from ask a where a.apply and si.inst_call in (select ucn from go)
    returning si.inst_call as after),
d_req as (
  -- The REQUEST is not deleted -- somebody really did raise it. Its link to the
  -- call is cleared and it goes back to Pending, which is what it was before
  -- the call existed.
  update public.call_requests cr set ucn = '', status = 'Pending'
    from ask a where a.apply and cr.ucn in (select ucn from go) returning 1),
d_pend as (delete from public.pending_registrations t using ask a where a.apply and t.ucn in (select ucn from go) returning 1),
d_f  as (delete from public.field_calls        t using ask a where a.apply and t.ucn in (select ucn from go) returning 1),
d_i  as (delete from public.installation_calls t using ask a where a.apply and t.ucn in (select ucn from go) returning 1),
d_p  as (delete from public.pm_calls           t using ask a where a.apply and t.ucn in (select ucn from go) returning 1)

-- ---- the report -----------------------------------------------------------
select * from (
  select 0 as sort, 'mode' as section,
         case when (select apply from ask) then 'APPLIED — the calls below have been deleted'
              else 'DRY RUN — nothing was deleted. Check every row, then set apply = true.' end as detail,
         '' as party, null::date as reg_date
  union all
  select 1, 'not on the register (check the UCN)', u.ucn, '', null::date
    from (select unnest(ucns) as ucn from ask) u
   where u.ucn not in (select ucn from found)
  union all
  select 2, 'REFUSED — this call has history',
         k.ucn || '  ·  ' || k.what || ' × ' || k.n,
         coalesce((select party_name from found f where f.ucn = k.ucn), ''),
         (select reg_date from found f where f.ucn = k.ucn)
    from kids k
  union all
  select 3, case when (select apply from ask) then 'deleted' else 'will be deleted' end,
         f.ucn || '  ·  ' || f.call_number || '  ·  ' || f.call_type,
         f.party_name, f.reg_date
    from found f where f.ucn in (select ucn from go)
  union all
  select 4, 'machines whose INST Call was cleared',
         (select count(*) from d_inst where coalesce(after, '') = '')::text
         || case when (select count(*) from d_inst where coalesce(after, '') <> '') > 0
                 then '  (⚠ ' || (select count(*) from d_inst where coalesce(after, '') <> '')::text
                      || ' would not clear — apply 0234, which lets a DBA clear a mapping to a deleted call)'
                 else '' end, '', null::date
  union all
  select 5, 'call requests put back to Pending',
         (select count(*) from d_req)::text, '', null::date
  union all
  select 6, 'rows removed from the call tables',
         ((select count(*) from d_f) + (select count(*) from d_i) + (select count(*) from d_p))::text, '', null::date
) report order by sort, detail;
