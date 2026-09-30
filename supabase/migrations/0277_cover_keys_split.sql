-- ===========================================================================
-- 0277 — WARRANTY AND CONTRACT HAVE KEYS OF THEIR OWN; DELETING AN ENTRY IS SEPARATE
--
-- Findings 57-67 (docs/PERMISSIONS_REVIEW.md), the user's decisions of
-- 2026-09-30: "63, 64: It should show the Individual View's Control Action and
-- its Check Box" -- each screen gets keys of its own, today's grants copied
-- across (0284) so nobody gains or loses anything on the day it ships -- and
-- "67: Break it down", with the old key kept as the PARENT of the new ones, so
-- a role holding it keeps everything until an administrator unticks it.
-- The parent rule itself is in has_perm() (0272, public.perm_parents).
--
-- This file: the sale and contract write rules, split into add/edit and
-- delete, the additional-entries rule, and the three maintenance functions
-- that asked cover.edit.
-- ===========================================================================

-- Adding and editing an entry, and removing a machine from one, is
-- "entries"; deleting a whole entry -- its machines go with it, by the
-- foreign key's cascade -- is "delete". The Warranty Register keeps cover.edit
-- as the parent; the Contract Register has contract.edit of its own.
do $$
declare t text; k text; r text;
begin
  foreach t in array array['sale_entries', 'sale_items', 'contract_entries', 'contract_items'] loop
    if to_regclass('public.' || t) is null then continue; end if;
    k := case when t like 'contract%' then 'contract.edit' else 'cover.edit' end;
    execute format('drop policy if exists %1$s_write on public.%1$s', t);
    execute format('drop policy if exists %1$s_insert on public.%1$s', t);
    execute format('drop policy if exists %1$s_update on public.%1$s', t);
    execute format('drop policy if exists %1$s_delete on public.%1$s', t);
    execute format('drop policy if exists %1$s_read on public.%1$s', t);
    execute format('create policy %1$s_insert on public.%1$s for insert with check ((select public.has_perm(''%2$s.entries'')))', t, k);
    execute format('create policy %1$s_update on public.%1$s for update using ((select public.has_perm(''%2$s.entries''))) with check ((select public.has_perm(''%2$s.entries'')))', t, k);
    execute format('create policy %1$s_delete on public.%1$s for delete using ((select public.has_perm(''%2$s.%3$s'')))',
                   t, k, case when t like '%entries' then 'delete' else 'entries' end);
    execute format('create policy %1$s_read on public.%1$s for select using ((select public.has_perm(''masters.view'')) or (select public.has_perm(''%2$s.entries'')) or (select public.is_admin()))', t, k);
  end loop;
end $$;

-- Additional entries recorded against a machine (Ownership Transfer -> Add
-- entry details, 0073) are warranty-side entries: cover.edit.entries.
drop policy if exists pae_write on public.product_additional_entries;
create policy pae_write on public.product_additional_entries for all
  using (public.has_perm('cover.edit.entries')) with check (public.has_perm('cover.edit.entries'));

CREATE OR REPLACE FUNCTION public.refresh_product_cover()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET statement_timeout TO '180s'
AS $function$
declare n integer;
begin
  -- 0247: THE COVER ADMIN ACTION IS FOR WHOEVER MAY EDIT COVER. This runs with
  -- the owner's rights over every sale, contract and machine, so it checks the
  -- caller itself. A call with nobody signed in (the SQL editor, a scheduled
  -- job) passes;
  -- the not-signed-in role cannot call it at all (0248 withdraws it).
  if auth.uid() is not null and not (public.is_admin() or public.has_perm('cover.edit.entries') or public.has_perm('contract.edit.entries')) then
    raise exception 'Only someone who may edit cover (cover.edit) can re-fold cover after an import.';
  end if;
  update public.products p set
    warranty_number = coalesce(m.sa_number, p.warranty_number),
    warranty_start  = coalesce(m.warranty_start, p.warranty_start),
    warranty_end    = coalesce(m.warranty_end,   p.warranty_end),
    contract_number = coalesce(m.mc_number, p.contract_number),
    contract_start  = coalesce(m.contract_start, p.contract_start),
    contract_end    = coalesce(m.contract_end,   p.contract_end),
    contract_type   = coalesce(nullif(m.contract_type, ''), p.contract_type),
    item_status     = m.item_status
  from public.machine_cover m
  where m.serial_key = lower(trim(p.serial_number));
  get diagnostics n = row_count;
  return n;
end $function$;

