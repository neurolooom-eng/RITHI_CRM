-- ===========================================================================
-- 0325 — PARTY AND PART MASTER: ONE KEY TO ADD, ONE TO EDIT, ONE TO DELETE
--
-- The user, 2026-10-03: "Provision to edit all masters. Action button on the
-- table. Ensure it is added in Roles and Permissions" -- and, asked how: "One
-- add, one edit, one delete per master".
--
-- Until now one key, masters.edit.records, wrote parties and parts through a
-- FOR ALL policy (0286), so whoever could add a party could also DELETE one
-- through the API although no screen offered it. This file splits it:
--
--   masters.parties.add / .edit   parents: masters.edit.records, masters.edit
--   masters.parties.delete        parent:  masters.edit
--   masters.parts.add / .edit     parents: masters.edit.records, masters.edit
--   masters.parts.delete          parent:  masters.edit
--
-- NOBODY'S GRANTS ARE TOUCHED. Add and edit are children of the key that
-- already allowed them, so a role holding it keeps exactly what it had. Delete
-- is a child of "Edit masters (all of the below)" only: a role holding just
-- masters.edit.records loses an API delete no screen ever offered it, which is
-- a narrowing, never a widening. An administrator passes has_perm() anyway.
--
-- A DELETE IS REFUSED WHILE ANY RECORD STILL NAMES THE ROW. Parties and parts
-- are referenced by TEXT, not by foreign key -- a call carries the party's
-- name, a consumption line the part's CODE|Description -- so a deleted party
-- would leave every machine, call and contract naming a customer who no longer
-- exists, with nothing to say so. master_delete_guard() counts those records
-- as the OWNER (security definer), never as the caller: under the caller's
-- row-level security an engineer's count would see only his own calls and pass
-- a party that a thousand other calls name.
--
-- In the rbac module, after 0286 (which creates parties_write / parts_write)
-- and before the policy tail, so a replay of rbac.sql ends on these.
-- ===========================================================================

-- ---- 1. the parents (0286's list carries the same rows) -------------------
insert into public.perm_parents (child, parent) values
  ('masters.parties.add', 'masters.edit.records'),
  ('masters.parties.add', 'masters.edit'),
  ('masters.parties.edit', 'masters.edit.records'),
  ('masters.parties.edit', 'masters.edit'),
  ('masters.parties.delete', 'masters.edit'),
  ('masters.parts.add', 'masters.edit.records'),
  ('masters.parts.add', 'masters.edit'),
  ('masters.parts.edit', 'masters.edit.records'),
  ('masters.parts.edit', 'masters.edit'),
  ('masters.parts.delete', 'masters.edit'),
  ('masters.product_master.add', 'masters.edit.records'),
  ('masters.product_master.add', 'masters.edit'),
  ('masters.product_master.edit', 'masters.edit.records'),
  ('masters.product_master.edit', 'masters.edit'),
  ('masters.product_master.delete', 'masters.edit')
on conflict do nothing;

-- ---- 2. parties and parts: insert / update / delete, each its own key -----
-- Split out of FOR ALL, which is also a read policy; each wrapped in a
-- sub-select so it is asked once per query, not once per row (0250).
do $$
declare t text; k text;
begin
  foreach t in array array['parties', 'parts'] loop
    if to_regclass('public.' || t) is null then continue; end if;
    k := 'masters.' || t;
    execute format('drop policy if exists %1$s_write on public.%1$s', t);
    execute format('drop policy if exists %1$s_insert on public.%1$s', t);
    execute format('drop policy if exists %1$s_update on public.%1$s', t);
    execute format('drop policy if exists %1$s_delete on public.%1$s', t);
    execute format('create policy %1$s_insert on public.%1$s for insert '
                   'with check ((select public.has_perm(%2$L)))', t, k || '.add');
    execute format('create policy %1$s_update on public.%1$s for update '
                   'using ((select public.has_perm(%2$L))) with check ((select public.has_perm(%2$L)))', t, k || '.edit');
    execute format('create policy %1$s_delete on public.%1$s for delete '
                   'using ((select public.has_perm(%2$L)))', t, k || '.delete');
  end loop;
end $$;

-- ---- 3. no delete while a record names it --------------------------------
-- plpgsql, so nothing in the body is resolved at creation: most of the tables
-- it reads belong to modules that run after this one, and each is asked only
-- if it exists. The lists are every column that names the row, read off the
-- schema on 2026-10-03; a table added later that names a party or a part
-- belongs here too.
create or replace function public.master_delete_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  refs text[];
  r text; tbl text; col text; n bigint;
  key text;
  found text[] := '{}';
  total bigint := 0;
begin
  if tg_table_name = 'parties' then
    key := lower(btrim(old.party_name));
    refs := array['products.party_name', 'field_calls.party_name', 'installation_calls.party_name',
      'pm_calls.party_name', 'call_requests.party_name', 'pending_registrations.party_name',
      'sale_entries.party_name', 'contract_entries.party_name', 'contract_items.party_name',
      'ownership_transfers.from_party', 'ownership_transfers.to_party',
      'product_additional_entries.party_name', 'feedback.party_name', 'spare_requests.party_name',
      'spare_consumption_history.party_name', 'indoor_jobs.party_name'];
  elsif tg_table_name = 'parts' then
    key := lower(btrim(old.item_detail));
    refs := array['spare_request_lines.part', 'spare_dispatch_lines.part', 'spare_consumption.part',
      'spare_consumption_history.part', 'spare_issue_history.part', 'handstock_opening.part',
      'handstock_adjustments.part', 'stock_transfer_lines.part', 'material_returns.part'];
  elsif tg_table_name = 'product_master' then
    key := lower(btrim(old.product_code));
    refs := array['products.item_code', 'sale_items.product_code', 'contract_items.product_code'];
  else
    return old;
  end if;
  if coalesce(key, '') = '' then return old; end if;

  foreach r in array refs loop
    tbl := split_part(r, '.', 1);
    col := split_part(r, '.', 2);
    if to_regclass('public.' || tbl) is null then continue; end if;
    if not exists (select 1 from information_schema.columns
                    where table_schema = 'public' and table_name = tbl and column_name = col) then
      continue;
    end if;
    execute format('select count(*) from public.%I where lower(btrim(%I)) = $1', tbl, col) into n using key;
    if n > 0 then
      found := found || format('%s %s', n, case tbl when 'products' then 'machines' else replace(tbl, '_', ' ') end);
      total := total + n;
    end if;
  end loop;

  if total > 0 then
    raise exception '% is still named on % record(s) — %. It cannot be deleted while they name it.',
      case tg_table_name when 'parties' then 'This party'
                         when 'parts' then 'This part'
                         else 'This product line' end,
      total, array_to_string(found, ', ')
      using errcode = '23503';
  end if;
  return old;
end $$;
revoke execute on function public.master_delete_guard() from public, anon, authenticated;

do $$
declare t text;
begin
  foreach t in array array['parties', 'parts'] loop
    if to_regclass('public.' || t) is null then continue; end if;
    execute format('drop trigger if exists master_delete_guard on public.%I', t);
    execute format('create trigger master_delete_guard before delete on public.%I '
                   'for each row execute function public.master_delete_guard()', t);
  end loop;
end $$;
