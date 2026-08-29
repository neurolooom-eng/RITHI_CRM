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
    (6, 'spare_requests: intake',  'spare_requests.or_no + the OR sequence (0011)',
        (exists (select 1 from information_schema.columns
                  where table_schema='public' and table_name='spare_requests' and column_name='or_no')
     and to_regclass('public.spare_or_no_seq')          is not null)),
    (7, 'spare_requests: approval fix', 'spare_needs_review() (0012)',
        to_regprocedure('public.spare_needs_review(text)')   is not null),
    (8, 'spare_requests: per-spare approvals', 'spare_request_lines.rm_at + spare_line_stage() (0016)',
        (exists (select 1 from information_schema.columns
                  where table_schema='public' and table_name='spare_request_lines' and column_name='rm_at')
     and to_regprocedure('public.spare_line_stage(text,text,text,text,timestamptz,text)') is not null)),
    (9, 'spare_requests: monthly OR numbers', 'next_spare_or_no() + spare_or_counters (0017)',
        (to_regprocedure('public.next_spare_or_no(date)') is not null
     and to_regclass('public.spare_or_counters')          is not null)),
    (10, 'spare_requests: 3-digit OR numbers', 'OR-YY/MM/NNN padding (0018)',
        not exists (select 1 from public.spare_requests where or_no ~ '^OR-\d\d/\d\d/\d{1,2}$')),
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
    (14, 'rbac: all-masters module', 'mod:/masters granted to the master-register roles (0013)',
        (to_regclass('public.app_roles') is not null
     and not exists (select 1 from public.app_roles
                      where coalesce(permissions, '[]'::jsonb) ? 'mod:/parts'
                        and not coalesce(permissions, '[]'::jsonb) ? 'mod:/masters')))
)
select bundle,
       case when present then 'yes' else 'NO  <-- apply this' end as applied,
       provides
  from checks order by sort_order;
