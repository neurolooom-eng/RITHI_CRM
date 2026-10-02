-- ===========================================================================
-- 0318 — ONE TIME: every Warranty Sale Entry re-read from the Party Master, and
-- every machine on it put back on its entry.
--
-- The user, 2026-10-02: "As a 1 time activity - Update all Records in Warranty
-- Sale Entry with '↺ Update from Party Master' in one go. Include 'Force Update
-- Child Records' in Warranty Register as well. Enforce Update as a 1 time
-- activity." And, asked how: blanks are copied exactly as the button copies
-- them, and the machines of EVERY sale go back to following their sale.
--
-- STEP 1 IS THE BUTTON, FOR EVERY SALE AT ONCE. ↺ Update from Party Master
-- (partyFillForSale + partyInfoFrom in the client) sets ELEVEN fields from the
-- Party Master entry whose name matches the sale's Party Name -- the same
-- trimmed, case-insensitive match (`parties.name_key`) -- BLANKS INCLUDED:
--   state, city, address (falling back to extra->>'Address' only where the
--   column is NULL), pincode, tel1 <- phone, tel2 <- phone_2, pan, gst <- gstin,
--   party_type (CUSTOMER / DEALER, anything else blank), profile (PRIVATE /
--   GOVERNMENT / DEALER / GENERAL, anything else blank), engineer <-
--   service_engineer.
-- A sale whose party the master does not hold is left exactly as it is, as the
-- button leaves it ("nothing to update from"). Only a sale where at least one
-- of the eleven actually changes is written.
--
-- STEP 2 IS ↺ FORCE UPDATE CHILD RECORDS, FOR EVERY SALE. The thirteen columns
-- a sale line inherits (inheritAllPatch over SALE.itemFields) are set to NULL,
-- so each machine follows its entry -- including the values step 1 just
-- refreshed. Only a line holding at least one pinned value is written.
--
-- EVERY VALUE IT CHANGES IS KEPT. Before and after, per row, in two backup
-- tables nobody signed in can read or write -- so "what did this machine say
-- before 2 October?" has an answer, and a value somebody needs back can be
-- restored from it by hand.
--
-- ONCE, AND ENFORCED. The migration ledger runs this file once on the live
-- project; but a bundle is also REPLAYED to rebuild or repair a project, and a
-- second run would overwrite whatever has been typed since. So the work is
-- guarded by a row in `one_time_fixes_done`: present, and nothing is touched.
-- ===========================================================================

create table if not exists public.one_time_fixes_done (
  name       text primary key,
  applied_at timestamptz not null default now(),
  detail     text
);
alter table public.one_time_fixes_done enable row level security;
revoke all on public.one_time_fixes_done from anon, authenticated;

create table if not exists public.sale_party_refresh_backup (
  id         bigserial primary key,
  sa_number  text not null,
  party_name text,
  before     jsonb not null,
  after      jsonb not null,
  saved_at   timestamptz not null default now()
);
alter table public.sale_party_refresh_backup enable row level security;
revoke all on public.sale_party_refresh_backup from anon, authenticated;

create table if not exists public.sale_items_inherit_backup (
  id            bigserial primary key,
  item_id       bigint not null,
  sa_number     text,
  serial_number text,
  before        jsonb not null,
  saved_at      timestamptz not null default now()
);
alter table public.sale_items_inherit_backup enable row level security;
revoke all on public.sale_items_inherit_backup from anon, authenticated;

do $$
begin
  if to_regprocedure('public.sys_columns_attach(regclass)') is not null then
    perform public.sys_columns_attach('public.one_time_fixes_done'::regclass);
    perform public.sys_columns_attach('public.sale_party_refresh_backup'::regclass);
    perform public.sys_columns_attach('public.sale_items_inherit_backup'::regclass);
  end if;
end $$;

do $$
declare
  n_sales int := 0;
  n_items int := 0;
