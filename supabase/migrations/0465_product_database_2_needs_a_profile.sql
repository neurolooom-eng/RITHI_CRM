-- ===========================================================================
-- 0465 — PRODUCT DATABASE 2.0'S STORED COPY IS READ ONLY BY SOMEBODY ON THE
--        USER MASTER (security re-scan, 2026-11-07, F-10)
--
-- A MATERIALISED VIEW HAS NO ROW-LEVEL SECURITY. 0222/0337 granted
-- product_database_v2_mv to `authenticated` so the screen's view
-- (product_database_v2, security_invoker) could read it -- which also let ANY
-- login read it straight through the API, including one with no profile:
-- somebody who signs themselves up (self sign-up is open) got the whole install
-- base -- every machine, serial, customer, city and cover. 0464 closed that
-- class for TABLES with a restrictive policy; a matview cannot carry one.
--
-- So the copy is granted to nobody, and is read through a GATE: an owner-rights
-- view over the copy alone that returns rows to the two API roles only while
-- the caller has a profile (0463 makes a profile only for an active User Master
-- address). Any other role -- the SQL editor, the refresh, a test -- reads it
-- as before: `current_user` in a view is still the caller, and only the API
-- roles reach it through the website's key. The
-- screen's view keeps security_invoker and its columns, and reads the gate
-- instead of the copy. The gate reads no table with row-level security -- the
-- profile test is a function -- so `check:views` has nothing to object to, and
-- it is a security_barrier so a filter sent with the request is never applied
-- before the gate's own test.
--
-- LAST IN THE product_database_2 BUNDLE, after 0337 (which grants the copy to
-- `authenticated` again on a re-run). A migration that drops and re-creates the
-- copy must re-create the gate and this view, and keep the copy ungranted.
-- ===========================================================================

create or replace function public.product_database_2_reader_ok()
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and exists (select 1 from public.profiles where id = auth.uid());
$$;
comment on function public.product_database_2_reader_ok() is
  'Product Database 2.0 gate (0465): true while the caller has a profile, i.e. is on the User Master.';
revoke all on function public.product_database_2_reader_ok() from public, anon;
grant execute on function public.product_database_2_reader_ok() to authenticated;

do $$
begin
  if to_regclass('public.product_database_v2_mv') is null then return; end if;

  execute $v$
    create or replace view public.product_database_v2_gate
      with (security_barrier = true) as
    select m.* from public.product_database_v2_mv m
     where current_user not in ('anon', 'authenticated')
        or (select public.product_database_2_reader_ok())
  $v$;
  execute 'revoke all on public.product_database_v2_gate from public, anon, authenticated';
  execute 'grant select on public.product_database_v2_gate to authenticated';

  execute $v$
    create or replace view public.product_database_v2 as
    select
      m.machine_key, m.product_name, m.serial_number, m.product_code,
      m.party_name, m.party_from,
      m.warranty_start, m.warranty_months, m.warranty_end, m.warranty_from,
      public.cover_state(m.warranty_end)                     as warranty_state,
      m.contract_number, m.contract_type_as_recorded, m.contract_type,
      m.contract_start, m.contract_months, m.contract_end, m.contract_from,
      public.cover_state(m.contract_end)                     as contract_state,
      case
        when coalesce(m.warranty_end, '-infinity'::date) >= current_date then 'WGP'
        when coalesce(m.contract_end, '-infinity'::date) >= current_date
          then coalesce(public.contract_cover_code(m.contract_type_as_recorded),
                        'CONTRACT (TYPE NOT RECORDED)')
        else 'OGP'
      end                                                    as item_status,
      case
        when coalesce(m.warranty_end, '-infinity'::date) >= current_date
          then 'inside warranty — ' || coalesce(m.warranty_from, 'source not recorded')
        when coalesce(m.contract_end, '-infinity'::date) >= current_date
          then 'under contract — ' || coalesce(m.contract_from, 'source not recorded')
        else 'no warranty and no contract covers today'
      end                                                    as item_status_reason,
      m.sa_number, m.state, m.city, m.engineer,
      m.from_party, m.to_party, m.transfer_date, m.reference_no,
      m.in_warranty_register, m.in_contract_register, m.in_additional_entries,
      m.installation_ucn,
      s.refreshed_at,
      s.stale
    from public.product_database_v2_gate m
    cross join public.product_database_v2_state s
  $v$;
  execute 'alter view public.product_database_v2 set (security_invoker = on)';
  execute 'grant select on public.product_database_v2 to authenticated';

  -- The copy itself: nobody through the API. The refresh runs as its owner.
  execute 'revoke all on public.product_database_v2_mv from public, anon, authenticated';
end $$;
