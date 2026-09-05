-- ===========================================================================
-- CLOSING A CALL WITHOUT A VISIT ENTRY.
--
-- A call is normally closed by the visit that solved it: `open_state` reads
-- Solved because the latest report said so. But calls also end for operational
-- reasons — the customer sorted it themselves, the machine was moved, the job
-- was done on another call — and until now the only ways out were to leave it
-- open for ever or to file a visit nobody made.
--
-- IT IS NOT RECORDED DIFFERENTLY (the user's decision, 2026-09-05). A call
-- closed this way is Solved, like any other closed call. It is not a separate
-- category, it does not get its own badge, and nothing downstream has to learn
-- a new state. What it does NOT do is invent a visit: `last_visit_at` is left
-- alone, so the visit history stays empty and honest.
--
-- `last_status` is set to plain 'Solved'. That reads as Solved everywhere
-- (`open_state` tests `like 'solved%'`), and it is the one thing here that must
-- not be overstated: writing "Solved - Report Completed" would claim a report
-- that was never written.
--
-- AND A VISIT ENTERED LATER SIMPLY TAKES OVER. `sync_call_last_visit` recomputes
-- `last_status` from the newest report whenever `reports` changes (0014's
-- trigger), so the moment a real visit is entered the call goes back to the
-- regular route — including back to OPEN if that visit says Unsolved. Nothing
-- here has to be undone first.
--
-- The pair on screen stays unambiguous, because the two never both apply:
--   • an OPEN call            → "Close call"        (this)
--   • a RE-OPENED call        → "Close again"       (0058) — withdraws the
--                                re-open and gives the count back
-- ===========================================================================

create or replace function public.close_call(p_ucn text)
returns text language plpgsql security definer set search_path = public as $$
declare v_found boolean; v_state text; v_reopened timestamptz; v_cancelled timestamptz;
begin
  -- The same gate as re-opening: whoever may put a call back on the open list
  -- may take one off it.
  if not (public.has_perm('pending.register') or public.has_perm('calls.create')) then
    raise exception 'RBAC: your role cannot close a call';
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
end $$;
revoke all on function public.close_call(text) from public;
grant execute on function public.close_call(text) to authenticated;
