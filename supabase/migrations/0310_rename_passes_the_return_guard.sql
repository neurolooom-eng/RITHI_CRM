-- ===========================================================================
-- 0310 — A PART RENAME PASSES THE MATERIAL-RETURN GUARD, MOVES TRANSFERS
-- LAST, AND THE HSN CLEAN-UP FINISHES.
--
-- 0309's one-time fill cleaned 12 of the 29 descriptions on the live project;
-- 17 renames were refused (2026-10-01, read back with _part_hsn.sql). The
-- migration's notices are not printed by the workflow, so the reasons were
-- found by reproducing the rename AS NOBODY on a database:
--   * material_returns_immutable -- "a material return cannot be edited"
--     unless is_admin(), and a migration is nobody. It now also lets through
--     the one change a rename makes: the part, moved exactly as the rename's
--     ticket names it, every other column unchanged;
--   * stock_transfer_lines_check_stock re-checks the sender's balance under the
--     NEW name, and transfers moved before stock adjustments, so a positive
--     adjustment not yet moved could read as a shortfall. Transfers now move
--     LAST, once everything else is there and the balance is the true one;
--   * and, for PEOPLE rather than the migration, spare_request_lines_guard --
--     0310_rename_passes_the_line_guard (spare_requests, which runs first).
-- Then the 0309 fill runs again. It is idempotent: the 12 already cleaned do
-- not match, and the HSN codes already filled are not overwritten.
-- ===========================================================================

create or replace function public.material_returns_immutable()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public.is_admin() then return new; end if;
  -- A PART RENAME (0310): only the part changed, exactly as the ticket that
  -- rename_part_records() filed in this transaction says. Nothing else on a
  -- return may change, by anybody but an administrator.
  if (to_jsonb(new) - 'part' - 'sys_updated_by' - 'sys_updated_on')
       = (to_jsonb(old) - 'part' - 'sys_updated_by' - 'sys_updated_on')
     and exists (select 1 from public.part_rename_ticket t
                  where t.txid = txid_current()
                    and t.old_key = lower(btrim(old.part))
                    and t.new_detail = new.part) then
    return new;
  end if;
  raise exception 'A material return cannot be edited — raise a correcting entry instead';
end $$;

