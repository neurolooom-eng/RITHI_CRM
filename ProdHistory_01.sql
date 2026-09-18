-- ===========================================================================
-- ProdHistory_01 — THE ARCHIVE SCHEMA.
--
-- RUN THIS ON THE ARCHIVE PROJECT (sxcccaghpvznllvdebcb), NOT ON THE LIVE ONE.
--
-- The 2016-onwards service history lives in a SECOND Supabase project. It is
-- closed data: nothing is registered into it, nothing is edited in it, and the
-- live application only ever READS it. That single fact is what shapes
-- everything below — there are no triggers, no counters, no RBAC, no audit
-- trail, because none of those have anything to do their work on.
--
-- WHAT MAKES A MACHINE'S HISTORY FINDABLE: `machine_key`.
--
-- A machine is its MODEL plus its SERIAL, never the serial alone — the install
-- base has eleven machines numbered "219" and 3,794 serials that repeat, so a
-- lookup on the number alone lands on a different machine at a different
-- hospital. The live app settles this in `src/lib/machine.ts` (machineKey =
-- squash(product)|squash(serial)) and this file mirrors that function EXACTLY,
-- because the two halves of one machine's history are matched by comparing the
-- keys the two projects compute. If they ever disagree, a machine's past
-- silently disappears — no error, an empty list, which reads as "this machine
-- has no history" rather than "the key is wrong".
--
-- Stored as a GENERATED column rather than filled by the loader: a value the
-- loader computes is a value the loader can get wrong on one file out of
-- twelve, and nothing downstream would notice.
--
-- Numbering: ProdHistory_xx is deliberate. These are not `supabase/migrations/`
-- files — they belong to a different database, they are numbered separately,
-- and `scripts/build-apply-bundles.mjs` refuses to build if it finds a
-- migration it does not own. Slot them into the live sequence at merge time if
-- and only if they ever move to the live project.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- The key function. IMMUTABLE because a generated column demands it, and
-- honestly so: it reads nothing but its argument.
--
-- Mirrors src/lib/headers.ts `squash` step for step:
--   lower()                    → "ORION-G" and "orion-g" are one model
--   strip (bracketed text)     → "MONNAL T75 (NEW)" is not a second model
--   keep [a-z0-9] only         → "ORION-G", "ORION G" and "ORIONG" are one
-- ---------------------------------------------------------------------------
create or replace function public.history_squash(v text)
returns text
language sql
immutable
as $$
  select regexp_replace(
           regexp_replace(lower(coalesce(v, '')), '\([^)]*\)', ' ', 'g'),
           '[^a-z0-9]', '', 'g')
$$;

comment on function public.history_squash(text) is
  'Mirror of squash() in src/lib/headers.ts. Changing one without the other loses history.';

create or replace function public.history_machine_key(product text, serial text)
returns text
language sql
immutable
as $$
  select public.history_squash(product) || '|' || public.history_squash(serial)
$$;

comment on function public.history_machine_key(text, text) is
  'Mirror of machineKey() in src/lib/machine.ts — model and serial, never the serial alone.';

