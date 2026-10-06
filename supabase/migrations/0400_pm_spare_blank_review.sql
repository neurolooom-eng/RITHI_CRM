-- ===========================================================================
-- 0400  PM CALLS WITH A SPARE: SPARE ON A REVIEW ROW THAT IS BLANK (2026-10-06).
--
-- 0399's re-run added no PM call: _pm_spare_calls_in_dccr.sql showed all 28
-- PM calls of 2026 carrying a Spare ALREADY HAD a call_reviews row -- empty
-- rows created 05-Sep-2026 -- so `on conflict do nothing` left them, and their
-- Spare / Consumable / Correction / Calibration stayed blank. They are in the
-- DCCR View (0397's dccr_calls lists every PM call with a review); what was
-- missing is the pre-set the user asked for.
--
--   1. pm_spare_to_dccr() restated from the database with one change: an
--      existing row whose answer is BLANK takes SPARE; an answer anybody gave
--      is never overwritten.
--   2. The same for the rows already there, 2026 only (the user's choice).
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.pm_spare_to_dccr()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if coalesce(new.qty, 0) <= 0 or btrim(coalesce(new.ucn, '')) = '' then return null; end if;
  if not exists (select 1 from public.pm_calls p where p.ucn = new.ucn) then return null; end if;
  if not public.part_is_spare(new.part) then return null; end if;
  insert into public.call_reviews (ucn, call_number, spare_category)
  select p.ucn, coalesce(p.call_number, ''), 'SPARE' from public.pm_calls p where p.ucn = new.ucn
  -- A review row that exists but is BLANK on this answer takes SPARE too
  -- (0400): 28 PM calls of 2026 already had empty rows from 05-Sep-2026.
  -- An answer somebody gave is never overwritten.
  on conflict (ucn) do update set spare_category = 'SPARE'
   where btrim(coalesce(public.call_reviews.spare_category, '')) = '';
  return null;
end $function$;

do $$
declare n integer;
begin
  if to_regprocedure('public.part_is_spare(text)') is null then return; end if;
  update public.call_reviews r
     set spare_category = 'SPARE'
   where btrim(coalesce(r.spare_category, '')) = ''
     and exists (select 1 from public.pm_calls p
                  join public.spare_consumption s on s.ucn = p.ucn
                 where p.ucn = r.ucn and p.reg_date >= date '2026-01-01'
                   and coalesce(s.qty, 0) > 0 and public.part_is_spare(s.part));
  get diagnostics n = row_count;
  raise notice '0400: % PM review row(s) of 2026 given SPARE where the answer was blank', n;
end $$;
