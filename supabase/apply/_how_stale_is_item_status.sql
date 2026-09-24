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
-- customer should be charged. Row 5 counts those.
--
-- A CALL'S ITEM STATUS IS A DIFFERENT QUESTION AND MUST NOT BE "FIXED" THE SAME
-- WAY. What cover a machine was under WHEN THE FAULT HAPPENED is a historical
-- fact that decided whether that visit was charged; recomputing it against
-- today would rewrite past billing. Row 4 counts the calls whose stamped status
-- differs from the machine's cover today WITHOUT judging them -- the ones worth
-- looking at are the OPEN calls, which have not been billed yet.
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
)
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
  from cmp;

-- ---- what it has already done to the spare register ------------------------
-- A request raised on a machine whose cached status said "covered" while the
-- machine was in fact out of cover. `spare_needs_review` saw the cached word,
-- so Commercial and NSM were never asked. Empty here is the good answer.
select r.uid, r.created_at, r.engineer, r.party_name, r.product_name, r.serial,
       r.item_status as status_when_raised,
       case
         when p.contract_end >= current_date then coalesce(nullif(btrim(p.contract_type), ''), 'CMC')
         when p.warranty_end >= current_date then 'WGP'
         else 'OGP'
       end as machine_today,
       p.warranty_end, p.contract_end
  from public.spare_requests r
  join public.products p on lower(btrim(p.serial_number)) = lower(btrim(r.serial))
 where coalesce(btrim(r.item_status), '') !~* '^(amc|ogp)$'
   and (case
          when p.contract_end >= current_date then coalesce(nullif(btrim(p.contract_type), ''), 'CMC')
          when p.warranty_end >= current_date then 'WGP'
          else 'OGP'
        end) = 'OGP'
 order by r.created_at desc nulls last
 limit 300;

-- ---- and the OPEN calls carrying a status that is no longer true -----------
-- Closed calls are left alone: their status is the record of what applied when
-- the work was done. These have not been billed yet.
select c.ucn, c.call_type, c.reg_date, c.party_name, c.product_name, c.serial,
       c.item_status as stamped_on_the_call,
       case
         when p.contract_end >= current_date then coalesce(nullif(btrim(p.contract_type), ''), 'CMC')
         when p.warranty_end >= current_date then 'WGP'
         else 'OGP'
       end as machine_today
  from public.calls c
  join public.products p on lower(btrim(p.serial_number)) = lower(btrim(c.serial))
 where c.cancelled_at is null
   and (c.open_state <> 'Solved' or c.reopened_at is not null)
   and upper(coalesce(btrim(c.item_status), '')) is distinct from upper(case
         when p.contract_end >= current_date then coalesce(nullif(btrim(p.contract_type), ''), 'CMC')
         when p.warranty_end >= current_date then 'WGP'
         else 'OGP' end)
 order by c.reg_date desc nulls last
 limit 300;
