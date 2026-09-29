-- ===========================================================================
-- A SPARE REQUEST'S COMPLAINT AND ITEM STATUS FOLLOW ITS CALL.
--
--   The user, 2026-09-30: "Add a Provision in Spare Request Register to update
--   the Complaint, Item Status field. It should inherit as is from the Call
--   register." Asked, they chose: ANY STAGE, and all three of -- a button on
--   one request, a bulk tick-and-apply, and AUTOMATICALLY when the call changes.
--
-- THE SAME RULE THE FORM USES WHEN THE REQUEST IS RAISED (SpareRequests.tsx
-- callToPicked): Complaint = the call's Complaint Reported, or its Standard
-- Complaint where that is blank; Item Status = the call's, as is (the request's
-- own cover-code trigger, 0208, then spells it WGP / OGP / CMC / AMC as it
-- always has). One function, spare_request_fields_from_call(), holds that rule
-- so the trigger and the button cannot drift apart.
--
-- WHAT IT DOES NOT CHANGE: the approval ROUTE. Whether a line needs Commercial
-- and NSM is STAMPED on each line when the RM approves (0210) and the stage is
-- read from those stamps, so refreshing Item Status on a request already past
-- RM approval changes what the request SAYS, not which approvals it went
-- through. A request still awaiting RM is routed on the refreshed value.
--
-- WHO: the automatic path runs with the owner's rights (whoever edits a call
-- may not have write access to spare requests, and the request must still
-- follow). The button and the bulk action run as the CALLER, through the
-- existing sr_update policy -- the approvers and the requester -- so nobody
-- gains the right to write a request they could not write before.
-- ===========================================================================

-- ---- the rule -------------------------------------------------------------------
create or replace function public.spare_request_complaint_from(p_reported text, p_standard text)
returns text language sql immutable as $$
  select coalesce(nullif(btrim(coalesce(p_reported, '')), ''), btrim(coalesce(p_standard, '')), '')
$$;

-- ---- automatically, when the call changes ---------------------------------------
create or replace function public.spare_requests_follow_call()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_complaint text;
begin
  if btrim(coalesce(new.ucn, '')) = '' then return null; end if;
  if new.complaint_reported is not distinct from old.complaint_reported
     and new.standard_complaint is not distinct from old.standard_complaint
     and new.item_status is not distinct from old.item_status then
    return null;
  end if;
  v_complaint := public.spare_request_complaint_from(new.complaint_reported, new.standard_complaint);
  update public.spare_requests r
     set complaint = v_complaint,
         item_status = coalesce(new.item_status, '')
   where r.ucn = new.ucn
     and (r.complaint is distinct from v_complaint
          or public.cover_code(coalesce(r.item_status, '')) is distinct from public.cover_code(coalesce(new.item_status, '')));
  return null;
end $$;
revoke execute on function public.spare_requests_follow_call() from public, anon, authenticated;

do $$
declare t text;
begin
  foreach t in array array['field_calls', 'installation_calls', 'pm_calls'] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop trigger if exists spare_requests_follow_call on public.%I', t);
      execute format(
        'create trigger spare_requests_follow_call after update of complaint_reported, standard_complaint, item_status '
        || 'on public.%I for each row execute function public.spare_requests_follow_call()', t);
    end if;
  end loop;
end $$;

-- ---- the button and the bulk action -------------------------------------------
-- INVOKER, deliberately: the rows it may touch are the rows sr_update lets the
-- caller touch, and the calls it reads are the calls the caller may see. It
-- returns how many requests changed, so the screen can say so.
create or replace function public.refresh_spare_requests_from_call(p_uids text[])
returns integer language plpgsql security invoker set search_path = public as $$
declare n integer;
begin
  with src as (
    select r.uid,
           public.spare_request_complaint_from(c.complaint_reported, c.standard_complaint) as complaint,
           coalesce(c.item_status, '') as item_status
      from public.spare_requests r
      join public.calls c on c.ucn = r.ucn
     where r.uid = any(p_uids) and btrim(coalesce(r.ucn, '')) <> ''
  )
  update public.spare_requests r
     set complaint = s.complaint, item_status = s.item_status
    from src s
   where r.uid = s.uid
     and (r.complaint is distinct from s.complaint
          or public.cover_code(coalesce(r.item_status, '')) is distinct from public.cover_code(s.item_status));
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.refresh_spare_requests_from_call(text[]) from public, anon;
grant execute on function public.refresh_spare_requests_from_call(text[]) to authenticated;
