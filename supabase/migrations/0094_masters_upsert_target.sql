-- ===========================================================================
-- The master value lists could not be uploaded at all.
--
--   there is no unique or exclusion constraint matching the ON CONFLICT
--   specification — this register matches on name,value
--
-- The uniqueness masters carries is (name, value, stage, product), and the last
-- two are EXPRESSIONS over `extra` (0021, widened by 0044). `on conflict` cannot
-- infer an expression index, so the upsert was refused outright — the eighth
-- time this project has met that wall, and the first on a table where the
-- expressions were the point.
--
-- The fix is the same one 0076 used for the party key: STORED generated columns
-- that hold what the expressions computed, and a unique index on plain columns.
-- Nothing about the rule changes — "Calibration" may still exist for MONNAL T60
-- and for T75, and a Spare Approval Reason may still exist at two stages.
--
-- Filed under daily_review, not masters: 0044 owns the index this replaces, and
-- a migration that redefines something a LATER module owns is overwritten by it
-- on a fresh apply.
-- ===========================================================================

alter table public.masters
  add column if not exists stage_key   text generated always as (coalesce(extra->>'stage', ''))   stored,
  add column if not exists product_key text generated always as (coalesce(extra->>'product', '')) stored;

do $$
begin
  if exists (
    select 1 from public.masters
     group by name, value, coalesce(extra->>'stage', ''), coalesce(extra->>'product', '')
    having count(*) > 1
  ) then
    raise notice 'masters holds duplicate (name, value, stage, product) rows — de-duplicate, then re-run this file to build masters_name_value_keys_uniq.';
    return;
  end if;
  create unique index if not exists masters_name_value_keys_uniq
    on public.masters (name, value, stage_key, product_key);
  -- The expression index it replaces guarantees the same thing and can no
  -- longer be inferred by anything.
  drop index if exists public.masters_name_value_product_idx;
end $$;
