-- ===========================================================================
-- REJECT AND DROP IN BULK TOO — and one function deciding all three.
--
-- 0116 gave bulk APPROVAL. The user's next ask (2026-09-06): reject and drop as
-- well. Three near-copies of the same stage resolution and the same skip rules
-- would drift within a release, so there is ONE function that takes the
-- decision as an argument, and `approve_spare_lines` becomes a thin call to it
-- — its signature is unchanged, because it is already live.
--
-- WHAT EACH DECISION MEANS, and they are three different things:
--
--   approve  advance this line one stage. Never more than one, so the button
--            cannot push a spare past a review it has not had.
--   reject   an APPROVER refuses the request. It closes at the stage it was
--            at, and the stage is recorded with the reason.
--   drop     STORES did not send a part that was already approved. Different
--            from a rejection and recorded differently (0025) — folding them
--            together would misreport who ended the line.
--
-- A REASON IS REQUIRED for reject and drop, and refused if blank. An approval
-- explains itself; ending somebody's request does not, and a register full of
-- reasonless rejections cannot be reviewed afterwards.
--
-- 0033 STILL APPLIES AT THE RM STAGE, to reject as much as to approve — not
-- because rejecting your own request is dangerous, but because the trigger
-- refuses it either way, and a function that promises what the trigger will
-- then refuse is worse than one that says no itself.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- AND THE PERMISSION 0036 NEVER GRANTED.
--
-- Found while building bulk drop: `spare.drop` is defined in the client's role
-- defaults and enforced by 0036's guard, but NO MIGRATION HAS EVER PUT IT IN
-- `app_roles`. `has_perm` falls back to the engineer defaults only for a role
-- with ZERO permissions, and every role here has some — so the answer has
-- always been false. Nobody but an administrator (who passes `is_admin()`
-- before the check) has ever been able to drop a spare, and the button never
-- appeared for anyone else because the client reads the same table.
--
-- 0036's own header says who it is for: "a Spare Coordinator / Hotline may DROP
-- a spare at any stage". That is what is granted, MERGED into whatever those
-- roles already hold.
-- ---------------------------------------------------------------------------
do $drop_perm$
declare r text;
begin
  if to_regclass('public.app_roles') is null then return; end if;
  foreach r in array array['spare_coordinator', 'hotline', 'stores_incharge'] loop
    update public.app_roles
       set permissions = (select jsonb_agg(distinct p) from (
             select jsonb_array_elements_text(coalesce(permissions, '[]'::jsonb)) as p
             union select 'spare.drop') u),
           updated_at = now()
     where role = r;
  end loop;
end $drop_perm$;

create or replace function public.decide_spare_lines(
  p_line_ids bigint[],
  p_decision text,
  p_actor    text default '',
  p_reason   text default ''
)
returns table (decided integer, skipped integer, reason text)
language plpgsql security definer set search_path = public as $$
declare
  v_id     bigint;
  v_stage  text;
  v_eng    text;
  v_dec    text := lower(btrim(coalesce(p_decision, '')));
  v_why    text := btrim(coalesce(p_reason, ''));
  v_actor  text := nullif(btrim(coalesce(p_actor, '')), '');
  v_now    timestamptz := now();
  n_ok     integer := 0;
  n_skip   integer := 0;
  why      text[]  := '{}';
