-- ===========================================================================
-- TICK WHAT YOU AGREE WITH, AND APPROVE IT IN ONE GO.
--
-- Two things the user asked for (2026-09-06):
--
--   1. NSM, Admin and Super Admin approve spares in BULK, at EVERY stage —
--      check the boxes, press Approve.
--   2. A screen of its own for RM APPROVAL, shaped like Pending Dispatch, and
--      listing only what is actually waiting for an RM.
--
-- ---------------------------------------------------------------------------
-- HOW "ALL STAGES" IS DONE, AND WHY IT IS NOT A BYPASS.
--
-- The per-stage permissions and the guard on `spare_request_lines` (0016) stay
-- exactly as they are. What changes is what the NSM role HOLDS: it gains
-- `spare.approve_rm` and `spare.approve_commercial` alongside the
-- `spare.approve_nsm` it already had.
--
-- That is deliberately the boring answer. A bypass flag would put a second,
-- invisible rule beside the guard, and the next person to read the guard would
-- not know it could be skipped. A permission shows up on the Roles screen, an
-- administrator can take it away again without a migration, and the audit trail
-- reads the same as any other approval. Admin and Super Admin already pass the
-- guard's first line (`is_admin()`), so they need nothing.
--
-- MERGED into the role, never written over it: an administrator may have tuned
-- it, and overwriting would silently take something away.
--
-- WHAT IS NOT RELAXED: 0033's rule that nobody gives RM approval to their own
-- request, and that a manager is confined to their own reporting tree. That is
-- an integrity rule, not a convenience — it exists because a manager's spares
-- otherwise had no approver above them — and bulk is exactly where it would go
-- unnoticed. `approve_spare_lines` SKIPS such a line and says how many it
-- skipped, rather than failing the batch or approving it quietly.
-- ===========================================================================

-- ---- 1. what the NSM role holds -------------------------------------------
do $perms$
declare want text[] := array['spare.approve_rm', 'spare.approve_commercial', 'mod:/spare-rm-approval'];
begin
  if to_regclass('public.app_roles') is null then return; end if;
  update public.app_roles
     set permissions = (select jsonb_agg(distinct p) from (
           select jsonb_array_elements_text(coalesce(permissions, '[]'::jsonb)) as p
           union select unnest(want)) u),
         updated_at = now()
   where role = 'nsm';
end $perms$;

-- The RM Approval screen goes to whoever actually gives RM approval.
do $mod$
declare r text;
begin
  if to_regclass('public.app_roles') is null then return; end if;
  foreach r in array array['admin', 'nsm', 'rm', 'rgm', 'hotline', 'spare_coordinator'] loop
    update public.app_roles
       set permissions = (select jsonb_agg(distinct p) from (
             select jsonb_array_elements_text(coalesce(permissions, '[]'::jsonb)) as p
             union select 'mod:/spare-rm-approval') u),
           updated_at = now()
     where role = r;
  end loop;
end $mod$;

-- ---- 2. what is waiting for an RM ------------------------------------------
-- Modelled on `spare_pending_dispatch` (0031), including the reason it computes
-- the stage rather than reading it: `stage` is a cache and may be stale.
--
-- `may_approve` is on the ROW because the answer differs per line and per
-- reader — an RM sees their team's, and never their own request. The screen
-- shows the rest greyed rather than hiding them, so "why is my spare not here"
-- has an answer on the screen instead of in somebody's head.
-- DROPPED FIRST, and that is not tidiness (added 2026-09-09 with 0154).
-- `create or replace view` can only APPEND columns, so once a later migration
-- has added one -- 0154 adds `complaint` -- replaying THIS bundle on its own
-- runs this statement against the wider view and fails outright with "cannot
-- drop columns from view". The bundles are replayed one at a time, so that is
-- a real path, and `npm run check:replay` is what found it. Nothing depends on
-- this view, so the drop is free.
drop view if exists public.spare_pending_rm;
create view public.spare_pending_rm as
  select
    l.id                                        as line_id,
    l.line_uid,
    l.request_uid,
    r.or_no,
    r.or_req_date,
    l.row_no,
    l.part,
    upper(btrim(split_part(coalesce(l.part, ''), '|', 1)))   as part_code,
    l.qty,
    r.req_type,
    r.item_status,
    coalesce(r.engineer, '')                    as engineer,
    lower(btrim(coalesce(r.engineer, '')))      as engineer_key,
    coalesce(r.engineer_email, '')              as engineer_email,
    coalesce(r.ucn, '')                         as ucn,
    coalesce(r.call_number, '')                 as call_number,
    coalesce(r.party_name, '')                  as party_name,
    coalesce(r.product_name, '')                as product_name,
    coalesce(r.serial, '')                      as serial,
    coalesce(r.handstock_reason, '')            as handstock_reason,
    coalesce(r.remarks, '')                     as remarks,
    coalesce(l.created_at, r.created_at)        as raised_at,
    public.spare_rm_may_approve(r.engineer)     as may_approve
  from public.spare_request_lines l
  join public.spare_requests r on r.uid = l.request_uid
  where public.spare_line_stage(
          coalesce(l.rm_approval, 'Pending'),
          coalesce(l.commercial_approval, 'Pending'),
          coalesce(l.nsm_approval, 'Pending'),
          coalesce(l.stores_status, 'Pending'),
          l.received_at,
          r.item_status) = 'RM Approval';

