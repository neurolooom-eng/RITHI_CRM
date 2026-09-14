-- ===========================================================================
-- 0188 REPAIRS A PROJECT 0186 CANNOT.
--
-- Reported from use after running the corrected bundle: "there is no unique or
-- exclusion constraint matching the ON CONFLICT specification ... (0 written)".
-- The bundle had run and reported success. `IF NOT EXISTS` guards a NAME, never
-- a DEFINITION, so neither the column's generation expression nor the index's
-- partial predicate was ever compared — the first version of 0186 survived
-- every subsequent run of the corrected one.
--
-- This walks the three states a project can be in and asserts the outcome of
-- each. The middle one is the user's.
--
-- Run: psql ... -f supabase/tests/feedback_key_repair_test.sql
-- The only errors in the output should be the ones labelled `expect ERROR`.
-- ===========================================================================
\set ON_ERROR_STOP off

-- What PostgREST needs to infer an ON CONFLICT target: unique, NOT partial,
-- NOT an expression index. Asked of the catalogue the way check:upserts asks.
create or replace function pg_temp.key_ok() returns boolean language sql stable as $$
  select exists (
    select 1 from pg_index i
     where i.indrelid = 'public.feedback'::regclass
       and i.indisunique and i.indpred is null and i.indexprs is null
       and pg_get_indexdef(i.indexrelid) ilike '%(ucn_key)%');
$$;

\echo
\echo '-- STATE 1: the bundle as it stands (0186 then 0188) leaves an inferable key --'
select pg_temp.key_ok() as "feedback has an inferable upsert target";

\echo
\echo '-- STATE 2: THE USER''S PROJECT -- the first version of 0186 already applied --'
-- Put the superseded shape back exactly: a generation expression that yields a
-- bare '' for a blank UCN, and the PARTIAL index that shape forced.
begin;
drop index if exists public.feedback_ucn_key_uniq;
alter table public.feedback drop column if exists ucn_key;
alter table public.feedback
  add column ucn_key text generated always as (lower(btrim(coalesce(ucn, '')))) stored;
create unique index feedback_ucn_key_uniq on public.feedback (ucn_key) where ucn_key <> '';

select not pg_temp.key_ok() as "the superseded shape is NOT inferable (this is the bug)";

-- Re-running 0186 changes NOTHING, which is the fault this file exists for.
alter table public.feedback
  add column if not exists ucn_key text generated always as
    (coalesce(nullif(lower(btrim(coalesce(ucn, ''))), ''), 'row-' || id)) stored;
create unique index if not exists feedback_ucn_key_uniq on public.feedback (ucn_key);

select not pg_temp.key_ok()
  as "0186 re-run STILL leaves it uninferable";
rollback;

\echo
\echo '-- and 0188 over that same state repairs it --'
begin;
drop index if exists public.feedback_ucn_key_uniq;
alter table public.feedback drop column if exists ucn_key;
alter table public.feedback
  add column ucn_key text generated always as (lower(btrim(coalesce(ucn, '')))) stored;
create unique index feedback_ucn_key_uniq on public.feedback (ucn_key) where ucn_key <> '';
\i supabase/migrations/0188_feedback_key_repair.sql
select pg_temp.key_ok() as "0188 leaves an inferable key";
rollback;

\echo
\echo '-- an index under ANOTHER name is the same trouble, and is found by SHAPE --'
begin;
drop index if exists public.feedback_ucn_key_uniq;
create unique index feedback_ucn_hand_built on public.feedback (ucn_key) where ucn_key <> '';
\i supabase/migrations/0188_feedback_key_repair.sql
select pg_temp.key_ok() as "a hand-named partial index is replaced too";
rollback;

\echo
\echo '-- STATE 3: a project that never had the key, with duplicates AND blanks --'
begin;
drop index if exists public.feedback_ucn_key_uniq;
alter table public.feedback drop column if exists ucn_key;
insert into public.feedback (ucn) values ('UCN-1'),('ucn-1'),('  UCN-1  '),(''),(null),('   '),('UCN-2');
\i supabase/migrations/0188_feedback_key_repair.sql

-- The LATEST row wins among real duplicates: three spellings of UCN-1 leave one.
select count(*) = 1 as "the three spellings of UCN-1 leave one row"
  from public.feedback where ucn_key = 'ucn-1';

-- And NO feedback is deleted for lacking a call number: blank, null and spaces
-- each key off their own id, so they are unique by construction.
select count(*) = 3 as "all three blank-UCN rows survive"
  from public.feedback where ucn_key like 'row-%';

select pg_temp.key_ok() as "and the key is inferable";
rollback;

\echo
\echo '-- done --'
