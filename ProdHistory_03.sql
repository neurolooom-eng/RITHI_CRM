-- ===========================================================================
-- ProdHistory_03 — GETTING THE OLD DATA IN.
--
-- RUN THIS ON THE ARCHIVE PROJECT (sxcccaghpvznllvdebcb), after ProdHistory_02.
--
-- The browser never writes to the archive (ProdHistory_02 says why), so
-- loading is done here, by you, in the SQL editor. Two steps:
--
--   1. Import each CSV with Supabase → Table Editor → Import data via CSV.
--      Let it create the table. Do not try to make the headers match anything
--      first — every column arriving as text is exactly what is wanted, and a
--      CSV that types itself is a CSV that guesses a date format.
--
--   2. Call public.history_load() once per file, telling it which column of
--      the imported table answers which column here.
--
-- WHY A MAPPING FUNCTION RATHER THAN FIXED STAGING TABLES: I do not know what
-- your 2016 exports are called inside. Fixed staging columns would mean
-- renaming headers in a spreadsheet before every import — by hand, ten times,
-- which is where a silent mistake comes from. Tell the function what it is
-- looking at instead, and the mapping is a line you can read back and check.
--
-- WHAT IT DOES WITH WHAT YOU DO NOT MAP: keeps it. Every unmapped column of
-- the source row is written to `extra` as JSON. The archive's job is to lose
-- nothing — a column nobody wants today is one somebody wants in 2027, by
-- which time the spreadsheet is gone.
--
-- EXAMPLE (one call export):
--
--   select public.history_load(
--     'calls', 'old_calls_2016',
--     '{"ucn":              "UCN",
--       "call_number":      "Call No",
--       "reg_date":         "Call Date",
--       "party_name":       "Customer Name",
--       "city":             "City",
--       "product_name":     "Item Name",
--       "serial":           "Item Serial Number",
--       "call_type":        "Call Type",
--       "standard_complaint":"Standard Complaint",
--       "complaint_reported":"Complaint",
--       "allocated_to":     "Engineer",
--       "closing_status":   "Status"}'::jsonb,
--     'AppSheet 2016-2019');
--
-- It returns the number of rows written. Run it twice and you get them twice —
-- it APPENDS, deliberately: see the note on de-duplication at the foot.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- DATES ARE DAY-FIRST. Every one of them.
--
-- The live app has exactly one date parser (src/lib/dates.ts) because it once
-- had four and they had started to disagree. This is that rule in SQL, and it
-- matters more here than anywhere: 03/04/2016 is the THIRD OF APRIL in every
-- Indian export in this project's history, and read as March the 4th it is not
-- an error anybody will ever see — just a call that happened a month early,
-- for ever.
--
-- It never raises. A cell that cannot be read becomes null, because one
-- unreadable date in row 40,000 must not abandon the other 39,999 — and a null
-- is visible on the screen afterwards, where a rolled-back load is not.
-- ---------------------------------------------------------------------------
create or replace function public.history_to_date(v text)
returns date
language plpgsql
immutable
as $$
declare
  s text := btrim(coalesce(v, ''));
  m text[];
  mon integer;
  months constant text[] := array['jan','feb','mar','apr','may','jun',
                                  'jul','aug','sep','oct','nov','dec'];
