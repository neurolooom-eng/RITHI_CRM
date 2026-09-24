-- ===========================================================================
-- CANCELLING A BATCH OF CALLS IN ONE GO.
--
--   The user, 2026-09-24: "Cancel all these calls in 1 Go with Reason as
--   'Duplicate Call'".
--
-- The everyday case this serves is exactly the one the reason names: a handful
-- of calls that are the SAME call, raised twice by different people or landed
-- twice from an import. Cancelling them one at a time is not merely slow — it
-- is a prompt answered a dozen times, which is how one of them gets a
-- different reason typed into it and the set stops reading as one decision.
--
-- IT ADDS NO NEW POWER, AND THAT IS THE WHOLE DESIGN. This function is
-- SECURITY INVOKER and does nothing itself: it LOOPS OVER `public.cancel_call`
-- (0108), which is the definer function that checks `calls.cancel`, refuses an
-- empty reason, refuses an unknown UCN and refuses one already cancelled. So a
-- role that cannot cancel one call cannot cancel fifty through here, and no
-- rule is written down twice — a second copy of a permission check is a second
-- copy to forget when the first one changes.
--
-- PARTIAL SUCCESS IS THE NORMAL OUTCOME AND IS REPORTED PER CALL. A selection
-- of twenty will routinely contain one that somebody already cancelled, and an
-- all-or-nothing batch would throw that whole decision away over it. Each
-- cancellation therefore runs in its OWN subtransaction (`begin ... exception`)
-- and the function returns one row per UCN saying whether it went through and,
-- if not, exactly what Postgres said. A batch that reports "18 done, 2 already
-- cancelled" is an answer; "ERROR" over the same twenty is not.
--
-- THE CAP IS 500 AND IT IS DELIBERATE. Cancelling is reversible (`restore_call`)
-- but it is still aimed at a whole register, and an accidental select-all
-- should not be able to take out ten thousand calls in one request. 500 is well
-- above any real duplicate set and below the PostgREST row cap, so the caller
-- always sees the whole report rather than a silently truncated one.
--
-- NOT A DELETE, the same as 0108: every row keeps its UCN, its visits and its
-- quality records, and reads as Cancelled.
-- ===========================================================================

create or replace function public.cancel_calls(p_ucns text[], p_reason text)
returns table (ucn text, ok boolean, error text)
language plpgsql
as $$
declare
  v_list text[];
  v_one  text;
  v_n    int;
begin
  -- Asked once, for the batch, rather than being discovered on call 1 of 50.
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'A cancellation needs a reason';
  end if;

  -- DE-DUPLICATED AND EMPTIES DROPPED. The same UCN twice in one selection is
  -- a client-side accident, and left alone it produces a row reading
  -- "already cancelled" against a call THIS batch had just cancelled — which
  -- reads as a fault and is not one.
  select coalesce(array_agg(distinct btrim(u)), '{}'::text[])
    into v_list
    from unnest(coalesce(p_ucns, '{}'::text[])) as u
   where coalesce(btrim(u), '') <> '';

  v_n := coalesce(array_length(v_list, 1), 0);
  if v_n = 0 then return; end if;
  if v_n > 500 then
    raise exception 'Too many calls in one go: % (the limit is 500)', v_n;
  end if;

  foreach v_one in array v_list loop
    begin
      perform public.cancel_call(v_one, p_reason);
      ucn := v_one; ok := true; error := null;
    exception when others then
      -- The message is passed through WORD FOR WORD. 0108 already says the
      -- useful thing ("Call X is already cancelled", "No call with UCN X",
      -- "RBAC: your role cannot cancel a call"), and a summary written here
      -- would be a second, worse copy of it.
      ucn := v_one; ok := false; error := sqlerrm;
    end;
    return next;
  end loop;
end $$;

revoke all on function public.cancel_calls(text[], text) from public;
grant execute on function public.cancel_calls(text[], text) to authenticated;

comment on function public.cancel_calls(text[], text) is
  'Cancel many calls with one reason. Loops cancel_call() per UCN in its own '
  'subtransaction and returns one row per UCN (ucn, ok, error). SECURITY '
  'INVOKER by design: the permission check lives in cancel_call().';
