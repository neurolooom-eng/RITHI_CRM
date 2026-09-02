-- ===========================================================================
-- What is actually applied to this project?
--
-- Run this FIRST in the Supabase SQL Editor. It reports one row per apply
-- bundle: whether the objects that bundle installs are present, so you know
-- what to run instead of discovering it one error at a time.
--
-- Read-only — it changes nothing.
-- ===========================================================================
with checks(sort_order, bundle, provides, present) as (
  values
    (1, 'base (0001-0003)',        'profiles / calls / spare_requests tables',
        (to_regclass('public.profiles')        is not null
     and to_regclass('public.calls')           is not null
     and to_regclass('public.spare_requests')  is not null)),
    (2, 'user_directory',          'visible_engineer_names()',
        to_regprocedure('public.visible_engineer_names()')   is not null),
    (3, 'rbac',                    'app_roles + has_perm() + is_admin() + can_approve_spares()',
        (to_regclass('public.app_roles')                is not null
     and to_regprocedure('public.has_perm(text)')            is not null
     and to_regprocedure('public.is_admin()')                is not null
     and to_regprocedure('public.can_approve_spares()')      is not null)),
    (4, 'spare_requests: workflow','spare_requests.stage (0006)',
        exists (select 1 from information_schema.columns
                 where table_schema='public' and table_name='spare_requests' and column_name='stage')),
    (5, 'spare_requests: receipt', 'spare_requests.received_at + is_spare_requester() (0009)',
        (exists (select 1 from information_schema.columns
                  where table_schema='public' and table_name='spare_requests' and column_name='received_at')
     and to_regprocedure('public.is_spare_requester(public.spare_requests)') is not null)),
    (6, 'spare_requests: intake',  'spare_requests.or_no + RowNo (0011)',
        -- NB: not the OR sequence — 0017 replaced it with a per-month counter.
        (exists (select 1 from information_schema.columns
                  where table_schema='public' and table_name='spare_requests' and column_name='or_no')
     and exists (select 1 from information_schema.columns
                  where table_schema='public' and table_name='spare_request_lines' and column_name='row_no'))),
    (7, 'spare_requests: approval fix', 'spare_needs_review() (0012)',
        to_regprocedure('public.spare_needs_review(text)')   is not null),
    (8, 'spare_requests: per-spare approvals', 'spare_request_lines.rm_at + spare_line_stage() (0016)',
        (exists (select 1 from information_schema.columns
                  where table_schema='public' and table_name='spare_request_lines' and column_name='rm_at')
     and to_regprocedure('public.spare_line_stage(text,text,text,text,timestamptz,text)') is not null)),
    (9, 'spare_requests: monthly OR numbers', 'next_spare_or_no() + spare_or_counters (0017)',
        (to_regprocedure('public.next_spare_or_no(date)') is not null
     and to_regclass('public.spare_or_counters')          is not null)),
    (11, 'stock_transfer', 'engineer_stock view + stock_transfers (0020)',
        (to_regclass('public.stock_transfers') is not null
     and to_regclass('public.engineer_stock')  is not null)),
    (10, 'spare_requests: OR number shape', 'OR-YYMM-NNNN, no slashed numbers left (0018 + 0019)',
        not exists (select 1 from public.spare_requests where or_no ~ '^OR-\d\d/\d\d/')),
    (2, 'user_directory: address', 'user_directory.address / city / state / phone (0029)',
        exists (select 1 from information_schema.columns
                 where table_schema='public' and table_name='user_directory' and column_name='address')),
    (18, 'rbac: Stores sees Pending Dispatch', 'mod:/spare-dispatch on the dispatch roles (0032)',
        (to_regclass('public.app_roles') is not null
     and not exists (select 1 from public.app_roles
                      where role in ('admin','stores_incharge','spare_coordinator')
                        and not coalesce(permissions, '[]'::jsonb) ? 'mod:/spare-dispatch'))),
    (17, 'rbac: address writable by dispatch', 'user_directory_address_guard() (0030)',
        to_regprocedure('public.user_directory_address_guard()') is not null),
    (11, 'spare_requests: approval forms', 'spare_request_lines.approval_data (0026)',
        exists (select 1 from information_schema.columns
                 where table_schema='public' and table_name='spare_request_lines' and column_name='approval_data')),
    (12, 'spare_requests: stores dispatch', 'spare_dispatches + spare_pending_dispatch + dispatch_spare_lines() (0027)',
        (to_regclass('public.spare_dispatches')       is not null
     and to_regclass('public.spare_pending_dispatch') is not null
     and to_regprocedure('public.dispatch_spare_lines(bigint[],text,text,date,text)') is not null)),
    (8, 'call_requests: items',    'call_requests without a unique reqid + next_call_reqid() (0010)',
        (to_regprocedure('public.next_call_reqid()')   is not null
     and not exists (select 1 from pg_constraint
                      where conname = 'call_requests_reqid_key'))),
    (9, 'call_requests: actions',  'call_requests.cancel_reason (0011)',
        exists (select 1 from information_schema.columns
                 where table_schema='public' and table_name='call_requests' and column_name='cancel_reason')),
    (10, 'call_requests: state',   'call_state + pending_calls views (0012)',
        (to_regclass('public.call_state')    is not null
     and to_regclass('public.pending_calls') is not null)),
    (11, 'reports: ordering',      'reports_visit_at_idx (0010_reports_ordering)',
        exists (select 1 from pg_indexes
                 where schemaname='public' and tablename='reports' and indexname='reports_visit_at_idx')),
    (12, 'call_requests: state (fast)', 'calls.open_state + the reports trigger (0014)',
        (exists (select 1 from information_schema.columns
                  where table_schema='public' and table_name='calls' and column_name='open_state')
     and exists (select 1 from pg_trigger where tgname = 'reports_touch_call'))),
    (13, 'call_requests: call number', 'next_direct_call_number() + the CL series (0015)',
        to_regprocedure('public.next_direct_call_number(text)') is not null),
    (13, 'call_requests: status by entry', 'the latest visit picked by entry date (0032)',
        exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                 where n.nspname = 'public' and p.proname = 'sync_call_last_visit'
                   and pg_get_functiondef(p.oid) ilike '%order by updated_at%')),
    (14, 'audit', 'audit_log table (0009_audit_log)',
        to_regclass('public.audit_log') is not null),
    (15, 'handstock', 'handstock_balance + handstock_movements, and engineer_stock over them (0023)',
        (to_regclass('public.handstock_balance')   is not null
     and to_regclass('public.handstock_movements') is not null)),
    (16, 'rbac: all-masters module', 'mod:/masters granted to the master-register roles (0013)',
        (to_regclass('public.app_roles') is not null
     and not exists (select 1 from public.app_roles
                      where coalesce(permissions, '[]'::jsonb) ? 'mod:/parts'
                        and not coalesce(permissions, '[]'::jsonb) ? 'mod:/masters'))),
    (17, 'handstock: material returns (MRN)', 'material_returns table + the Return arm on the balance (0039)',
        (to_regclass('public.material_returns') is not null
     and exists (select 1 from information_schema.columns
                  where table_schema='public' and table_name='handstock_balance'
                    and column_name='returned'))),
    (15, 'masters: value lists',   'master_lists registry + masters.added_on (0021)',
        (to_regclass('public.master_lists') is not null
     and exists (select 1 from information_schema.columns
                  where table_schema='public' and table_name='masters' and column_name='added_on'))),
    (20, 'sales_contracts: import speed', 'products_serial_key_idx -- without it an item import times out (0037)',
        exists (select 1 from pg_indexes where schemaname='public' and indexname='products_serial_key_idx')),
    (19, 'sales_contracts', 'sale_entries / contract_entries + machine_cover + sync_product_cover() (0036)',
        (to_regclass('public.sale_entries')     is not null
     and to_regclass('public.contract_entries') is not null
     and to_regclass('public.machine_cover')    is not null
     and to_regprocedure('public.sync_product_cover(text)') is not null)),
    (21, 'daily_review (DCCR)', 'call_reviews + field_call_review + the two per-product masters (0044/0046)',
        (to_regclass('public.call_reviews')      is not null
     and to_regclass('public.field_call_review') is not null
     and exists (select 1 from public.master_lists where key in ('dccrgrouping', 'rootcause')))),
    (22, 'daily_review: values', 'the register''s own DCCR Complaint Grouping / Root Cause Key Word values (0046)',
        exists (select 1 from public.masters where name in ('dccrgrouping', 'rootcause'))),
    (23, 'masters: deactivate a value', 'masters.active -- a used value is deactivated, not deleted (0066)',
        exists (select 1 from information_schema.columns
                 where table_schema='public' and table_name='masters' and column_name='active')),
    (24, 'masters: permission per list', 'masters_insert / masters_update / masters_delete policies (0067)',
        (exists (select 1 from pg_policy where polrelid = to_regclass('public.masters') and polname = 'masters_insert')
     and exists (select 1 from pg_policy where polrelid = to_regclass('public.masters') and polname = 'masters_delete')))
)
select bundle,
       case when present then 'yes' else 'NO  <-- apply this' end as applied,
       provides
  from checks order by sort_order;
