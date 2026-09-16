-- ===========================================================================
-- WHO DISPATCHED A STOCK OUT IS STAMPED, NOT SENT.
--
-- Reported from use (the user, 2026-09-16): "dispatched_by -- Is not actually
-- taking the Name based on the USer. Kasturi is Dispatching whereas it still
-- shows Jagadesh."
--
-- THE NAME ON A DELIVERY CHALLAN IS DATA, and it came from the CALLER:
-- `dispatch_spare_lines(..., p_actor)` writes whatever the app sent into
-- `spare_dispatches.dispatched_by`, and the line rows copy it from there. So a
-- fault in the app is a fault on a document that leaves the building with the
-- company's mark on it.
--
-- And the app was sending the wrong thing. `SpareDispatch.tsx` read
-- `user?.name`, and the `User` type has no `name` — it has `fullName`. It
-- type-checked only because `BaseRecord` carries an index signature, so
-- `user?.name` is `undefined` at runtime, every time, and the value fell
-- through to the email. No error anywhere.
--
-- THE SAME RULE AS A CALL'S REGISTRANT (0113/0114): a caller-supplied value is
-- DISCARDED, not refused. Refusing makes an honest client fail; discarding
-- makes a dishonest — or merely buggy — one harmless.
--
-- ---------------------------------------------------------------------------
-- A TRIGGER, NOT A REWRITE OF THE FUNCTION, and that is the whole design here.
-- ---------------------------------------------------------------------------
-- The obvious change is to edit `dispatch_spare_lines` so it resolves the name
-- itself. The first draft of this migration did exactly that — against 0027's
-- version of the function, which is FOUR revisions out of date. The live one
-- carries partial dispatch: per-line quantities, the outstanding balance, the
-- refurbished flags and the `spare_dispatch_lines` rows. Replacing it with a
-- tidied copy of the old body would have silently deleted all of it.
--
-- So nothing about the function changes. A BEFORE INSERT trigger on
-- `spare_dispatches` overwrites `dispatched_by` with the session's own name,
-- which also covers any other path that ever inserts a dispatch — and the line
-- rows inherit it, because the function copies the header's value onto them.
--
-- AN ADMINISTRATIVE CONNECTION HAS NO SESSION. `auth.uid()` is null in the SQL
-- editor and during a restore, so there whatever was supplied is the only thing
-- there is and it is kept — the same exception 0114 makes, and for the same
-- reason: a bulk load must not stamp every row with nobody.
--
-- NOTHING ALREADY DISPATCHED IS REWRITTEN. A challan that has gone out says
-- what it said; changing that would be rewriting a despatch record after the
-- fact, which is worse than a name somebody can explain. Old stock outs keep
-- their `dispatched_by`, including ones carrying an email or a sheet-era name.
-- ===========================================================================

-- The signed-in person's display name, resolved the way `registrant_desks()`
-- resolves one: the profile's full name, falling back to its email. NULL when
-- there is no session at all, which is what the trigger below tests.
create or replace function public.my_display_name()
returns text language sql stable security definer set search_path = public as $$
  select coalesce(nullif(btrim(p.full_name), ''), nullif(btrim(p.email), ''))
    from public.profiles p
   where p.id = auth.uid()
$$;
grant execute on function public.my_display_name() to authenticated;

create or replace function public.spare_dispatches_stamp_actor()
returns trigger language plpgsql security definer set search_path = public as $$
declare me text;
begin
  me := public.my_display_name();
  -- Only where there IS a session. On an administrative connection the caller's
  -- value is all there is, and blanking it would lose the only record of who
  -- booked the stock out.
  if me is not null then new.dispatched_by := me; end if;
  return new;
end $$;

drop trigger if exists spare_dispatches_stamp_actor on public.spare_dispatches;
create trigger spare_dispatches_stamp_actor
  before insert on public.spare_dispatches
  for each row execute function public.spare_dispatches_stamp_actor();
