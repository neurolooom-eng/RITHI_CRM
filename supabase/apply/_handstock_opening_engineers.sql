-- ===========================================================================
-- OPENING STOCK: ACTIVE USERS OF THE USER MASTER, AND NOBODY ELSE.
--
-- The WinMax export's `User Name` column is not a list of engineers. It holds
-- dealers and customers too — on this project 252,592 of its 257,130 parts sit
-- under names like "A AND M HEALTH CARE C" — and every one of them was given a
-- hand-stock balance on a screen that only means anything for the people who
-- carry parts.
--
-- Asked which way to load it, the user said: USER MASTER, ACTIVE NAMES ONLY.
-- The uploader now holds the rest back before writing anything. This is the
-- same rule applied to what is ALREADY loaded.
--
-- The match is `lower(btrim(name))`, which is exactly the database's own
-- `handstock_key()` — the key the balance is grouped on — so a name that
-- survives here is the name its pool is filed under.
--
-- WHAT THIS REMOVES IS RE-LOADABLE. Every row it deletes came from the WinMax
-- file, and re-running that upload writes back exactly the rows this keeps. It
-- touches only `handstock_opening`: no movement, consumption, transfer or
-- return is affected, and the balance of every engineer who IS in the User
-- Master comes out unchanged.
--
-- SAFE TO RE-RUN. The second run finds nothing to remove.
--
-- IT LOOKS FIRST. Section A is READ-ONLY and names every pool that would go;
-- the delete is section B, commented out. It used to delete on the first run
-- and report afterwards, which is the wrong way round for a removal: by the
-- time the Messages tab said which names went, they had gone.
--
-- AND THE ANSWER IS NOT ALWAYS "a dealer". A name reaches this list three ways
-- and only one of them is the WinMax file:
--   • it is not in the User Master at all — the dealers and customers;
--   • it IS in the User Master and has been DEACTIVATED since the stock was
--     loaded — a real engineer, whose opening balance this would delete;
--   • it is in the User Master under a DIFFERENT SPELLING — a rename, a middle
--     initial, a trailing space — where the stock and the person are the same
--     person and the match is what is broken, not the data.
-- Section A says which, per name. The second and third are not this file's to
-- fix: re-activate the user, or correct the spelling in User Master, and the
-- row stops being on the list.
--
-- Read the Messages tab after section B: it says what went, what stayed, and
-- the balance before and after.
-- ===========================================================================

-- ---- A. WHAT WOULD GO, AND WHY IT IS ON THE LIST -------------------------
-- One row per NAME, largest first. Run this on its own and read it before
-- uncommenting anything.
select case
         when exists (select 1 from public.user_directory u
                       where lower(btrim(u.name)) = o.engineer_key)
           then 'IN USER MASTER BUT DEACTIVATED — re-activate them instead'
         when exists (select 1 from public.user_directory u
                       where u.validity
                         and lower(btrim(regexp_replace(u.name, '\s+', ' ', 'g')))
                           = lower(btrim(regexp_replace(o.engineer, '\s+', ' ', 'g'))))
           then 'SAME PERSON, DIFFERENT SPELLING — fix the name in User Master'
         else 'not in User Master — a dealer or customer from the WinMax file'
       end                                as "why it is on the list",
       o.engineer                         as "the name on the opening stock",
       count(*)                           as "rows",
       sum(o.qty)                         as "parts",
       count(distinct o.source)           as "pools",
       min(o.as_of)                       as "as of"
  from public.handstock_opening o
 where not exists (select 1 from public.user_directory u
                    where u.validity and lower(btrim(u.name)) = o.engineer_key)
 group by 1, 2
 order by 1, 4 desc nulls last;

-- (ONE STATEMENT. The Supabase SQL editor shows a single result grid, so a
-- second SELECT here would hand back only the later one.)


-- ---- B. THE REMOVAL. Commented out on purpose; read A first. -------------
-- Uncomment the whole block below and run it again. It removes every row
-- section A listed, WITHOUT READING THE REASON — and that is precisely why A
-- has to be read by a person first. A deactivated engineer and a misspelt name
-- are on that list beside the dealers, and this deletes all three alike.
--
-- So: fix those two in User Master FIRST (re-activate the engineer, correct the
-- spelling), re-run A until every remaining line reads "not in User Master",
-- and only then run this.
--

-- do $$
-- declare
--   v_active   int;
--   v_rows0    int;
--   v_qty0     numeric;
--   v_gone     int;
--   v_goneqty  numeric;
--   v_names    int;
--   v_rows1    int;
--   v_qty1     numeric;
--   r          record;
-- begin
--   select count(*) into v_active from public.user_directory where validity;
--   if v_active = 0 then
--     raise exception 'The User Master has no active users on this project. Load it first — otherwise this would delete every opening balance there is.';
--   end if;
--
--   select count(*), coalesce(sum(qty), 0) into v_rows0, v_qty0 from public.handstock_opening;
--   raise notice 'Before: % opening rows, % parts, against % active users in the User Master.', v_rows0, v_qty0, v_active;
--
--   -- Who is going, and how much with them. Named before anything is removed.
--   select count(distinct o.engineer_key), count(*), coalesce(sum(o.qty), 0)
--     into v_names, v_gone, v_goneqty
--     from public.handstock_opening o
--    where not exists (
--      select 1 from public.user_directory u
--       where u.validity and lower(btrim(u.name)) = o.engineer_key
--    );
--
--   if v_gone = 0 then
--     raise notice 'Nothing to remove — every opening balance is already against an active user.';
--     return;
--   end if;
--
--   raise notice 'Removing % rows / % parts, held under % name(s) that are not active users. A sample:', v_gone, v_goneqty, v_names;
--   for r in
--     select o.engineer_key as name, count(*) as rows, sum(o.qty) as qty
--       from public.handstock_opening o
--      where not exists (
--        select 1 from public.user_directory u
--         where u.validity and lower(btrim(u.name)) = o.engineer_key
--      )
--      group by 1 order by 3 desc nulls last limit 15
--   loop
--     raise notice '    %  —  % rows, % parts', r.name, r.rows, r.qty;
--   end loop;
--
--   delete from public.handstock_opening o
--    where not exists (
--      select 1 from public.user_directory u
--       where u.validity and lower(btrim(u.name)) = o.engineer_key
--    );
--
--   select count(*), coalesce(sum(qty), 0) into v_rows1, v_qty1 from public.handstock_opening;
--   raise notice 'After:  % opening rows, % parts. Re-loading the WinMax file writes back exactly these.', v_rows1, v_qty1;
-- end $$;
--
-- -- What is left, by pool. One row per opening balance you have loaded.
-- select source,
--        count(distinct engineer_key) as engineers,
--        count(*)                     as rows,
--        sum(qty)                     as parts
--   from public.handstock_opening
--  group by source
--  order by source;
