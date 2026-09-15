-- ===========================================================================
-- THE PARTY MASTER CARRIES ITS SERVICE ENGINEER.
--
-- The user, 2026-09-15: *"In Party Master, my old source has service engineer
-- details. So during any new field call or Installation calls or PM Call, it
-- has to map the engineer as per the party master. In case of creating a call
-- from a request, then it has to map it to the requestor. All the fields to be
-- retained as is."*
--
-- The supplied export (Product Master - PartyMaster.csv, 4,752 parties) has a
-- `Serviceman` column, filled on 4,677 of them — 49 distinct names. That is who
-- looks after the customer, and it is the answer for a call on a machine this
-- system has never seen: an INSTALLATION reaches a customer who has no machine
-- yet, so the machine's own Service Engineer cannot answer for it.
--
-- A REAL COLUMN, NOT A KEY IN `extra`. The importer is `extraInto: 'extra'`, so
-- the value would arrive either way — and a value in a jsonb blob cannot be
-- joined, indexed or picked from. It is the fault 0148 fixed for the Part
-- Master and 0194 for the Product Database, and the call form has to LOOK THIS
-- UP on every registration, which is the one thing a blob is worst at.
--
-- PRECEDENCE, settled with the user before any of this was built: the MACHINE'S
-- own Service Engineer still wins, and the party's Serviceman answers only
-- where the machine has none. So this widens where an engineer can be found and
-- changes no call that already found one.
--
-- IT IS A PREFILL AND NOTHING MORE. `allocated_to` keeps no default and gains
-- no trigger: the form offers a name and whoever registers the call may change
-- it. An assignment the database made would be a rule nobody could see and,
-- once the party master went stale, one nobody could correct at the keyboard.
-- ===========================================================================

alter table public.parties add column if not exists service_engineer text default '';

comment on column public.parties.service_engineer is
  'The Serviceman on the Party Master — who looks after this customer. Prefills "Call Allocated To" where the machine has no Service Engineer of its own.';

-- ---------------------------------------------------------------------------
-- THE BACKFILL, out of `extra`.
--
-- The parties already loaded came in through `extraInto: 'extra'`, so any
-- Serviceman they carried is on the row under its ORIGINAL SPREADSHEET HEADING
-- — the same reason 0190 could recover the feedback dates without asking for
-- the file again. Several spellings are tried because the exports disagree, and
-- the first non-blank wins.
--
-- It never overwrites a value already in the column, so re-running it cannot
-- undo a correction somebody made on the screen.
-- ---------------------------------------------------------------------------
-- WRITTEN OUT TWICE rather than through a LATERAL, and that is not a style
-- choice: `update ... from lateral (...)` CANNOT SEE the update's own target
-- table, so the tidier version raises `invalid reference to FROM-clause entry
-- for table "p"` and the whole migration stops before the function below is
-- created. Caught by running it; it reads perfectly well.
do $$
declare n int;
begin
  update public.parties p
     set service_engineer = coalesce(
           nullif(btrim(p.extra ->> 'Serviceman'), ''),
           nullif(btrim(p.extra ->> 'Service Engineer'), ''),
           nullif(btrim(p.extra ->> 'SERVICEMAN'), ''),
           nullif(btrim(p.extra ->> 'Service Man'), ''))
   where coalesce(btrim(p.service_engineer), '') = ''
     and coalesce(
           nullif(btrim(p.extra ->> 'Serviceman'), ''),
           nullif(btrim(p.extra ->> 'Service Engineer'), ''),
           nullif(btrim(p.extra ->> 'SERVICEMAN'), ''),
           nullif(btrim(p.extra ->> 'Service Man'), '')) is not null;
  get diagnostics n = row_count;
  raise notice 'Party Master: service engineer recovered from `extra` on % part(y/ies).', n;
end $$;

-- ---------------------------------------------------------------------------
-- The lookup the call form makes, and the only reason this is a column.
--
-- Answered from `name_key`, which is GENERATED and already carries the unique
-- index (0076) — so the party is found by the same key the importer matches on
-- and the two cannot disagree about which party this is.
--
-- SECURITY INVOKER by being plain SQL over a table the reader's own policy
-- covers: `parties_read` admits any signed-in user, which is what the existing
-- party pickers already rely on. It returns the empty string rather than NULL
-- for a party nobody has recorded, so the caller has one thing to test.
-- ---------------------------------------------------------------------------
-- THE COALESCE IS OUTSIDE THE SUBQUERY, and the first version had it inside.
-- A `select ... from parties where ...` that matches NO ROW returns no rows at
-- all, so the function returned NULL for exactly the case it exists to answer
-- — a party nobody has recorded — whatever the coalesce around the column said.
-- It passed every test written against a party that DOES exist. Caught by
-- asking it about one that does not.
create or replace function public.party_service_engineer(p_party text)
returns text language sql stable security invoker set search_path = public as $$
  select coalesce((
    select nullif(btrim(p.service_engineer), '')
      from public.parties p
     where p.name_key = lower(btrim(coalesce(p_party, '')))
     limit 1
  ), '')
$$;

comment on function public.party_service_engineer(text) is
  'The Party Master Serviceman for a party name, or the empty string. Prefills "Call Allocated To" where the machine has none.';

grant execute on function public.party_service_engineer(text) to authenticated;