begin
  if v_dec not in ('approve', 'reject', 'drop') then
    raise exception 'Unknown decision: %', p_decision;
  end if;
  if p_line_ids is null or array_length(p_line_ids, 1) is null then
    raise exception 'Nothing selected';
  end if;
  -- Ending a request without saying why leaves a register nobody can review.
  if v_dec in ('reject', 'drop') and v_why = '' then
    raise exception 'A % needs a reason', v_dec;
  end if;
  if v_dec = 'drop' then
    if not public.has_perm('spare.drop') then
      raise exception 'RBAC: your role cannot drop a spare';
    end if;
  elsif not public.can_approve_spares() then
    raise exception 'RBAC: your role cannot approve or reject spares';
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

    -- ---- DROP: any stage that is still open, and only Stores' own right ----
    if v_dec = 'drop' then
      if v_stage not in ('RM Approval', 'Commercial', 'NSM', 'Stores') then
        n_skip := n_skip + 1; why := array_append(why, 'already at ' || v_stage); continue;
      end if;
      update public.spare_request_lines
         set stores_status = 'Dropped', dispatch_remarks = v_why,
             dispatched_by = v_actor, dispatched_at = v_now
       where id = v_id;
      n_ok := n_ok + 1;
      continue;
    end if;

    -- ---- APPROVE / REJECT: at the stage the line is AT --------------------
    if v_stage not in ('RM Approval', 'Commercial', 'NSM') then
      n_skip := n_skip + 1; why := array_append(why, 'already at ' || v_stage); continue;
    end if;

    if v_stage = 'RM Approval' then
      if not public.has_perm('spare.approve_rm') then
        n_skip := n_skip + 1; why := array_append(why, 'not yours to decide at RM'); continue;
      end if;
      -- The trigger refuses this either way; saying so here is the difference
      -- between a counted skip and a failed batch.
      if not public.spare_rm_may_approve(v_eng) then
        n_skip := n_skip + 1; why := array_append(why, 'your own request, or outside your team'); continue;
      end if;
      if v_dec = 'approve' then
        update public.spare_request_lines
           set rm_approval = 'Approved', rm_by = v_actor, rm_at = v_now where id = v_id;
      else
        update public.spare_request_lines
           set rm_approval = 'Rejected', rm_by = v_actor, rm_at = v_now,
               rejected_stage = v_stage, reject_reason = v_why where id = v_id;
      end if;

    elsif v_stage = 'Commercial' then
      if not public.has_perm('spare.approve_commercial') then
        n_skip := n_skip + 1; why := array_append(why, 'not yours to decide at Commercial'); continue;
      end if;
      if v_dec = 'approve' then
        update public.spare_request_lines
           set commercial_approval = 'Approved', commercial_by = v_actor, commercial_at = v_now where id = v_id;
      else
        update public.spare_request_lines
           set commercial_approval = 'Rejected', commercial_by = v_actor, commercial_at = v_now,
               rejected_stage = v_stage, reject_reason = v_why where id = v_id;
      end if;

    else  -- NSM
      if not public.has_perm('spare.approve_nsm') then
        n_skip := n_skip + 1; why := array_append(why, 'not yours to decide at NSM'); continue;
      end if;
      if v_dec = 'approve' then
        update public.spare_request_lines
           set nsm_approval = 'Approved', nsm_by = v_actor, nsm_at = v_now where id = v_id;
      else
        update public.spare_request_lines
           set nsm_approval = 'Rejected', nsm_by = v_actor, nsm_at = v_now,
               rejected_stage = v_stage, reject_reason = v_why where id = v_id;
      end if;
    end if;

    n_ok := n_ok + 1;
  end loop;

  return query select n_ok, n_skip,
    coalesce((select string_agg(w, '; ') from (select distinct unnest(why) as w) d), '');
end $$;
revoke all on function public.decide_spare_lines(bigint[], text, text, text) from public;
grant execute on function public.decide_spare_lines(bigint[], text, text, text) to authenticated;

-- 0116's function is ALREADY LIVE and the app calls it by that name, so its
-- signature and its column names are kept. It is now one line.
create or replace function public.approve_spare_lines(p_line_ids bigint[], p_actor text default '')
returns table (approved integer, skipped integer, reason text)
language sql security definer set search_path = public as $$
  select decided, skipped, reason from public.decide_spare_lines(p_line_ids, 'approve', p_actor, '');
$$;
revoke all on function public.approve_spare_lines(bigint[], text) from public;
grant execute on function public.approve_spare_lines(bigint[], text) to authenticated;

comment on function public.decide_spare_lines(bigint[], text, text, text) is
  'Approve / reject / drop many spare lines at once, each at the stage it is AT. Reject and drop require a reason. Skips what the caller may not decide and returns the counts.';
