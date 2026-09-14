-- ===========================================================================
-- 0188 — 0186 CANNOT FIX A PROJECT THAT RAN ITS FIRST VERSION. THIS CAN.
--
-- Reported from use, 2026-09-14, AFTER running the corrected bundle:
--
--     Customer Feedback - there is no unique or exclusion constraint matching
--     the ON CONFLICT specification (row ~1) ... (0 written before it stopped.)
--
-- The bundle ran. It reported success. It changed NOTHING, and that is the
-- whole fault:
--
--   * `alter table ... ADD COLUMN IF NOT EXISTS ucn_key ... generated always as
--     (<new expression>)` is a no-op when the column exists. The GENERATION
--     EXPRESSION is not compared — the old one survives, silently.
--   * `CREATE UNIQUE INDEX IF NOT EXISTS feedback_ucn_key_uniq ...` is a no-op
--     when an index of that NAME exists. Its DEFINITION is not compared — the
--     old PARTIAL index survives, silently.
--
-- So a project that had run the first version of 0186 (the one with
-- `where ucn_key <> ''`) keeps the partial index for ever, and PostgREST cannot
-- infer a partial index as an ON CONFLICT target. Every subsequent run of the
-- corrected file confirms it is already correct.
--
-- PROVED, not reasoned: a throwaway Postgres was built with every migration
-- except 0186, the FIRST version of 0186 applied by hand, and then the current
-- `data_integrity.sql` run over it. The bundle emitted no error and the index
-- was still `... USING btree (ucn_key) WHERE (ucn_key <> ''::text)`, with the
-- column still generated as `lower(btrim(COALESCE(ucn, ''::text)))`.
--
-- THE LESSON, and it is why this is a new file rather than an edit to 0186:
-- `IF NOT EXISTS` guards a NAME, never a DEFINITION. It makes a migration
-- re-runnable; it does NOT make it corrective. Anything that CHANGES the shape
-- of an object someone may already have must inspect what is there and replace
-- it. 0185 got this right by accident — it named the new index differently
-- (`..._machine_key_uniq`) and dropped the old one by its own name. 0186 reused
-- both names, which is the one case in this tree where the trap bites.
--
-- Written so it is safe on EVERY state: never applied, applied at the first
-- version, applied at the corrected version. It rebuilds only what is wrong.
-- ===========================================================================

do $$
declare
  v_expr text;
  v_idx  record;
  v_n    int;
begin
  if to_regclass('public.feedback') is null then
    raise notice '0188: public.feedback is absent -- nothing to repair';
    return;
  end if;

  -- 1. THE COLUMN. Its expression decides, not its existence. The corrected
  --    expression falls back to `row-<id>` for a blank UCN; the first version
  --    yielded a bare '' that every other blank row collided with, which is
  --    what forced the partial index in the first place.
  select pg_get_expr(d.adbin, d.adrelid) into v_expr
    from pg_attrdef d
    join pg_attribute a on a.attrelid = d.adrelid and a.attnum = d.adnum
   where d.adrelid = 'public.feedback'::regclass and a.attname = 'ucn_key';

  if v_expr is not null and v_expr not like '%row-%' then
    -- Dropping a GENERATED STORED column loses nothing: every value is derived
    -- from `ucn` and `id`, both still here. The drop cascades to the indexes
    -- over it, which takes the stale partial index with it.
    raise notice '0188: feedback.ucn_key carries the superseded expression -- rebuilding it';
    execute 'alter table public.feedback drop column ucn_key';
    v_expr := null;
  end if;

  if v_expr is null then
    execute $g$alter table public.feedback
      add column ucn_key text generated always as
        (coalesce(nullif(lower(btrim(coalesce(ucn, ''))), ''), 'row-' || id)) stored$g$;
  end if;

  -- 2. THE INDEX. Found by SHAPE, not by name -- a project that hand-built one
  --    under another name is in exactly the same trouble, and PostgREST looks
  --    at shape too. A partial index (`indpred`) and an expression index
  --    (`indexprs`) are both uninferable as an ON CONFLICT target.
  for v_idx in
    select i.indexrelid::regclass::text as name
      from pg_index i
     where i.indrelid = 'public.feedback'::regclass
       and i.indisunique
       and (i.indpred is not null or i.indexprs is not null)
       and pg_get_indexdef(i.indexrelid) ilike '%ucn_key%'
  loop
    raise notice '0188: dropping % -- partial or expression, so not an inferable upsert target', v_idx.name;
    execute format('drop index if exists public.%I', v_idx.name);
  end loop;

  -- 3. Duplicates, or the total index cannot be built. The LATEST row wins: a
  --    second feedback for one call is a correction of the first. Blank-UCN
  --    rows are untouched -- they key off their own id now, so they are unique
  --    by construction and nobody's feedback is deleted to tidy an index.
  delete from public.feedback a
   using public.feedback b
   where lower(btrim(coalesce(a.ucn, ''))) = lower(btrim(coalesce(b.ucn, '')))
     and lower(btrim(coalesce(a.ucn, ''))) <> ''
     and a.id < b.id;
  get diagnostics v_n = row_count;
  if v_n > 0 then
    raise notice '0188: % duplicate feedback row(s) superseded by the later entry', v_n;
  end if;

  if not exists (
    select 1 from pg_index i
     where i.indrelid = 'public.feedback'::regclass
       and i.indisunique and i.indpred is null and i.indexprs is null
       and pg_get_indexdef(i.indexrelid) ilike '%(ucn_key)%')
  then
    execute 'create unique index feedback_ucn_key_uniq on public.feedback (ucn_key)';
    raise notice '0188: feedback_ucn_key_uniq created -- one feedback per call';
  else
    raise notice '0188: the key is already correct -- nothing changed';
  end if;
end $$;

comment on index public.feedback_ucn_key_uniq is
  'One feedback per call. The v2Feedback export has 24,748 distinct UC Numbers in 24,749 rows and no repeats — the key was always there, nothing was using it, and a second load duplicated the register. A row with no UCN keys off its own id, so it is unique rather than colliding with every other blank. Rebuilt by 0188 where 0186''s first version had left a PARTIAL index that no later run could replace.';
