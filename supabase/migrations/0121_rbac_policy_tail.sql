-- ===========================================================================
-- rbac.sql must leave every policy it defines at its LATEST definition.
--
-- 0008 creates a policy for most tables in the schema. Six of those were later
-- narrowed by other modules — and because the apply bundles are replayed ONE AT
-- A TIME, running `rbac.sql` on its own put 0008's wider version back. No
-- error, no warning, and the bundle reports success. It has now happened twice
-- (2026-09-05 for `srl_insert`, 2026-09-06 for these six), each time reading as
-- "the migration was never applied" when it had been applied and overwritten.
--
-- 0087/0088 were fixed by MOVING them into this module. These six cannot move:
-- each sits in a migration that also does work belonging to its own module, and
-- each depends on tables that module creates. So this file — the LAST in the
-- rbac module — re-asserts their latest definitions instead:
--
--   spare_requests.sr_read        0040_spare_read_scope
--   spare_requests.sr_update      0009_spare_receipt
--   spare_request_lines.srl_update 0016_spare_line_approvals
--   spare_consumption.cons_read   0038_spare_consumption_scope
--   spare_consumption.cons_write  0059_consumption_reconciliation
--   spare_requests_stage_guard()  0016_spare_line_approvals
--   masters insert/update/delete  0067_master_list_permissions
--
-- Every block is GUARDED on what it names. On a FRESH apply rbac runs before
-- masters, spare_requests and handstock (ALL_ORDER), so those tables do not
-- exist yet: each block skips, and the owning module defines the policy itself
-- a moment later — identically. On a replay against a live database everything
-- is present, so the latest definition is restored. Idempotent either way, and
-- the definitions here are copies: change one in its own migration and change
-- it here too, or rbac.sql goes back to reverting it.
-- ===========================================================================

-- --------------------------------------------------------------------------
-- spare_requests — who may SEE one (0040), and who may UPDATE one (0009).
-- --------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.spare_requests') is null then
    raise notice 'skip sr_read/sr_update — public.spare_requests is not present yet';
    return;
  end if;

  if to_regproc('public.can_view_all_calls') is not null
     and exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'spare_requests'
                    and column_name = 'engineer_email') then
    drop policy if exists sr_read on public.spare_requests;
    create policy sr_read on public.spare_requests for select
      using (
        (select public.can_view_all_calls())
        or created_by = (select auth.uid())
        or lower(engineer_email) = lower((select auth.email()))
        or lower(btrim(engineer)) in (
             select lower(btrim(n)) from public.visible_engineer_names() as v(n)
           )
      );
  else
    raise notice 'skip sr_read — can_view_all_calls() or engineer_email is not present yet';
  end if;

  if to_regproc('public.is_spare_requester') is not null then
    drop policy if exists sr_update on public.spare_requests;
    create policy sr_update on public.spare_requests for update
      using      (public.can_approve_spares() or public.is_spare_requester(spare_requests))
      with check (public.can_approve_spares() or public.is_spare_requester(spare_requests));
  else
    raise notice 'skip sr_update — is_spare_requester() is not present yet';
  end if;
end $$;

-- --------------------------------------------------------------------------
-- spare_request_lines — the raiser may touch their own lines, not only an
-- approver (0016). Without this an engineer cannot acknowledge receipt.
-- --------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.spare_request_lines') is null
     or to_regproc('public.is_spare_requester') is null then
    raise notice 'skip srl_update — spare_request_lines or is_spare_requester() is not present yet';
    return;
  end if;

  drop policy if exists srl_update on public.spare_request_lines;
  create policy srl_update on public.spare_request_lines for update
    using (
      public.can_approve_spares()
      or exists (select 1 from public.spare_requests r
                  where r.uid = spare_request_lines.request_uid and public.is_spare_requester(r))
    )
    with check (
      public.can_approve_spares()
      or exists (select 1 from public.spare_requests r
                  where r.uid = spare_request_lines.request_uid and public.is_spare_requester(r))
    );
end $$;

