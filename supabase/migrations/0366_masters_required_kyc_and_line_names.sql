-- ===========================================================================
-- 0366 — THE MASTERS' OWN RULES IN THE DATABASE: required fields, a code that
--        differs only in case, the KYC verifier, and a product line's NAME
--        (second re-review D-058, D-138, D-140)
--
-- D-140 -- the masters' required fields and unique codes were the forms' alone.
-- Measured as a signed-in user, each accepted: a party with no city or state,
-- a party named only spaces, a part with blank code and description, a
-- product line with blank code and name, a product line 'c-named' beside
-- 'C-NAMED' (product_line_sellable('C-NAMED') then fails with "more than one
-- row returned by a subquery") and a part 'cp-r' beside 'CP-R'.
-- Now, for a signed-in caller who is not an importer:
--   * a NEW party needs a name, a city and a state (the Add form's three --
--     the user, 2026-10-03); an edit may not blank one that has a value, and
--     leaves a row that never had one alone, so an old incomplete party can
--     still be edited;
--   * a part needs a code and a description; a product line a code and a
--     name -- on insert, and an edit may not blank them;
--   * a part code or a product code that matches an EXISTING one ignoring case
--     and outer spaces, but is spelled differently, is refused: the exact
--     spelling is already unique (parts_item_detail_key_uniq, the product
--     master's primary key), so the case variant is the only duplicate left.
--     Not a unique index: one would fail this migration on a project that
--     already holds a pair, and a pair already there is not this file's to
--     choose between.
-- Imports load history as it was and are not stopped. The rule is
-- stock_import_allowed()'s (0339), written out: that function is created by a
-- LATER module, and this trigger may fire before it exists on a fresh apply.
--
-- D-058 -- parties_kyc_stamp() (0201) stamps kyc_verified_by / _at only when
-- the KYC status changes, so an UPDATE writing the verifier without changing
-- the status kept the caller's value (measured). A signed-in UPDATE that leaves
-- the status alone now keeps the verifier and time as they were. (The other
-- half of D-058, renaming a party, is refused since 0325's
-- master_key_changes_only_by_rename.)
--
-- D-138 -- a product line is matched by NAME as well as code:
-- indoor_job_product_code() (0321) and indoor_job_is_imported() (0320) read
-- product_master.product_name, and the delete guard counted only the code.
-- Measured: a line whose name indoor jobs carry, and whose code no machine
-- carries, was deleted, and the jobs lost their code. Now:
--   * product_line_name_uses(name) counts the indoor jobs naming a line by
--     that name -- 0 where another line keeps the name, since the match then
--     still resolves -- for the Product Master's rename warning;
--   * deleting a line those jobs still name is refused, in the delete guard's
--     words, by a trigger of its own (master_delete_guard is 0350's and is
--     left as it is).
-- In the masters module, after 0326.
-- ===========================================================================

-- ---- D-140 -------------------------------------------------------------------
create or replace function public.master_required_fields()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_missing text[] := '{}';
  v_other   text;
begin
  -- On INSERT a blank is refused; on UPDATE only a value being BLANKED is.
  if auth.uid() is null or public.has_perm('bulk.upload') or public.has_perm('import.panel') then return new; end if;     -- no session, or an importer

  if tg_table_name = 'parties' then
    if btrim(coalesce(new.party_name, '')) = ''
       and (tg_op = 'INSERT' or btrim(coalesce(old.party_name, '')) <> '') then
      v_missing := v_missing || 'Party Name'::text;
    end if;
    if btrim(coalesce(new.city, '')) = ''
       and (tg_op = 'INSERT' or btrim(coalesce(old.city, '')) <> '') then
      v_missing := v_missing || 'City'::text;
    end if;
    if btrim(coalesce(new.state, '')) = ''
       and (tg_op = 'INSERT' or btrim(coalesce(old.state, '')) <> '') then
      v_missing := v_missing || 'State'::text;
    end if;

  elsif tg_table_name = 'parts' then
    if btrim(coalesce(new.code, '')) = ''
       and (tg_op = 'INSERT' or btrim(coalesce(old.code, '')) <> '') then
      v_missing := v_missing || 'Part Code'::text;
    end if;
    if btrim(coalesce(new.description, '')) = ''
       and (tg_op = 'INSERT' or btrim(coalesce(old.description, '')) <> '') then
      v_missing := v_missing || 'Description'::text;
    end if;
    if btrim(coalesce(new.code, '')) <> ''
       and (tg_op = 'INSERT' or new.code is distinct from old.code) then
      select p.code into v_other from public.parts p
       where p.id is distinct from new.id
         and lower(btrim(p.code)) = lower(btrim(new.code))
         and p.code is distinct from new.code
       limit 1;
      if found then
        raise exception 'Part code % is already on the Part Master as % -- the same code spelled differently would be counted as two parts',
          btrim(new.code), v_other using errcode = '23505';
      end if;
    end if;

  elsif tg_table_name = 'product_master' then
    if btrim(coalesce(new.product_code, '')) = ''
       and (tg_op = 'INSERT' or btrim(coalesce(old.product_code, '')) <> '') then
      v_missing := v_missing || 'Product Code'::text;
    end if;
    if btrim(coalesce(new.product_name, '')) = ''
       and (tg_op = 'INSERT' or btrim(coalesce(old.product_name, '')) <> '') then
      v_missing := v_missing || 'Product Name'::text;
    end if;
    if btrim(coalesce(new.product_code, '')) <> ''
       and (tg_op = 'INSERT' or new.product_code is distinct from old.product_code) then
      select m.product_code into v_other from public.product_master m
       where m.product_code is distinct from new.product_code
         and lower(btrim(m.product_code)) = lower(btrim(new.product_code))
       limit 1;
      if found then
        raise exception 'Product code % is already on the Product Master as % -- the same code spelled differently would be two product lines',
          btrim(new.product_code), v_other using errcode = '23505';
      end if;
    end if;
  end if;

  if array_length(v_missing, 1) > 0 then
    raise exception '% cannot be blank', array_to_string(v_missing, ', ') using errcode = '23502';
  end if;
  return new;
end $$;
revoke execute on function public.master_required_fields() from public, anon, authenticated;

do $$
declare t text;
begin
  foreach t in array array['parties', 'parts', 'product_master'] loop
    execute format('drop trigger if exists master_required_fields on public.%I', t);
    execute format('create trigger master_required_fields before insert or update on public.%I '
                   'for each row execute function public.master_required_fields()', t);
  end loop;
end $$;

-- ---- D-058: the KYC verifier is the database's -------------------------------
-- Runs after parties_kyc_stamp (the name sorts after it), so a status change
-- has already been stamped and is left alone.
create or replace function public.parties_kyc_stamp_kept()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;                 -- the SQL editor, a restore
  if new.kyc_status is not distinct from old.kyc_status then
    new.kyc_verified_by := old.kyc_verified_by;
    new.kyc_verified_at := old.kyc_verified_at;
  end if;
  return new;
end $$;
revoke execute on function public.parties_kyc_stamp_kept() from public, anon, authenticated;
drop trigger if exists parties_kyc_stamp_kept on public.parties;
create trigger parties_kyc_stamp_kept
  before update on public.parties
  for each row execute function public.parties_kyc_stamp_kept();

-- ---- D-138: a product line named by indoor jobs -------------------------------
-- How many indoor jobs would lose their match if no line carried this name any
-- more. 0 when another line (other than p_except_code) still has the name.
create or replace function public.product_line_name_uses(p_name text, p_except_code text default null)
returns bigint language plpgsql stable security definer set search_path = public as $$
declare n bigint := 0;
begin
  if btrim(coalesce(p_name, '')) = '' then return 0; end if;
  if exists (select 1 from public.product_master m
              where lower(btrim(m.product_name)) = lower(btrim(p_name))
                and (p_except_code is null or m.product_code is distinct from p_except_code)) then
    return 0;
  end if;
  if to_regclass('public.indoor_jobs') is not null then
    execute 'select count(*) from public.indoor_jobs where lower(btrim(product_name)) = lower(btrim($1))'
      into n using p_name;
  end if;
  return n;
end $$;
revoke execute on function public.product_line_name_uses(text, text) from public, anon;
grant execute on function public.product_line_name_uses(text, text) to authenticated;

create or replace function public.product_line_delete_by_name_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare n bigint;
begin
  n := public.product_line_name_uses(old.product_name, old.product_code);
  if n > 0 then
    raise exception 'This product line is still named on % record(s) — % indoor jobs (by product name). It cannot be deleted while they name it.',
      n, n using errcode = '23503';
  end if;
  return old;
end $$;
revoke execute on function public.product_line_delete_by_name_guard() from public, anon, authenticated;
drop trigger if exists product_line_delete_by_name_guard on public.product_master;
create trigger product_line_delete_by_name_guard
  before delete on public.product_master
  for each row execute function public.product_line_delete_by_name_guard();
