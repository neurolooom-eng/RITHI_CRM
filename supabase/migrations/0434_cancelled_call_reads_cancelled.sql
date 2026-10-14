-- ===========================================================================
-- 0434 -- A CANCELLED CALL'S STATUS READS "CANCELLED" (the user, 2026-10-14:
-- "these calls are Cancelled I believe, but the Status is still showing as
-- UnSolved. If a Call is Cancelled, then the Status should also State
-- 'Cancelled'").
--
-- Measured on the live project the same day: 26H07F0010, 26H07F0011 and
-- 26H31F0009 were cancelled on 18-Sep-2026 (cancel_call(), 0108) and read
-- open_state = 'Unsolved'. open_state is stamped by call_open_state_t (0226)
-- from the LATEST VISIT'S status alone, and cancelling a call through the app
-- writes cancelled_at / cancel_reason without touching the visits -- so the
-- column only said Cancelled when a visit's own text did (the AppSheet
-- "Canceled"), never for a call cancelled here.
--
-- NOW: a call with cancelled_at set reads 'Cancelled', whatever its visits
-- say. Restoring it (restore_call() clears cancelled_at) puts back the state
-- its visits give, because the same trigger runs on that update. Nothing else
-- changes: call_open_state() keeps its two arguments and its answers (the
-- client's stateBucket() is compared with it), and the visits are untouched.
--
-- Every screen and report reading open_state -- the call report, the DCCR,
-- Product Failure Analysis, Solved without a Report -- therefore says
-- Cancelled for these calls too, which is the rule as the user stated it.
-- ===========================================================================

create or replace function public.call_open_state_stamp()
returns trigger language plpgsql set search_path = public as $$
begin
  -- Whatever the caller sent is discarded. This is a derived value. A call
  -- cancelled in RITHI (0108) is Cancelled first; otherwise its latest visit
  -- decides (0226).
  new.open_state := case when new.cancelled_at is not null then 'Cancelled'
                         else public.call_open_state(new.last_status, new.last_visit_at) end;
  return new;
end $$;
revoke execute on function public.call_open_state_stamp() from public, anon, authenticated;

-- Restate the calls already cancelled. The trigger above writes the value;
-- `set open_state = open_state` only makes it run.
do $restate$
declare t text; n bigint; total bigint := 0;
begin
  foreach t in array array['field_calls', 'installation_calls', 'pm_calls'] loop
    continue when to_regclass('public.' || t) is null;
    execute format('update public.%I set open_state = open_state '
                   'where cancelled_at is not null and open_state is distinct from %L', t, 'Cancelled');
    get diagnostics n = row_count;
    total := total + n;
  end loop;
  raise notice '0434: % cancelled call(s) now read Cancelled.', total;
end $restate$;