-- --------------------------------------------------------------------------
-- spare_consumption — scoped reads (0038), and a Reconciliation line needing
-- its own permission rather than calls.report (0059).
-- --------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.spare_consumption') is null then
    raise notice 'skip cons_read/cons_write — public.spare_consumption is not present yet';
    return;
  end if;

  if to_regproc('public.can_view_all_calls') is not null
     and exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'spare_consumption'
                    and column_name = 'engineer_email') then
    drop policy if exists cons_read on public.spare_consumption;
    create policy cons_read on public.spare_consumption for select
      using (
        (select public.can_view_all_calls())
        or created_by = (select auth.uid())
        or lower(engineer_email) = lower((select auth.email()))
        or lower(trim(engineer)) in (
             select lower(trim(n)) from public.visible_engineer_names() as v(n)
           )
      );
  else
    raise notice 'skip cons_read — can_view_all_calls() or engineer_email is not present yet';
  end if;

  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'spare_consumption'
                and column_name = 'source') then
    drop policy if exists cons_write on public.spare_consumption;
    create policy cons_write on public.spare_consumption for insert
      with check (
        case when coalesce(source, 'Report') = 'Reconciliation'
             then public.has_perm('consumption.reconcile')
             else (public.has_perm('calls.report') or public.has_perm('spare.dispatch'))
        end
      );
  else
    raise notice 'skip cons_write — spare_consumption.source is not present yet';
  end if;
end $$;

-- --------------------------------------------------------------------------
-- masters — write rights are PER LIST (0067).
--
-- This is the one no static check can see: 0008 creates `masters_write`
-- through `execute format(...)` in a loop, so no `create policy` literal
-- appears in its text. Policies are OR'd, so leaving 0008's version in place
-- lets a holder of `masters.edit` write EVERY list again — exactly what 0067
-- narrowed.
-- --------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.masters') is null then
    raise notice 'skip masters policies — public.masters is not present yet';
    return;
  end if;

  drop policy if exists masters_write on public.masters;
  drop policy if exists masters_admin_write on public.masters;
  drop policy if exists masters_insert on public.masters;
  drop policy if exists masters_update on public.masters;
  drop policy if exists masters_delete on public.masters;

  create policy masters_insert on public.masters for insert
    with check (public.has_perm('masters.edit')
             or public.has_perm('master.' || coalesce(name, '') || '.edit'));

  create policy masters_update on public.masters for update
    using      (public.has_perm('masters.edit')
             or public.has_perm('master.' || coalesce(name, '') || '.edit'))
    with check (public.has_perm('masters.edit')
             or public.has_perm('master.' || coalesce(name, '') || '.edit'));

  create policy masters_delete on public.masters for delete
    using      (public.has_perm('masters.edit')
             or public.has_perm('master.' || coalesce(name, '') || '.delete'));
end $$;

-- --------------------------------------------------------------------------
-- spare_requests_stage_guard() — the per-stage approval guard.
--
-- 0008 creates it; 0009, 0012 and 0016 each extend it, and 0016 has the last
-- word: the receipt columns, courier / dispatch remarks, reject_reason and the
-- Received transition. Replaying rbac.sql put 0008's back, which refuses an
-- engineer acknowledging receipt and lets a rejection be written without one.
--
-- Unlike the policies above this needs nothing that a later module creates —
-- it is plpgsql, so its body is not resolved until it runs — so it is
-- unguarded and correct on a fresh apply as well.
-- --------------------------------------------------------------------------
create or replace function public.spare_requests_stage_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.is_admin() then return new; end if;
  if coalesce(current_setting('app.spare_rollup', true), '') = '1' then return new; end if;

  if new.stage  is distinct from old.stage
  or new.status is distinct from old.status
  or new.rm_approval         is distinct from old.rm_approval
  or new.commercial_approval is distinct from old.commercial_approval
  or new.nsm_approval        is distinct from old.nsm_approval
  or new.stores_status       is distinct from old.stores_status
  or new.received_at         is distinct from old.received_at then
    raise exception 'Spare approvals are recorded per spare — update spare_request_lines, not the request';
  end if;
  return new;
end $$;
