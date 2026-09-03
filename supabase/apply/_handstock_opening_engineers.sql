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
-- Read the Messages tab: it says what went, what stayed, and the balance
-- before and after.
-- ===========================================================================

do $$
declare
  v_active   int;
  v_rows0    int;
  v_qty0     numeric;
  v_gone     int;
  v_goneqty  numeric;
  v_names    int;
  v_rows1    int;
  v_qty1     numeric;
  r          record;
begin
  select count(*) into v_active from public.user_directory where validity;
  if v_active = 0 then
    raise exception 'The User Master has no active users on this project. Load it first — otherwise this would delete every opening balance there is.';
  end if;

  select count(*), coalesce(sum(qty), 0) into v_rows0, v_qty0 from public.handstock_opening;
  raise notice 'Before: % opening rows, % parts, against % active users in the User Master.', v_rows0, v_qty0, v_active;

  -- Who is going, and how much with them. Named before anything is removed.
  select count(distinct o.engineer_key), count(*), coalesce(sum(o.qty), 0)
    into v_names, v_gone, v_goneqty
    from public.handstock_opening o
   where not exists (
     select 1 from public.user_directory u
      where u.validity and lower(btrim(u.name)) = o.engineer_key
   );

  if v_gone = 0 then
    raise notice 'Nothing to remove — every opening balance is already against an active user.';
    return;
  end if;

  raise notice 'Removing % rows / % parts, held under % name(s) that are not active users. A sample:', v_gone, v_goneqty, v_names;
  for r in
    select o.engineer_key as name, count(*) as rows, sum(o.qty) as qty
      from public.handstock_opening o
     where not exists (
       select 1 from public.user_directory u
        where u.validity and lower(btrim(u.name)) = o.engineer_key
     )
     group by 1 order by 3 desc nulls last limit 15
  loop
    raise notice '    %  —  % rows, % parts', r.name, r.rows, r.qty;
  end loop;

  delete from public.handstock_opening o
   where not exists (
     select 1 from public.user_directory u
      where u.validity and lower(btrim(u.name)) = o.engineer_key
   );

  select count(*), coalesce(sum(qty), 0) into v_rows1, v_qty1 from public.handstock_opening;
  raise notice 'After:  % opening rows, % parts. Re-loading the WinMax file writes back exactly these.', v_rows1, v_qty1;
end $$;

-- What is left, by pool. One row per opening balance you have loaded.
select source,
       count(distinct engineer_key) as engineers,
       count(*)                     as rows,
       sum(qty)                     as parts
  from public.handstock_opening
 group by source
 order by source;
