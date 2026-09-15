-- ===========================================================================
-- ONE VOCABULARY FOR COVER: WGP, OGP, CMC, AMC — AND "WARRANTY" IS WGP.
--
-- Reported from use (the user, 2026-09-15), looking at Failures per cover:
-- "What is this Warranty? It has to be Normalized -- Warranty is WGP -- Where
-- ever this DAta is feeding - Fix that as well."
--
-- The chart read CMC 880, OGP 374, WGP 56, AMC 3 and **WARRANTY 1**. The last
-- one is not a fifth kind of cover; it is WGP spelled differently by whatever
-- loaded it. The application has said `['WGP','OGP','CMC','AMC']` since
-- `fieldcall.ts` was written, but nothing made the DATABASE agree, so a
-- register loaded from a file could carry any spelling its source used.
--
-- A SECOND SPELLING IS WORSE THAN A WRONG ONE HERE. Every count, share and
-- cross-tab on this dimension is a GROUP BY: two spellings of one cover do not
-- read as a small error, they split the total silently and the reader believes
-- both halves. One row today is the visible edge of it — the same load could
-- have carried a thousand.
--
-- NORMALISED AT THE DATABASE, NOT IN THE CHART. Rewriting the label where it is
-- drawn would leave the stored value wrong for every other reader — the DCCR
-- grid, the exports, the spare-approval rule that asks whether an item is AMC
-- or OGP — and the next screen would show the split again. So:
--
--   1. `public.cover_code(text)` is the ONE rule, in SQL.
--   2. A trigger applies it on every write to the five tables that store a
--      cover, so no importer, form or bulk load can reintroduce a synonym.
--   3. The existing rows are corrected once, here.
--
-- AN UNRECOGNISED VALUE IS LEFT EXACTLY AS IT IS, on purpose. Forcing anything
-- unknown into OGP would be a guess written into a quality record, and a wrong
-- cover on a failure is a wrong answer to "is this a manufacturing question or
-- a wear question". A spelling nobody anticipated stays visible as itself —
-- which is how this one was found.
-- ===========================================================================

create or replace function public.cover_code(v text)
returns text language sql immutable as $$
  select case
    when v is null or btrim(v) = '' then v
    else coalesce(
      (select m.code
         from (values
                -- WGP — inside the guarantee period. "Warranty" is the word
                -- people use; WGP is the code this system stores.
                ('wgp',                              'WGP'),
                ('warranty',                         'WGP'),
                ('underwarranty',                    'WGP'),
                ('inwarranty',                       'WGP'),
                ('withinwarranty',                   'WGP'),
                ('warrantyguaranteeperiod',          'WGP'),
                ('guaranteeperiod',                  'WGP'),
                -- OGP — out of it. Note these are matched WHOLE, so
                -- "outofwarranty" cannot be caught by the 'warranty' row
                -- above: the comparison is on the entire squashed string.
                ('ogp',                              'OGP'),
                ('outofwarranty',                    'OGP'),
                ('outofguaranteeperiod',             'OGP'),
                ('outofguarantee',                   'OGP'),
                ('outofcover',                       'OGP'),
                ('outofcontract',                    'OGP'),
                ('nocover',                          'OGP'),
                -- The two contracts.
                ('cmc',                              'CMC'),
                ('comprehensivemaintenancecontract', 'CMC'),
                ('undercmc',                         'CMC'),
                ('amc',                              'AMC'),
                ('annualmaintenancecontract',        'AMC'),
                ('underamc',                         'AMC')
              ) as m(src, code)
        where m.src = regexp_replace(lower(v), '[^a-z0-9]', '', 'g')),
      btrim(v))
  end
$$;
comment on function public.cover_code(text) is
  'The one rule for cover. WGP / OGP / CMC / AMC from any spelling that means '
  'one of them; anything else is returned trimmed and unchanged, because a '
  'guess written into a quality record is worse than a value that reads as odd.';

-- ---------------------------------------------------------------------------
-- The trigger, on every table that STORES a cover. `calls`, `pending_calls`
-- and `machine_cover` are views over these and follow without being touched.
-- ---------------------------------------------------------------------------
create or replace function public.cover_code_stamp()
returns trigger language plpgsql as $$
begin
  new.item_status := public.cover_code(new.item_status);
  return new;
end $$;

-- The two AppSheet cover exports spell the same thing in a column of their
-- own, `present_item_status` (0036 documents it as "OGP / WGP / CMC / AMC"),
-- and `machine_cover` reads it as a machine's cover alongside the rest. A
-- register left out of this list is exactly how one synonym survived.
create or replace function public.present_cover_code_stamp()
returns trigger language plpgsql as $$
begin
  new.present_item_status := public.cover_code(new.present_item_status);
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['field_calls','installation_calls','pm_calls','products','spare_requests']
  loop
    if to_regclass('public.' || t) is null then continue; end if;
    if (select c.relkind from pg_class c where c.oid = to_regclass('public.' || t)) <> 'r'
      then continue; end if;
    execute format('drop trigger if exists %I on public.%I', t || '_cover_code', t);
    execute format(
      'create trigger %I before insert or update of item_status on public.%I '
      'for each row execute function public.cover_code_stamp()', t || '_cover_code', t);
  end loop;

  -- ONLY A TABLE TAKES A ROW TRIGGER. `contract_details` carries the column
  -- and is a VIEW over `contract_items`, so it follows without being touched —
  -- and naming it here without this guard is an error that stops the migration
  -- dead, which is how the list gets quietly shortened instead of corrected.
  foreach t in array array['contract_items','contract_details']
  loop
    if to_regclass('public.' || t) is null then continue; end if;
    if (select c.relkind from pg_class c where c.oid = to_regclass('public.' || t)) <> 'r'
      then continue; end if;
    execute format('drop trigger if exists %I on public.%I', t || '_cover_code', t);
    execute format(
      'create trigger %I before insert or update of present_item_status on public.%I '
      'for each row execute function public.present_cover_code_stamp()', t || '_cover_code', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- The rows already stored. Only the ones the rule actually changes are
-- written: an update that touches every row would restamp `updated_at` across
-- five registers and bury the real change in the audit trail.
-- ---------------------------------------------------------------------------
do $$
declare t text; n int; total int := 0;
begin
  foreach t in array array['field_calls','installation_calls','pm_calls','products','spare_requests']
  loop
    if to_regclass('public.' || t) is null then continue; end if;
    execute format(
      'update public.%I set item_status = public.cover_code(item_status) '
      'where item_status is distinct from public.cover_code(item_status)', t);
    get diagnostics n = row_count;
    total := total + n;
    if n > 0 then raise notice '0208: %: % row(s) normalised', t, n; end if;
  end loop;

  foreach t in array array['contract_items','contract_details']
  loop
    if to_regclass('public.' || t) is null then continue; end if;
    if (select c.relkind from pg_class c where c.oid = to_regclass('public.' || t)) <> 'r'
      then continue; end if;
    execute format(
      'update public.%I set present_item_status = public.cover_code(present_item_status) '
      'where present_item_status is distinct from public.cover_code(present_item_status)', t);
    get diagnostics n = row_count;
    total := total + n;
    if n > 0 then raise notice '0208: %.present_item_status: % row(s) normalised', t, n; end if;
  end loop;
  raise notice '0208: % cover value(s) normalised in all', total;
end $$;
