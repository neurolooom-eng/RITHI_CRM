-- ===========================================================================
-- ProdHistory_06 — LETTING THE APPLICATION LOAD THE ARCHIVE.
--
-- RUN THIS ON THE ARCHIVE PROJECT (sxcccaghpvznllvdebcb), after ProdHistory_03.
--
-- ProdHistory_02 made this database read-only from the browser and argued for
-- it at length. This file DELIBERATELY REOPENS PART OF THAT, because loading
-- ten CSV exports through the SQL editor is a job somebody has to do at a
-- keyboard on a Tuesday, and Bulk Uploads already knows how to read a sheet,
-- match its headers, parse its dates day-first and show what it is about to
-- write before it writes it.
--
-- ── What changes, and what pointedly does not ──────────────────────────────
--
-- INSERT is granted. UPDATE and DELETE are NOT, and there is still no policy
-- for either, so the strongest property from 02 survives intact:
--
--   ** NOTHING REACHABLE FROM THE BROWSER CAN ALTER OR DESTROY AN EXISTING
--      ARCHIVE ROW. **
--
-- The worst a leaked key now does is APPEND — rubbish rows next to the real
-- ones, not instead of them. That is recoverable; an UPDATE policy would not
-- be, because a wrong value written over a 2016 record cannot be reconstructed
-- from anywhere.
--
-- ── Every row must say where it came from ──────────────────────────────────
--
-- The policy's WITH CHECK refuses a row whose `source_system` is blank. That
-- one condition is what makes the append recoverable: a batch loaded in error
-- is one labelled DELETE away, run by you, as the owner, in the SQL editor:
--
--   delete from public.history_calls where source_system = 'AppSheet 2016-2019';
--
-- Without it a mistaken load would be indistinguishable from the real data the
-- moment it landed, and the only honest answer would be to reload the whole
-- archive. So the label is not paperwork — it is the undo button, and that is
-- why the database refuses the row rather than the screen merely asking nicely.
-- (Bulk Uploads also refuses to send one, but a check that lives only in the
-- browser is a check that one curl request walks past.)
-- ===========================================================================

do $$
declare t text;
begin
  foreach t in array array['history_machines', 'history_calls', 'history_visits',
                           'history_parts', 'history_cover']
  loop
    -- INSERT only. Note what is NOT here: no `for update`, no `for delete`.
    execute format('drop policy if exists %I on public.%I', t || '_insert', t);
    execute format(
      'create policy %I on public.%I for insert to anon, authenticated
         with check (coalesce(btrim(source_system), '''') <> '''')',
      t || '_insert', t);

    -- The privilege, matching the policy exactly. UPDATE, DELETE and TRUNCATE
    -- stay revoked — 02 removed them, and this file must not quietly hand any
    -- of them back while adding the one it needs.
    execute format('grant insert on public.%I to anon, authenticated', t);
    execute format('revoke update, delete, truncate on public.%I from anon, authenticated', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- CHECK IT IS EXACTLY AS NARROW AS IT READS.
--
-- Both queries are worth running: the first says which commands have a policy,
-- the second which the API roles hold a privilege for. A gap either way is the
-- thing to notice — a policy with no privilege silently refuses, and a
-- privilege with no policy is a door RLS happens to be holding shut.
--
--   select tablename, policyname, cmd from pg_policies
--    where schemaname = 'public' and tablename like 'history\_%' order by 1, 3;
--
--   select table_name, grantee, privilege_type from information_schema.role_table_grants
--    where table_schema = 'public' and table_name like 'history\_%'
--      and grantee in ('anon', 'authenticated') order by 1, 2, 3;
--
-- Expect SELECT and INSERT, per table, per role. Anything else on that second
-- list is a finding.
-- ---------------------------------------------------------------------------
