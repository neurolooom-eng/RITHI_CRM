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
    -- 0013 is a pure DATA grant with no object to look for, so this can only be
    -- inferred. It used to read "no role has mod:/parts without mod:/masters",
    -- which was right when the two always travelled together — but since 0067
    -- masters can be granted LIST BY LIST, and an admin narrowing a role to
    -- Part Master without All Masters is now a deliberate, supported setting.
    -- Flagging that as a missing migration sent people to re-run a grant that
    -- would silently widen a role they had just narrowed. So this now tests the
    -- only thing that genuinely means "never applied": that NO role at all can
    -- open All Masters.
    (16, 'rbac: all-masters module', 'at least one role holds mod:/masters (0013). Per-role narrowing is expected — see 0067.',
        (to_regclass('public.app_roles') is null
      or exists (select 1 from public.app_roles
                  where coalesce(permissions, '[]'::jsonb) ? 'mod:/masters'))),
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
     and exists (select 1 from pg_policy where polrelid = to_regclass('public.masters') and polname = 'masters_delete'))),
    (25, 'user_directory: who created a row', 'app_user_names -- id -> name, so tables show a name not a UUID (0068)',
        to_regclass('public.app_user_names') is not null),
    (26, 'rbac: NSM is the National SERVICE Manager', 'the app_roles label no longer says Sales (0069)',
        (to_regclass('public.app_roles') is null
      or not exists (select 1 from public.app_roles
                      where role = 'nsm' and label = 'NSM (National Sales Manager)'))),
    (27, 'documents', 'documents table -- service manuals + QMS, and the call''s supporting docs (0070)',
        to_regclass('public.documents') is not null),
    (28, 'reports: bulk mapping', 'reports.source_ref + a NON-partial uid index the upsert can infer (0071)',
        (exists (select 1 from information_schema.columns
                  where table_schema='public' and table_name='reports' and column_name='source_ref')
     and exists (select 1 from pg_indexes where schemaname='public' and indexname='reports_uid_uniq'))),
    (29, 'ownership transfer', 'ownership_transfers -- where each machine has been (0072)',
        to_regclass('public.ownership_transfers') is not null),
    (30, 'additional entry details', 'product_additional_entries -- warranty for a lost Sale Entry (0073)',
        to_regclass('public.product_additional_entries') is not null),
    (31, 'handstock: opening pools', 'handstock_opening + the Opening arm on handstock_movements (0074)',
        (to_regclass('public.handstock_opening') is not null
     and exists (select 1 from pg_views where schemaname='public' and viewname='handstock_movements'
                  and definition ilike '%handstock_opening%'))),
    -- Tests the INDEXES, not just the columns. 0079 deliberately SKIPS building
    -- an index when the table already holds duplicates (it cannot be built), and
    -- says so in a NOTICE — which the Supabase editor makes easy to miss. The
    -- column would be there and this row would read "yes" while the upload still
    -- failed with "no unique or exclusion constraint". The index is what matters.
    -- Tests the INDEXES, not the columns: 0079/0081/0082 SKIP building one when
    -- the table already holds duplicates, and say so in a NOTICE the Supabase
    -- editor makes easy to miss. The column would be there, this would read
    -- "yes", and the upload would still fail on ON CONFLICT.
    --
    -- parts is keyed on CODE|Description, not the code: the real register uses
    -- YR134500 for two different parts (0082).
    (35, 'parts + products: natural keys', 'parts_item_detail_key_uniq + products_machine_key_uniq — the upsert needs these (0082)',
        (exists (select 1 from pg_indexes where schemaname='public' and indexname='parts_item_detail_key_uniq')
     and exists (select 1 from pg_indexes where schemaname='public' and indexname='products_machine_key_uniq'))),
    (37, 'call requests: status follows the UCN', 'call_requests_biu fires on update and sets Registered when a UCN is present (0083)',
        exists (select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid
                 where c.relname = 'call_requests' and t.tgname = 'call_requests_biu'
                   and t.tgtype::int & 16 = 16)),   -- bit 16 = fires on UPDATE
    (36, 'uploads: extra columns kept', 'ownership_transfers.extra + stock_transfers.extra (0080)',
        (exists (select 1 from information_schema.columns
                  where table_schema='public' and table_name='ownership_transfers' and column_name='extra')
     and exists (select 1 from information_schema.columns
                  where table_schema='public' and table_name='stock_transfers' and column_name='extra'))),
    -- Tests what the UPLOAD actually needs, not just 0078's columns. It read
    -- "yes" on grir + source_ref while the Consumption upload still failed with
    -- 'column "source_ref_key" does not exist' — that key and its FULL unique
    -- index come from 0081, and a status row that cannot see the difference is
    -- worse than no row. Same lesson as row 35.
    (38, 'spare requests: importable', 'spare_requests.extra + the stub-parent trigger a line needs (0084)',
        (exists (select 1 from information_schema.columns
                  where table_schema='public' and table_name='spare_requests' and column_name='extra')
     and exists (select 1 from pg_trigger where tgname = 'spare_request_line_stub_parent'))),
    (34, 'consumption: GRIR + re-loadable', 'spare_consumption.grir, source_ref_key and its unique index (0078 + 0081)',
        (exists (select 1 from information_schema.columns
                  where table_schema='public' and table_name='spare_consumption' and column_name='grir')
     and exists (select 1 from information_schema.columns
                  where table_schema='public' and table_name='spare_consumption' and column_name='source_ref_key')
     and exists (select 1 from pg_indexes
                  where schemaname='public' and indexname='spare_consumption_source_ref_uniq'))),
    -- The WHERE is part of what this row checks, not a detail: with 0076 alone
    -- the columns and the index are all present and this read "yes", while the
    -- Party Master upload stopped at row 1 with "UPDATE requires a WHERE
    -- clause" — Supabase refuses the counter's WHERE-less bump. Same lesson as
    -- rows 34 and 35: check what the UPLOAD needs.
    (33, 'parties: key + de-duplication', 'parties.party_key (Party-1, Party-2 …), the name_key unique index (0076) and a counter Supabase will run (0086)',
        (exists (select 1 from information_schema.columns
                  where table_schema='public' and table_name='parties' and column_name='party_key')
     and exists (select 1 from pg_indexes where schemaname='public' and indexname='parties_name_key_uniq')
     and coalesce(pg_get_functiondef(to_regprocedure('public.next_party_key()'))
                    ilike '%where singleton%', false))),
    -- The stub a line's trigger creates is invisible to the very command that
    -- is inserting the line, so `srl_insert` must not need to SEE it. Until
    -- this is applied, one line whose request is in neither export refuses the
    -- whole upload with "Your role does not have permission for this action."
    --
    -- 0087's shape (is_admin() hoisted out of the EXISTS) reads as fixed and is
    -- not: it works for an ADMIN only, and the register is loaded by whoever
    -- loads it. So test for the function 0088 asks through — the one that takes
    -- a fresh snapshot and can actually see the stub.
    -- Found by loading the four spare files END TO END against a copy of the
    -- live database. `material_returns.extra` had never existed, so the MRN
    -- upload could not write a row; the shortfall guards refused history that
    -- had already happened; and a transfer with no creator would not take its
    -- own lines.
    -- WinMax HS + SO + ST received - Consumption - ST sent - MRN. Every term
    -- had a home except the SO: the issue side was only ever derived from a
    -- spare REQUEST, which exists for 2026 and for nothing before it.
    -- A Reporting Manager whose address in the User Master has gone stale
    -- resolved to no row, so visible_engineer_names() was empty and the database
    -- returned no calls -- while the screen said "Team view - 15 engineers",
    -- because the CLIENT also matches on username. The name is the fallback.
    -- The master value lists could not be uploaded at all: their uniqueness is
    -- (name, value, stage, product) and the last two were EXPRESSIONS, which
    -- `on conflict` cannot infer. The eighth time this project met that wall.
    (46, 'master value lists: uploadable', 'masters keys the upsert can infer — stage_key + product_key and their index (0094)',
        (exists (select 1 from information_schema.columns
                  where table_schema='public' and table_name='masters' and column_name='stage_key')
     and exists (select 1 from information_schema.columns
                  where table_schema='public' and table_name='masters' and column_name='product_key')
     and exists (select 1 from pg_indexes
                  where schemaname='public' and indexname='masters_name_value_keys_uniq'))),
    (45, 'product & party search', 'the Product & Party Search screen is on the roles that have Product Master (0093)',
        exists (select 1 from public.app_roles
                 where permissions ? 'mod:/lookup')),
    (44, 'manager scope: the name is the fallback', 'visible_engineer_names() finds the caller by name when the address does not (0092)',
        coalesce(pg_get_functiondef(to_regprocedure('public.visible_engineer_names()'))
                   ilike '%me_by_name%', false)),
    (43, 'hand stock: read indexes', 'the balance is DERIVED, and indexed for it — halves a per-engineer read (0091)',
        (select count(*) from pg_indexes where schemaname='public' and right(indexname, 7) = '_hs_idx') >= 8),
    (42, 'hand stock: the issue history', 'spare_issue_history + its arm, which does not re-count a 2026 request line (0090)',
        (to_regclass('public.spare_issue_history') is not null
     and exists (select 1 from pg_views where schemaname='public' and viewname='handstock_movements'
                  and definition ilike '%spare_issue_history%')
     and exists (select 1 from information_schema.columns
                  where table_schema='public' and table_name='handstock_opening' and column_name='data'))),
    (41, 'spare imports: the historical files load', 'material_returns.extra, stock_transfers.source + created_by default, and the import exemptions (0089)',
        (exists (select 1 from information_schema.columns
                  where table_schema='public' and table_name='material_returns' and column_name='extra')
     and exists (select 1 from information_schema.columns
                  where table_schema='public' and table_name='stock_transfers' and column_name='source')
     and exists (select 1 from information_schema.columns
                  where table_schema='public' and table_name='stock_transfers'
                    and column_name='created_by' and column_default like '%auth.uid%')
     and coalesce(pg_get_functiondef(to_regprocedure('public.consumption_reconcile_guard()'))
                    ilike '%new.source_ref%', false))),
    (40, 'spare lines: a stub parent is allowed', 'srl_insert asks spare_line_parent_ok(), which can see the stub (0088)',
        (to_regprocedure('public.spare_line_parent_ok(text)') is not null
     and exists (select 1 from pg_policies
                  where schemaname='public' and tablename='spare_request_lines'
                    and policyname='srl_insert' and with_check ilike '%spare_line_parent_ok%'))),
    (39, 'spare requests: keyed on the OR number', 'uid filled from the OR number, and a line finding its request by it (0085)',
        (coalesce(pg_get_functiondef(to_regprocedure('public.spare_requests_assign_or_no()'))
                    ilike '%new.uid :=%', false)
     and coalesce(pg_get_functiondef(to_regprocedure('public.spare_request_line_stub_parent()'))
                    ilike '%r.or_no = new.request_uid%', false))),
    (59, 'hand stock: a level says how much of it was IMPORTED', 'handstock_balance carries hist_net / on_hand_live, so the sheet era can be split out (0102)',
        exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'handstock_balance'
                   and column_name = 'on_hand_live')),
    (60, 'audit trail: record_audit is STOPPED', 'no record_audit trigger is left on any table -- audit_log is the trail (0112). The table stays, holding what it recorded while it ran',
        not exists (select 1 from pg_trigger
                     where tgname in ('record_audit_i', 'record_audit_u', 'record_audit_d'))),
    (61, 'complaints: the wording gets the register''s own house style', 'suggest_complaint_text + alarm_value_for -- the alarm number in this product''s spelling, and the phrasings already in use (0107)',
        (to_regprocedure('public.suggest_complaint_text(text,text,integer)') is not null
     and to_regprocedure('public.alarm_value_for(text,integer)')             is not null)),
    (62, 'calls: a call can be CANCELLED', 'cancel_call / restore_call + the cancelled_at column and the Cancelled state (0108)',
        (to_regprocedure('public.cancel_call(text,text)')  is not null
     and to_regprocedure('public.restore_call(text)')      is not null
     and exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'field_calls' and column_name = 'cancelled_at')
     and coalesce((select pg_get_viewdef('public.call_state'::regclass, true) like '%Cancelled%'), false))),
    (63, 'calls: an open call can be CLOSED without a visit', 'close_call() -- for a call that ended for operational reasons, recorded as Solved like any other (0109)',
        to_regprocedure('public.close_call(text)') is not null),
    (64, 'logins: an admin can reset a forgotten password', 'admin_reset_password() + the password_resets log -- what the sign-in page now tells people to ask for (0110)',
        (to_regprocedure('public.admin_reset_password(text,text)') is not null
     and to_regclass('public.password_resets')                     is not null)),
    (65, 'DCCR: the register can be filtered by CALL status', 'field_call_review_summary carries open_state, so the rows and the stage counters agree (0111)',
        exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'field_call_review_summary'
                   and column_name = 'open_state')),
    (56, 'calls: row-level security actually applies', 'the `calls` view reads as the READER, not its owner (0105) -- without it every user sees every call',
        coalesce((select array_to_string(reloptions, ',') like '%security_invoker=on%'
                    from pg_class where oid = 'public.calls'::regclass), false)),
    (57, 'cover views: row-level security actually applies', 'warranty_sale_details / contract_details read as the reader (0106)',
        not exists (
          select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relkind = 'v'
             and c.relname in ('warranty_sale_details', 'contract_details')
             and coalesce(array_to_string(c.reloptions, ',') not like '%security_invoker=on%', true))),
    (58, 'call registration: the complaint suggests itself', 'suggest_standard_complaint() + the offered/accepted log (0104)',
        (to_regprocedure('public.suggest_standard_complaint(text,text,int)') is not null
     and to_regclass('public.complaint_suggestions') is not null)),
    (47, 'performance: JIT is OFF', 'the Hand Stock timeout -- 3.7s COMPILING a query that runs in 174ms (0099)',
        exists (select 1 from pg_db_role_setting s
                  join pg_database d on d.oid = s.setdatabase
                 where d.datname = current_database()
                   and 'jit=off' = any(s.setconfig))),
    (48, 'performance: the product list', 'product_register_names -- the dropdown on Product & Party Search (0098)',
        to_regclass('public.product_register_names') is not null),
    (49, 'performance: the KPIs', 'spare_usage / spare_usage_rollup / failure_rate_by_product / failure_modes_by_product (0101)',
        (to_regclass('public.spare_usage')                is not null
     and to_regclass('public.spare_usage_rollup')         is not null
     and to_regclass('public.failure_rate_by_product')    is not null
     and to_regclass('public.failure_modes_by_product')   is not null)),
    (50, 'call_requests: REQID follows the data', 'resync_call_req_seq(), and the trigger that keeps the counter ahead of an imported REQID (0097)',
        (to_regprocedure('public.resync_call_req_seq()') is not null
     and coalesce(pg_get_functiondef(to_regprocedure('public.call_requests_biu()'))
                    ilike '%pg_sequence_last_value%', false))),
    (51, 'call_requests: the counter is ahead of the register', 'the next REQID is above every REQID on record -- no second R1 (0097)',
        coalesce(
          (select coalesce(pg_sequence_last_value('public.call_req_seq'::regclass), 0)
                  >= coalesce(max(case when reqid ~ '^R[0-9]{1,15}$'
                                       then substring(reqid from 2)::bigint end), 0)
             from public.call_requests), true)),
    (52, 'handstock: a period can be CLOSED', 'handstock_period + handstock_cutoff() on every arm + close_handstock_period() (0096)',
        (to_regclass('public.handstock_period')                     is not null
     and to_regprocedure('public.handstock_cutoff()')               is not null
     and to_regprocedure('public.close_handstock_period(date)')     is not null
     and exists (select 1 from pg_views where schemaname='public' and viewname='handstock_movements'
                  and definition ilike '%handstock_cutoff%'))),
    (53, 'handstock: policies are InitPlans, not per-row', 'hso_write asks has_perm ONCE per query, not once per row (0095)',
        exists (select 1 from pg_policies
                 where schemaname='public' and tablename='handstock_opening'
                   and policyname='hso_write' and qual ilike '%( SELECT%')),
    (54, 'spare requests: the engineer can be corrected', 'reassign_spare_request() + its log + the guard that refuses it after dispatch (0100)',
        (to_regclass('public.spare_request_engineer_log')                        is not null
     and to_regprocedure('public.reassign_spare_request(text,text,text,text)')   is not null
     and exists (select 1 from pg_trigger
                  where tgrelid = 'public.spare_requests'::regclass
                    and tgname = 'spare_request_engineer_guard'))),
    (55, 'handstock: opening stock is ENGINEERS only', 'no opening balance is held under a name that is not an active user (_handstock_opening_engineers.sql)',
        (to_regclass('public.handstock_opening') is null
      or not exists (
           select 1 from public.handstock_opening o
            where not exists (select 1 from public.user_directory u
                               where u.validity and lower(btrim(u.name)) = o.engineer_key)))),
    (32, 'handstock: historical consumption', 'spare_consumption_history + its arm -- the pre-2026 record, uncapped (0075)',
        (to_regclass('public.spare_consumption_history') is not null
     and exists (select 1 from pg_views where schemaname='public' and viewname='handstock_movements'
                  and definition ilike '%spare_consumption_history%')))
)
select bundle,
       case when present then 'yes' else 'NO  <-- apply this' end as applied,
       provides
  from checks order by sort_order;