create or replace function public.rename_part_records(p_id bigint, p_code text, p_description text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  old_detail text; old_key text;
  new_code text := btrim(coalesce(p_code, ''));
  new_desc text := btrim(coalesce(p_description, ''));
  new_detail text; moved jsonb := '{}'::jsonb; n bigint;
begin
  if new_code = '' or new_desc = '' then
    raise exception 'A part needs both a code and a description';
  end if;
  if position('|' in new_code) > 0 or position('|' in new_desc) > 0 then
    -- The separator IS the key's structure, so a value containing one would
    -- produce a key nothing can parse back.
    raise exception 'Neither the code nor the description may contain "|"';
  end if;

  select item_detail into old_detail from parts where id = p_id;
  if old_detail is null then raise exception 'No such part'; end if;
  old_key := lower(btrim(old_detail));
  new_detail := new_code || '|' || new_desc;

  if lower(btrim(new_detail)) = old_key then
    return jsonb_build_object('renamed', false, 'reason', 'nothing changed',
                              'from', old_detail, 'to', new_detail);
  end if;
  -- A RENAME, NOT A MERGE (0196).
  if exists (select 1 from parts where item_detail_key = lower(btrim(new_detail)) and id <> p_id) then
    raise exception 'Another part is already called "%" — a rename cannot merge two parts', new_detail;
  end if;

  -- FILE THE TICKET, so the consumption guard can tell this rename from a line
  -- being re-pointed (0196/0261). Keyed on the transaction.
  insert into public.part_rename_ticket (txid, old_key, new_detail)
  values (txid_current(), old_key, new_detail)
  on conflict (txid) do update set old_key = excluded.old_key,
                                   new_detail = excluded.new_detail, at = now();

  -- THE TEN, then the part itself, each matched on the key the register uses;
  -- stock transfers last of the ten (0310).
  update spare_consumption         set part = new_detail where lower(btrim(part)) = old_key;
  get diagnostics n = row_count; moved := moved || jsonb_build_object('Spare consumption', n);
  update spare_consumption_history set part = new_detail where lower(btrim(part)) = old_key;
  get diagnostics n = row_count; moved := moved || jsonb_build_object('Consumption (history)', n);
  update spare_issue_history       set part = new_detail where lower(btrim(part)) = old_key;
  get diagnostics n = row_count; moved := moved || jsonb_build_object('Issued to engineers', n);
  update handstock_opening         set part = new_detail where lower(btrim(part)) = old_key;
  get diagnostics n = row_count; moved := moved || jsonb_build_object('Opening hand stock', n);
  update spare_request_lines       set part = new_detail where lower(btrim(part)) = old_key;
  get diagnostics n = row_count; moved := moved || jsonb_build_object('Spare request lines', n);
  update spare_dispatch_lines      set part = new_detail where lower(btrim(part)) = old_key;
  get diagnostics n = row_count; moved := moved || jsonb_build_object('Dispatch lines', n);
  update material_returns          set part = new_detail where lower(btrim(part)) = old_key;
  get diagnostics n = row_count; moved := moved || jsonb_build_object('Material returns', n);
  update indoor_job_parts          set part_code = new_detail where lower(btrim(part_code)) = old_key;
  get diagnostics n = row_count; moved := moved || jsonb_build_object('Indoor job parts', n);
  -- NEW (0309): stock adjustments (0266) move with the part too.
  update handstock_adjustments     set part = new_detail where lower(btrim(part)) = old_key;
  get diagnostics n = row_count; moved := moved || jsonb_build_object('Stock adjustments', n);
  -- TRANSFERS LAST (0310). Their guard re-checks the sender's stock under the
  -- NEW name, so it must run once everything else is already there -- or it
  -- sees a balance missing a positive adjustment and refuses a rename that
  -- changes nobody's stock.
  update stock_transfer_lines      set part = new_detail where lower(btrim(part)) = old_key;
  get diagnostics n = row_count; moved := moved || jsonb_build_object('Stock transfer lines', n);

  update parts set code = new_code, description = new_desc, item_detail = new_detail
   where id = p_id;

  delete from public.part_rename_ticket where txid = txid_current();

  return jsonb_build_object('renamed', true, 'from', old_detail, 'to', new_detail, 'moved', moved);
end $$;
revoke execute on function public.rename_part_records(bigint, text, text) from public, anon, authenticated;

-- ---- THE ONE-TIME FILL ----------------------------------------------------------
-- "(HSN:90330000)" / "(HSN NO:90330000)", brackets and all, with the space
-- before it. Idempotent: once removed, the pattern no longer matches, so a
-- re-run (or the bundle replayed) finds nothing to do. A part whose cleaned
-- name would collide with another part keeps its description and is named in
-- a notice; its HSN code is filled either way.
do $$
declare
  r record; hsn text; clean text; n_fill int := 0; n_ren int := 0; skipped text := '';
  pat constant text := '\s*\(\s*HSN(\s*NO\.?)?\s*:\s*([0-9]+)\s*\)';
begin
  for r in select id, code, description from public.parts
            where description ~* pat order by id loop
    hsn := (regexp_match(r.description, pat, 'i'))[2];
    clean := btrim(regexp_replace(r.description, pat, '', 'i'));
    update public.parts set hsn_code = hsn where id = r.id and btrim(hsn_code) = '';
    if found then n_fill := n_fill + 1; end if;
    if clean = '' then skipped := skipped || ' ' || r.code || ' (nothing left)'; continue; end if;
    begin
      perform public.rename_part_records(r.id, r.code, clean);
      n_ren := n_ren + 1;
    exception when others then
      skipped := skipped || ' ' || r.code || ' (' || sqlerrm || ')';
    end;
  end loop;
  raise notice '0310 (the 0309 fill, finished): HSN code filled on % part(s); "(HSN:...)" removed from % description(s).%',
    n_fill, n_ren, case when skipped = '' then '' else ' Left as they were:' || skipped end;
end $$;
