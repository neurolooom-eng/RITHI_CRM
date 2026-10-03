-- ===========================================================================
-- 0341 — A CALL IS RE-OPENED, CLOSED, CANCELLED OR RESTORED ONLY BY SOMEBODY
--        WHO CAN SEE IT  (second re-review, 2026-10-03: D-127)
--
-- reopen_call, close_call, close_reopened_call, cancel_call and restore_call are
-- SECURITY DEFINER and asked only the permission (call_perm), never whether the
-- caller can see the call. rm and rgm hold calls.reopen without data.view_all,
-- so, measured, an RM who could see neither call re-opened another team's
-- solved call and closed another team's Unattended call as Solved.
--
-- THE TEST IS THE READ RULE: call_visible_to_me() asks what calls_scoped_read
-- asks of a call -- an office role (can_view_all_calls), the creator or the
-- person who typed it in, an unallotted call, or one allotted to somebody in the
-- caller's team -- WITHOUT the has_perm('calls.view') half, so it is never
-- narrower than what a screen can show. Every call a screen lists therefore
-- still passes; only a call the caller cannot see is refused. cancel_calls()
-- loops cancel_call() and inherits it. It answers NULL ONLY for a UCN that is
-- no call (no row), so each function's own "No call with UCN" message still
-- comes first; for a real call it answers true or false, never NULL.
--
-- Each function below is its live definition (read from a database built from
-- every migration, 0287 / 0311) with ONE block added after the permission check.
-- ===========================================================================

create or replace function public.call_visible_to_me(p_ucn text)
returns boolean language sql stable security definer set search_path = public as $$
  -- coalesce(…, false): a call with no creator recorded must read "not mine",
  -- never NULL -- false OR NULL is NULL, and a NULL here would wave it through.
  select coalesce(public.can_see_call(c.allocated_to), false)
      or coalesce(c.created_by = auth.uid(), false)
      or coalesce(c.actual_created_by = auth.uid(), false)
    from public.calls c
   where c.ucn = p_ucn
   limit 1;
$$;
revoke execute on function public.call_visible_to_me(text) from public, anon, authenticated;

