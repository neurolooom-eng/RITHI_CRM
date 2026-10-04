-- ===========================================================================
-- 0334 — THE INDOOR SERVICE TEST DATA, EMPTIED ONCE
--
-- The user, 2026-10-04: "Empty all data in Indoor" -- "Indoor is in Testing
-- Phase, so deleting is not a problem." Asked: no backup; the numbering
-- restarts; and the visits and spares an Indoor DC approval filed on calls go
-- too, each call's status falling back to its previous visit.
--
-- What goes, in this order, ONCE (one_time_fixes_done '0334_indoor_emptied'):
--   1. spare_consumption lines an Indoor DC approval booked. They carry no
--      Indoor marker, but approve_indoor_dc() writes them in the SAME
--      transaction that stamps the job's visit_filed_at, so their created_at
--      is that exact instant -- matched on the job's UCN AND that instant, so
--      no other spare on the call is touched. Their hand stock returns.
--   2. the visits those approvals filed (reports.uid = indoor_jobs.visit_uid);
--      sync_call_last_visit() puts each call back on its previous visit.
--   3. every Indoor DC line, DC and release ticket; every pre-delivery test,
--      check, harvested part, accessory and job.
--   4. the job and IDC number counters, so the next of each is the first.
-- no_hard_delete is lifted BY NAME on the four tables that carry it, for these
-- statements only, and put back before the block ends. Files in Drive stay.
-- ===========================================================================

do $$
declare n_sp integer := 0; n_vis integer := 0; n_jobs integer := 0; n_dcs integer := 0;
begin
  if to_regclass('public.indoor_jobs') is null then
    raise notice '0334: no Indoor tables here -- nothing to empty';
    return;
  end if;
  -- Created here when absent: on a fresh build this module runs before the one
  -- that first makes it, and a bare reference would not even plan.
  create table if not exists public.one_time_fixes_done (
    name text primary key, applied_at timestamptz not null default now(), detail text);
  alter table public.one_time_fixes_done enable row level security;
  revoke all on public.one_time_fixes_done from anon, authenticated;
  if exists (select 1 from public.one_time_fixes_done where name = '0334_indoor_emptied') then
    raise notice '0334: the Indoor test data was emptied before -- not touched again';
    return;
  end if;
  -- Nothing to empty (a fresh build): record it and stop, so the guards on
  -- tables later modules create are not reached for nothing.
  if not exists (select 1 from public.indoor_jobs) and not exists (select 1 from public.indoor_dcs) then
    delete from public.indoor_job_counters;
    delete from public.indoor_dc_counters;
    insert into public.one_time_fixes_done (name, detail) values ('0334_indoor_emptied', 'nothing to empty');
    raise notice '0334: no Indoor data -- nothing to empty';
    return;
  end if;

  if exists (select 1 from pg_trigger where tgname = 'no_hard_delete' and tgrelid = 'public.spare_consumption'::regclass) then
    alter table public.spare_consumption disable trigger no_hard_delete;
  end if;
  delete from public.spare_consumption c
   using public.indoor_jobs j
   where j.visit_filed_at is not null
     and btrim(c.ucn) = btrim(j.ucn)
     and c.created_at = j.visit_filed_at;
  get diagnostics n_sp = row_count;
  if exists (select 1 from pg_trigger where tgname = 'no_hard_delete' and tgrelid = 'public.spare_consumption'::regclass) then
    alter table public.spare_consumption enable trigger no_hard_delete;
  end if;

  if exists (select 1 from pg_trigger where tgname = 'no_hard_delete' and tgrelid = 'public.reports'::regclass) then
    alter table public.reports disable trigger no_hard_delete;
  end if;
  delete from public.reports r
   using public.indoor_jobs j
   where j.visit_uid is not null and r.uid = j.visit_uid;
  get diagnostics n_vis = row_count;
  if exists (select 1 from pg_trigger where tgname = 'no_hard_delete' and tgrelid = 'public.reports'::regclass) then
    alter table public.reports enable trigger no_hard_delete;
  end if;

  select count(*) into n_dcs from public.indoor_dcs;
  if exists (select 1 from pg_trigger where tgname = 'no_hard_delete' and tgrelid = 'public.indoor_dc_lines'::regclass) then
    alter table public.indoor_dc_lines disable trigger no_hard_delete;
  end if;
  if exists (select 1 from pg_trigger where tgname = 'no_hard_delete' and tgrelid = 'public.indoor_dcs'::regclass) then
    alter table public.indoor_dcs disable trigger no_hard_delete;
  end if;
  delete from public.indoor_dc_lines;
  delete from public.indoor_dcs;
  if exists (select 1 from pg_trigger where tgname = 'no_hard_delete' and tgrelid = 'public.indoor_dc_lines'::regclass) then
    alter table public.indoor_dc_lines enable trigger no_hard_delete;
  end if;
  if exists (select 1 from pg_trigger where tgname = 'no_hard_delete' and tgrelid = 'public.indoor_dcs'::regclass) then
    alter table public.indoor_dcs enable trigger no_hard_delete;
  end if;
  if to_regclass('public.indoor_dc_release_tickets') is not null then
    delete from public.indoor_dc_release_tickets;
  end if;

  select count(*) into n_jobs from public.indoor_jobs;
  delete from public.indoor_pdt;
  delete from public.indoor_job_checks;
  delete from public.indoor_job_parts;
  delete from public.indoor_job_accessories;
  delete from public.indoor_jobs;

  delete from public.indoor_job_counters;
  delete from public.indoor_dc_counters;

  insert into public.one_time_fixes_done (name, detail)
  values ('0334_indoor_emptied',
          format('%s job(s), %s DC(s), %s visit(s) and %s spare line(s) removed; numbering restarted', n_jobs, n_dcs, n_vis, n_sp));
  raise notice '0334: % Indoor job(s), % Indoor DC(s), % visit(s) and % spare line(s) filed by DC approvals removed; job and IDC numbering restarted',
    n_jobs, n_dcs, n_vis, n_sp;
end $$;