begin
  if exists (select 1 from public.one_time_fixes_done where name = '0318_warranty_party_refresh') then
    raise notice '0318: done before -- the warranty sales were not touched again';
    return;
  end if;
  if to_regclass('public.sale_entries') is null or to_regclass('public.sale_items') is null
     or to_regclass('public.parties') is null then
    raise notice '0318: sale_entries, sale_items or parties missing -- nothing to do (and not marked done)';
    return;
  end if;
  -- THE PARTY COLUMNS THE BUTTON READS come from the `masters` bundle (0200,
  -- 0201). This bundle can be replayed on its own, so they are asked for
  -- rather than assumed; missing, nothing is done and nothing is marked.
  if (select count(*) from information_schema.columns
       where table_schema = 'public' and table_name = 'parties'
         and column_name in ('state', 'city', 'address', 'extra', 'pincode', 'phone', 'phone_2',
                             'pan', 'gstin', 'party_type', 'profile', 'service_engineer', 'name_key')) < 13 then
    raise notice '0318: the Party Master lacks columns the update reads -- run masters.sql first (not marked done)';
    return;
  end if;

  -- ---- step 1: the Party Master onto every sale ----------------------------
  create temporary table _fill on commit drop as
  select s.id, s.sa_number, s.party_name,
         jsonb_build_object('state', s.state, 'city', s.city, 'address', s.address, 'pincode', s.pincode,
                            'tel1', s.tel1, 'tel2', s.tel2, 'pan', s.pan, 'gst', s.gst,
                            'party_type', s.party_type, 'profile', s.profile, 'engineer', s.engineer) as before,
         btrim(coalesce(p.state, ''))                                as state,
         btrim(coalesce(p.city, ''))                                 as city,
         btrim(coalesce(p.address, p.extra->>'Address', ''))         as address,
         btrim(coalesce(p.pincode, ''))                              as pincode,
         btrim(coalesce(p.phone, ''))                                as tel1,
         btrim(coalesce(p.phone_2, ''))                              as tel2,
         btrim(coalesce(p.pan, ''))                                  as pan,
         btrim(coalesce(p.gstin, ''))                                as gst,
         case when upper(btrim(coalesce(p.party_type, ''))) in ('CUSTOMER', 'DEALER')
              then upper(btrim(p.party_type)) else '' end            as party_type,
         case when upper(btrim(coalesce(p.profile, ''))) in ('PRIVATE', 'GOVERNMENT', 'DEALER', 'GENERAL')
              then upper(btrim(p.profile)) else '' end               as profile,
         btrim(coalesce(p.service_engineer, ''))                     as engineer
    from public.sale_entries s
    join public.parties p on p.name_key = lower(btrim(s.party_name))
   where btrim(coalesce(s.party_name, '')) <> '';

  delete from _fill f
   where (f.state, f.city, f.address, f.pincode, f.tel1, f.tel2, f.pan, f.gst, f.party_type, f.profile, f.engineer)
         is not distinct from
         (f.before->>'state', f.before->>'city', f.before->>'address', f.before->>'pincode',
          f.before->>'tel1', f.before->>'tel2', f.before->>'pan', f.before->>'gst',
          f.before->>'party_type', f.before->>'profile', f.before->>'engineer');

  insert into public.sale_party_refresh_backup (sa_number, party_name, before, after)
  select f.sa_number, f.party_name, f.before,
         jsonb_build_object('state', f.state, 'city', f.city, 'address', f.address, 'pincode', f.pincode,
                            'tel1', f.tel1, 'tel2', f.tel2, 'pan', f.pan, 'gst', f.gst,
                            'party_type', f.party_type, 'profile', f.profile, 'engineer', f.engineer)
    from _fill f;

  update public.sale_entries s
     set state = f.state, city = f.city, address = f.address, pincode = f.pincode,
         tel1 = f.tel1, tel2 = f.tel2, pan = f.pan, gst = f.gst,
         party_type = f.party_type, profile = f.profile, engineer = f.engineer
    from _fill f
   where s.id = f.id;
  get diagnostics n_sales = row_count;

  -- ---- step 2: every machine back on its sale ------------------------------
  insert into public.sale_items_inherit_backup (item_id, sa_number, serial_number, before)
  select i.id, i.sa_number, i.serial_number,
         jsonb_strip_nulls(jsonb_build_object(
           'warranty_start', i.warranty_start, 'warranty_end', i.warranty_end,
           'warranty_years', i.warranty_years, 'warranty_months', i.warranty_months,
           'pm_visits', i.pm_visits, 'warranty_status', i.warranty_status,
           'invoice_no', i.invoice_no, 'invoice_date', i.invoice_date,
           'sold_through', i.sold_through, 'other_details', i.other_details,
           'state', i.state, 'city', i.city, 'engineer', i.engineer))
    from public.sale_items i
   where coalesce(i.warranty_start::text, i.warranty_end::text, i.warranty_years::text, i.warranty_months::text,
                  i.pm_visits::text, i.warranty_status, i.invoice_no, i.invoice_date::text, i.sold_through,
                  i.other_details, i.state, i.city, i.engineer) is not null;

  update public.sale_items i
     set warranty_start = null, warranty_end = null, warranty_years = null, warranty_months = null,
         pm_visits = null, warranty_status = null, invoice_no = null, invoice_date = null,
         sold_through = null, other_details = null, state = null, city = null, engineer = null
   where coalesce(i.warranty_start::text, i.warranty_end::text, i.warranty_years::text, i.warranty_months::text,
                  i.pm_visits::text, i.warranty_status, i.invoice_no, i.invoice_date::text, i.sold_through,
                  i.other_details, i.state, i.city, i.engineer) is not null;
  get diagnostics n_items = row_count;

  insert into public.one_time_fixes_done (name, detail)
  values ('0318_warranty_party_refresh',
          format('%s sale(s) updated from the Party Master; %s machine line(s) put back on their sale', n_sales, n_items));
  raise notice '0318: % sale(s) updated from the Party Master; % machine line(s) put back on their sale', n_sales, n_items;
end $$;
