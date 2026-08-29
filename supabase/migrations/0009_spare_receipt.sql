-- ===========================================================================
-- Spare request module — phase 3.
--   • Reject reasons captured at every approval stage.
--   • Dispatch details (courier / remarks) alongside the DC number.
--   • Engineer acknowledgement, closing the loop: Dispatched → Received.
--
-- Runs after 0008_rbac_enforcement.sql and extends the RBAC it installed:
-- the new receipt columns get their own stage in the guard, and the raiser
-- (who holds none of the approval permissions) is allowed to write them.
-- ===========================================================================

alter table public.spare_requests
  add column if not exists reject_reason     text,
  add column if not exists rejected_stage    text,
  add column if not exists courier           text,
  add column if not exists dispatch_remarks  text,
  add column if not exists received_by       text,
  add column if not exists received_at       timestamptz,
  add column if not exists receipt_remarks   text;

-- The register filters and sorts by workflow stage, so index it.
create index if not exists spare_requests_stage_idx      on public.spare_requests (stage);
create index if not exists spare_requests_created_at_idx on public.spare_requests (created_at desc);

-- ---------------------------------------------------------------------------
-- created_by was never populated: the app inserts spare_requests without it
-- and the column has no default, so it is NULL on every row. 0008's policies
-- test `created_by = auth.uid()`, which therefore never matches — that blocks
-- srl_insert (a non-admin raising a request could not write its lines) as well
-- as the acknowledgement added here. Defaulting it fixes both for new rows.
-- ---------------------------------------------------------------------------
alter table public.spare_requests alter column created_by set default auth.uid();

-- The raiser must be able to update their own request to acknowledge receipt,
-- and they hold none of the approval permissions. Identify them the same way
-- sr_read already does: by created_by, or by the engineer_email on the row.
create or replace function public.is_spare_requester(r public.spare_requests)
returns boolean language sql stable as $$
  select r.created_by = auth.uid()
      or (nullif(trim(r.engineer_email), '') is not null
          and lower(trim(r.engineer_email)) = lower(auth.email()));
$$;
grant execute on function public.is_spare_requester(public.spare_requests) to authenticated;

drop policy if exists sr_update on public.spare_requests;
create policy sr_update on public.spare_requests for update
  using (public.can_approve_spares() or public.is_spare_requester(spare_requests))
  with check (public.can_approve_spares() or public.is_spare_requester(spare_requests));

-- ---------------------------------------------------------------------------
-- Stage guard, extended. Keeps 0008's per-stage column rules and adds:
--   • the receipt columns, which need spare.receive AND being the raiser;
--   • courier / dispatch_remarks, which belong to the dispatch stage;
--   • reject_reason / rejected_stage, which only an approver may write;
--   • the Received stage transition, which the raiser may make.
-- ---------------------------------------------------------------------------
create or replace function public.spare_requests_stage_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  changed boolean;
begin
  if public.is_admin() then return new; end if;

  changed := new.rm_approval is distinct from old.rm_approval
          or new.rm_by       is distinct from old.rm_by
          or new.rm_at       is distinct from old.rm_at;
  if changed and not public.has_perm('spare.approve_rm') then
    raise exception 'RBAC: RM approval requires the spare.approve_rm permission';
  end if;

  changed := new.commercial_approval is distinct from old.commercial_approval
          or new.commercial_by       is distinct from old.commercial_by
          or new.commercial_at       is distinct from old.commercial_at;
  if changed and not public.has_perm('spare.approve_commercial') then
    raise exception 'RBAC: Commercial approval requires the spare.approve_commercial permission';
  end if;

  changed := new.nsm_approval is distinct from old.nsm_approval
          or new.nsm_by       is distinct from old.nsm_by
          or new.nsm_at       is distinct from old.nsm_at;
  if changed and not public.has_perm('spare.approve_nsm') then
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

  -- A rejection reason is only meaningful from whoever rejected the request.
  changed := new.reject_reason  is distinct from old.reject_reason
          or new.rejected_stage is distinct from old.rejected_stage;
  if changed and not public.can_approve_spares() then
    raise exception 'RBAC: recording a rejection requires an approval permission';
  end if;

  -- Receipt: the engineer who raised the request acknowledges the parts.
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

  -- The workflow stage moves as a side effect of an approval, or of the
  -- raiser acknowledging receipt.
  if new.stage is distinct from old.stage
     and not public.can_approve_spares()
     and not (new.stage = 'Received' and public.has_perm('spare.receive') and public.is_spare_requester(old)) then
    raise exception 'RBAC: advancing the approval stage requires an approval permission';
  end if;

  return new;
end $$;

drop trigger if exists spare_requests_stage_guard on public.spare_requests;
create trigger spare_requests_stage_guard
  before update on public.spare_requests
  for each row execute function public.spare_requests_stage_guard();

-- ---------------------------------------------------------------------------
-- has_perm() reads app_roles, and 0008's seed deliberately leaves an existing
-- role's permissions alone — so spare.receive, which did not exist then, is on
-- no role. Append it to the roles that raise or handle requests, without
-- disturbing any other permission an admin has since edited.
-- ---------------------------------------------------------------------------
update public.app_roles
   set permissions = coalesce(permissions, '[]'::jsonb) || '["spare.receive"]'::jsonb,
       updated_at  = now()
 where role in ('admin', 'engineer', 'rm', 'rgm', 'spare_coordinator')
   and not coalesce(permissions, '[]'::jsonb) ? 'spare.receive';
