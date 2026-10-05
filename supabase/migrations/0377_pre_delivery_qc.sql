-- ===========================================================================
-- 0377  PRE-DELIVERY QUALITY CHECK -- a register of its own (2026-10-05).
--
-- The user: "Pre-Delivery Quality Check [Under Indoor] 1. Imported Machines
-- are received in Godown. 2. It is done before Billing 3. It is done as per
-- the Record. 4. There are certain Checks. 5. Use the Image for Fields, Ensure
-- all the Fields are Mandatory". Their answers: its OWN register (no Indoor
-- job behind it), ANY product, RECORD ONLY (billing is not blocked), and the
-- SAME checks and tables as R/SER/QC/007 -- so the columns are indoor_pdt's
-- (0320), word for word, with the product and serial on the row itself.
--
-- EVERY FIELD IS MANDATORY, and the database says so: NOT NULL and non-blank
-- on every column of the form, so a half-filled check cannot be saved by any
-- path. A record is therefore written whole, in one save.
--
-- INSPECTED BY is the SESSION'S, stamped by the trigger with the name and the
-- designation held then -- whoever saves the record is the person vouching
-- for it, so an edit re-signs it as the editor. A value the browser sends is
-- discarded.
--
-- A QUALITY RECORD: no DELETE policy and no DELETE grant (0049's rule).
--
-- KEYS: mod:/indoor/pdqc opens the page (admin + technical_support only, the
-- 0241 pattern); pdqc.record writes, granted to NO role -- an administrator
-- passes has_perm() anyway; every other grant is made on Roles & Permissions.
-- ===========================================================================

create table if not exists public.pdqc_records (
  id        bigint generated always as identity primary key,

  product_name text not null check (btrim(product_name) <> ''),
  serial       text not null check (btrim(serial) <> ''),
  test_date    date not null,
  measuring_equipment_id text not null check (btrim(measuring_equipment_id) <> ''),
  software_version       text not null check (btrim(software_version) <> ''),
  hv                     text not null check (btrim(hv) <> ''),
  ht                     text not null check (btrim(ht) <> ''),

  check1 text not null check (check1 in ('OK', 'NOT OK')),
  check2 text not null check (check2 in ('OK', 'NOT OK')),
  check3 text not null check (check3 in ('OK', 'NOT OK')),
  check4 text not null check (check4 in ('OK', 'NOT OK')),
  check5 text not null check (check5 in ('OK', 'NOT OK')),

  -- 7. Mode CMV/ACMV -- Volume (Vte), Peep, O2% at FiO2 21 / 60 / 100 %
  cmv_vte_21  numeric not null, cmv_vte_60  numeric not null, cmv_vte_100  numeric not null,
  cmv_peep_21 numeric not null, cmv_peep_60 numeric not null, cmv_peep_100 numeric not null,
  cmv_o2_21   numeric not null, cmv_o2_60   numeric not null, cmv_o2_100   numeric not null,
  -- 8. Mode PCMV -- PIP, Peep, O2% at FiO2 21 / 60 / 100 %
  pcmv_pip_21  numeric not null, pcmv_pip_60  numeric not null, pcmv_pip_100  numeric not null,
  pcmv_peep_21 numeric not null, pcmv_peep_60 numeric not null, pcmv_peep_100 numeric not null,
  pcmv_o2_21   numeric not null, pcmv_o2_60   numeric not null, pcmv_o2_100   numeric not null,

  inspected_by          uuid,
  inspector_name        text not null default '',
  inspector_designation text not null default '',
  inspected_at          timestamptz,

  created_by uuid,
  created_at timestamptz not null default now(),
  updated_by uuid,
  updated_at timestamptz not null default now()
);

comment on table public.pdqc_records is
  'Pre-Delivery Quality Check (R/SER/QC/007) of an imported machine in the godown before billing, one row per check (0377). Every field is mandatory; Inspected by is stamped from the session at every save. Record only: nothing else reads it. A quality record: never deleted.';

create index if not exists pdqc_records_serial on public.pdqc_records (serial);
create index if not exists pdqc_records_test_date on public.pdqc_records (test_date desc, id desc);

create or replace function public.pdqc_stamp()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.product_name := btrim(new.product_name);
  new.serial       := btrim(new.serial);
  new.updated_at   := now();
  new.updated_by   := auth.uid();
  if tg_op = 'INSERT' then
    new.created_at := now();
    new.created_by := auth.uid();
  else
    new.created_at := old.created_at;
    new.created_by := old.created_by;
  end if;
  -- WHOEVER SAVES IS THE INSPECTOR -- never what the browser sent.
  new.inspected_by := auth.uid();
  new.inspected_at := case when auth.uid() is null then null else now() end;
  new.inspector_name := ''; new.inspector_designation := '';
  select coalesce(nullif(btrim(p.full_name), ''), p.email, ''), coalesce(btrim(p.designation), '')
    into new.inspector_name, new.inspector_designation
    from public.profiles p where p.id = auth.uid();
  new.inspector_name        := coalesce(new.inspector_name, '');
  new.inspector_designation := coalesce(new.inspector_designation, '');
  return new;
end $$;
revoke execute on function public.pdqc_stamp() from public, anon, authenticated;

drop trigger if exists zz_pdqc_stamp on public.pdqc_records;
create trigger zz_pdqc_stamp before insert or update on public.pdqc_records
  for each row execute function public.pdqc_stamp();

alter table public.pdqc_records enable row level security;
drop policy if exists pdqc_read on public.pdqc_records;
create policy pdqc_read on public.pdqc_records for select
  using ((select public.has_perm('mod:/indoor/pdqc')) or (select public.has_perm('pdqc.record')));
drop policy if exists pdqc_insert on public.pdqc_records;
create policy pdqc_insert on public.pdqc_records for insert
  with check ((select public.has_perm('pdqc.record')));
drop policy if exists pdqc_update on public.pdqc_records;
create policy pdqc_update on public.pdqc_records for update
  using ((select public.has_perm('pdqc.record')))
  with check ((select public.has_perm('pdqc.record')));
revoke all on public.pdqc_records from anon;
revoke delete, truncate on public.pdqc_records from authenticated;
grant select, insert, update on public.pdqc_records to authenticated;

do $$
begin
  if to_regprocedure('public.sys_columns_attach(regclass)') is not null then
    perform public.sys_columns_attach('public.pdqc_records'::regclass);
  end if;
end $$;

-- THE SCREEN'S KEY, IN THE ADMIN AND TECHNICAL SUPPORT ROLES ONLY (0241, 0355).
do $$
declare n integer;
begin
  if to_regclass('public.app_roles') is null then return; end if;
  update public.app_roles ar
     set permissions = (
           select coalesce(jsonb_agg(distinct v), '[]'::jsonb)
             from (select jsonb_array_elements_text(ar.permissions) as v
                   union select unnest(array['mod:/indoor/pdqc']) as v) u),
         updated_at = now()
   where jsonb_array_length(ar.permissions) > 0
     and ar.role in ('admin', 'technical_support')
     and not (ar.permissions ? 'mod:/indoor/pdqc');
  get diagnostics n = row_count;
  raise notice '0377: Pre-Delivery Quality Check screen key given to admin + technical_support (% of 2 rows) -- grant the rest on Roles & Permissions', n;
end $$;
