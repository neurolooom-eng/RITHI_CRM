-- ===========================================================================
-- A CALL IS CANCELLED ONLY WHILE IT IS STILL OPEN (D-036, FRS-133).
--
-- The user's rule: a call may be cancelled only while it is Unattended or
-- Unsolved, because cancelling a call that was visited and closed takes what
-- was done out of every count. The rule lived in ONE place -- `canCancelRow`
-- in FieldCalls.tsx, which offers 🚫 only while the state is blank,
-- Unattended or Unsolved and the call is not re-opened. `cancel_call()` (0108)
-- tested the right, the reason, existence and whether it was already
-- cancelled, and nothing about state; `cancel_calls()` (0242) loops it. So a
-- holder of calls.cancel could cancel a Solved or Re-opened call through the
-- data interface.
--
-- WHAT CHANGES: cancel_call() refuses a call whose state is anything but
-- blank, Unattended or Unsolved, or that is re-opened -- the screen's test,
-- word for word. cancel_calls() inherits it, because it calls this function.
-- WHAT DOES NOT: the right (call_perm(.., 'cancel')), the reason, the
-- already-cancelled refusal, and what is written. Restoring a cancelled call
-- is untouched.
-- ===========================================================================

create or replace function public.cancel_call(p_ucn text, p_reason text)
returns text language plpgsql security definer set search_path = public as $$
declare v_cancelled timestamptz; v_exists boolean; v_state text; v_reopened timestamptz;
begin
  if not public.call_perm(p_ucn, 'cancel') then
    raise exception 'RBAC: your role cannot cancel a call';
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
end $$;