-- A view over RLS-protected tables reads as its OWNER without this, and every
-- signed-in user would see every engineer's spares. Re-asserted on every
-- rebuild — `create or replace view` drops it silently.
alter view public.spare_pending_rm set (security_invoker = on);
grant select on public.spare_pending_rm to authenticated;

-- ---- 3. approve a batch ----------------------------------------------------
-- Each line is approved AT THE STAGE IT IS AT, so a mixed selection advances
-- every line by exactly one step and none of them skips a stage. That is the
-- least surprising reading of "approve these", and it means the button cannot
-- be used to push a spare past a review it has not had.
--
-- It SKIPS rather than fails. A batch of forty that stops on the one line you
-- may not approve is a batch you have to pick apart by hand; the counts come
-- back so the screen can say what happened to all forty.
create or replace function public.approve_spare_lines(p_line_ids bigint[], p_actor text default '')
returns table (approved integer, skipped integer, reason text)
language plpgsql security definer set search_path = public as $$
declare
  v_id     bigint;
  v_stage  text;
  v_eng    text;
  v_actor  text := nullif(btrim(coalesce(p_actor, '')), '');
  n_ok     integer := 0;
  n_skip   integer := 0;
  why      text[]  := '{}';
begin
  if not public.can_approve_spares() then
    raise exception 'RBAC: your role cannot approve spares';
  end if;
  if p_line_ids is null or array_length(p_line_ids, 1) is null then
    raise exception 'Nothing selected';
  end if;

  v_actor := coalesce(v_actor, public.my_dir_name(), auth.email(), '');

  foreach v_id in array p_line_ids loop
    select public.spare_line_stage(
             coalesce(l.rm_approval, 'Pending'), coalesce(l.commercial_approval, 'Pending'),
             coalesce(l.nsm_approval, 'Pending'), coalesce(l.stores_status, 'Pending'),
             l.received_at, r.item_status),
           coalesce(r.engineer, '')
      into v_stage, v_eng
      from public.spare_request_lines l
      join public.spare_requests r on r.uid = l.request_uid
     where l.id = v_id;

    if v_stage is null then
      n_skip := n_skip + 1; why := array_append(why, 'no such spare'); continue;
    end if;

    if v_stage = 'RM Approval' then
      -- Both tests, in this order: the permission, then whose request it is.
      if not public.has_perm('spare.approve_rm') then
        n_skip := n_skip + 1; why := array_append(why, 'not yours to approve at RM'); continue;
      end if;
      if not public.spare_rm_may_approve(v_eng) then
        n_skip := n_skip + 1; why := array_append(why, 'your own request, or outside your team'); continue;
      end if;
      update public.spare_request_lines
         set rm_approval = 'Approved', rm_by = v_actor, rm_at = now()
       where id = v_id;

    elsif v_stage = 'Commercial' then
      if not public.has_perm('spare.approve_commercial') then
        n_skip := n_skip + 1; why := array_append(why, 'not yours to approve at Commercial'); continue;
      end if;
      update public.spare_request_lines
         set commercial_approval = 'Approved', commercial_by = v_actor, commercial_at = now()
       where id = v_id;

    elsif v_stage = 'NSM' then
      if not public.has_perm('spare.approve_nsm') then
        n_skip := n_skip + 1; why := array_append(why, 'not yours to approve at NSM'); continue;
      end if;
      update public.spare_request_lines
         set nsm_approval = 'Approved', nsm_by = v_actor, nsm_at = now()
       where id = v_id;

    else
      -- Already through, rejected, dropped or with Stores. Not an error: a
      -- selection made a minute ago can be overtaken by somebody else's work.
      n_skip := n_skip + 1; why := array_append(why, 'already at ' || v_stage); continue;
    end if;

    n_ok := n_ok + 1;
  end loop;

  return query select n_ok, n_skip,
    coalesce((select string_agg(w, '; ') from (select distinct unnest(why) as w) d), '');
end $$;
revoke all on function public.approve_spare_lines(bigint[], text) from public;
grant execute on function public.approve_spare_lines(bigint[], text) to authenticated;

comment on view public.spare_pending_rm is
  'Spare lines waiting for RM approval, with may_approve saying whether THIS reader may give it (0033: never your own request, and a manager only within their tree).';
