-- ===========================================================================
-- ProdHistory_02 — WHO MAY READ THE ARCHIVE, AND WHY IT CAN ONLY BE READ.
--
-- RUN THIS ON THE ARCHIVE PROJECT (sxcccaghpvznllvdebcb), after ProdHistory_01.
--
-- READ THIS BEFORE RUNNING IT. It is the one file here that decides an access
-- question, and the honest answer is narrower than the live project's.
--
-- ── The thing that does not carry across ───────────────────────────────────
--
-- On the LIVE project the anon key is public by design: it identifies the
-- project, and WHO YOU ARE comes from a signed-in user's JWT, which every
-- policy tests through has_perm() and the visibility functions. The key grants
-- nothing on its own.
--
-- THAT ARGUMENT DOES NOT HOLD HERE. Your users exist in the LIVE project's
-- auth schema. A JWT this project is handed was signed by the live project's
-- key, and this project cannot verify it — different project, different
-- signing key — so `auth.uid()` in a policy here is null for every one of your
-- staff. There is no per-user gating to be had by writing a cleverer policy:
-- the identity simply is not there to test.
--
-- So the archive key IS the credential. Anyone holding it can read the 2016
-- history — hospital names, serials, engineers, faults. Which leads to the one
-- rule that matters:
--
--   ** DO NOT BAKE THE ARCHIVE KEY INTO THE REPOSITORY. **
--
-- The live URL and key are baked into src/lib/supabase.ts because RLS makes
-- them harmless. This one is pasted into Settings → Archive (Product History)
-- on the devices that should have it, and it is stored per device. The app is
-- built that way on purpose and there is no default to fall back on.
--
-- ── What is genuinely protected ────────────────────────────────────────────
--
-- The archive is READ-ONLY, and that is enforced twice: RLS is on with a
-- SELECT policy and no other, and the write privileges are revoked outright.
-- A leaked key is then a disclosure — bad — and NOT a way to alter or destroy
-- ten years of service records. The loading in ProdHistory_03 is done by you,
-- in the SQL editor, as the owner; the browser never writes here.
--
-- ── If this is not good enough (and it may well not be) ────────────────────
--
-- The fix is to stop letting the browser talk to this project at all. Reach it
-- from the LIVE project instead, where the identity does exist — either
-- postgres_fdw foreign tables wrapped in security_invoker views gated by
-- has_perm('mod:/product-history'), or an Edge Function on the live project
-- that verifies the caller's JWT and queries here with a service key held as a
-- secret. Both are strictly better and both cost a setup step I cannot take
-- for you from here. src/lib/archive.ts is deliberately the ONE file that
-- knows how the archive is reached, so that swap is a small change and not a
-- rewrite of the screen.
-- ===========================================================================

alter table public.history_machines enable row level security;
alter table public.history_calls    enable row level security;
alter table public.history_visits   enable row level security;
alter table public.history_parts    enable row level security;
alter table public.history_cover    enable row level security;

-- ---------------------------------------------------------------------------
-- READ. One policy per table, and no INSERT, UPDATE or DELETE policy anywhere
-- in this file — under RLS an operation with no policy is refused, so the
-- absence IS the rule. Do not "helpfully" add a write policy later without
-- reading the block above: the credential that would use it is a shared one.
--
-- `using (true)` is the whole condition because there is nothing to test. A
-- policy that pretended to test something would be worse than this one: it
-- would read as protection while granting exactly the same access.
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['history_machines', 'history_calls', 'history_visits',
                           'history_parts', 'history_cover']
  loop
    execute format('drop policy if exists %I on public.%I', t || '_read', t);
    execute format(
      'create policy %I on public.%I for select to anon, authenticated using (true)',
      t || '_read', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- NO WRITES, BELT AND BRACES. Supabase's defaults grant the API roles full
-- table privileges and leave RLS to do the deciding. RLS does decide correctly
-- here (no write policy = no write), but this database holds quality records
-- that cannot be reconstructed, so the privilege is removed as well. Two
-- independent reasons a write fails, rather than one.
--
-- TRUNCATE is not covered by RLS AT ALL — it is a privilege check only — so on
-- a table with no write policy it would otherwise still be available to a role
-- holding the default grant. That one is not belt and braces; it is the belt.
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['history_machines', 'history_calls', 'history_visits',
                           'history_parts', 'history_cover']
  loop
    execute format('revoke insert, update, delete, truncate on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to anon, authenticated', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- WHAT THE APP ASKS FIRST. The screen needs to know whether a machine has any
-- archive history before it offers to show it, and five COUNT queries to answer
-- "is there anything here?" is five round trips across the internet to another
-- project. This answers it in one.
--
-- SECURITY INVOKER, and re-asserted here rather than assumed: `create or
-- replace view` DROPS the setting, and a view without it reads as its OWNER,
-- which on the live project meant every signed-in user could read every call.
-- The tables under it are readable by the same roles anyway, so nothing is
-- gated by this — but a view that silently runs as owner is a habit, and the
-- habit is what did the damage.
-- ---------------------------------------------------------------------------
create or replace view public.history_summary as
select m.machine_key,
       max(m.product_name)                       as product_name,
       max(m.serial)                             as serial,
       max(m.party_name)                         as party_name,
       (select count(*) from public.history_calls  c where c.machine_key = m.machine_key) as calls,
       (select count(*) from public.history_visits v where v.machine_key = m.machine_key) as visits,
       (select count(*) from public.history_parts  p where p.machine_key = m.machine_key) as parts,
       (select count(*) from public.history_cover  k where k.machine_key = m.machine_key) as cover
  from public.history_machines m
 group by m.machine_key;

alter view public.history_summary set (security_invoker = on);
grant select on public.history_summary to anon, authenticated;
