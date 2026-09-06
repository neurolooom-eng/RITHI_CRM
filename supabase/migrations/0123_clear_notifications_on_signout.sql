-- ===========================================================================
-- Signing out clears your notifications — in the database, not just on screen.
--
-- The bell is a session convenience: "a call was allotted to you", "a spare you
-- asked for has been dispatched". The durable record is the call and the spare
-- request themselves, which is where anyone goes to act on either. So once you
-- sign out, the notifications have served their purpose and the rows go.
--
-- UNREAD ONES GO TOO. Sign-out is the clearing event, not "having read it" —
-- otherwise the thing the user asked for (a clean slate at the start of a
-- session) would not happen for exactly the people who have most piled up. The
-- work itself is not lost: the call is still in the register and the spare is
-- still on the request.
--
-- A SECURITY DEFINER function rather than a delete policy, so `authenticated`
-- is never granted `delete` on the table at all. It takes no arguments and
-- filters on auth.uid(): there is no shape of this call that reaches another
-- person's rows, and nothing to get wrong at the call site.
-- ===========================================================================

create or replace function public.clear_my_notifications()
returns integer language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); n integer;
begin
  -- Not signed in: nothing of yours to clear. Never a bare delete.
  if me is null then return 0; end if;
  delete from public.notifications where recipient_id = me;
  get diagnostics n = row_count;
  return n;
end $$;

revoke all on function public.clear_my_notifications() from public;
grant execute on function public.clear_my_notifications() to authenticated;
