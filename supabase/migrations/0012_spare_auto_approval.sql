-- ===========================================================================
-- Fix: the RM's approval of a non-AMC/OGP item is refused by the stage guard.
--
-- The business rule is that Commercial and NSM only review AMC or OGP items;
-- for anything else they auto-approve. The app implements that by writing
-- commercial_approval / nsm_approval = 'Auto-Approved' in the SAME update that
-- records the RM's approval (src/lib/spareflow.ts, buildPatch).
--
-- 0008_rbac_enforcement.sql's guard sees those columns change and demands
-- spare.approve_commercial / spare.approve_nsm, which an RM does not hold — so
-- the whole update is rejected and the common path cannot be approved at all.
--
-- The guard is reissued here allowing exactly that case: the auto-approval
-- literal, written by someone who may approve at the RM stage, on an item that
-- is not AMC or OGP. A manual 'Approved' still needs the stage's own action.
-- ===========================================================================

create or replace function public.spare_needs_review(item_status text)
returns boolean language sql immutable as $$
  select coalesce(trim(item_status), '') ~* '^(amc|ogp)$';
$$;
grant execute on function public.spare_needs_review(text) to authenticated;

create or replace function public.spare_requests_stage_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  changed   boolean;
  auto_ok   boolean;
begin
  if public.is_admin() then return new; end if;

  -- Commercial and NSM auto-approve alongside the RM's approval when the item
  -- needs no review. Anyone who may approve at the RM stage may write that.
  auto_ok := not public.spare_needs_review(new.item_status)
             and public.has_perm('spare.approve_rm');

  changed := new.rm_approval is distinct from old.rm_approval
          or new.rm_by       is distinct from old.rm_by
          or new.rm_at       is distinct from old.rm_at;
  if changed and not public.has_perm('spare.approve_rm') then
    raise exception 'RBAC: RM approval requires the spare.approve_rm permission';
  end if;

  changed := new.commercial_approval is distinct from old.commercial_approval
          or new.commercial_by       is distinct from old.commercial_by
          or new.commercial_at       is distinct from old.commercial_at;
  if changed
     and not public.has_perm('spare.approve_commercial')
     and not (auto_ok and new.commercial_approval = 'Auto-Approved'
              and new.commercial_by is not distinct from old.commercial_by
              and new.commercial_at is not distinct from old.commercial_at) then
    raise exception 'RBAC: Commercial approval requires the spare.approve_commercial permission';
  end if;

  changed := new.nsm_approval is distinct from old.nsm_approval
          or new.nsm_by       is distinct from old.nsm_by
          or new.nsm_at       is distinct from old.nsm_at;
  if changed
     and not public.has_perm('spare.approve_nsm')
     and not (auto_ok and new.nsm_approval = 'Auto-Approved'
              and new.nsm_by is not distinct from old.nsm_by
              and new.nsm_at is not distinct from old.nsm_at) then
    raise exception 'RBAC: NSM approval requires the spare.approve_nsm permission';
  end if;

  changed := new.stores_status    is distinct from old.stores_status
          or new.dc_number        is distinct from old.dc_number
          or new.dispatched_by    is distinct from old.dispatched_by
          or new.dispatched_at    is distinct from old.dispatched_at
          or new.courier          is distinct from old.courier
          or new.dispatch_remarks is distinct from old.dispatch_remarks;
  if changed and not public.has_perm('spare.dispatch') then
    raise exception 'RBAC: dispatch / DC requires the spare.dispatch permission';
  end if;

  changed := new.reject_reason  is distinct from old.reject_reason
          or new.rejected_stage is distinct from old.rejected_stage;
  if changed and not public.can_approve_spares() then
    raise exception 'RBAC: recording a rejection requires an approval permission';
  end if;

  changed := new.received_by     is distinct from old.received_by
          or new.received_at     is distinct from old.received_at
          or new.receipt_remarks is distinct from old.receipt_remarks;
  if changed then
    if not public.has_perm('spare.receive') then
      raise exception 'RBAC: acknowledging receipt requires the spare.receive permission';
    end if;
    if not public.is_spare_requester(old) then
      raise exception 'RBAC: only the engineer who raised the request may acknowledge it';
    end if;
    if old.stores_status is null or old.stores_status !~* 'dispatch' then
      raise exception 'RBAC: a request can only be acknowledged after it is dispatched';
    end if;
  end if;

  if new.stage is distinct from old.stage
     and not public.can_approve_spares()
     and not (new.stage = 'Received' and public.has_perm('spare.receive') and public.is_spare_requester(old)) then
    raise exception 'RBAC: advancing the approval stage requires an approval permission';
  end if;

  return new;
end $$;
