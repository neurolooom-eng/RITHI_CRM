-- ===========================================================================
-- MAIN PRODUCT -> ITS ACCESSORIES AND ALLIED PRODUCTS.
--
--   The user, 2026-09-30: "Phase 2 - List Accessories + Main Product for the
--   Spare Request. So should also be able to map the Main Product and
--   Accessories / Allied products that might have been sold together -- so
--   ensure we have a place holder for that also in the table." Asked where it
--   should live: ON THE PRODUCT LINE -- one list per product, the same for
--   every machine of that product.
--
-- ONE ROW PER MAIN PRODUCT, keyed on its Product Database name (ORION-G,
-- VEGA...) -- the names a machine, a call and a spare request carry, and the
-- names the Part Master and the Standard Complaints are mapped to -- so Phase 2
-- can go from a call's product to its accessories and on to the parts of both
-- with no translation between vocabularies.
--
-- A PLACEHOLDER TODAY: nothing reads it yet. Phase 2 (the spare request
-- offering the parts of the main product AND its accessories) is the reader.
--
-- Readable by anyone signed in (a list of product names discloses nothing the
-- product list does not); written by whoever may edit masters -- the permission
-- asked ONCE per query (0250's lesson: a bare has_perm in a FOR ALL policy is
-- paid per row, on every read).
-- ===========================================================================

create table if not exists public.product_accessories (
  id           bigint generated always as identity primary key,
  main_product text not null,
  accessories  text[] not null default '{}',
  note         text not null default '',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ONE LIST PER MAIN PRODUCT, however it was typed -- a plain unique index on a
-- stored key, so a re-save updates rather than adds a second list.
alter table public.product_accessories
  add column if not exists main_product_key text generated always as (lower(btrim(main_product))) stored;
create unique index if not exists product_accessories_main_key on public.product_accessories (main_product_key);

create or replace function public.product_accessories_touch()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  if tg_op = 'UPDATE' then new.created_at := old.created_at; end if;
  return new;
end $$;
drop trigger if exists product_accessories_touch on public.product_accessories;
create trigger product_accessories_touch before insert or update on public.product_accessories
  for each row execute function public.product_accessories_touch();

alter table public.product_accessories enable row level security;

drop policy if exists pa_read on public.product_accessories;
create policy pa_read on public.product_accessories for select to authenticated using (true);

drop policy if exists pa_insert on public.product_accessories;
create policy pa_insert on public.product_accessories for insert to authenticated
  with check ((select public.has_perm('masters.edit')));
drop policy if exists pa_update on public.product_accessories;
create policy pa_update on public.product_accessories for update to authenticated
  using ((select public.has_perm('masters.edit'))) with check ((select public.has_perm('masters.edit')));
drop policy if exists pa_delete on public.product_accessories;
create policy pa_delete on public.product_accessories for delete to authenticated
  using ((select public.has_perm('masters.edit')));

grant select, insert, update, delete on public.product_accessories to authenticated;
revoke all on public.product_accessories from anon;

-- The five system columns (0244), which a table created after 0244 does not
-- get from it -- guarded, since on a fresh apply sys_columns runs later.
do $$
begin
  if to_regprocedure('public.sys_columns_attach(regclass)') is not null then
    perform public.sys_columns_attach('public.product_accessories'::regclass);
  end if;
end $$;
