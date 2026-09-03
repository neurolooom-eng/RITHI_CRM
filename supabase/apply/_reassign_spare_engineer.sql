-- ===========================================================================
-- MOVE A SPARE REQUEST TO A DIFFERENT ENGINEER
--
-- Ad-hoc, run by hand in the SQL editor. Nothing here is a migration.
--
-- Edit the TWO values in `new_owner` and the list of OR numbers, then run the
-- three steps in order. Step 2 does not commit on its own: look at what step 3
-- prints and only then run COMMIT (or ROLLBACK, and nothing happened).
--
-- WHAT ELSE MOVES: hand stock follows the NAME. Any spare issued on these
-- requests is currently counted in the old engineer's hand stock, and after
-- this it is counted in the new one's — which is the point when a request was
-- raised against the wrong person, and is worth knowing when it is not.
--
-- The OR number itself never changes: it is quoted on DCs and in Tally, and the
-- database refuses to change one (0011).
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. LOOK FIRST — who holds these requests now, and what is on them.
-- ---------------------------------------------------------------------------
select r.or_no, r.engineer, r.engineer_email, r.ucn, r.call_number, r.party_name,
       r.status, r.stage, count(l.id) as spares, coalesce(sum(l.qty), 0) as qty
  from public.spare_requests r
  left join public.spare_request_lines l on l.request_uid = r.uid
 where r.or_no in ('OR-2609-0002','OR-2609-0004','OR-2609-0005','OR-2609-0006','OR-2609-0007')
 group by 1,2,3,4,5,6,7,8
 order by r.or_no;

-- ---------------------------------------------------------------------------
-- 2. THE CHANGE.
-- ---------------------------------------------------------------------------
begin;

with new_owner as (
  select
    'ENGINEER NAME'::text            as engineer,        -- <-- exactly as the User Master spells it
    'engineer@airliquide.com'::text  as engineer_email   -- <-- '' to leave the email as it is
)
update public.spare_requests r
   set engineer       = n.engineer,
       engineer_email = case when btrim(n.engineer_email) = '' then r.engineer_email else n.engineer_email end
  from new_owner n
 where r.or_no in ('OR-2609-0002','OR-2609-0004','OR-2609-0005','OR-2609-0006','OR-2609-0007');

-- ---------------------------------------------------------------------------
-- 3. CHECK, THEN COMMIT — or ROLLBACK and nothing happened.
-- ---------------------------------------------------------------------------
select or_no, engineer, engineer_email
  from public.spare_requests
 where or_no in ('OR-2609-0002','OR-2609-0004','OR-2609-0005','OR-2609-0006','OR-2609-0007')
 order by or_no;

-- commit;
-- rollback;

-- ---------------------------------------------------------------------------
-- AFTERWARDS: where the stock now sits, for the parts on those requests.
-- ---------------------------------------------------------------------------
-- select b.engineer, b.part_code, b.on_hand
--   from public.handstock_balance b
--  where b.part_code in (
--    select public.part_code(l.part)
--      from public.spare_request_lines l
--      join public.spare_requests r on r.uid = l.request_uid
--     where r.or_no in ('OR-2609-0002','OR-2609-0004','OR-2609-0005','OR-2609-0006','OR-2609-0007'))
--  order by 2, 1;