begin
  if s = '' or lower(s) in ('null', 'n/a', '-', '--') then return null; end if;

  -- ISO first: unambiguous, and the only one that needs no convention.
  m := regexp_match(s, '^(\d{4})-(\d{1,2})-(\d{1,2})');
  if m is not null then
    return make_date(m[1]::int, m[2]::int, m[3]::int);
  end if;

  -- 28-August-2016 / 2-Sep-2016 / 2 Sep 2016 — a named month cannot be
  -- ambiguous, so it is tried before the all-digit forms.
  m := regexp_match(s, '^(\d{1,2})[-/ ]([A-Za-z]+)[-/ ](\d{4})');
  if m is not null then
    mon := array_position(months, lower(substr(m[2], 1, 3)));
    if mon is not null then return make_date(m[3]::int, mon, m[1]::int); end if;
  end if;

  -- DD/MM/YYYY and DD-MM-YYYY. DAY FIRST — see the block above.
  m := regexp_match(s, '^(\d{1,2})[/-](\d{1,2})[/-](\d{4})');
  if m is not null then
    return make_date(m[3]::int, m[2]::int, m[1]::int);
  end if;

  -- Two-digit years, which the oldest exports do use. 70..99 → 19xx, the rest
  -- → 20xx: this archive starts in 2016 and the system it replaced did not run
  -- in the 1970s, so the split costs nothing and stops "16" becoming 0016.
  m := regexp_match(s, '^(\d{1,2})[/-](\d{1,2})[/-](\d{2})$');
  if m is not null then
    return make_date(case when m[3]::int >= 70 then 1900 + m[3]::int else 2000 + m[3]::int end,
                     m[2]::int, m[1]::int);
  end if;

  return null;
exception
  when others then return null;      -- 31/02/2016 is a typo, not a failed load
end $$;

-- A wall-clock stamp in an export is LOCAL time, settled with the user for the
-- live importers and the same here. Date-only values become midnight.
create or replace function public.history_to_ts(v text)
returns timestamptz
language plpgsql
immutable
as $$
declare
  s text := btrim(coalesce(v, ''));
  d date;
  tm text[];
begin
  if s = '' then return null; end if;
  d := public.history_to_date(s);
  if d is null then
    begin return s::timestamptz; exception when others then return null; end;
  end if;
  tm := regexp_match(s, '(\d{1,2}):(\d{2})(?::(\d{2}))?');
  if tm is null then return d::timestamptz; end if;
  return (d + make_interval(hours => tm[1]::int, mins => tm[2]::int,
                            secs => coalesce(tm[3], '0')::int))::timestamptz;
exception
  when others then return null;
end $$;

-- "1", "1.0", "1 No", "" and "-" all arrive in a quantity column.
create or replace function public.history_to_num(v text)
returns numeric
language plpgsql
immutable
as $$
declare
  s text := btrim(coalesce(v, ''));
  m text[];
begin
  if s = '' then return null; end if;
  m := regexp_match(replace(s, ',', ''), '(-?\d+(?:\.\d+)?)');
  if m is null then return null; end if;
  return m[1]::numeric;
exception
  when others then return null;
end $$;

-- ---------------------------------------------------------------------------
-- THE LOADER.
--
--   target   'machines' | 'calls' | 'visits' | 'parts' | 'cover'
--   source   the table your CSV landed in (public schema)
--   mapping  {"<column here>": "<column in your CSV table>", ...}
--   label    what to stamp into source_system, so a row can always be traced
--            back to the file it came out of
--
-- Everything is cast by the TARGET column's own type, looked up rather than
-- assumed: a date column gets the day-first parser, a numeric gets the number
-- reader, everything else is taken as text. So mapping a date onto a text
-- column does not silently reformat it, and mapping text onto a date column
-- does not abort the load.
--
-- A mapped column your CSV does not have is a MISTAKE, and it says so and
-- writes nothing. The alternative — quietly loading the other nineteen columns
-- and leaving one empty — is how a load "succeeds" and the screen shows blanks
-- that nobody can explain three weeks later.
-- ---------------------------------------------------------------------------
create or replace function public.history_load(
  target text,
  source text,
  mapping jsonb,
  label text default '',
  keep_extra boolean default true
)
returns bigint
language plpgsql
as $$
declare
  tbl        text := 'history_' || target;
  cols       text := '';
  vals       text := '';
  k          text;
  v          text;
  coltype    text;
  missing    text[] := '{}';
  srccols    text[];
  mappedsrc  text[] := '{}';
  n          bigint;
