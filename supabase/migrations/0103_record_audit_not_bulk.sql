-- ===========================================================================
-- THE AUDIT TRAIL RECORDS WHAT PEOPLE DO, NOT WHAT A LOAD LOADED.
--
-- `record_audit` (0048) kept a row, with the whole record before and after, for
-- every INSERT / UPDATE / DELETE on the quality tables. That is right for a
-- person changing a record and wrong for a bulk load: migrating the sheet era
-- wrote tens of thousands of audit rows that say nothing a migration report
-- does not say better, and they are the reason the table grew as it did.
--
-- An audit trail exists to answer "who changed this record, and to what". A
-- one-time load is not that question; it is answered by the migration's own
-- verification (the DM checks in the validation package: row counts reconciled,
-- fields sampled, identifiers checked).
--
-- SO A BULK WRITE IS STILL RECORDED — AS ONE EVENT, NOT TEN THOUSAND. The row
-- says who loaded, into which table, how many rows and when. The load remains
-- attributable, which is what Part 11 asks of it; what goes is the per-record
-- duplicate of data that is already in the table it was loaded into.
--
-- HOW THE LINE IS DRAWN. A statement-level trigger with transition tables can
-- count the rows one statement touched, which a row-level trigger cannot. The
-- threshold sits between the largest write a PERSON makes in one statement and
-- the smallest a LOADER makes:
--
--     bulk re-allotment   100 rows per statement  (reallocateCalls, src/lib/supabase.ts)
--     bulk upload         300 or 500 per statement (uploadRows, same file)
--
-- 150 sits between them, and if either chunk size changes this number wants
-- revisiting. But the margin is wider than those numbers suggest, and it is
-- worth knowing why:
--
--   THE BULK USER ACTIONS GO THROUGH THE `calls` VIEW, and 0040's INSTEAD OF
--   triggers write it ROW BY ROW into the typed table. So at the table — which
--   is where this trigger sits — a hundred-call re-allotment arrives as a
--   hundred single-row statements and is audited in full, whatever the
--   threshold. The loaders write to `field_calls`, `spare_requests`,
--   `spare_consumption` and the rest DIRECTLY, in one statement per batch.
--
-- Verified on Postgres, all three: 500 rows loaded into field_calls -> one BULK
-- INSERT row; a re-allotment through the view -> a row each, with before and
-- after intact; a re-load UPDATING 500 rows -> one BULK UPDATE row.
--
-- Everything else is unchanged: written only by a SECURITY DEFINER trigger,
-- readable only by an administrator or `audit.view`, and still not writable or
-- alterable by anyone.
-- ===========================================================================

create or replace function public.record_audit_fn()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  n     bigint;
  bulk  boolean;
begin
  -- How many rows this ONE statement touched.
  if tg_op = 'DELETE' then
    select count(*) into n from old_rows;
  else
    select count(*) into n from new_rows;
  end if;
  if n = 0 then return null; end if;

  bulk := n > 150;

  if bulk then
    -- One row for the whole statement: who, what table, how many, when.
    insert into public.record_audit (table_name, op, record_key, actor, actor_email, old_data, new_data)
    values (tg_table_name, 'BULK ' || tg_op, null, auth.uid(), auth.email(), null,
            jsonb_build_object('rows', n,
                               'note', 'Bulk write — recorded as one event. The records are in ' || tg_table_name || '.'));
    return null;
  end if;

  -- Otherwise exactly what 0048 did, a row at a time, from the transition
  -- tables rather than from OLD / NEW.
  if tg_op = 'INSERT' then
    insert into public.record_audit (table_name, op, record_key, actor, actor_email, old_data, new_data)
    select tg_table_name, tg_op,
           coalesce(j->>'ucn', j->>'uid', j->>'line_uid', j->>'call_number', j->>'id'),
           auth.uid(), auth.email(), null, j
      from (select to_jsonb(r) as j from new_rows r) x;
  elsif tg_op = 'DELETE' then
    insert into public.record_audit (table_name, op, record_key, actor, actor_email, old_data, new_data)
    select tg_table_name, tg_op,
           coalesce(j->>'ucn', j->>'uid', j->>'line_uid', j->>'call_number', j->>'id'),
           auth.uid(), auth.email(), j, null
      from (select to_jsonb(r) as j from old_rows r) x;
  else
    -- UPDATE: the before and after of the same record, paired on the key the
    -- audit is written under. A quality table without one of these keys cannot
    -- be paired, so both images are still written and the key reads null.
    insert into public.record_audit (table_name, op, record_key, actor, actor_email, old_data, new_data)
    select tg_table_name, tg_op,
           coalesce(nj->>'ucn', nj->>'uid', nj->>'line_uid', nj->>'call_number', nj->>'id'),
           auth.uid(), auth.email(), oj, nj
      from (
        select to_jsonb(nr) as nj,
               (select to_jsonb(orow) from old_rows orow
                 where coalesce(to_jsonb(orow)->>'ucn', to_jsonb(orow)->>'uid', to_jsonb(orow)->>'line_uid',
                                to_jsonb(orow)->>'call_number', to_jsonb(orow)->>'id')
                       is not distinct from
                       coalesce(to_jsonb(nr)->>'ucn', to_jsonb(nr)->>'uid', to_jsonb(nr)->>'line_uid',
                                to_jsonb(nr)->>'call_number', to_jsonb(nr)->>'id')
                 limit 1) as oj
          from new_rows nr
      ) x;
  end if;
  return null;
end $$;

-- Re-attach: one trigger PER OPERATION now, because a statement trigger names
-- the transition table it needs and INSERT has no OLD, DELETE no NEW.
do $$
declare t text;
begin
  foreach t in array array[
    'field_calls', 'installation_calls', 'pm_calls', 'reports',
    'spare_requests', 'spare_request_lines', 'spare_consumption', 'feedback',
    'call_requests', 'pending_registrations'
  ] loop
    if to_regclass('public.' || t) is not null
       and (select relkind from pg_class where oid = ('public.' || t)::regclass) = 'r' then
      execute format('drop trigger if exists record_audit_t on public.%I', t);
      execute format('drop trigger if exists record_audit_i on public.%I', t);
      execute format('drop trigger if exists record_audit_u on public.%I', t);
      execute format('drop trigger if exists record_audit_d on public.%I', t);
      execute format('create trigger record_audit_i after insert on public.%I '
                     'referencing new table as new_rows for each statement '
                     'execute function public.record_audit_fn()', t);
      execute format('create trigger record_audit_u after update on public.%I '
                     'referencing old table as old_rows new table as new_rows for each statement '
                     'execute function public.record_audit_fn()', t);
      execute format('create trigger record_audit_d after delete on public.%I '
                     'referencing old table as old_rows for each statement '
                     'execute function public.record_audit_fn()', t);
    end if;
  end loop;
end $$;
