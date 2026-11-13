-- ===========================================================================
-- DELETE SPECIFIC CALLS TOGETHER WITH THEIR VISIT ENTRIES, AND PUT THEIR
-- REQUESTS BACK TO PENDING.
--
-- Asked for on 2026-11-13: "Delete 26K13F0024, 26K13F0025, 26K13F0026 &
-- 26K13F0027 and all its associated Visit Entries. Move the Request to
-- Pending State."
--
-- `_delete_these_calls.sql` refuses any call that has a visit. This one is the
-- different decision that file names: it deletes the VISITS too -- and only
-- the visits. A call with anything else behind it (a spare requested or
-- consumed, feedback, a review, a field failure report, an indoor job ...)
-- is still REFUSED and named, because deleting those is not what was asked.
--
-- WHAT IT DOES, per call it accepts:
--   1. Req_VisitTable rows filed on the call are un-filed (UCN, Report UID and
--      Filed At cleared). They are the request's own answers, so they are
--      KEPT: when the request is registered again, its visit is filed again.
--   2. The call request goes back to Pending -- UCN cleared, Status = Pending,
--      Actioned By / At cleared -- so it is on Pending Registrations again.
--   3. Every visit entry (public.reports) on the call is deleted.
--   4. A machine whose INST Call names the call has it cleared.
--   5. The call is deleted from its register (and pending_registrations).
--
-- A CALL IS A QUALITY RECORD. `0049`'s `block_hard_delete` stops the
-- APPLICATION from deleting one; it lets this editor do it, and
-- `record_audit_d` records every row deleted either way.
--
-- HOW TO RUN IT (Supabase SQL editor):
--   1. Run it AS IT IS. `apply` is false: nothing changes, and the grid shows
--      each call (party, date), its visits, its request, and anything refused.
--   2. Check every row against the register.
--   3. Change `false` to `true` on the apply line and run it again.
-- ===========================================================================

create temp table if not exists _delete_calls_report (
  sort int, section text, detail text, party text, reg_date date
) on commit preserve rows;
truncate _delete_calls_report;

do $$
declare
  v_apply boolean := false;            -- <<<< SET TO true TO ACTUALLY DELETE
  v_ucns  text[]  := array[
    '26K13F0024',
    '26K13F0025',
    '26K13F0026',
    '26K13F0027'
  ];
  v_go     text[];
  v_n      bigint;
  r        record;
