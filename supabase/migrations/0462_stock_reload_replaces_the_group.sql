-- ===========================================================================
-- D-177 (re-review 5; the user's decision, 2026-10-14: "Replace the whole SI /
-- transfer"), D-178 (part), D-195, D-200.
--
-- D-071's fix (0455) matched a re-loaded MRN or transfer line on its SI Number
-- (or transfer) and its LINE NUMBER -- the file's, or its position. A corrected
-- file that drops or reorders a line shifts every later line's number, so a
-- re-load doubled or dropped stock (measured: a transfer loaded A, B, C and
-- re-loaded B, C read B, C, C). The user's rule now: an SI Number (or a
-- transfer) is loaded AS A WHOLE. Its imported lines are replaced by the
-- file's; a line the file no longer carries is removed.
--
--   1. reload_imported_stock_lines(p_kind, p_rows): for each SI Number ('mrn')
--      or transfer ('stl') the rows name, in ONE transaction: refuse if any
--      line under it was entered in RITHI (source <> import) -- a file never
--      replaces a return or transfer somebody recorded; remove the imported
--      lines under it; insert the file's. Only an importer (bulk.upload, or
--      import.panel for the legacy importer) may call it. It runs as the owner,
--      so a second importer may re-load what somebody else loaded (D-195), and
--      every statement is per group, so record_audit keeps every row's image
--      (a >150-row statement keeps none -- D-178 (3)).
--   2. The direct-overwrite door 0455 opened is closed again (D-200): the
--      importer UPDATE policies go, and material_returns_immutable is 0310's
--      rule again (part_key left out of its comparison, as 0310 now does).
--   3. stock_transfer_lines is put under record_audit (D-178 (2)); 0455's header
--      claimed it already was.
-- The natural-key indexes of 0455 stay: a line number is still one line.
-- ===========================================================================

create or replace function public.reload_imported_stock_lines(p_kind text, p_rows jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_tab   text;
  v_key   text;
  g       text;
  r       jsonb;
  v_cols  text;
  n_rem   int := 0;
  n_ins   int := 0;
  n_grp   int := 0;
  k       int;
begin
  if auth.uid() is not null and not (public.has_perm('bulk.upload') or public.has_perm('import.panel')) then
    raise exception 'RBAC: re-loading imported stock lines needs Bulk Uploads (bulk.upload) or the Data Import panel (import.panel)'
      using errcode = '42501';
  end if;
  if p_kind = 'mrn' then v_tab := 'material_returns'; v_key := 'uid';
  elsif p_kind = 'stl' then v_tab := 'stock_transfer_lines'; v_key := 'transfer_uid';
  else raise exception 'Unknown kind %: expected mrn or stl', p_kind;
  end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    return jsonb_build_object('groups', 0, 'removed', 0, 'written', 0);
  end if;

  for g in select distinct btrim(e->>v_key) from jsonb_array_elements(p_rows) e loop
    if coalesce(g, '') = '' then
      raise exception 'A row names no % -- it could never be matched again, so nothing was loaded', v_key;
    end if;
    n_grp := n_grp + 1;
    if p_kind = 'mrn' then
      if exists (select 1 from public.material_returns m where m.uid = g and coalesce(m.source, '') <> 'import') then
        raise exception 'SI Number % holds a return entered in RITHI; a file does not replace it -- nothing was loaded', g;
      end if;
      delete from public.material_returns m where m.uid = g;
    else
      if not exists (select 1 from public.stock_transfers t where t.uid = g and coalesce(t.source, '') = 'import') then
        raise exception 'Transfer % is not an imported transfer (or is not loaded); its lines are not replaced by a file -- nothing was loaded', g;
      end if;
      delete from public.stock_transfer_lines l where l.transfer_uid = g;
    end if;
    get diagnostics k = row_count; n_rem := n_rem + k;

    for r in select e from jsonb_array_elements(p_rows) e where btrim(e->>v_key) = g loop
      if p_kind = 'mrn' then r := r || jsonb_build_object('source', 'import'); end if;
      -- Only the columns the row carries, so every other one keeps its default.
      select string_agg(quote_ident(c.column_name), ', ' order by c.ordinal_position) into v_cols
        from information_schema.columns c
       where c.table_schema = 'public' and c.table_name = v_tab
         and c.column_name <> 'id' and c.column_name not like 'sys\_%'
         and c.is_generated = 'NEVER' and c.is_identity = 'NO'
         and r ? c.column_name;
      execute format('insert into public.%I (%s) select %s from jsonb_populate_record(null::public.%I, $1)',
                     v_tab, v_cols, v_cols, v_tab) using r;
      n_ins := n_ins + 1;
    end loop;
  end loop;
  return jsonb_build_object('groups', n_grp, 'removed', n_rem, 'written', n_ins);
end $$;
revoke execute on function public.reload_imported_stock_lines(text, jsonb) from public;
do $$ begin
  revoke execute on function public.reload_imported_stock_lines(text, jsonb) from anon;
exception when undefined_object then null; end $$;
grant execute on function public.reload_imported_stock_lines(text, jsonb) to authenticated;

-- 2. The direct-overwrite door closed again.
drop policy if exists mr_import_update on public.material_returns;
drop policy if exists stl_import_update on public.stock_transfer_lines;

create or replace function public.material_returns_immutable()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.is_admin() then return new; end if;
  -- A PART RENAME (0310): only the part changed, exactly as the ticket that
  -- rename_part_records() filed in this transaction says. Nothing else on a
  -- return may change, by anybody but an administrator. part_key is generated
  -- from part and not yet computed in a BEFORE trigger, so it is left out.
  -- (0462: a re-loaded imported return is REPLACED, not edited, so 0455's
  -- import exemption is gone.)
  if (to_jsonb(new) - 'part' - 'part_key' - 'sys_updated_by' - 'sys_updated_on')
       = (to_jsonb(old) - 'part' - 'part_key' - 'sys_updated_by' - 'sys_updated_on')
     and exists (select 1 from public.part_rename_ticket t
                  where t.txid = txid_current()
                    and t.old_key = lower(btrim(old.part))
                    and t.new_detail = new.part) then
    return new;
  end if;
  raise exception 'A material return cannot be edited — raise a correcting entry instead';
end $$;

-- 3. Transfer lines imaged.
do $on$
begin
  if to_regprocedure('public.record_audit_fn()') is null then return; end if;
  drop trigger if exists record_audit_i on public.stock_transfer_lines;
  drop trigger if exists record_audit_u on public.stock_transfer_lines;
  drop trigger if exists record_audit_d on public.stock_transfer_lines;
  create trigger record_audit_i after insert on public.stock_transfer_lines
    referencing new table as new_rows for each statement execute function public.record_audit_fn();
  create trigger record_audit_u after update on public.stock_transfer_lines
    referencing old table as old_rows new table as new_rows for each statement execute function public.record_audit_fn();
  create trigger record_audit_d after delete on public.stock_transfer_lines
    referencing old table as old_rows for each statement execute function public.record_audit_fn();
end $on$;