begin
  if target not in ('machines', 'calls', 'visits', 'parts', 'cover') then
    raise exception 'history_load: target must be machines, calls, visits, parts or cover (got %)', target;
  end if;
  if to_regclass('public.' || quote_ident(source)) is null then
    raise exception 'history_load: no table public.% — import the CSV first', source;
  end if;

  select array_agg(column_name::text) into srccols
    from information_schema.columns
   where table_schema = 'public' and table_name = source;

  for k, v in select * from jsonb_each_text(mapping) loop
    -- The column must exist HERE...
    select data_type into coltype
      from information_schema.columns
     where table_schema = 'public' and table_name = tbl and column_name = k
       and is_generated = 'NEVER';          -- machine_key computes itself
    if coltype is null then
      raise exception 'history_load: public.% has no writable column %', tbl, k;
    end if;
    -- ...and THERE.
    if not (v = any(srccols)) then
      missing := missing || v;
      continue;
    end if;
    mappedsrc := mappedsrc || v;
    cols := cols || format('%I, ', k);
    vals := vals || case
      when coltype = 'date'                        then format('public.history_to_date(s.%I::text), ', v)
      when coltype like 'timestamp%'               then format('public.history_to_ts(s.%I::text), ', v)
      when coltype in ('numeric', 'integer', 'bigint', 'double precision')
                                                   then format('public.history_to_num(s.%I::text), ', v)
      else format('nullif(btrim(s.%I::text), ''''), ', v)
    end;
  end loop;

  if array_length(missing, 1) is not null then
    raise exception 'history_load: public.% has no column(s): %. Nothing was loaded.',
      source, array_to_string(missing, ', ');
  end if;
  if cols = '' then
    raise exception 'history_load: the mapping is empty — nothing to load';
  end if;

  cols := cols || 'source_system';
  vals := vals || quote_literal(label);

  if keep_extra then
    cols := cols || ', extra';
    -- Everything not mapped, as it arrived. `- array[...]` on a jsonb object
    -- removes the keys we have already stored in their own columns.
    vals := vals || format(', coalesce(to_jsonb(s) - %L::text[], ''{}''::jsonb)', mappedsrc);
  end if;

  execute format('insert into public.%I (%s) select %s from public.%I s', tbl, cols, vals, source);
  get diagnostics n = row_count;
  return n;
end $$;

comment on function public.history_load(text, text, jsonb, text, boolean) is
  'Load an imported CSV table into a history_* table. Appends; see ProdHistory_03 on re-runs.';

-- ---------------------------------------------------------------------------
-- RUNNING A LOAD TWICE.
--
-- history_load APPENDS. It does not upsert, and that is a decision rather than
-- an omission: an upsert needs a key, and the ONE thing a ten-year-old export
-- reliably lacks is a column that is unique. The live project learned what a
-- guessed key costs — `feedback` got one, the upload turned into an UPDATE at
-- row 24,092, and the table had no UPDATE policy to meet it.
--
-- So if a load goes in wrong, delete it by its label and do it again. That is
-- what `source_system` is for, and why every load should be given one:
--
--   delete from public.history_calls where source_system = 'AppSheet 2016-2019';
--
-- This is also the only DELETE anyone should ever run here, and it runs as the
-- owner in the SQL editor — not through the app, which holds no write
-- privilege at all.
-- ---------------------------------------------------------------------------

-- What went in, and when. Read this after every load rather than trusting the
-- number the function returned: it is the same question asked of the table.
create or replace view public.history_loads as
select 'machines' as target, source_system, count(*) as rows, max(loaded_at) as loaded_at
  from public.history_machines group by source_system
union all
select 'calls', source_system, count(*), max(loaded_at) from public.history_calls  group by source_system
union all
select 'visits', source_system, count(*), max(loaded_at) from public.history_visits group by source_system
union all
select 'parts', source_system, count(*), max(loaded_at) from public.history_parts  group by source_system
union all
select 'cover', source_system, count(*), max(loaded_at) from public.history_cover  group by source_system;

alter view public.history_loads set (security_invoker = on);
grant select on public.history_loads to anon, authenticated;
