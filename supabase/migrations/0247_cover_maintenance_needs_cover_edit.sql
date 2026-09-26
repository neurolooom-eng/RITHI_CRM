-- ===========================================================================
-- THE TWO COVER ADMIN FUNCTIONS CHECK WHO IS CALLING (finding 51).
--
--   The user, 2026-09-26: "Fix all low hanging fruits", after the table
--   review found that cover_unpin_inherited() and refresh_product_cover() run
--   for ANY caller. Both run with the owner's rights and rewrite a whole
--   register: every sale and contract line, and every machine's stored cover.
--   Measured: an engineer holding neither cover.edit nor admin ran both
--   without refusal, and the not-signed-in role ran refresh_product_cover().
--
-- THE APP CALLS BOTH, from Data Import's "finish the cover import" step
-- (finishCoverImport() in src/lib/cover.ts), so they cannot simply be
-- withdrawn. They now ask for the permission that import already needs:
-- admin, or cover.edit. That is the recommendation the user accepted with
-- "low hanging fruits"; a different permission is a one-word change here.
--
-- TAKEN FROM THE DATABASE, NOT FROM 0036/0037: each body below is
-- pg_get_functiondef() of the current definition, with ONE statement added
-- first after BEGIN. Nothing else moves -- the 0210/0211 lesson about
-- rewriting a function from an old revision.
--
-- WHO STILL PASSES: nobody signed in (auth.uid() null) -- the SQL editor, a
-- scheduled job -- so a hand-run repair keeps working. The not-signed-in API
-- role would also pass this test, which is why 0248 withdraws execute from it:
-- the two together close the path.
-- ===========================================================================

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
  if auth.uid() is not null and not (public.is_admin() or public.has_perm('cover.edit')) then
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
  if auth.uid() is not null and not (public.is_admin() or public.has_perm('cover.edit')) then
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
