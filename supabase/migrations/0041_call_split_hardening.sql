-- ===========================================================================
-- Stage 3 — harden the calls split. The `calls` view stays (cheap, keeps the
-- cross-type screens simple, and after Stage 2 the registers already read the
-- typed tables directly); this makes keeping it robust:
--
--   1. A CHECK per table pins each row to the right table (call_table_for()),
--      so the INSTEAD OF routing can never misfile a row, and an accidental
--      in-place call_type change is rejected rather than silently orphaned.
--   2. Drop the per-table call_type index LIKE copied from calls — every row in
--      a table now shares one call_type, so the index only costs writes.
--
-- (No constraint-exclusion pruning is attempted: the check is on
-- call_table_for(call_type) while callers filter on call_type, different
-- expressions, and the registers no longer filter the view by type anyway.)
--
-- Idempotent.
-- ===========================================================================

do $$
declare t text; want text; idx text;
begin
  if to_regclass('public.field_calls') is null then
    raise notice 'calls not split yet (0040) — nothing to harden'; return;
  end if;

  foreach t in array array['field_calls', 'installation_calls', 'pm_calls'] loop
    want := case t when 'field_calls' then 'field'
                   when 'installation_calls' then 'installation'
                   else 'pm' end;

    -- 1 + 2. type-pinning CHECK (drop/recreate so it's idempotent).
    execute format('alter table public.%I drop constraint if exists %I', t, t || '_type_ck');
    execute format($c$alter table public.%1$I add constraint %1$s_type_ck check (public.call_table_for(call_type) = %2$L)$c$, t, want);

    -- 3. drop any index on just (call_type) — redundant now the table is one type.
    for idx in
      select indexrelid::regclass::text
        from pg_index i
        join pg_class c on c.oid = i.indrelid
       where c.relname = t and c.relnamespace = 'public'::regnamespace
         and not i.indisprimary and not i.indisunique
         and pg_get_indexdef(i.indexrelid) ilike '%(call_type)%'
    loop
      execute format('drop index if exists %s', idx);
    end loop;
  end loop;
end $$;
