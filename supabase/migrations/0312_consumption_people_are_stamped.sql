-- ===========================================================================
-- WHO BOOKED AND WHO ADJUSTED A CONSUMPTION LINE COMES FROM THE SESSION
-- (D-042, FRS-151.5 and .7).
--
-- addReconciliationConsumption() sent `recorded_by` from the browser and
-- nothing replaced it (0059 added it as plain text); `adjusted_by` was stamped
-- only when the client sent it BLANK (0062, 0063), so a supplied name won. Both
-- are shown on the Consumption Report as the person who booked or adjusted the
-- line -- what the reader is shown was whatever the client said. The login was
-- always recoverable from sys_created_by / sys_updated_by (0244); these are the
-- columns people READ. 0211 fixed the same fault for spare_dispatches.
--
-- THE RULE (0211's): where there IS a signed-in session, the name comes from
-- it and a caller-supplied value is DISCARDED, not refused -- refusing makes an
-- honest client fail, discarding makes a buggy one harmless. Where there is
-- none (a migration, an administrative load) the supplied value is all there
-- is and is kept.
--
--   insert, source = 'Reconciliation'  recorded_by := the session's name
--   update that changes the quantity   adjusted_by := the session's name
--   any other update                   recorded_by and adjusted_by keep
--                                      what they were
--
-- A separate trigger rather than an edit to consumption_adjust_guard(): that
-- function has been rewritten four times (0062, 0063, 0259, 0263) and carries
-- the rename and part-rename exemptions; re-typing it to add two lines is how
-- a rule gets dropped (0210, 0217). Named so it fires AFTER the adjust and
-- reconcile guards, which decide whether the write happens at all, and before
-- zz_consumption_needs_visit and zzz_sys_stamp.
-- ===========================================================================

create or replace function public.consumption_stamp_people()
returns trigger language plpgsql security definer set search_path = public as $$
declare me text;
begin
  -- my_display_name() (0211) inlined: it lives in the spare_requests bundle,
  -- and this one must not need another bundle to have run.
  select coalesce(nullif(btrim(p.full_name), ''), nullif(btrim(p.email), ''))
    into me from public.profiles p where p.id = auth.uid();
  if me is null then return new; end if;     -- no session: keep what was sent

  if tg_op = 'INSERT' then
    if coalesce(new.source, '') = 'Reconciliation' then
      new.recorded_by := me;
    end if;
    return new;
  end if;

  -- UPDATE. The booking's author never changes after the booking.
  new.recorded_by := old.recorded_by;
  if new.qty is distinct from old.qty then
    new.adjusted_by := me;
  else
    new.adjusted_by := old.adjusted_by;
  end if;
  return new;
end $$;
revoke execute on function public.consumption_stamp_people() from public, anon, authenticated;

drop trigger if exists consumption_stamp_people on public.spare_consumption;
create trigger consumption_stamp_people
  before insert or update on public.spare_consumption
  for each row execute function public.consumption_stamp_people();