begin
  -- ---- what the register holds -------------------------------------------
  insert into _delete_calls_report
  select 1, 'not on the register (check the UCN)', u, '', null
    from unnest(v_ucns) u
   where not exists (select 1 from public.calls c where c.ucn = u);

  -- ---- anything behind a call OTHER than its visits and its request -------
  create temp table if not exists _dc_kids (ucn text, what text, n bigint) on commit drop;
  truncate _dc_kids;
  insert into _dc_kids
  select u.ucn, k.what, k.n
    from (select unnest(v_ucns) as ucn) u
   cross join lateral (
               select 'spare request' as what, count(*) as n from public.spare_requests t where t.ucn = u.ucn
     union all select 'spare consumed',            count(*) from public.spare_consumption t where t.ucn = u.ucn
     union all select 'spare consumed (history)',  count(*) from public.spare_consumption_history t where t.ucn = u.ucn
     union all select 'customer feedback',         count(*) from public.feedback t where t.ucn = u.ucn
     union all select 'daily call review',         count(*) from public.call_reviews t where t.ucn = u.ucn
     union all select 'report review',             count(*) from public.call_report_reviews t where t.ucn = u.ucn
     union all select 'field failure report',      count(*) from public.field_failure_reports t where t.ucn = u.ucn
     union all select 'FFR sheet update',          count(*) from public.ffr_sheet_updates t where t.ucn = u.ucn
     union all select 'indoor job',                count(*) from public.indoor_jobs t where t.ucn = u.ucn
     union all select 'vigilance change',          count(*) from public.call_vigilance_changes t where t.ucn = u.ucn
     union all select 'complaint suggestion',      count(*) from public.complaint_suggestions t where t.ucn = u.ucn
     union all select 'call history (pre-RITHI)',  count(*) from public.call_history t where t.ucn = u.ucn
     union all select 'DCCR history import',       count(*) from public.dccr_history_import t where t.ucn = u.ucn
     union all select 'installation warranty start', count(*) from public.installation_warranty_starts t where t.ucn = u.ucn
   ) k
   where k.n > 0;

  insert into _delete_calls_report
  select 2, 'REFUSED — this call has more than visits behind it',
         k.ucn || '  ·  ' || k.what || ' × ' || k.n,
         coalesce((select c.party_name from public.calls c where c.ucn = k.ucn), ''),
         (select c.reg_date from public.calls c where c.ucn = k.ucn)
    from _dc_kids k;

  select coalesce(array_agg(c.ucn), '{}') into v_go
    from public.calls c
   where c.ucn = any(v_ucns)
     and not exists (select 1 from _dc_kids k where k.ucn = c.ucn);

  -- ---- what will go (or went) ---------------------------------------------
  insert into _delete_calls_report
  select 3, case when v_apply then 'call deleted' else 'call will be deleted' end,
         c.ucn || '  ·  ' || coalesce(nullif(btrim(c.call_number), ''), '(no call number)') || '  ·  ' || coalesce(c.call_type, ''),
         coalesce(c.party_name, ''), c.reg_date
    from public.calls c where c.ucn = any(v_go);

  insert into _delete_calls_report
  select 4, case when v_apply then 'visit entry deleted' else 'visit entry will be deleted' end,
         r2.ucn || '  ·  ' || r2.uid || '  ·  ' || coalesce(r2.call_status, '') || '  ·  ' || coalesce(r2.engineer, ''),
         '', (r2.visit_at at time zone 'Asia/Kolkata')::date
    from public.reports r2 where r2.ucn = any(v_go);

  insert into _delete_calls_report
  select 5, case when v_apply then 'request put back to Pending' else 'request will go back to Pending' end,
         cr.ucn || '  ·  ' || coalesce(nullif(cr.true_key, ''), cr.unique_key, '') || '  ·  was ' || coalesce(cr.status, ''),
         coalesce(cr.party_name, ''), null
    from public.call_requests cr where cr.ucn = any(v_go);

  insert into _delete_calls_report
  select 6, case when v_apply then 'Req_VisitTable row un-filed (kept)' else 'Req_VisitTable row will be un-filed (kept)' end,
         t.ucn || '  ·  ' || t.visit_key, '', t.visit_date
    from public.req_visit_table t where t.ucn = any(v_go);

  if not v_apply or cardinality(v_go) = 0 then
    insert into _delete_calls_report values
      (0, 'mode', case when v_apply then 'APPLIED — but nothing was deletable'
                       else 'DRY RUN — nothing was changed. Check every row, then set apply = true.' end, '', null);
    return;
  end if;

  -- ---- the changes, in order ----------------------------------------------
  update public.req_visit_table set ucn = '', report_uid = '', filed_at = null
   where ucn = any(v_go);

  update public.call_requests
     set ucn = '', status = 'Pending', actioned_by = '', actioned_at = null
   where ucn = any(v_go);

  delete from public.reports where ucn = any(v_go);

  update public.sale_items set inst_call = '' where inst_call = any(v_go);

  delete from public.pending_registrations where ucn = any(v_go);
  delete from public.field_calls        where ucn = any(v_go);
  delete from public.installation_calls where ucn = any(v_go);
  delete from public.pm_calls           where ucn = any(v_go);

  -- ---- proof, read back after the changes ---------------------------------
  insert into _delete_calls_report
  select 7, 'check after apply (each should be 0)', x.what || ': ' || x.n, '', null
    from (
      select 'calls still on the register' as what, count(*) as n from public.calls where ucn = any(v_go)
      union all select 'visit entries still on these calls', count(*) from public.reports where ucn = any(v_go)
      union all select 'requests still holding these UCNs', count(*) from public.call_requests where ucn = any(v_go)
      union all select 'Req_VisitTable rows still filed on them', count(*) from public.req_visit_table where ucn = any(v_go)
    ) x;

  insert into _delete_calls_report values
    (0, 'mode', 'APPLIED — the calls below and their visit entries are deleted; their requests are Pending', '', null);
end $$;

select sort, section, detail, party, reg_date from _delete_calls_report order by sort, detail;
