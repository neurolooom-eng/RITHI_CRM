-- ===========================================================================
-- 0393 — WHO APPROVED, DISPATCHED OR RECEIVED A SPARE IS THE SESSION, NOT
--        WHATEVER THE SCREEN SENT (second re-review D-041)
--
-- buildPatch() (spareflow.ts) wrote rm_by / commercial_by / nsm_by from the
-- screen's own actor string; decide_spare_lines() takes coalesce(p_actor, ...)
-- preferring the caller's; receive_spare_shipments() writes received_by from
-- p_actor; dispatch_spare_lines() writes dispatched_by from p_actor. No trigger
-- stamped any of them -- the fault 0211 fixed for spare_dispatches.dispatched_by
-- after the Delivery Challan named the wrong person, still standing on the
-- five names the approval trail SHOWS (the login was recoverable from
-- sys_updated_by, 0244; what the reader is shown was not attested).
--
-- Now, whenever a signed-in write sets or changes one of rm_by, commercial_by,
-- nsm_by, dispatched_by or received_by on a spare line, the database writes the
-- signed-in person's name (my_display_name(), the name 0211 stamps) instead of
-- the value sent -- DISCARDED, not refused, the 0211 rule: refusing makes an
-- honest client fail, discarding makes a buggy one harmless. Not changed:
--   * a value cleared to blank (an approval taken back keeps that meaning);
--   * a User Master rename carrying the name (engineer_rename_in_progress());
--   * an import (bulk.upload / import.panel) and a connection with no session,
--     which load history as it was;
--   * "Auto-Approved", which writes no name and so is not touched.
-- In the spare_requests module, before its replay tail.
-- ===========================================================================

create or replace function public.spare_line_people_from_session()
returns trigger language plpgsql security definer set search_path = public as $$
declare me text := public.my_display_name();
begin
  if me is null then return new; end if;                                   -- no session
  if public.has_perm('bulk.upload') or public.has_perm('import.panel') then return new; end if;

  if tg_op = 'INSERT' then
    if nullif(btrim(coalesce(new.rm_by, '')), '') is not null then new.rm_by := me; end if;
    if nullif(btrim(coalesce(new.commercial_by, '')), '') is not null then new.commercial_by := me; end if;
    if nullif(btrim(coalesce(new.nsm_by, '')), '') is not null then new.nsm_by := me; end if;
    if nullif(btrim(coalesce(new.dispatched_by, '')), '') is not null then new.dispatched_by := me; end if;
    if nullif(btrim(coalesce(new.received_by, '')), '') is not null then new.received_by := me; end if;
    return new;
  end if;

  if new.rm_by is distinct from old.rm_by and nullif(btrim(coalesce(new.rm_by, '')), '') is not null
     and not public.engineer_rename_in_progress(old.rm_by, new.rm_by) then
    new.rm_by := me;
  end if;
  if new.commercial_by is distinct from old.commercial_by and nullif(btrim(coalesce(new.commercial_by, '')), '') is not null
     and not public.engineer_rename_in_progress(old.commercial_by, new.commercial_by) then
    new.commercial_by := me;
  end if;
  if new.nsm_by is distinct from old.nsm_by and nullif(btrim(coalesce(new.nsm_by, '')), '') is not null
     and not public.engineer_rename_in_progress(old.nsm_by, new.nsm_by) then
    new.nsm_by := me;
  end if;
  if new.dispatched_by is distinct from old.dispatched_by and nullif(btrim(coalesce(new.dispatched_by, '')), '') is not null
     and not public.engineer_rename_in_progress(old.dispatched_by, new.dispatched_by) then
    new.dispatched_by := me;
  end if;
  if new.received_by is distinct from old.received_by and nullif(btrim(coalesce(new.received_by, '')), '') is not null
     and not public.engineer_rename_in_progress(old.received_by, new.received_by) then
    new.received_by := me;
  end if;
  return new;
end $$;
revoke execute on function public.spare_line_people_from_session() from public, anon, authenticated;
drop trigger if exists zzy_spare_line_people_from_session on public.spare_request_lines;
create trigger zzy_spare_line_people_from_session
  before insert or update on public.spare_request_lines
  for each row execute function public.spare_line_people_from_session();
