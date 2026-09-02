-- ===========================================================================
-- UNDO THE GO-LIVE RESET — put the `bak` snapshot back.
--
-- Only useful against the snapshot `_backup_before_reset.sql` took in this same
-- project. It empties the live tables and refills them from `bak`.
--
-- Three things this has to get right, none of which a plain
-- `insert into x select * from bak.x` does:
--
--   1. Every `id` in this schema is GENERATED ALWAYS. Without OVERRIDING SYSTEM
--      VALUE the restore is REFUSED; with a plain insert that dropped the id,
--      every row would be silently RENUMBERED and every reference between them
--      would point at the wrong record. So: explicit column list, overriding.
--   2. The write triggers would restamp the rows as they land — updated_at set
--      to now(), created_by set to whoever is running this. They are disabled
--      for the duration so the snapshot goes back as it was.
--   3. The identity sequences must be moved PAST the restored ids, or the next
--      real insert collides with a restored row.
--
-- Order matters: children are emptied before parents, and parents refilled
-- before children.
-- ===========================================================================

do $$
declare
  t     text;
  cols  text;
  n     bigint;
  -- Parents first. The restore walks this order; the truncate walks it back.
  tabs  text[] := array[
    'parties','products','parts','masters',
    'sale_entries','sale_items','contract_entries','contract_items',
    'field_calls','installation_calls','pm_calls','call_requests',
    'pending_registrations','call_reviews','reports','feedback',
    'spare_requests','spare_request_lines','spare_dispatches',
    'spare_dispatch_lines','spare_consumption','material_returns',
    'stock_transfers','stock_transfer_lines','notifications',
    'call_number_seq','spare_or_counters','spare_dispatch_counters',
    'material_return_counters','stock_transfer_counters',
    'audit_log','record_audit','validation_results','kb_articles',
    'documents','help_screenshots'
  ];
begin
  if to_regclass('bak._taken_at') is null then
    raise exception 'No snapshot found — schema bak is empty. Nothing to restore.';
  end if;

  -- 1. empty what we are about to refill (children first)
  for t in select unnest(tabs) order by 1 desc loop
    if to_regclass('public.' || t) is null or to_regclass('bak.' || t) is null then continue; end if;
    execute format('alter table public.%I disable trigger user', t);
    execute format('truncate table public.%I cascade', t);
  end loop;

  -- 2. refill, keeping the original ids
  for t in select unnest(tabs) loop
    if to_regclass('public.' || t) is null or to_regclass('bak.' || t) is null then continue; end if;

    -- Only the columns the snapshot actually has, so a column added by a
    -- migration since the snapshot does not break the restore — and NEVER a
    -- GENERATED column (field_calls.open_state, call_reviews.review2_done and
    -- the rest). Postgres computes those and refuses an explicit value, so
    -- listing them fails the whole restore with "cannot insert a non-DEFAULT
    -- value into column". They rebuild themselves from the columns they derive
    -- from, which the restore does put back.
    select string_agg(quote_ident(a.attname), ', ' order by a.attnum)
      into cols
      from pg_attribute a
     where a.attrelid = ('public.' || quote_ident(t))::regclass
       and a.attnum > 0 and not a.attisdropped
       and a.attgenerated = ''
       and exists (select 1 from information_schema.columns b
                    where b.table_schema = 'bak' and b.table_name = t
                      and b.column_name = a.attname);

    execute format('insert into public.%1$I (%2$s) overriding system value select %2$s from bak.%1$I', t, cols);
    execute format('select count(*) from public.%I', t) into n;
    raise notice 'restored % (% rows)', t, n;

    execute format('alter table public.%I enable trigger user', t);
  end loop;

  -- 3. move every identity sequence past the ids we just put back
  for t in select unnest(tabs) loop
    if to_regclass('public.' || t) is null then continue; end if;
    if exists (select 1 from information_schema.columns
                where table_schema='public' and table_name=t and column_name='id') then
      execute format(
        'select setval(pg_get_serial_sequence(''public.%1$I'', ''id''),
                       greatest(coalesce((select max(id) from public.%1$I), 0), 1),
                       (select count(*) > 0 from public.%1$I))
         where pg_get_serial_sequence(''public.%1$I'', ''id'') is not null', t);
    end if;
  end loop;

  -- 4. and the three shared / function-driven ones, from what was recorded
  perform setval('public.' || s.name, greatest(s.last_value, 1), coalesce(s.is_called, true))
     from bak._sequences s
    where to_regclass('public.' || s.name) is not null;
end $$;

select 'restored from snapshot taken at ' || max(at)::text as result from bak._taken_at;
