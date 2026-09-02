-- ===========================================================================
-- Closing a re-opened call again, without inventing a visit.
--
-- A call is often re-opened only to correct it — the complaint was typed
-- wrong, the wrong machine was picked. Once corrected there was no way back:
-- the state comes from the latest visit, so the only route to Closed was to
-- enter a visit that never happened.
--
-- `close_reopened_call` withdraws the re-open instead: `reopened_at` is
-- cleared, so the call falls back to what its last visit said (Solved), and
-- nothing is added to its visit history.
--
-- The re-open count is given back. `reopened_at` is only set while NO visit
-- has followed the re-open — once one is entered, sync_call_last_visit clears
-- it and the count stands. So a re-open that is withdrawn never led to a
-- visit: it was an edit, and "how many calls were re-opened" should not count
-- it.
-- ===========================================================================

create or replace function public.close_reopened_call(p_ucn text, p_reason text default '')
returns text language plpgsql security definer set search_path = public as $$
declare v_reopened timestamptz; v_found boolean;
begin
  if not (public.has_perm('pending.register') or public.has_perm('calls.create')) then
    raise exception 'RBAC: your role cannot close a re-opened call';
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
end $$;
grant execute on function public.close_reopened_call(text, text) to authenticated;
