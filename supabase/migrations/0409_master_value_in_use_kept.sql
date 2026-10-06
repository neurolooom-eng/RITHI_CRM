-- ===========================================================================
-- 0409 — A VALUE THAT RECORDS CARRY IS DEACTIVATED, NOT DELETED
--        (second re-review D-056, FRS-015, FRS-180.6)
--
-- Master Lists offered Delete to a holder of master.<list>.delete, and
-- masters_delete checked only the permission: a Standard Complaint carried by
-- thousands of calls could be erased, and every record kept a word no list
-- holds -- every count, filter and frequent-failure match downstream runs on
-- that word. FRS-015: a value in use SHALL be deactivated rather than deleted,
-- and the database SHALL refuse the deletion of a value any record carries.
-- Deactivate already exists on the screen (masters.active): the value stays on
-- every record and stops being offered.
--
-- WHICH RECORDS CARRY WHICH LIST -- read from the columns that hold each one's
-- values, compared trimmed and case-insensitive:
--   calltype       call_requests, field/installation/pm calls, feedback,
--                  field_failure_reports, pending_registrations  .call_type
--   complaint      call_requests, field/installation/pm calls, indoor_jobs
--                  .standard_complaint
--   pendingreason  reports.pending_reason, indoor_jobs.call_pending_reason
--   cancelreason   call_requests, field/installation/pm calls .cancel_reason
--   dccrgrouping   call_reviews.complaint_grouping
--   rootcause      call_reviews.root_cause_keyword
--   department     user_directory.department
--   feedbackrating the answers of feedback (a rating is an answer's value)
--   orapproval     nothing reads it today, so nothing carries it
-- A value is "carried" only where no OTHER row of the same list holds the same
-- word: deleting one of two duplicates (a complaint listed for two products)
-- leaves the word on the list, so nothing is orphaned and it is allowed.
-- master_value_uses() COUNTS AS ITS OWNER: run as the caller, row-level
-- security would hide the records the person deleting cannot see, the count
-- would read low and a value in use elsewhere would be deleted. It returns a
-- number and nothing else.
-- Not stopped: a connection with no session and a function running as its
-- owner. In the masters module, last.
-- ===========================================================================

create or replace function public.master_value_uses(p_name text, p_value text)
returns bigint language plpgsql stable security definer set search_path = public as $$
declare
  v    text := lower(btrim(coalesce(p_value, '')));
  n    bigint := 0;
  c    bigint;
  pair text[];
  cols text[][];
begin
  if v = '' then return 0; end if;
  cols := case lower(btrim(coalesce(p_name, '')))
    when 'calltype' then array[['call_requests','call_type'], ['field_calls','call_type'], ['installation_calls','call_type'],
                               ['pm_calls','call_type'], ['feedback','call_type'], ['field_failure_reports','call_type'],
                               ['pending_registrations','call_type']]
    when 'complaint' then array[['call_requests','standard_complaint'], ['field_calls','standard_complaint'],
                                ['installation_calls','standard_complaint'], ['pm_calls','standard_complaint'],
                                ['indoor_jobs','standard_complaint']]
    when 'pendingreason' then array[['reports','pending_reason'], ['indoor_jobs','call_pending_reason']]
    when 'cancelreason' then array[['call_requests','cancel_reason'], ['field_calls','cancel_reason'],
                                   ['installation_calls','cancel_reason'], ['pm_calls','cancel_reason']]
    when 'dccrgrouping' then array[['call_reviews','complaint_grouping']]
    when 'rootcause' then array[['call_reviews','root_cause_keyword']]
    when 'department' then array[['user_directory','department']]
    else null end;
  if cols is not null then
    foreach pair slice 1 in array cols loop
      if to_regclass('public.' || pair[1]) is not null
         and exists (select 1 from information_schema.columns
                      where table_schema = 'public' and table_name = pair[1] and column_name = pair[2]) then
        execute format('select count(*) from public.%I where lower(btrim(%I)) = $1', pair[1], pair[2]) into c using v;
        n := n + c;
      end if;
    end loop;
  end if;
  if lower(btrim(coalesce(p_name, ''))) = 'feedbackrating' and to_regclass('public.feedback') is not null then
    select count(*) into c
      from public.feedback f
     where jsonb_typeof(f.answers) = 'object'
       and exists (select 1 from jsonb_each_text(f.answers) a where lower(btrim(a.value)) = v);
    n := n + c;
  end if;
  return n;
end $$;
revoke execute on function public.master_value_uses(text, text) from public, anon;
grant execute on function public.master_value_uses(text, text) to authenticated;

create or replace function public.master_value_in_use_kept()
returns trigger language plpgsql security invoker set search_path = public as $$
declare n bigint;
begin
  if auth.uid() is null then return old; end if;
  if current_user <> 'authenticated' then return old; end if;
  -- Another row of the same list still holds the word: nothing is orphaned.
  if exists (select 1 from public.masters m
              where m.name = old.name and m.id <> old.id
                and lower(btrim(m.value)) = lower(btrim(coalesce(old.value, '')))) then
    return old;
  end if;
  n := public.master_value_uses(old.name, old.value);
  if n > 0 then
    raise exception '"%" is on % record(s) and cannot be deleted -- deactivate it instead, so it stays on those records and is no longer offered',
      old.value, n using errcode = '23514';
  end if;
  return old;
end $$;
revoke execute on function public.master_value_in_use_kept() from public, anon, authenticated;
drop trigger if exists master_value_in_use_kept on public.masters;
create trigger master_value_in_use_kept
  before delete on public.masters
  for each row execute function public.master_value_in_use_kept();