create or replace function public.reopen_call(p_ucn text, p_reason text DEFAULT ''::text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_solved boolean; v_reopened timestamptz;
begin
  if not public.call_perm(p_ucn, 'reopen') then
    raise exception 'RBAC: your role cannot re-open a call';
  end if;
  -- 0333 (D-127): and only on a call the caller can see -- the read rule, so
  -- every call a screen shows passes and a call outside it is refused.
  if public.call_visible_to_me(p_ucn) is false then
    raise exception 'Call % is not one of yours to change', p_ucn using errcode = '42501';
  end if;

  select open_state = 'Solved', reopened_at into v_solved, v_reopened
    from public.calls where ucn = p_ucn;
  if v_solved is null then raise exception 'No call with UCN %', p_ucn; end if;
  if v_reopened is not null then raise exception 'Call % is already re-opened', p_ucn; end if;
  if not v_solved then raise exception 'Call % is not closed, so there is nothing to re-open', p_ucn; end if;

  update public.calls
     set reopened_at = now(), reopen_count = coalesce(reopen_count, 0) + 1
   where ucn = p_ucn;

  return p_ucn;
end $function$;

create or replace function public.close_call(p_ucn text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_found boolean; v_state text; v_reopened timestamptz; v_cancelled timestamptz;
begin
  -- The same gate as re-opening: whoever may put a call back on the open list
  -- may take one off it.
  if not public.call_perm(p_ucn, 'reopen') then
    raise exception 'RBAC: your role cannot close a call';
  end if;
  -- 0333 (D-127): and only on a call the caller can see -- the read rule, so
  -- every call a screen shows passes and a call outside it is refused.
  if public.call_visible_to_me(p_ucn) is false then
    raise exception 'Call % is not one of yours to change', p_ucn using errcode = '42501';
  end if;

  select true, open_state, reopened_at, cancelled_at
    into v_found, v_state, v_reopened, v_cancelled
    from public.calls where ucn = p_ucn;
  if v_found is null then raise exception 'No call with UCN %', p_ucn; end if;
  if v_cancelled is not null then
    raise exception 'Call % is cancelled — restore it before closing it', p_ucn;
  end if;
  if v_reopened is not null then
    raise exception 'Call % is re-opened — use Close again, which gives the re-open back', p_ucn;
  end if;
  if v_state = 'Solved' then raise exception 'Call % is already closed', p_ucn; end if;

  -- No visit is invented: last_visit_at is untouched, so the visit history
  -- still says what actually happened, which is nothing.
  update public.calls set last_status = 'Solved' where ucn = p_ucn;

  return p_ucn;
end $function$;

create or replace function public.close_reopened_call(p_ucn text, p_reason text DEFAULT ''::text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_reopened timestamptz; v_found boolean;
begin
  if not public.call_perm(p_ucn, 'reopen') then
    raise exception 'RBAC: your role cannot close a re-opened call';
  end if;
  -- 0333 (D-127): and only on a call the caller can see -- the read rule, so
  -- every call a screen shows passes and a call outside it is refused.
  if public.call_visible_to_me(p_ucn) is false then
    raise exception 'Call % is not one of yours to change', p_ucn using errcode = '42501';
  end if;

  select true, reopened_at into v_found, v_reopened
    from public.calls where ucn = p_ucn;
  if v_found is null then raise exception 'No call with UCN %', p_ucn; end if;
  if v_reopened is null then
    raise exception 'Call % is not re-opened — close it by entering the visit that solved it', p_ucn;
  end if;

  update public.calls
     set reopened_at  = null,
         reopen_count = greatest(coalesce(reopen_count, 0) - 1, 0)
   where ucn = p_ucn;

  return p_ucn;
end $function$;

create or replace function public.cancel_call(p_ucn text, p_reason text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_cancelled timestamptz; v_exists boolean; v_state text; v_reopened timestamptz;
begin
  if not public.call_perm(p_ucn, 'cancel') then
    raise exception 'RBAC: your role cannot cancel a call';
  end if;
  -- 0333 (D-127): and only on a call the caller can see -- the read rule, so
  -- every call a screen shows passes and a call outside it is refused.
  if public.call_visible_to_me(p_ucn) is false then
    raise exception 'Call % is not one of yours to change', p_ucn using errcode = '42501';
  end if;
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'A cancellation needs a reason';
  end if;

  select true, cancelled_at, open_state, reopened_at
    into v_exists, v_cancelled, v_state, v_reopened
    from public.calls where ucn = p_ucn;
  if v_exists is null then raise exception 'No call with UCN %', p_ucn; end if;
  if v_cancelled is not null then raise exception 'Call % is already cancelled', p_ucn; end if;
  -- THE SCREEN'S RULE (FieldCalls.tsx, canCancelRow), now the database's too.
  if v_reopened is not null or coalesce(v_state, '') not in ('', 'Unattended', 'Unsolved') then
    raise exception 'Call % is %: only an Unattended or Unsolved call can be cancelled',
      p_ucn, case when v_reopened is not null then 'Reopened' else v_state end;
  end if;

  update public.calls
     set cancelled_at  = now(),
         cancel_reason = btrim(p_reason),
         cancelled_by  = auth.uid()
   where ucn = p_ucn;

  return p_ucn;
end $function$;

create or replace function public.restore_call(p_ucn text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_cancelled timestamptz; v_exists boolean;
begin
  if not public.call_perm(p_ucn, 'cancel') then
    raise exception 'RBAC: your role cannot restore a call';
  end if;
  -- 0333 (D-127): and only on a call the caller can see -- the read rule, so
  -- every call a screen shows passes and a call outside it is refused.
  if public.call_visible_to_me(p_ucn) is false then
    raise exception 'Call % is not one of yours to change', p_ucn using errcode = '42501';
  end if;

  select true, cancelled_at into v_exists, v_cancelled
    from public.calls where ucn = p_ucn;
  if v_exists is null then raise exception 'No call with UCN %', p_ucn; end if;
  if v_cancelled is null then raise exception 'Call % is not cancelled', p_ucn; end if;

  update public.calls set cancelled_at = null, cancelled_by = null where ucn = p_ucn;
  return p_ucn;
end $function$;

-- Two of the five were still executable by the public key (0057's grant to
-- PUBLIC); without a sign-in call_perm() refuses them anyway, so this takes
-- nothing from anybody and closes the door the lockdown (0248) closes elsewhere.
revoke execute on function public.reopen_call(text, text) from public, anon;
revoke execute on function public.close_reopened_call(text, text) from public, anon;
grant execute on function public.reopen_call(text, text) to authenticated;
grant execute on function public.close_reopened_call(text, text) to authenticated;
