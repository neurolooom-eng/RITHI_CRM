-- ===========================================================================
-- A RECONCILIATION DOES NOT NEED A VISIT BEHIND IT.
--
--   The user, 2026-09-26: "Exempt reconciliation from the visit rule and fix
--   it" -- finding 47 in docs/MODULE_REVIEW_LOG.md.
--
-- WHAT WENT WRONG. 0214 refuses any consumption line whose call has no row in
-- `reports`, and it refused every SOURCE alike. "Add consumption
-- (reconciliation)" exists for exactly the case 0214 refuses: its own words are
-- "Books spares against a call without waiting for the engineer's report -- for
-- a part fitted but never reported". So on a call nobody had filed a visit
-- against, the screen built for it could not save at all. Reported
-- 2026-09-26: AJAY G (INDOOR SERVICE) held seven parts, all received by
-- transfer, and none could be booked against 26G06F0006. Reproduced on a copy
-- database: refused with no visit, and the identical row accepted once one
-- visit was added.
--
-- WHAT THIS CHANGES -- ONE SOURCE, NOTHING ELSE:
--   * source = 'Reconciliation' passes without a visit.
--   * Every other source is refused exactly as before: a line from Call
--     Reporting (which files the visit first anyway), and the BULK CONSUMPTION
--     UPLOAD, whose rows still need a visit on their call.
--
-- WHY THIS IS NOT A WAY ROUND THE RULE FOR EVERYBODY. The source is not a free
-- choice. `cons_write` (the insert policy) requires `consumption.reconcile` for
-- a Reconciliation row -- held by admin, hotline and spare_coordinator on a
-- database built from the migrations -- and `consumption_reconcile_guard`
-- still demands the call exist, the engineer, the part and a written reason.
-- The hand-stock cap still applies. An engineer who writes
-- source = 'Reconciliation' to skip the visit is refused by the policy, not
-- waved through here. `consumption_before_insert` fills a blank source with
-- 'Report' and runs before this (triggers fire in name order, and this one is
-- `zz_`), so a row that names no source is never read as a reconciliation.
--
-- WHAT THE USER ACCEPTS WITH IT, said plainly because it undoes part of
-- 0214's reason. MEASURED on a database, not read off 0214's comment -- which
-- predates 0215 and would have said "blank": on a reconciliation with no visit
-- the Consumption Report shows
--   "Visit Entry Date"  = when the line was booked   (0215's last fallback)
--   "Visit Date & Time" = when the line was booked   (the same)
--   "Visit UID"         = blank                      (an id cannot be guessed)
-- So the dates are an APPROXIMATION standing in for a visit that was never
-- filed, and the line points at no visit. Those columns are joined in from the
-- latest visit, not stored on the line, so FILING THE VISIT LATER replaces all
-- three with the real ones, with nothing re-entered.
-- `_consumption_without_a_visit.sql` still lists every such line.
--
-- INSERT ONLY, as 0214 was. The trigger is re-created unchanged; only the
-- function body moves.
-- ===========================================================================
create or replace function public.consumption_needs_a_visit()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  -- A blank UCN is the reconciliation guard's to refuse, with a better message.
  if btrim(coalesce(new.ucn, '')) = '' then return new; end if;

  -- A hand-booked reconciliation is for a part fitted but never reported, so
  -- the missing visit is the reason it exists (0243). Who may write one is
  -- the insert policy's question (consumption.reconcile), not this trigger's.
  if coalesce(new.source, 'Report') = 'Reconciliation' then return new; end if;

  if not exists (select 1 from public.reports r where r.ucn = new.ucn) then
    raise exception
      'No visit has been filed on % yet, so a spare cannot be booked against it. '
      'File the visit report first — the spare is recorded on the visit it was used on.',
      new.ucn;
  end if;
  return new;
end $$;

drop trigger if exists zz_consumption_needs_visit on public.spare_consumption;
create trigger zz_consumption_needs_visit
  before insert on public.spare_consumption
  for each row execute function public.consumption_needs_a_visit();
