-- ===========================================================================
-- An RM approves their own team's spares — and never their own request.
--
-- RM approval was gated on the PERMISSION alone: anyone holding
-- spare.approve_rm could approve any spare they could see. Two things follow
-- that should not:
--
--   • a Reporting Manager could approve a spare raised by someone outside
--     their team, including one raised by an administrator;
--   • a Reporting Manager could approve their OWN request, so a manager's
--     spares had no approver above them.
--
-- The rule now: the request's engineer must be someone who reports to the
-- approver, directly or through the tree — and must not be the approver.
-- A manager's own request therefore waits for THEIR manager.
--
-- visible_engineer_names() (0004) already walks that tree, but it INCLUDES
-- the caller, which is exactly why self-approval slipped through. The check
-- below subtracts them.
--
-- Coordination roles — Hotline, Spare Coordinator and the like — sit outside
-- the reporting tree and hold spare.approve_rm as a backstop. They have no
-- reports, so the sub-tree test would refuse them everything; they keep the
-- wider remit they have today, minus the self-approval that is now closed for
-- everyone. If those roles should also be narrowed, this is the one function
-- to change.
-- ===========================================================================

-- Does p_name report to the caller (at any depth), and is not the caller?
create or replace function public.is_my_report(p_name text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.visible_engineer_names() as v(n)
     where lower(btrim(n)) = lower(btrim(coalesce(p_name, '')))
       and lower(btrim(n)) <> lower(btrim(coalesce(public.my_dir_name(), '')))
  );
$$;
grant execute on function public.is_my_report(text) to authenticated;

-- Does the caller have anyone reporting to them at all?
create or replace function public.has_reports()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.visible_engineer_names() as v(n)
     where lower(btrim(n)) <> lower(btrim(coalesce(public.my_dir_name(), '')))
  );
$$;
grant execute on function public.has_reports() to authenticated;

-- May the caller give RM approval to a spare raised by p_engineer?
create or replace function public.spare_rm_may_approve(p_engineer text)
returns boolean language sql stable security definer set search_path = public as $$
  select case
    when public.is_admin() then true
    -- Never your own request, whoever you are: it goes to your manager.
    when lower(btrim(coalesce(p_engineer, '')))
       = lower(btrim(coalesce(public.my_dir_name(), ''))) then false
    -- A manager is confined to their own tree.
    when public.has_reports() then public.is_my_report(p_engineer)
    -- Coordination roles, who are not managers, keep the wider remit.
    else true
  end;
$$;
grant execute on function public.spare_rm_may_approve(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Enforced as its own trigger rather than by re-stating 0016's guard, which
-- owns the per-stage permission rules and is long enough already.
-- ---------------------------------------------------------------------------
create or replace function public.spare_request_lines_rm_scope_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare req public.spare_requests;
begin
  if public.is_admin() then return new; end if;
  if new.rm_approval is not distinct from old.rm_approval
     and new.rm_by    is not distinct from old.rm_by
     and new.rm_at    is not distinct from old.rm_at then
    return new;                                   -- not an RM decision
  end if;

  select * into req from public.spare_requests where uid = new.request_uid;
  if not public.spare_rm_may_approve(req.engineer) then
    if lower(btrim(coalesce(req.engineer, '')))
     = lower(btrim(coalesce(public.my_dir_name(), ''))) then
      raise exception 'You cannot approve your own spare request — it goes to your reporting manager';
    end if;
    raise exception '% does not report to you, so their spare is not yours to approve',
      coalesce(nullif(btrim(req.engineer), ''), 'That engineer');
  end if;
  return new;
end $$;

drop trigger if exists spare_request_lines_rm_scope_guard on public.spare_request_lines;
create trigger spare_request_lines_rm_scope_guard
  before update on public.spare_request_lines
  for each row execute function public.spare_request_lines_rm_scope_guard();
