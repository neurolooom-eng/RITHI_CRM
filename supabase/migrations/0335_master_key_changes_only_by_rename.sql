-- ===========================================================================
-- 0335 — A PARTY'S NAME, A PART'S CODE AND A PRODUCT LINE'S CODE CHANGE ONLY
--        THROUGH A RENAME  (second re-review, 2026-10-03: D-135)
--
-- master_delete_guard (0325) refuses deleting a party, part or product line that
-- records still name -- by the OLD key. parties_update, parts_update and
-- pm_update let the key itself be changed, with no trigger refusing it, so a
-- row could be renamed first and then deleted, and every record naming it was
-- left pointing at nothing. Measured: a party named on a machine was refused a
-- delete, then renamed (UPDATE 1) and deleted (DELETE 1). Renaming a part that
-- way also skips rename_part(), which carries the part's history through ten
-- tables.
--
-- WHAT KEEPS WORKING -- read from the code, not assumed:
--   * The screens never change these keys. updateParty() deliberately leaves
--     party_name out; updatePart() sends category, product, cost and HSN only;
--     the Product Master's Edit sends every field but the code (FRS-242.5).
--   * Renaming a part goes through rename_part(), which files its ticket in
--     part_rename_ticket BEFORE it updates the part (0310): that ticket is
--     accepted here, exactly as the spare and consumption guards accept it.
--   * The uploads re-load on the KEY (parties on name_key, parts on
--     item_detail_key, product lines on product_code), so a re-load never
--     changes it. A change of case or of outer spaces is not a change of key and
--     is allowed. The importers and writes with no signed-in user are trusted, as
--     in 0331.
--
-- Filed in the handstock bundle, after rename_part's last definition (0310),
-- because it reads part_rename_ticket, which that bundle creates.
-- ===========================================================================

create or replace function public.master_key_changes_only_by_rename()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.stock_import_allowed() then return new; end if;

  if tg_table_name = 'parties' then
    if lower(btrim(coalesce(new.party_name, ''))) is distinct from lower(btrim(coalesce(old.party_name, ''))) then
      raise exception 'A party''s name is the key every machine, call and contract names it by, so it is not changed here (it would leave them naming a party that is gone)'
        using errcode = '42501';
    end if;

  elsif tg_table_name = 'parts' then
    if (lower(btrim(coalesce(new.item_detail, ''))) is distinct from lower(btrim(coalesce(old.item_detail, '')))
        or lower(btrim(coalesce(new.code, ''))) is distinct from lower(btrim(coalesce(old.code, ''))))
       and not exists (select 1 from public.part_rename_ticket t
                        where t.txid = txid_current()
                          and t.old_key = lower(btrim(coalesce(old.item_detail, '')))) then
      raise exception 'A part''s code and description are renamed with "Rename part", which carries every record that names it'
        using errcode = '42501';
    end if;

  elsif tg_table_name = 'product_master' then
    if lower(btrim(coalesce(new.product_code, ''))) is distinct from lower(btrim(coalesce(old.product_code, ''))) then
      raise exception 'A product line''s code is the key machines name it by, so it is not changed (FRS-242.5)'
        using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
revoke execute on function public.master_key_changes_only_by_rename() from public, anon, authenticated;

do $$
declare t text;
begin
  foreach t in array array['parties', 'parts', 'product_master'] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop trigger if exists master_key_changes_only_by_rename on public.%I', t);
      execute format('create trigger master_key_changes_only_by_rename before update on public.%I '
                     'for each row execute function public.master_key_changes_only_by_rename()', t);
    end if;
  end loop;
end $$;
