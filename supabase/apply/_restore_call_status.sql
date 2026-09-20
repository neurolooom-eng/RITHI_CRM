-- ===========================================================================
-- RESTORE THE CALL STATUSES THAT WENT BACK TO UNATTENDED. Run it once.
--
-- IT DOES THE REPAIR AND THEN REPORTS WHAT IT DID, in one run. It is safe to
-- run twice: the second run finds nothing left to do.
--
-- WHAT WENT WRONG. 0032 ends with a BARE statement -- not inside a function --
-- so it re-executed every time `call_requests.sql` was applied:
--     update public.calls set last_status = '', last_visit_at = null
--      where ... and not exists (select 1 from public.reports where ucn = c.ucn);
-- 0109 (close_call) made its premise false four months later: a call could be
-- Solved with no visit ON PURPOSE. Re-running the bundle un-solved every one.
-- Reproduced exactly on a copy before this was written. 0032 is guarded now.
--
-- IT ONLY EVER TOUCHES A CALL THAT IS BLANK TODAY AND HAS NO VISIT, so it
-- cannot overwrite a status the register worked out for itself, and it cannot
-- reach a call that was legitimately never attended -- those have no evidence
-- and are left exactly as they are.
--
-- TWO SOURCES OF EVIDENCE, best first:
--
--   1. THE CALL'S OWN IMPORTED ROW. The call uploads are `extraInto: 'extra'`,
--      so every heading the file carried that this system has no column for is
--      still on the row under its ORIGINAL SPREADSHEET NAME. If the export
--      carried a call status, it is still there and it is the complete record
--      -- better than any trail, because it predates all of this.
--
--   2. THE AUDIT TRAIL, for calls closed with the old "Close call" button,
--      which wrote `calls.close` with the UCN. PARTIAL BY CONSTRUCTION: the
--      trail keeps SEVEN DAYS (0033) and the button existed 5-15 September, so
--      anything closed before about the 14th has already been purged.
--
-- WHAT IT WILL NOT DO: invent a status. A call with neither source keeps the
-- blank, and section C lists how many those are. If that number matters, a
-- POINT-IN-TIME RESTORE of the project to just before the bundle was run is
-- the only source that has all of it.
-- ===========================================================================
do $$
declare
  v_extra int := 0;
  v_audit int := 0;
  v_key   text;
begin
  -- 1. WHICH HEADING HOLDS THE STATUS. Discovered rather than assumed: the
  --    export's own spelling is whatever it was, so match on the squashed name
  --    and take the one that actually carries call-status-shaped values.
  select k into v_key
    from (
      select e.key as k, count(*) as n
        from public.field_calls c, jsonb_each_text(coalesce(c.extra, '{}'::jsonb)) e
       where regexp_replace(lower(e.key), '[^a-z]', '', 'g') in
             ('callstatus', 'status', 'callclosestatus', 'closestatus', 'currentstatus')
         and (e.value ilike 'solved%' or e.value ilike 'unsolved%' or e.value ilike 'closed%')
       group by e.key
       order by count(*) desc
       limit 1
    ) t;

  if v_key is not null then
    update public.field_calls c
       set last_status = btrim(c.extra ->> v_key)
     where coalesce(c.last_status, '') = ''
       and coalesce(btrim(c.extra ->> v_key), '') <> ''
       and not exists (select 1 from public.reports r where r.ucn = c.ucn);
    get diagnostics v_extra = row_count;

    update public.installation_calls c
       set last_status = btrim(c.extra ->> v_key)
     where coalesce(c.last_status, '') = ''
       and coalesce(btrim(c.extra ->> v_key), '') <> ''
       and not exists (select 1 from public.reports r where r.ucn = c.ucn);
    get diagnostics v_audit = row_count;  -- reused below; added to v_extra now
    v_extra := v_extra + v_audit;

    update public.pm_calls c
       set last_status = btrim(c.extra ->> v_key)
     where coalesce(c.last_status, '') = ''
       and coalesce(btrim(c.extra ->> v_key), '') <> ''
       and not exists (select 1 from public.reports r where r.ucn = c.ucn);
    get diagnostics v_audit = row_count;
    v_extra := v_extra + v_audit;
    v_audit := 0;
  end if;

  -- 2. THE AUDIT TRAIL, for whatever the imported row could not answer.
  --    Plain 'Solved' and not "Solved - Report Completed": that would claim a
  --    report nobody wrote, which is the mistake 0109 was careful not to make.
  update public.field_calls c set last_status = 'Solved'
   where coalesce(c.last_status, '') = ''
     and not exists (select 1 from public.reports r where r.ucn = c.ucn)
     and exists (select 1 from public.audit_log a
                  where a.action = 'calls.close' and a.target = c.ucn);
  get diagnostics v_audit = row_count;

  raise notice 'restored % call(s) from the imported row (heading: %), % from the audit trail',
               v_extra, coalesce(v_key, 'none found'), v_audit;

  insert into public.app_settings (key, value)
  values ('call_status_restored_after_0032', to_jsonb(now()::text))
      on conflict (key) do update set value = excluded.value, updated_at = now();
end $$;

-- ---- what it did, and what is left ---------------------------------------
select 'A. calls now Solved with no visit (restored, plus any already there)' as clause,
       count(*)::text as finding
  from public.calls where coalesce(open_state,'') like 'Solved%'
   and not exists (select 1 from public.reports r where r.ucn = calls.ucn)
union all
select 'B. still Unattended with no visit and no evidence to restore from',
       count(*)::text
  from public.calls c
 where coalesce(c.last_status, '') = ''
   and not exists (select 1 from public.reports r where r.ucn = c.ucn)
union all
select 'C. of those, how many are recent enough that a visit is simply missing',
       count(*)::text
  from public.calls c
 where coalesce(c.last_status, '') = ''
   and c.reg_date >= current_date - 60
   and not exists (select 1 from public.reports r where r.ucn = c.ucn)
union all
select 'D. the heading the imported rows used for status',
       coalesce((select e.key
                   from public.field_calls fc, jsonb_each_text(coalesce(fc.extra,'{}'::jsonb)) e
                  where regexp_replace(lower(e.key), '[^a-z]', '', 'g') in
                        ('callstatus','status','callclosestatus','closestatus','currentstatus')
                    and (e.value ilike 'solved%' or e.value ilike 'unsolved%')
                  limit 1), '(none — the import carried no status column)');
