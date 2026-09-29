-- ===========================================================================
-- A RENAME DOES NOT NOTIFY "CALL ALLOTTED TO YOU" (0259, finding 23).
--
-- `notify_call_allotted` (0045/0054) writes a notification whenever a call's
-- allottee changes. 0259 rewrites the allottee on every call filed under a
-- renamed person's old name, so without this a spelling correction sent them
-- one "Call allotted to you" per call they already had. Recognised by the
-- ticket 0259 files for its own transaction. Body taken from the database.
-- ===========================================================================

create or replace function public.notify_call_allotted()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
declare v_uid uuid;
begin
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
end $$;
