-- ===========================================================================
-- MOVE A SPARE REQUEST TO A DIFFERENT ENGINEER
--
-- Ad-hoc, run by hand in the SQL editor. Nothing here is a migration.
--
-- Edit the SEARCH for the new engineer and the list of OR numbers, then run the
-- steps in order. The name is read FROM THE USER MASTER rather than typed, and
-- the change refuses to run unless that search matches exactly one person.
--
-- Step 3 is ONE statement and it COMMITS ON ITS OWN. It used to sit inside an
-- explicit `begin;` waiting for a `commit;` — a psql habit that does not fit
-- the Supabase SQL editor, where the batch ends without one and the change is
-- thrown away. It looked like it had worked and nothing had changed. The block
-- is atomic by itself: if the guard raises, no row is touched.
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
-- 2. WHO, EXACTLY. The name is taken FROM THE USER MASTER, not typed: hand
--    stock is keyed on the engineer's name, so a spelling that differs by one
--    character puts the stock somewhere nobody is looking. Check this returns
--    the one person you mean before running step 3.
-- ---------------------------------------------------------------------------
select id, name, email, gmail, designation, region, validity
  from public.user_directory
 where name ilike '%pawan%'                       -- <-- who to move them to
 order by name;

-- ---------------------------------------------------------------------------
-- 3. THE CHANGE. It refuses to run unless that search matches EXACTLY ONE
--    person, so a second Pawan stops it rather than picking one at random.
--    ONE statement, applied when it succeeds. Nothing to commit afterwards.
-- ---------------------------------------------------------------------------
do $$
declare
  v_who   text := '%pawan%';                      -- <-- the same search as above
  v_ors   text[] := array['OR-2609-0002','OR-2609-0004','OR-2609-0005','OR-2609-0006','OR-2609-0007'];
  v_name  text;
  v_email text;
  n       int;
  moved   int;
begin
  select count(*) into n from public.user_directory where name ilike v_who;
  if n <> 1 then
    raise exception 'The User Master has % people matching %  — narrow the search to the one you mean', n, v_who;
  end if;

  select name, nullif(btrim(coalesce(nullif(btrim(email), ''), gmail)), '')
    into v_name, v_email
    from public.user_directory where name ilike v_who;

  update public.spare_requests r
     set engineer       = v_name,
         engineer_email = coalesce(v_email, r.engineer_email)
   where r.or_no = any (v_ors);
  get diagnostics moved = row_count;

  raise notice 'Moved % of % requests to "%" (%)', moved, array_length(v_ors, 1), v_name, coalesce(v_email, 'email unchanged');
end $$;

-- ---------------------------------------------------------------------------
-- 4. CHECK — this is what the register will show.
-- ---------------------------------------------------------------------------
select or_no, engineer, engineer_email
  from public.spare_requests
 where or_no in ('OR-2609-0002','OR-2609-0004','OR-2609-0005','OR-2609-0006','OR-2609-0007')
 order by or_no;

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
