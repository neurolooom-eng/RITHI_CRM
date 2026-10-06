-- ===========================================================================
-- 0394  A HISTORICAL CALL LOAD SENDS NO "CALL ALLOTTED" NOTIFICATION (2026-10-06).
--
-- The user, asked whether loading the old DCCR register's calls should notify
-- each engineer of every call: "No notifications". notify_call_allotted() is
-- restated from the database (0262's body) with one early return, taken only
-- when the transaction-local setting rithi.silent_import is 'on' -- which
-- dccr_history_apply() (0395) sets for the length of one row and nothing
-- else does. Every live allotment notifies exactly as before.
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.notify_call_allotted()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_uid uuid;
begin
  -- A HISTORICAL LOAD NOTIFIES NOBODY (0394, the user 2026-10-06: "No
  -- notifications"). Set, transaction-local, by dccr_history_apply() alone.
  if coalesce(current_setting('rithi.silent_import', true), '') = 'on' then return new; end if;
  if coalesce(new.allocated_to, '') = '' then return new; end if;
  if tg_op = 'UPDATE' and new.allocated_to is not distinct from old.allocated_to then return new; end if;
  -- A USER MASTER RENAME (0259) is not an allotment: the call was already this
  -- person's. Without this, correcting a name sent them one notice per call.
  if tg_op = 'UPDATE' and public.engineer_rename_in_progress(old.allocated_to, new.allocated_to) then return new; end if;
  v_uid := public.notify_resolve_uid(new.allocated_to_email, new.allocated_to);
  if v_uid is null then return new; end if;
  insert into public.notifications (recipient_id, recipient_email, kind, title, body, link)
  values (v_uid, coalesce(new.allocated_to_email, ''), 'call_allotted',
          'Call allotted to you',
          concat_ws(' · ', nullif(coalesce(new.ucn, ''), ''), nullif(coalesce(new.party_name, ''), ''), nullif(coalesce(new.product_name, ''), '')),
          '/' || case public.call_table_for(new.call_type)
                   when 'installation' then 'installations' when 'pm' then 'pm-calls' else 'field-calls' end);
  return new;
end $function$;
