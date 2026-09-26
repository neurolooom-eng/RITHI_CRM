-- ===========================================================================
-- ITEM STATUS IS A CACHE OF A VALUE THAT DEPENDS ON TODAY'S DATE, AND NOTHING
-- REFRESHES IT.
--
--   The user, 2026-09-24: "The Item status is stale - leading to confusion in
--   the Current item status" -- on the Product Database, the Call Register and
--   the Spare Request Register.
--
-- THE MECHANISM, exactly. `sync_product_cover()` (0036) writes
-- `products.item_status` with this rule:
--
--     when contract_end >= current_date then <contract type>
--     when warranty_end >= current_date then 'WGP'
--     else 'OGP'
--
-- `current_date` is evaluated AT THE MOMENT A SALE OR CONTRACT ROW IS WRITTEN,
-- and the answer is stored. The function runs from a trigger on the sale and
-- contract registers and from nothing else -- no schedule, no nightly job. So a
-- machine's Item Status is frozen at the date somebody last edited its
-- paperwork, and the day its warranty runs out nothing anywhere notices.
--
-- `machine_cover.item_status` computes the SAME rule live, so the two disagree
-- for every machine whose cover has lapsed since its last edit. That gap is
-- what rows 1-3 measure.
--
-- WHY THIS IS NOT A DISPLAY PROBLEM. `spare_needs_review(item_status)` (0012)
-- is `^(amc|ogp)$` -- a spare request is sent to Commercial and NSM ONLY when
-- the machine is AMC or OGP, and auto-approved otherwise. A machine that has
-- actually fallen out of cover to OGP while its cached status still reads WGP
-- or CMC therefore SKIPS BOTH APPROVALS, and nobody is asked whether the
-- customer should be charged. Row 5 counts those, and rows 101 onwards name
-- them.
--
-- A CALL'S ITEM STATUS IS A DIFFERENT QUESTION AND MUST NOT BE "FIXED" THE SAME
-- WAY. What cover a machine was under WHEN THE FAULT HAPPENED is a historical
-- fact that decided whether that visit was charged; recomputing it against
-- today would rewrite past billing. Row 4 counts the calls whose stamped status
-- differs from the machine's cover today WITHOUT judging them -- the ones worth
-- looking at are the OPEN calls, which have not been billed yet. Row 6 counts
-- those and rows 501 onwards name them.
--
-- A MACHINE IS ITS MODEL AND ITS SERIAL. The spare and call lists match on
-- BOTH: matched on the serial alone, the eleven machines numbered 219 each
-- answered for the others.
--
-- ONE STATEMENT, ONE GRID (finding 40). The SQL editor shows only the LAST
-- result, and this file used to be three queries -- so rows 1-4 never reached
-- the screen. The lists are rows of the same grid now, capped at 300 each.
--
-- READ-ONLY. Nothing is written or repaired here.
-- ===========================================================================

