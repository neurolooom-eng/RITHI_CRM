-- ===========================================================================
-- ONE TRACKER ITEM, ADDED BY SQL RATHER THAN BY HAND.
--
-- The user, 2026-09-08: "Add - Collect Engineer's Air Liquide ID , Map it in
-- the User Master and then Inform the Rithi Admin - Assign it to Devika".
--
-- WHY A MIGRATION FOR ONE ROW. The Tracker is a live table nobody can write to
-- from here -- the sandbox has no route to the database, and applying SQL is
-- the user's own step by design. A seeded row travels with the bundle instead,
-- so it arrives the same on every project rather than depending on who typed it
-- in. It is a row somebody could equally add on the page in twenty seconds;
-- this way it is also in the record.
--
-- IDEMPOTENT BY TITLE, like 0144. Running the bundle twice does not give
-- anybody a second copy, and an item somebody has since edited or closed is
-- left exactly as they left it.
-- ===========================================================================

do $seed$
declare
  seeded int := 0;
begin
  if to_regclass('public.tracker_items') is null then
    raise notice 'tracker_items is missing -- run tracker.sql first';
    return;
  end if;

  if not exists (
    select 1 from public.tracker_items i
     where i.title = 'Collect every engineer''s Air Liquide ID'
  ) then
    insert into public.tracker_items (title, detail, owner, area, status, sort_order)
    values (
      'Collect every engineer''s Air Liquide ID',
      'Collect the Air Liquide ID from each engineer, map it against their row in User Master, and tell the Rithi Admin once it is done. The mapping is what lets a person be recognised across both systems; until it exists the two directories can only be matched by name, which is exactly the join that goes wrong quietly.',
      'Devika',
      'Data',
      'Open',
      -- ABOVE the seeded backlog (which starts at 10). It was asked for
      -- directly and has a named owner, which the backlog items mostly do not.
      5
    );
    seeded := 1;
  end if;

  raise notice 'Tracker: % item added (Air Liquide ID)', seeded;
end $seed$;