CREATE OR REPLACE FUNCTION public.cover_unpin_inherited()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET statement_timeout TO '180s'
AS $function$
declare n integer := 0; m integer;
begin
  -- 0247: THE COVER ADMIN ACTION IS FOR WHOEVER MAY EDIT COVER. This runs with
  -- the owner's rights over every sale, contract and machine, so it checks the
  -- caller itself. A call with nobody signed in (the SQL editor, a scheduled
  -- job) passes;
  -- the not-signed-in role cannot call it at all (0248 withdraws it).
  if auth.uid() is not null and not (public.is_admin() or public.has_perm('cover.edit.entries') or public.has_perm('contract.edit.entries')) then
    raise exception 'Only someone who may edit cover (cover.edit) can re-fold cover after an import.';
  end if;
  update public.sale_items i set
    invoice_no      = case when i.invoice_no      is not distinct from h.invoice_no      then null else i.invoice_no end,
    invoice_date    = case when i.invoice_date    is not distinct from h.invoice_date    then null else i.invoice_date end,
    sold_through    = case when i.sold_through    is not distinct from h.sold_through    then null else i.sold_through end,
    warranty_start  = case when i.warranty_start  is not distinct from h.warranty_start  then null else i.warranty_start end,
    warranty_end    = case when i.warranty_end    is not distinct from h.warranty_end    then null else i.warranty_end end,
    warranty_years  = case when i.warranty_years  is not distinct from h.warranty_years  then null else i.warranty_years end,
    warranty_months = case when i.warranty_months is not distinct from h.warranty_months then null else i.warranty_months end,
    pm_visits       = case when i.pm_visits       is not distinct from h.pm_visits       then null else i.pm_visits end,
    warranty_status = case when i.warranty_status is not distinct from h.warranty_status then null else i.warranty_status end,
    other_details   = case when i.other_details   is not distinct from h.other_details   then null else i.other_details end,
    state           = case when i.state           is not distinct from h.state           then null else i.state end,
    city            = case when i.city            is not distinct from h.city            then null else i.city end,
    engineer        = case when i.engineer        is not distinct from h.engineer        then null else i.engineer end
  from public.sale_entries h where h.sa_number = i.sa_number;
  get diagnostics m = row_count; n := n + m;

  update public.contract_items i set
    entry_at         = case when i.entry_at         is not distinct from h.entry_at         then null else i.entry_at end,
    party_name       = case when i.party_name       is not distinct from h.party_name       then null else i.party_name end,
    payment_schedule = case when i.payment_schedule is not distinct from h.payment_schedule then null else i.payment_schedule end,
    bill_generate_at = case when i.bill_generate_at is not distinct from h.bill_generate_at then null else i.bill_generate_at end,
    contract_type    = case when i.contract_type    is not distinct from h.contract_type    then null else i.contract_type end,
    contract_start   = case when i.contract_start   is not distinct from h.contract_start   then null else i.contract_start end,
    contract_end     = case when i.contract_end     is not distinct from h.contract_end     then null else i.contract_end end,
    contract_years   = case when i.contract_years   is not distinct from h.contract_years   then null else i.contract_years end,
    contract_months  = case when i.contract_months  is not distinct from h.contract_months  then null else i.contract_months end,
    pm_visits_total  = case when i.pm_visits_total  is not distinct from h.pm_visits_total  then null else i.pm_visits_total end,
    status           = case when i.status           is not distinct from h.status           then null else i.status end
  from public.contract_entries h where h.mc_number = i.mc_number;
  get diagnostics m = row_count; n := n + m;
  return n;
end $function$;

CREATE OR REPLACE FUNCTION public.link_install_call(p_item_id bigint, p_ucn text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  it  public.sale_items%rowtype;
  v_ucn text := btrim(coalesce(p_ucn, ''));
begin
  if not (public.is_admin() or public.has_perm('cover.edit.entries') or public.has_perm('install.create')) then
    raise exception 'RBAC: mapping an installation call needs install.create or cover.edit.entries';
  end if;

  select * into it from public.sale_items where id = p_item_id for update;
  if not found then
    raise exception 'Machine line % is not on the warranty register', p_item_id;
  end if;

  if btrim(coalesce(it.inst_call, '')) = v_ucn then
    return;
  end if;
  if public.is_call_number(it.inst_call) then
    raise exception '% · % already has installation call %, which is not replaced here',
      it.product_name, it.serial_number, btrim(it.inst_call);
  end if;

  if not exists (
    select 1 from public.installation_calls c
     where c.ucn = v_ucn
       and lower(btrim(coalesce(c.serial, '')))       = lower(btrim(coalesce(it.serial_number, '')))
       and lower(btrim(coalesce(c.product_name, ''))) = lower(btrim(coalesce(it.product_name, '')))
  ) then
    raise exception 'Call % is not an installation call for % · %', v_ucn, it.product_name, it.serial_number;
  end if;

  update public.sale_items set inst_call = v_ucn where id = p_item_id;
end $function$;