with live as (
  select p.id, p.serial_number, p.item_name, p.party_name,
         btrim(coalesce(p.item_status, '')) as cached,
         case
           when p.contract_end >= current_date then coalesce(nullif(btrim(p.contract_type), ''), 'CMC')
           when p.warranty_end >= current_date then 'WGP'
           else 'OGP'
         end as today,
         p.warranty_end, p.contract_end
    from public.products p
), cmp as (
  select *, upper(cached) is distinct from upper(today) as stale from live
),
-- A request raised on a machine whose cached status said "covered" while the
-- machine was in fact out of cover. `spare_needs_review` saw the cached word,
-- so Commercial and NSM were never asked. Empty is the good answer.
spares as (
  select r.uid, r.created_at, r.engineer, r.party_name, r.product_name, r.serial,
         r.item_status as status_when_raised, l.today as machine_today,
         l.warranty_end, l.contract_end
    from public.spare_requests r
    join live l on lower(btrim(l.item_name)) = lower(btrim(r.product_name))
               and lower(btrim(l.serial_number)) = lower(btrim(r.serial))
   where coalesce(btrim(r.item_status), '') !~* '^(amc|ogp)$'
     and l.today = 'OGP'
),
-- The OPEN calls carrying a status that is no longer true. Closed calls are
-- left alone: their status is the record of what applied when the work was
-- done. These have not been billed yet.
opencalls as (
  select c.ucn, c.call_type, c.reg_date, c.party_name, c.product_name, c.serial,
         c.item_status as stamped_on_the_call, l.today as machine_today
    from public.calls c
    join live l on lower(btrim(l.item_name)) = lower(btrim(c.product_name))
               and lower(btrim(l.serial_number)) = lower(btrim(c.serial))
   where c.cancelled_at is null
     and (c.open_state <> 'Solved' or c.reopened_at is not null)
     and upper(coalesce(btrim(c.item_status), '')) is distinct from upper(l.today)
)
select * from (
  select 1 as row, 'machines in the Product Database' as measure, count(*)::text as value,
         'Every one carries a stored Item Status that was correct on the day its sale or contract row was last written.' as what_it_means
    from cmp
  union all
  select 2, 'Item Status that is WRONG TODAY', count(*) filter (where stale)::text,
         'The stored value disagrees with the same rule evaluated now. Nothing is broken in the data -- the cache simply has no refresh.'
    from cmp
  union all
  select 3, '...of those, COVER HAS LAPSED (says covered, is OGP)',
         count(*) filter (where stale and upper(today) = 'OGP')::text,
         'THE ONES THAT COST MONEY. The machine is out of warranty and out of contract, the register still says it is covered, and every spare raised against it auto-approves past Commercial and NSM.'
    from cmp
  union all
  select 4, '...and the other way (says OGP, is covered)',
         count(*) filter (where stale and upper(today) <> 'OGP')::text,
         'A renewal was entered but the machine''s cached status was never rebuilt -- these are sent for approval that is not needed, and may be charged to a customer who is under contract.'
    from cmp
  union all
  select 5, 'SPARE REQUESTS that skipped Commercial and NSM', count(*)::text,
         'Raised while the cached status said covered and the machine was in fact OGP. Rows 101 onwards name them (newest first, up to 300). Zero is the good answer.'
    from spares
  union all
  select 6, 'OPEN calls stamped with a status no longer true', count(*)::text,
         'Not billed yet, so still worth correcting. Rows 501 onwards name them (newest first, up to 300). Closed calls are not counted: their status is the record of what applied at the time.'
    from opencalls
  union all
  select * from (
    select (100 + row_number() over (order by created_at desc nulls last, uid))::int,
           'spare ' || uid || ' -- ' || coalesce(product_name, '') || ' / ' || coalesce(serial, ''),
           coalesce(status_when_raised, '(blank)') || ' when raised; ' || machine_today || ' today',
           'raised ' || coalesce(created_at::text, '(no date)') || ' by ' || coalesce(nullif(btrim(engineer), ''), '(nobody)')
           || ' for ' || coalesce(nullif(btrim(party_name), ''), '(no party)')
           || '; warranty to ' || coalesce(warranty_end::text, '--') || ', contract to ' || coalesce(contract_end::text, '--')
      from spares
     order by created_at desc nulls last, uid
     limit 300
  ) s
  union all
  select * from (
    select (500 + row_number() over (order by reg_date desc nulls last, ucn))::int,
           'call ' || ucn || ' -- ' || coalesce(product_name, '') || ' / ' || coalesce(serial, ''),
           coalesce(nullif(btrim(stamped_on_the_call), ''), '(blank)') || ' on the call; ' || machine_today || ' today',
           coalesce(call_type, '') || ' call registered ' || coalesce(reg_date::text, '(no date)')
           || ' for ' || coalesce(nullif(btrim(party_name), ''), '(no party)')
      from opencalls
     order by reg_date desc nulls last, ucn
     limit 300
  ) o
) g order by row;