-- ---------------------------------------------------------------------------
-- THE MACHINE. One row per machine the archive knows about, which is what the
-- history screen shows before any event: whose it was, where, and when it went
-- in. Not a master — the live project owns `products`. This is what the OLD
-- system believed, preserved as it was.
-- ---------------------------------------------------------------------------
create table if not exists public.history_machines (
  id             bigint generated always as identity primary key,
  product_name   text not null default '',
  serial         text not null default '',
  machine_key    text generated always as (public.history_machine_key(product_name, serial)) stored,
  party_name     text default '',
  city           text default '',
  state          text default '',
  address        text default '',
  item_status    text default '',
  installed_on   date,
  source_system  text default '',      -- which old system the row came out of
  -- EVERYTHING THE OLD SYSTEM HAD THAT THIS SHAPE HAS NO COLUMN FOR. The
  -- archive's job is to lose nothing: a column nobody has asked for yet is a
  -- column somebody asks for in 2027, and by then the spreadsheet is gone.
  extra          jsonb not null default '{}',
  loaded_at      timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- THE CALLS. Shaped to match `public.calls` on the live project column for
-- column where the column exists there, so the two halves of the timeline need
-- no translation layer and a future FDW join is a UNION ALL rather than a
-- mapping exercise.
-- ---------------------------------------------------------------------------
create table if not exists public.history_calls (
  id                  bigint generated always as identity primary key,
  ucn                 text default '',
  call_number         text default '',
  reg_date            date,
  complaint_date      date,
  closed_date         date,
  party_name          text default '',
  city                text default '',
  state               text default '',
  product_name        text default '',
  serial              text default '',
  machine_key         text generated always as (public.history_machine_key(product_name, serial)) stored,
  item_status         text default '',
  call_type           text default '',   -- FIELD | INSTALLATION | PM, as the old system said it
  standard_complaint  text default '',
  complaint_reported  text default '',
  allocated_to        text default '',
  status              text default '',
  -- THE CALL'S OWN LAST WORD. The live register derives state from the latest
  -- visit; the archive cannot, because the old system's visits are not always
  -- there. So the closed call carries what it was closed as, and the screen
  -- shows THAT rather than computing a state it has no evidence for.
  closing_status      text default '',
  source_system       text default '',
  extra               jsonb not null default '{}',
  loaded_at           timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- THE VISITS. `public.reports` on the live project is one row per visit keyed
-- by `uid`; the old system's equivalent is whatever it was, so this keeps the
-- UCN and the date and puts the rest in `extra`.
-- ---------------------------------------------------------------------------
create table if not exists public.history_visits (
  id              bigint generated always as identity primary key,
  uid             text default '',
  ucn             text default '',
  call_number     text default '',
  product_name    text default '',
  serial          text default '',
  machine_key     text generated always as (public.history_machine_key(product_name, serial)) stored,
  party_name      text default '',
  visit_at        timestamptz,
  engineer        text default '',
  call_status     text default '',
  work_done       text default '',
  root_cause      text default '',
  source_system   text default '',
  extra           jsonb not null default '{}',
  loaded_at       timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- THE PARTS. What was fitted to this machine, which is the question the
-- history screen is most often opened for: "has this board been changed
-- before?" A part number and a date answer it; a quantity without a date does
-- not.
-- ---------------------------------------------------------------------------
create table if not exists public.history_parts (
  id              bigint generated always as identity primary key,
  ucn             text default '',
  call_number     text default '',
  product_name    text default '',
  serial          text default '',
  machine_key     text generated always as (public.history_machine_key(product_name, serial)) stored,
  part            text default '',
  part_name       text default '',
  qty             numeric default 0,
  consumed_on     date,
  engineer        text default '',
  source_system   text default '',
  extra           jsonb not null default '{}',
  loaded_at       timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- THE COVER. Warranty and contract as the old system recorded them, one row
-- per cover period per machine — so a machine that ran warranty → CMC → AMC
-- has three rows and the screen can show WHICH cover the call fell under,
-- which is the difference between a billable visit and one that was not.
-- ---------------------------------------------------------------------------
create table if not exists public.history_cover (
  id              bigint generated always as identity primary key,
  product_name    text default '',
  serial          text default '',
  machine_key     text generated always as (public.history_machine_key(product_name, serial)) stored,
  party_name      text default '',
  cover_kind      text default '',      -- WARRANTY | CONTRACT, as written
  cover_number    text default '',      -- warranty number / MC number
  contract_type   text default '',      -- CMC / AMC
  cover_start     date,
  cover_end       date,
  status          text default '',
  source_system   text default '',
  extra           jsonb not null default '{}',
  loaded_at       timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- INDEXES. Every one of these serves the SAME query — one machine's history —
-- because that is the only query this database is asked. `machine_key` is an
-- equality lookup, so btree: a trigram index does not serve `=` at all, which
-- is what left `products.party_name =` timing out on the live project until
-- btrees were added beside the trigram ones.
-- ---------------------------------------------------------------------------
create index if not exists history_machines_key_idx on public.history_machines (machine_key);
create index if not exists history_calls_key_idx    on public.history_calls (machine_key);
create index if not exists history_visits_key_idx   on public.history_visits (machine_key);
create index if not exists history_parts_key_idx    on public.history_parts (machine_key);
create index if not exists history_cover_key_idx    on public.history_cover (machine_key);

-- The serial alone is NOT how a machine is identified, but it IS how somebody
-- searches when they have half a number off a phone call. Supports the picker,
-- never the join.
create index if not exists history_machines_serial_idx on public.history_machines (lower(serial));
create index if not exists history_machines_party_idx  on public.history_machines (lower(party_name));

-- The UCN ties a visit and a part line back to their call within the archive.
create index if not exists history_visits_ucn_idx on public.history_visits (ucn);
create index if not exists history_parts_ucn_idx  on public.history_parts (ucn);
