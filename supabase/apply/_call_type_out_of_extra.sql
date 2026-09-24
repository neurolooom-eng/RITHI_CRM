-- ===========================================================================
-- "THE EXPORTS ARE SHOWING CALL TYPE IN EXTRAS."   Read-only unless you say so.
--
--   The user, 2026-09-24: "Add a Separate Column in Call Register to Capture
--   the Call Type. At present it is in Extra." -- and, asked which register:
--   "the exports are showing Call type in Extras".
--
-- THE COLUMN WAS NEVER MISSING. `field_calls`, `installation_calls` and
-- `pm_calls` have each carried `call_type` since they existed, and the bulk
-- upload STAMPS it from the register somebody picked -- 'FIELD', 'INSTALLATION'
-- or 'PM' -- so a PM sheet cannot land as a field call. That is deliberate and
-- it stays.
--
-- WHAT WENT WRONG IS THAT THE FILE'S OWN "Call Type" HEADER WENT IN AS WELL.
-- A stamped header is claimed by no column, so it fell through into the `extra`
-- blob beside the real value. Every export carrying `extra` therefore shows a
-- Call Type inside it. The importer no longer does this (v0.9.371); this is the
-- rows that were loaded before it stopped.
--
-- AND THEY CAN DISAGREE, WHICH IS WHY THIS FILE DOES NOT JUST DELETE THE KEY.
-- A PM sheet loaded through the Field Calls register stores call_type='FIELD'
-- and extra['Call Type']='PM'. Deleting that would destroy the only record that
-- the two ever disagreed -- and the disagreement is a finding about a LOAD, not
-- noise. So:
--
--   * where the blob AGREES with the column, the key carries nothing and is
--     removed;
--   * where it DISAGREES, it is LEFT and listed, for a person to look at.
--
-- RUN IT ONCE AS IS. It writes NOTHING and shows you the counts. Then change
-- `v_apply` to true in the DO block below and run it again to remove the ones
-- that agree. The report at the end runs either way, so a second run shows you
-- what is left.
-- ===========================================================================

do $$
declare
  v_apply boolean := false;   -- <<< set to true to remove the agreeing copies
  t text;
  n integer;
  total integer := 0;
begin
  if not v_apply then
    raise notice 'Read-only run: nothing was changed. Set v_apply := true to remove them.';
    return;
  end if;
  foreach t in array array['field_calls', 'installation_calls', 'pm_calls'] loop
    if to_regclass('public.' || t) is null then continue; end if;
    -- ONLY WHERE IT AGREES. Compared with the case and the spaces squashed,
    -- because 'Field' and 'FIELD' are the same word and calling that a
    -- disagreement would send somebody to look at thousands of untroubled rows.
    execute format($f$
      update public.%1$s
         set extra = extra - 'Call Type'
       where extra ? 'Call Type'
         and upper(btrim(coalesce(extra->>'Call Type', '')))
           = upper(btrim(coalesce(call_type, '')));$f$, t);
    get diagnostics n = row_count;
    total := total + n;
    raise notice '%: % copy(ies) removed from extra', t, n;
  end loop;
  raise notice 'Total removed: %. Anything left DISAGREES with its column and is listed below.', total;
end $$;

-- One statement, one grid -- the Supabase editor shows the last result only.
with rows as (
  select 'field_calls' as t, call_type, extra->>'Call Type' as in_extra
    from public.field_calls where extra ? 'Call Type'
  union all
  select 'installation_calls', call_type, extra->>'Call Type'
    from public.installation_calls where extra ? 'Call Type'
  union all
  select 'pm_calls', call_type, extra->>'Call Type'
    from public.pm_calls where extra ? 'Call Type'
),
judged as (
  select *, upper(btrim(coalesce(call_type, ''))) = upper(btrim(coalesce(in_extra, ''))) as agrees
    from rows
)
select 1 as sort_order,
       'rows still carrying Call Type inside extra' as section,
       t as finding, count(*)::int as n,
       'every export that carries `extra` shows it beside the real column' as detail
  from judged group by t
union all
select 2, 'of those, the blob says the same as the column',
       t, count(*) filter (where agrees)::int,
       'carries nothing -- this file removes these when v_apply is true'
  from judged group by t
union all
select 3, 'of those, the blob DISAGREES with the column',
       t || ': extra says ' || coalesce(nullif(in_extra, ''), '(blank)')
          || ', the row says ' || coalesce(nullif(call_type, ''), '(blank)'),
       count(*)::int,
       'LEFT ALONE -- a sheet loaded through the wrong register, and worth a look'
  from judged where not agrees group by t, in_extra, call_type
union all
select 4, 'nothing left to do',
       case when (select count(*) from judged) = 0
            then 'no call carries Call Type in extra' else 'see the rows above' end,
       (select count(*) from judged)::int,
       'the importer stopped adding these in v0.9.371'
order by sort_order, n desc, finding;
