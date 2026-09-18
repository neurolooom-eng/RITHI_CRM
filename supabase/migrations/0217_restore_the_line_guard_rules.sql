-- ===========================================================================
-- RESTORING THE THREE RULES 0210 DELETED FROM `spare_request_lines_guard()`.
--
-- 0210 rewrote this function to add the HandStock NSM rule, and rebuilt its
-- body from an OLD revision instead of the one in the database. Six rules went
-- in; three came out. The function kept RM, Commercial and NSM approval, and
-- silently lost:
--
--   * dispatch / DC requires `spare.dispatch` (a drop needs `spare.drop`)
--   * recording a REJECTION requires an approval permission
--   * acknowledging RECEIPT requires `spare.receive`, may only be done by the
--     engineer who RAISED the request, and only AFTER the line is dispatched
--   * only the engineer who raised the request may change its PARTS
--
-- WHAT THAT COST, measured rather than reasoned about — `spare_workflow_test`
-- on a database built from every migration:
--
--   step 8   an engineer marked a line RECEIVED that had never been dispatched.
--            `UPDATE 1`, no refusal, and the line's stage went straight to
--            Received while its sibling still read Dispatched.
--   step 10  a DIFFERENT engineer acknowledged somebody else's spare.
--            `UPDATE 1`, no refusal.
--
-- and the one no test caught, which is the worst of them: any engineer could
-- change the PART or QUANTITY on another engineer's line.
--
-- THIS IS THE 0211 LESSON A SECOND TIME, in the file written the same week it
-- was learned: **read a function out of the DATABASE before replacing it**, not
-- out of the migration that first created it. 0211's first draft did it to
-- `dispatch_spare_lines` and was caught; 0210 did it to this one and shipped.
--
-- WHY NO CHECK SAW IT. `check:replay` compares each bundle against `all.sql`
-- and both are built from the same migrations, so a function truncated in the
-- migration is truncated identically in both and they agree perfectly — the
-- same blind spot `check:generated` exists for. The suite DID fail, and the
-- validation record named the wrong two expectations, because the harness pairs
-- an `expect ERROR` with the next error IN ORDER: two guards stopped firing
-- early in the file, so every later pairing shifted by two and the report blamed
-- the last two labels. The COUNTS were right and the NAMES were not; read such a
-- report by re-running the suite, not by trusting the labels.
--
-- THE MERGE. 0210's auto-Commercial / auto-NSM logic is kept EXACTLY as it is —
-- it is the current rule and it is correct — and the four lost blocks are put
-- back verbatim from 0036 after it. Nothing else changes.
-- ===========================================================================
create or replace function public.spare_request_lines_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  changed         boolean;
  auto_commercial boolean;
  auto_nsm        boolean;
  req             public.spare_requests;
begin
  if public.is_admin() then return new; end if;
  select * into req from public.spare_requests where uid = new.request_uid;

  -- ---- 0210's rule, unchanged ---------------------------------------------
  -- The two middle stages do NOT share a test: Commercial judges whether
  -- somebody is being CHARGED, NSM whether the stock is WARRANTED, and a
  -- HandStock request has no machine behind it for Commercial to weigh.
  auto_commercial := not public.spare_needs_commercial(req.item_status)
                     and public.has_perm('spare.approve_rm');
  auto_nsm        := not public.spare_needs_nsm(req.item_status, req.req_type)
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
     and not (auto_commercial and new.commercial_approval = 'Auto-Approved'
              and new.commercial_by is not distinct from old.commercial_by
              and new.commercial_at is not distinct from old.commercial_at) then
    raise exception 'RBAC: Commercial approval requires the spare.approve_commercial permission';
  end if;

  changed := new.nsm_approval is distinct from old.nsm_approval
          or new.nsm_by       is distinct from old.nsm_by
          or new.nsm_at       is distinct from old.nsm_at;
  if changed
     and not public.has_perm('spare.approve_nsm')
     and not (auto_nsm and new.nsm_approval = 'Auto-Approved'
              and new.nsm_by is not distinct from old.nsm_by
              and new.nsm_at is not distinct from old.nsm_at) then
    raise exception 'RBAC: NSM approval requires the spare.approve_nsm permission';
  end if;

  -- ---- RESTORED FROM 0036, verbatim ---------------------------------------
  changed := new.stores_status    is distinct from old.stores_status
          or new.dc_number        is distinct from old.dc_number
          or new.dispatched_by    is distinct from old.dispatched_by
          or new.dispatched_at    is distinct from old.dispatched_at
          or new.courier          is distinct from old.courier
          or new.dispatch_remarks is distinct from old.dispatch_remarks;
  -- Dispatch needs spare.dispatch; a DROP (Dropped, no DC) needs spare.drop.
  if changed and not public.has_perm('spare.dispatch')
     and not (public.has_perm('spare.drop')
              and coalesce(new.stores_status, '') ~* 'drop'
              and new.dc_number is not distinct from old.dc_number) then
    raise exception 'RBAC: dispatch / DC requires the spare.dispatch permission (a drop needs spare.drop)';
  end if;

  changed := new.reject_reason  is distinct from old.reject_reason
          or new.rejected_stage is distinct from old.rejected_stage;
  if changed and not public.can_approve_spares() and not public.has_perm('spare.drop') then
    raise exception 'RBAC: recording a rejection requires an approval permission';
  end if;

  changed := new.received_by     is distinct from old.received_by
          or new.received_at     is distinct from old.received_at
          or new.receipt_remarks is distinct from old.receipt_remarks;
  if changed then
    if not public.has_perm('spare.receive') then
      raise exception 'RBAC: acknowledging receipt requires the spare.receive permission';
    end if;
    if not public.is_spare_requester(req) then
      raise exception 'RBAC: only the engineer who raised the request may acknowledge it';
    end if;
    -- RECEIPT FOLLOWS DISPATCH, never precedes it. Without this a line is
    -- acknowledged as received while the part is still on the shelf, and the
    -- stage rolls to Received with nothing having moved.
    if old.stores_status is null or old.stores_status !~* 'dispatch' then
      raise exception 'RBAC: a spare can only be acknowledged after it is dispatched';
    end if;
  end if;

  if (new.part is distinct from old.part or new.qty is distinct from old.qty)
     and not public.is_spare_requester(req) then
    raise exception 'RBAC: only the engineer who raised the request may change its parts';
  end if;

  return new;
end $$;
