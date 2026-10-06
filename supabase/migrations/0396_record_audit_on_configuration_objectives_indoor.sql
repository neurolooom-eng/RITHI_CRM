-- ===========================================================================
-- 0396 — CONFIGURATION, QUALITY OBJECTIVES AND THE INDOOR WORKSHOP ARE IMAGED
--        (second re-review D-067, D-021, D-039)
--
-- record_audit (0225, 0314) images fifteen tables. Three groups that decide
-- or record a quality answer were outside it, so an edit or a delete there
-- left no before-and-after anywhere:
--
--   D-067  app_roles       what a role may do -- Roles & Permissions recorded
--                          rbac.save with the role KEYS only
--          app_settings    the Hotline desk, Audit Mode, the frequent-failure
--                          rules, the objective lock
--          sla_rules       the service-level targets
--   D-021  quality_objectives, objective_cutoffs, objective_settings
--                          a typed figure, a re-calculation, a cut-off, and
--                          deleting an objective with its twelve figures
--                          (objective_settings had UPDATE only, from 0357)
--   D-039  indoor_jobs, indoor_job_parts, indoor_job_accessories,
--          indoor_job_checks, indoor_pdt, indoor_dcs, indoor_dc_lines
--                          the workshop record, saved field by field on blur
--
-- THE SAME TRIGGERS AS 0225 / 0314 -- statement-level with transition tables,
-- so a bulk load is one event. Counters and release tickets are not records
-- and are left out.
--
-- THE KEY. record_audit_fn() writes each row under, and pairs an update's
-- before and after on, the first of ucn / uid / line_uid / call_number / id.
-- app_roles, app_settings, sla_rules and objective_settings have none of
-- them, so every row would be written under a NULL key and, in a statement
-- touching several rows, each "after" paired with the FIRST "before". The key
-- list gains `role` and `key` (the natural keys of those tables) and then
-- `sys_id`, unique on every table since 0244 -- AFTER the five it had, so no
-- table already imaged changes the key it is recorded under.
-- Otherwise the function is 0103's, unchanged.
--
-- In data_integrity, after 0314: every table named here is created by a module
-- earlier in ALL_ORDER. A project missing one simply arms the rest.
-- ===========================================================================

create or replace function public.record_audit_key(j jsonb)
returns text language sql immutable set search_path = public as $$
  select coalesce(j->>'ucn', j->>'uid', j->>'line_uid', j->>'call_number', j->>'id',
                  j->>'role', j->>'key', j->>'sys_id')
$$;
revoke execute on function public.record_audit_key(jsonb) from public, anon, authenticated;

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

  if tg_op = 'INSERT' then
    insert into public.record_audit (table_name, op, record_key, actor, actor_email, old_data, new_data)
    select tg_table_name, tg_op, public.record_audit_key(j), auth.uid(), auth.email(), null, j
      from (select to_jsonb(r) as j from new_rows r) x;
  elsif tg_op = 'DELETE' then
    insert into public.record_audit (table_name, op, record_key, actor, actor_email, old_data, new_data)
    select tg_table_name, tg_op, public.record_audit_key(j), auth.uid(), auth.email(), j, null
      from (select to_jsonb(r) as j from old_rows r) x;
  else
    -- UPDATE: the before and after of the same record, paired on the key the
    -- audit is written under.
    insert into public.record_audit (table_name, op, record_key, actor, actor_email, old_data, new_data)
    select tg_table_name, tg_op, public.record_audit_key(nj), auth.uid(), auth.email(), oj, nj
      from (
        select to_jsonb(nr) as nj,
               (select to_jsonb(orow) from old_rows orow
                 where public.record_audit_key(to_jsonb(orow)) is not distinct from public.record_audit_key(to_jsonb(nr))
                 limit 1) as oj
          from new_rows nr
      ) x;
  end if;
  return null;
end $$;

do $on$
declare t text; n int := 0;
begin
  foreach t in array array[
    'app_roles', 'app_settings', 'sla_rules',
    'quality_objectives', 'objective_cutoffs', 'objective_settings',
    'indoor_jobs', 'indoor_job_parts', 'indoor_job_accessories', 'indoor_job_checks',
    'indoor_pdt', 'indoor_dcs', 'indoor_dc_lines'
  ] loop
    if to_regclass('public.' || t) is not null
       and (select relkind from pg_class where oid = ('public.' || t)::regclass) = 'r' then
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
      n := n + 1;
    end if;
  end loop;
  raise notice '0396: record_audit armed on % of 13 tables.', n;
end $on$;
