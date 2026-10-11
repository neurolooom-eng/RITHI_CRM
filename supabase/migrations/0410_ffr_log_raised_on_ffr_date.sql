-- ===========================================================================
-- 0410 -- AN IMPORTED REPORT WAS RAISED ON ITS FFR DATE, NOT ON THE DAY IT WAS
-- LOADED (the user, 2026-10-11: "The FFR Date in the Log has to match with
-- Actual FFR Date, it is showing the import date").
--
-- ffr_history_created() (0174) writes the "Report raised" entry of the update
-- log at now(). For a report raised in RITHI that is the truth. For a report
-- LOADED from the old register it is the moment of the load: measured on the
-- live project, all 560 imported reports read "raised" on 14-Sep-2026 (the
-- load), none on its FFR Date -- so the log of a 2020 report began in 2026,
-- after the 2020 updates loaded from the old update sheet (0409).
--
-- NOW: a report carrying imported_from is logged as raised on its FFR DATE
-- (midnight, India time); the load time is KEPT on the entry as
-- changes._loaded_at, and the Update log shows it as "loaded into RITHI on",
-- so nothing the old timestamp said is lost. A report raised in RITHI is
-- unchanged -- logged at the moment it was raised (the 44 such reports read
-- their raising time today, and that is what they were).
--
-- ONCE, the existing entries: every imported report's "Report raised" entry
-- not already on its FFR Date moves to it, its old time kept the same way.
-- Idempotent -- an entry already on its FFR Date is skipped.
--
-- The log is append-only to everybody through the API (0174: no update
-- policy); this correction is the migration's, and touches only the date of
-- the one system-written entry per report.
-- ===========================================================================

create or replace function public.ffr_history_created()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_imported boolean := coalesce(btrim(new.imported_from), '') <> '';
  v_changes  jsonb := jsonb_build_object('ffr_date', jsonb_build_object('from', null, 'to', new.ffr_date),
                                         'ucn',      jsonb_build_object('from', null, 'to', new.ucn));
begin
  -- 0410: a report loaded from the old register was raised on its FFR Date;
  -- when it was loaded is kept beside it.
  if v_imported and new.ffr_date is not null then
    insert into public.ffr_history (ffr_id, ffr_no, changed_at, changed_by, changed_by_name, action, changes)
    values (new.id, coalesce(new.ffr_no, ''), (new.ffr_date::timestamp at time zone 'Asia/Kolkata'),
            new.raised_by, coalesce(new.raised_by_name, ''), 'create',
            v_changes || jsonb_build_object('_loaded_at', now()));
  else
    insert into public.ffr_history (ffr_id, ffr_no, changed_by, changed_by_name, action, changes)
    values (new.id, coalesce(new.ffr_no, ''), new.raised_by, coalesce(new.raised_by_name, ''), 'create', v_changes);
  end if;
  return null;
end $$;

do $once$
declare n integer;
begin
  update public.ffr_history h
     set changes    = h.changes || jsonb_build_object('_loaded_at', coalesce(h.changes -> '_loaded_at', to_jsonb(h.changed_at))),
         changed_at = (f.ffr_date::timestamp at time zone 'Asia/Kolkata')
    from public.field_failure_reports f
   where h.ffr_id = f.id
     and h.action = 'create'
     and coalesce(btrim(f.imported_from), '') <> ''
     and f.ffr_date is not null
     and h.changed_at is distinct from (f.ffr_date::timestamp at time zone 'Asia/Kolkata');
  get diagnostics n = row_count;
  raise notice '0410: % imported report(s) now read raised on their FFR Date', n;
end $once$;
