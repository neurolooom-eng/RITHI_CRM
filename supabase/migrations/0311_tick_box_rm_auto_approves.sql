-- ===========================================================================
-- 0311 -- A TICK-BOX RM APPROVAL AUTO-APPROVES WHAT THE LINE DOES NOT NEED (D-081)
--
-- The single-spare Approve (buildPatch() in src/lib/spareflow.ts) writes
-- Auto-Approved into Commercial unless the item is AMC or OGP, and into NSM
-- unless AMC, OGP or a HandStock request (0210). decide_spare_lines() -- the
-- RM Approval page's tick boxes and a selection on Spare Requests -- wrote
-- rm_approval ALONE, so spare_line_stage() put every such line at Commercial
-- whatever its cover: a warranty spare waited on a decision the rule says it
-- does not need, on the path most RM approvals take. Measured on a database
-- built from every migration before this was written.
--
-- ONE CHANGE: the RM approve branch writes the same two auto-approvals, by the
-- same two functions the line guard (0310) asks, so the guard admits them
-- (spare.approve_rm, no _by/_at). Everything else is 0118 verbatim, read out
-- of a database built from every migration rather than out of 0118.
--
-- FORWARD ONLY. Lines already approved by tick box and waiting at Commercial
-- are NOT moved: releasing live records past a stage is the user's decision.
-- supabase/apply/_spares_waiting_at_commercial_by_mistake.sql lists them.
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.decide_spare_lines(p_line_ids bigint[], p_decision text, p_actor text DEFAULT ''::text, p_reason text DEFAULT ''::text)
 RETURNS TABLE(decided integer, skipped integer, reason text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
        -- THE SAME RULE AS THE SINGLE-SPARE APPROVE (0311, D-081): each later
        -- stage the line does not need is written Auto-Approved, with no _by
        -- or _at, because nobody decided it. Before this a tick-box approval
        -- wrote rm_approval alone and a warranty line waited at Commercial.
        update public.spare_request_lines l
           set rm_approval = 'Approved', rm_by = v_actor, rm_at = v_now,
               commercial_approval = case when public.spare_needs_commercial(r.item_status)
                                          then l.commercial_approval else 'Auto-Approved' end,
               nsm_approval        = case when public.spare_needs_nsm(r.item_status, r.req_type)
                                          then l.nsm_approval else 'Auto-Approved' end
          from public.spare_requests r
         where l.id = v_id and r.uid = l.request_uid;
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
end $function$;
