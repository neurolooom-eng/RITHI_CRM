-- ===========================================================================
-- Answers from the approval forms, kept whole.
--
-- The Commercial (formerly ADMIN) step is a branching form, not a yes/no:
-- a status, then either a clearing reason — with an MC/SA number or a
-- four-step Direct PO checklist behind it — or a pending reason. NSM's form
-- is the same shape.
--
-- Storing the answers as jsonb keyed by stage means the forms can gain or
-- lose questions without a migration each time, while the decision itself
-- stays in the columns the workflow already reads (commercial_approval and
-- friends), so nothing about stage derivation changes.
--
--   approval_data = { "commercial": { ... }, "nsm": { ... } }
-- ===========================================================================

alter table public.spare_request_lines
  add column if not exists approval_data jsonb not null default '{}'::jsonb;

-- Answers are gated like the decision they belong to: a Commercial answer
-- needs spare.approve_commercial, an NSM answer needs spare.approve_nsm.
-- A separate trigger from the stage guard, so that one stays untouched.
create or replace function public.spare_request_lines_answer_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.is_admin() then return new; end if;
  if new.approval_data is not distinct from old.approval_data then return new; end if;

  if new.approval_data -> 'commercial' is distinct from old.approval_data -> 'commercial'
     and not public.has_perm('spare.approve_commercial') then
    raise exception 'RBAC: recording a Commercial answer requires the spare.approve_commercial permission';
  end if;

  if new.approval_data -> 'nsm' is distinct from old.approval_data -> 'nsm'
     and not public.has_perm('spare.approve_nsm') then
    raise exception 'RBAC: recording an NSM answer requires the spare.approve_nsm permission';
  end if;

  -- Anything else under approval_data still needs a seat in the chain.
  if not public.can_approve_spares() then
    raise exception 'RBAC: recording an approval answer requires an approval permission';
  end if;
  return new;
end $$;

drop trigger if exists spare_request_lines_answer_guard on public.spare_request_lines;
create trigger spare_request_lines_answer_guard
  before update on public.spare_request_lines
  for each row execute function public.spare_request_lines_answer_guard();

-- Lines still sitting with Commercial because the answer was "Admin Process
-- in Progress" — the queue the team works from.
create index if not exists spare_request_lines_commercial_pending_idx
  on public.spare_request_lines ((approval_data -> 'commercial' ->> 'pending_reason'))
  where approval_data -> 'commercial' ->> 'pending_reason' is not null;
