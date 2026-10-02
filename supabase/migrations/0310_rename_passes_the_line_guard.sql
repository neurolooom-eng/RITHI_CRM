-- ===========================================================================
-- 0310 — A PART RENAME PASSES THE SPARE-LINE GUARD.
--
-- Found while finding why 0309's one-time HSN fill cleaned only 12 of 29
-- descriptions on the live project (2026-10-01). spare_request_lines_guard's
-- parts rule -- "only the engineer who raised the request may change its
-- parts" -- lets only an administrator or the requester past, so a person who
-- holds masters.edit.rename_part but is NOT an administrator could not rename
-- any part on somebody else's spare request. The rename is not somebody
-- changing a line's part; it is the part's own name changing everywhere at once.
--
-- NOT what stopped the migration: with no signed-in user the rule's test
-- (`created_by = auth.uid()`) is NULL, an IF treats NULL as false, and the
-- line was let through. Measured on a database before this was written, not
-- assumed. What stopped the fill is in 0310_rename_passes_the_return_guard.
--
-- READ FROM THE DATABASE, NOT FROM A MIGRATION (CLAUDE.md): this is the body
-- 0217 left, with ONE condition added to the parts rule and nothing else
-- changed. The exemption is the ticket the consumption guard already trusts
-- (0196): unforgeable, because only rename_part_records() writes it, and keyed
-- on this transaction.
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.spare_request_lines_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
     and not public.is_spare_requester(req)
     -- A PART RENAME IS NOT SOMEBODY CHANGING THE PART (0310). rename_part
     -- (0196/0309) files a ticket naming this transaction, the old key and the
     -- new name; only it can write one. A line whose part moves EXACTLY from
     -- that key to that name, quantity untouched, is the rename carrying the
     -- record -- refusing it left the part's history split across two names.
     and not (new.qty is not distinct from old.qty
              and exists (select 1 from public.part_rename_ticket t
                           where t.txid = txid_current()
                             and t.old_key = lower(btrim(old.part))
                             and t.new_detail = new.part)) then
    raise exception 'RBAC: only the engineer who raised the request may change its parts';
  end if;

  return new;
end $function$;
