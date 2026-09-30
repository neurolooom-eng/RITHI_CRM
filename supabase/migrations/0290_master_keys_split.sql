-- ===========================================================================
-- 0290 — EDITING MASTERS, VERIFYING KYC AND THE SERVICEMAN SWAP ARE SEPARATE
--
-- Findings 57-67 (docs/PERMISSIONS_REVIEW.md), the user's decisions of
-- 2026-09-30: "63, 64: It should show the Individual View's Control Action and
-- its Check Box" -- each screen gets keys of its own, today's grants copied
-- across (0298) so nobody gains or loses anything on the day it ships -- and
-- "67: Break it down", with the old key kept as the PARENT of the new ones, so
-- a role holding it keeps everything until an administrator unticks it.
-- The parent rule itself is in has_perm() (0286, public.perm_parents).
--
-- This file: every master write rule the masters module owns asks
-- masters.edit.records; a KYC status change asks masters.edit.kyc; the bulk
-- Serviceman swap becomes swap_service_engineer() with masters.edit.swap_serviceman.
-- ===========================================================================

drop policy if exists pm_write on public.product_master;
create policy pm_write on public.product_master for all
  using ((select public.has_perm('masters.edit.records'))) with check ((select public.has_perm('masters.edit.records')));

drop policy if exists master_lists_write on public.master_lists;
create policy master_lists_write on public.master_lists for all
  using ((select public.has_perm('masters.edit.records'))) with check ((select public.has_perm('masters.edit.records')));

do $$
begin
  if to_regclass('public.product_accessories') is null then return; end if;
  drop policy if exists pa_insert on public.product_accessories;
  drop policy if exists pa_update on public.product_accessories;
  drop policy if exists pa_delete on public.product_accessories;
  create policy pa_insert on public.product_accessories for insert
    with check ((select public.has_perm('masters.edit.records')));
  create policy pa_update on public.product_accessories for update
    using ((select public.has_perm('masters.edit.records'))) with check ((select public.has_perm('masters.edit.records')));
  create policy pa_delete on public.product_accessories for delete
    using ((select public.has_perm('masters.edit.records')));
end $$;

drop policy if exists masters_insert on public.masters;
drop policy if exists masters_update on public.masters;
drop policy if exists masters_delete on public.masters;
create policy masters_insert on public.masters for insert
    with check (public.has_perm('masters.edit.records')
             or public.has_perm('master.' || coalesce(name, '') || '.edit'));

  create policy masters_update on public.masters for update
    using      (public.has_perm('masters.edit.records')
             or public.has_perm('master.' || coalesce(name, '') || '.edit'))
    with check (public.has_perm('masters.edit.records')
             or public.has_perm('master.' || coalesce(name, '') || '.edit'));

  create policy masters_delete on public.masters for delete
    using      (public.has_perm('masters.edit.records')
             or public.has_perm('master.' || coalesce(name, '') || '.delete'));

-- ---- the Serviceman swap, as one statement with its own key ---------------
-- It was a bulk UPDATE from the browser under masters.edit. Exact match on
-- the stored string, as the screen always did, so it renames nobody by
-- accident.
create or replace function public.swap_service_engineer(p_from text, p_to text)
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  if not coalesce(public.has_perm('masters.edit.swap_serviceman'), false) then
    raise exception 'RBAC: changing the Serviceman on every party needs "Swap the Serviceman in bulk"';
  end if;
  if coalesce(p_from, '') = '' then raise exception 'Pick the name to change'; end if;
  if p_from = coalesce(p_to, '') then raise exception 'That is the same name'; end if;
  update public.parties set service_engineer = coalesce(p_to, '') where service_engineer = p_from;
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.swap_service_engineer(text, text) from public, anon;
grant  execute on function public.swap_service_engineer(text, text) to authenticated;

CREATE OR REPLACE FUNCTION public.parties_kyc_stamp()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if tg_op = 'INSERT' then
    if coalesce(btrim(new.kyc_status), '') = '' then new.kyc_status := 'Pending'; end if;
  end if;

  -- A LONE `Pincode` BESIDE AN `Inst. Pincode` IS THE BILLING ONE. The export
  -- names the installation pincode and leaves the billing one bare, so the
  -- importer cannot alias it without racing the installation column for the
  -- same heading. The pair is only ambiguous in isolation: where BOTH headings
  -- are on the row, which is which is not in doubt.
  if coalesce(btrim(new.billing_pincode), '') = ''
     and new.extra ? 'Inst. Pincode' and coalesce(btrim(new.extra ->> 'Pincode'), '') <> '' then
    new.billing_pincode := btrim(new.extra ->> 'Pincode');
  end if;

  -- THE NUMBERS ARE DERIVED HERE TOO, not only in the backfill below. An upload
  -- puts the Tax columns in `extra` and nothing else would ever read them, so a
  -- file loaded next year would land exactly as the file loaded today did
  -- BEFORE this migration — with its GSTIN sitting in a blob. Only ever fills a
  -- BLANK: a number typed on the screen is never overwritten by a spreadsheet.
  if coalesce(btrim(new.gstin), '') = '' then
    new.gstin := coalesce(public.kyc_gstin(concat_ws(' ',
      new.extra ->> 'Tax 1', new.extra ->> 'Tax 2', new.extra ->> 'Tax 3',
      new.extra ->> 'GSTIN', new.extra ->> 'GST No')), '');
  end if;
  -- AFTER the GSTIN, and reading it: a GSTIN contains a PAN at characters 3-12,
  -- so a customer who gave only a GSTIN is not asked for a PAN as well.
  if coalesce(btrim(new.pan), '') = '' then
    new.pan := coalesce(public.kyc_pan(concat_ws(' ', new.gstin,
      new.extra ->> 'Tax 1', new.extra ->> 'Tax 2', new.extra ->> 'Tax 3',
      new.extra ->> 'PAN', new.extra ->> 'PAN No')), '');
  end if;
  if new.kyc_status is distinct from (case when tg_op = 'UPDATE' then old.kyc_status else null end) then
    -- VERIFYING KYC IS ITS OWN KEY (0290). A new party starting at Pending is
    -- not a verification; the SQL editor or an import is not a caller through
    -- the API (the `role` setting survives SECURITY DEFINER).
    if tg_op = 'UPDATE' and coalesce(current_setting('role', true), 'none') in ('authenticated', 'anon') and not public.is_admin()
       and not coalesce(public.has_perm('masters.edit.kyc'), false) then
      raise exception 'RBAC: changing a party''s KYC status needs "Verify KYC"';
    end if;
    if new.kyc_status = 'Verified' then
      new.kyc_verified_by := auth.uid();
      new.kyc_verified_at := now();
    else
      -- Moving OFF Verified clears the stamp: a party sent back to Pending has
      -- not been verified by anybody, and leaving the old name on it would say
      -- it had.
      new.kyc_verified_by := null;
      new.kyc_verified_at := null;
    end if;
  end if;
  return new;
end $function$;
