-- ===========================================================================
-- PRODUCT DATABASE 2.0 REACHES THE ROLES THAT ALREADY HAVE THE PRODUCT DATABASE.
--
-- `permsForRole()` is `if (stored && stored.length) return stored;` — the code
-- defaults apply ONLY to a role whose stored set is EMPTY, and on a project in
-- use every role has a tuned row. So a new module's key reaches NOBODY until a
-- migration puts it there: the screen ships, the menu entry exists, the
-- permission is ticked in DEFAULT_PERMS, and the page is invisible to every
-- role with no error anywhere. That is what happened to Machine History, the
-- Call Report and the Customer Feedback Report; 0192/0195 are the pattern.
--
-- THE AUDIENCE IS COPIED, NOT CHOSEN. Whoever can open the Product Database can
-- open 2.0 — it is the same machines seen a second way, so picking a different
-- list would be deciding, in a migration, that somebody should not be able to
-- compare the two. 0192 did exactly this when the Product Master and Product
-- Database swapped names.
--
-- MERGE, NEVER OVERWRITE, and leave a role with ZERO permissions alone: an
-- empty array means "not configured" and writing one key into it switches the
-- engineer fallback off, taking away everything else that role could do.
-- ===========================================================================
do $$
declare n int; who text; skipped text;
begin
  if to_regclass('public.app_roles') is null then
    raise notice '0219: app_roles is missing -- run rbac.sql first';
    return;
  end if;

  update public.app_roles ar
     set permissions = (
           select jsonb_agg(distinct p)
             from jsonb_array_elements(ar.permissions || '["mod:/product-database-2"]'::jsonb) p)
   where ar.permissions ? 'mod:/product-database'
     and jsonb_array_length(coalesce(ar.permissions, '[]'::jsonb)) > 0
     and not (ar.permissions ? 'mod:/product-database-2');
  get diagnostics n = row_count;

  select string_agg(ar.role, ', ' order by ar.role) into who
    from public.app_roles ar where ar.permissions ? 'mod:/product-database-2';

  -- SAY WHAT WAS NOT DONE. A role that holds the old key but has zero
  -- permissions cannot hold it, so this can never fire -- but a role that holds
  -- NEITHER key is a role nobody will be able to open the new screen with, and
  -- that is worth reading rather than discovering.
  select string_agg(ar.role, ', ' order by ar.role) into skipped
    from public.app_roles ar
   where not (ar.permissions ? 'mod:/product-database')
     and jsonb_array_length(coalesce(ar.permissions, '[]'::jsonb)) > 0;

  raise notice '0219: % role(s) gained mod:/product-database-2; now holding it: %',
    n, coalesce(who, 'none');
  if skipped is not null then
    raise notice '0219: NOT granted (they do not hold the Product Database either): %', skipped;
  end if;
end $$;
