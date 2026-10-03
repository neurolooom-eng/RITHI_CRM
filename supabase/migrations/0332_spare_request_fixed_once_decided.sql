-- ===========================================================================
-- 0332 — A SPARE REQUEST IS WHAT WAS APPROVED  (second re-review, 2026-10-03:
--        D-120, D-121)
--
-- D-120  The parts rule in spare_request_lines_guard() exempts the requester
--        at EVERY stage, though 0016 says "the part and quantity are the
--        request; they are fixed once submitted". Measured: a line at Stores
--        (approved for 1 x GP-1) was changed by its requester to 40 of another
--        part, and Stores booked out 40.
-- D-121  spare_request_engineer_guard() refused a change of engineer only AFTER
--        dispatch, so before it a plain UPDATE moved the request to anybody,
--        with no key, no reason and nothing in the engineer log -- the path
--        reassign_spare_request() exists to be. And item_status / req_type,
--        which decide whether Commercial and NSM must approve, could be changed
--        at will: an RM turned an AMC request into WGP and it went to Stores
--        with Commercial auto-approved.
--
-- WHAT KEEPS WORKING -- read from the code, not assumed:
--   * The screens never change a line's part or quantity: every line write is an
--     approval, a rejection, a drop or a receipt (SpareRequests.tsx), and no
--     database function changes qty (partial dispatch uses dispatched_qty). The
--     requester may still change part and quantity while the RM has not decided.
--   * A part RENAME (rename_part, its ticket) still carries every line, as the
--     big guard already allows; that test is repeated here word for word.
--   * A change of engineer still goes through reassign_spare_request() (its
--     rithi.reassigning ticket) and a User Master rename (0259) still carries the
--     name. No screen updates a request's engineer any other way
--     (updateSpareRequest has no caller).
--   * Item Status FOLLOWS THE CALL (0268, the user's ask): automatically when
--     the call changes, and from the Refresh button. Both write the CALL'S value,
--     so a change to the call's value is accepted; any other value is DISCARDED
--     (the old one kept), never refused, so nothing honest fails. On a new
--     request the call's value is taken -- the form copies it anyway.
--   * The importers (bulk.upload / import.panel) and writes with no signed-in
--     user are trusted with history, as in 0331.
--
-- A SEPARATE TRIGGER, NOT A REWRITE: spare_request_lines_guard() has been
-- rewritten from an old body before and lost three rules (0210 -> 0217), so it
-- is left exactly as it is; these rules sit beside it.
-- ===========================================================================

-- ---- D-120: part and quantity are fixed once the RM has decided --------------
create or replace function public.spare_line_fixed_once_decided()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.part is not distinct from old.part and new.qty is not distinct from old.qty then
    return new;
  end if;
  if public.stock_import_allowed() then return new; end if;
  if coalesce(btrim(old.rm_approval), 'Pending') in ('', 'Pending') then
    return new;                                   -- not decided yet: the requester's rule (the big guard) applies
  end if;
  -- A PART RENAME carrying the record (0310's test, verbatim).
  if new.qty is not distinct from old.qty
     and exists (select 1 from public.part_rename_ticket t
                  where t.txid = txid_current()
                    and t.old_key = lower(btrim(old.part))
                    and t.new_detail = new.part) then
    return new;
  end if;
  raise exception 'Spare % has been % by the RM: its part and quantity are what was approved and are not changed afterwards -- raise a new request instead',
    coalesce(nullif(old.line_uid, ''), old.id::text), lower(btrim(old.rm_approval))
    using errcode = '42501';
end $$;
revoke execute on function public.spare_line_fixed_once_decided() from public, anon, authenticated;
drop trigger if exists spare_line_fixed_once_decided on public.spare_request_lines;
create trigger spare_line_fixed_once_decided before update on public.spare_request_lines
  for each row execute function public.spare_line_fixed_once_decided();

-- ---- D-121: the engineer moves only by Change engineer; the cover follows the call
-- Named spare_requests_z… so it runs after spare_requests_cover_code has spelled
-- the value, and after spare_request_engineer_guard (which still says the clearer
-- thing once the parts have gone out).
create or replace function public.spare_requests_zz_header_rules()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_call_status text; v_has_call boolean := false;
begin
  if public.stock_import_allowed() then return new; end if;

  if btrim(coalesce(new.ucn, '')) <> '' then
    select true, coalesce(c.item_status, '') into v_has_call, v_call_status
      from public.calls c where c.ucn = btrim(new.ucn) limit 1;
  end if;

  if tg_op = 'INSERT' then
    -- FRS-146.5: copied from the call, not chosen. The form sends the call's own
    -- value, so for an honest client this changes nothing.
    if coalesce(v_has_call, false) then new.item_status := v_call_status; end if;
    return new;
  end if;

  -- The engineer: only through reassign_spare_request() or a User Master rename.
  if (lower(btrim(coalesce(new.engineer, ''))) is distinct from lower(btrim(coalesce(old.engineer, '')))
      or lower(btrim(coalesce(new.engineer_email, ''))) is distinct from lower(btrim(coalesce(old.engineer_email, ''))))
     and coalesce(current_setting('rithi.reassigning', true), '') is distinct from new.uid
     and not (lower(btrim(coalesce(new.engineer_email, ''))) is not distinct from lower(btrim(coalesce(old.engineer_email, '')))
              and public.engineer_rename_in_progress(old.engineer, new.engineer)) then
    raise exception 'The engineer on % is changed with "Change engineer", which needs its key and a reason and keeps the change on record',
      coalesce(nullif(new.or_no, ''), new.uid)
      using errcode = '42501';
  end if;

  -- The cover follows the call (0268); anything else is kept as it was.
  if public.cover_code(coalesce(new.item_status, '')) is distinct from public.cover_code(coalesce(old.item_status, ''))
     and not (coalesce(v_has_call, false)
              and public.cover_code(coalesce(new.item_status, '')) is not distinct from public.cover_code(v_call_status)) then
    new.item_status := old.item_status;
  end if;
  -- The request type is what was raised.
  if new.req_type is distinct from old.req_type then
    new.req_type := old.req_type;
  end if;
  return new;
end $$;
revoke execute on function public.spare_requests_zz_header_rules() from public, anon, authenticated;
drop trigger if exists spare_requests_zz_header_rules on public.spare_requests;
create trigger spare_requests_zz_header_rules before insert or update on public.spare_requests
  for each row execute function public.spare_requests_zz_header_rules();
