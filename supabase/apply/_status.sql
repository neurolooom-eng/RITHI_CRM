-- ===========================================================================
-- What is actually applied to this project?
--
-- Run this FIRST in the Supabase SQL Editor. It reports one row per apply
-- bundle: whether the objects that bundle installs are present, so you know
-- what to run instead of discovering it one error at a time.
--
-- Read-only — it changes nothing.
--
-- ORDER NO LONGER MATTERS. It used to: some access rules are written in one
-- bundle and corrected in another, so running the earlier bundle put the older
-- rule back — silently — and `rbac.sql` was the early one. Every bundle now
-- ends with the latest definition of everything it touches, so you can run them
-- in any order, as many times as you like, and nothing goes backwards.
-- `npm run check:replay` proves it by replaying each bundle onto a copy of a
-- fully-applied database and diffing every policy, function and view; the rows
-- at the bottom of this report still show the six that used to drift, so if one
-- ever says NO again you will see it here.
--
-- ONE EXCEPTION: `base.sql` is bootstrap only, and now REFUSES to run on a
-- database that already has Roles & Permissions. If you need it there, you
-- don't — run all.sql.
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
    (40, 'spare lines: a stub parent is allowed', 'srl_insert asks spare_line_parent_ok(), which can see the stub (0088). Restore: rbac.sql -- 0087/0088 moved there in v0.9.99 so a bundle replay stops reverting them, so Spare_1.sql no longer carries this',
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
    (66, 'calls: who REGISTERED it is the database''s to say', 'zz_calls_stamp_creator overrides a caller-supplied created_by with auth.uid() -- the Hotline is the only role trained on the vigilance questions, so anyone else must be findable (0113)',
        (to_regprocedure('public.calls_stamp_creator()') is not null
     and exists (select 1 from pg_trigger
                  where tgrelid = 'public.field_calls'::regclass
                    and tgname = 'zz_calls_stamp_creator'))),
    (67, 'calls: the desk of record and the person at the keyboard', 'actual_created_by holds who typed the call in; created_by holds the Hotline desk it belongs to. The two disagreeing is the vigilance finding (0114 call_requests)',
        (exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'field_calls'
                    and column_name = 'actual_created_by')
     and to_regprocedure('public.default_registrant()') is not null)),
    (68, 'audit mode: the switch exists and every flip is kept', 'set_audit_mode() + audit_mode_changes -- admin-only, needs a reason, and the history outlives the audit_log retention window (0114 audit)',
        (to_regprocedure('public.set_audit_mode(boolean,text)') is not null
     and to_regclass('public.audit_mode_changes') is not null)),
    (75, 'visits: a visit date that could not have happened is refused', 'reports_visit_date_guard -- not in the future, not before the call''s complaint date, on visits ENTERED on the form (uid WEB-...). Imported history is exempt by design (0115). Restore: reports.sql',
        (to_regprocedure('public.reports_visit_date_guard()') is not null
     and exists (select 1 from pg_trigger
                  where tgrelid = 'public.reports'::regclass
                    and tgname = 'reports_visit_date_guard'))),
    (76, 'spares: approve a batch, and the RM queue', 'approve_spare_lines() + spare_pending_rm -- tick and approve, each line at the stage it is AT so nothing skips a review; the NSM role holds all three approvals (0116). Restore: Spare_1.sql',
        (to_regprocedure('public.approve_spare_lines(bigint[],text)') is not null
     and to_regclass('public.spare_pending_rm') is not null
     and coalesce((select permissions ? 'spare.approve_rm' from public.app_roles where role='nsm'), false))),
    (77, 'DCCR: the register answers "is this a frequent failure?"', 'frequent_failure_history() -- earlier calls on the same product+serial with the same complaint, in the 6 months BEFORE this call''s own date (0117). Restore: daily_review.sql',
        to_regprocedure('public.frequent_failure_history(text,integer)') is not null),
    (78, 'spares: reject and drop in bulk, and somebody can actually drop', 'decide_spare_lines() -- approve / reject / drop many at once, each at the stage it is AT, a reason required for the last two. AND the spare.drop permission 0036 never granted to any role (0118). Restore: Spare_1.sql',
        (to_regprocedure('public.decide_spare_lines(bigint[],text,text,text)') is not null
     and exists (select 1 from public.app_roles where permissions ? 'spare.drop'))),
    (79, 'DCCR: Review 2 in bulk, except inside the first year', 'bulk_set_review2() -- answers Review 2 for many calls at once and REFUSES any that failed under 366 days or whose age is unknown; those are reviewed one by one (0119). Restore: daily_review.sql',
        to_regprocedure('public.bulk_set_review2(text[],text,text,text,text)') is not null),
    (80, 'registers: a layout can be set for a ROLE', 'role_table_views + set_role_table_view() / my_table_view() -- columns, order, widths and grouping, per role (role '''' = everyone). set_at is stamped by the database, so the reader''s own arrangement and the administrator''s are ranked by WHEN, not by who (0120). Restore: rbac.sql',
        (to_regclass('public.role_table_views') is not null
     and to_regprocedure('public.set_role_table_view(text,text,jsonb)') is not null
     and to_regprocedure('public.my_table_view(text)') is not null)),
    -- ---- POLICIES THAT A BUNDLE REPLAY QUIETLY REVERTS -------------------
    -- Each of these is created early (0001/0008) and REDEFINED later, in a
    -- different module. The bundles are replayed one at a time, so re-running
    -- the earlier one puts the older definition back -- no error, and the
    -- bundle reports success. `npm run check:bundles` lists them; these rows
    -- are what makes the drift VISIBLE on a live project.
    -- Proven, not theorised: every migration applied to one database, the
    -- bundle replayed on a copy, pg_policies diffed (2026-09-06). That is now
    -- `npm run check:replay`, and every bundle passes it -- each ends with a
    -- guarded mirror of whatever a later module narrows. These rows stay: they
    -- are how the same drift would be SEEN on the live project if it returned.
    (69, 'spares: who can SEE a spare request', 'sr_read is 0040''s -- scoped by can_view_all_calls() and the reporting tree. Replaying rbac.sql used to put 0035''s back; 0121 ends that bundle with this one, so it no longer does. Restore: Spare_1.sql',
        exists (select 1 from pg_policies
                 where schemaname='public' and tablename='spare_requests'
                   and policyname='sr_read' and qual ilike '%can_view_all_calls%')),
    (70, 'spares: who can UPDATE a spare request', 'sr_update is 0009''s -- is_spare_requester(), so acknowledging receipt works. Replaying rbac.sql used to put 0008''s back; 0121 ends that bundle with this one. Restore: Spare_1.sql',
        exists (select 1 from pg_policies
                 where schemaname='public' and tablename='spare_requests'
                   and policyname='sr_update' and qual ilike '%is_spare_requester%')),
    (71, 'spares: per-LINE approvals', 'srl_update is 0016''s -- the requester may touch their own lines, not only an approver. Replaying rbac.sql used to put 0008''s back; 0121 ends that bundle with this one. Restore: Spare_1.sql',
        exists (select 1 from pg_policies
                 where schemaname='public' and tablename='spare_request_lines'
                   and policyname='srl_update' and qual ilike '%is_spare_requester%')),
    (72, 'consumption: who can SEE it', 'cons_read is 0038''s -- the engineer, their manager''s tree, the office roles. Replaying rbac.sql used to put 0008/0035''s permission-only test back; 0121 ends that bundle with this one. Restore: HandStock_X.sql',
        exists (select 1 from pg_policies
                 where schemaname='public' and tablename='spare_consumption'
                   and policyname='cons_read' and qual ilike '%can_view_all_calls%')),
    (73, 'consumption: a RECONCILIATION line needs its own right', 'cons_write is 0059''s -- a Reconciliation row asks consumption.reconcile, not calls.report. Replaying rbac.sql used to put 0008''s back and amend/void lost its gate; 0121 ends that bundle with this one. Restore: HandStock_X.sql',
        exists (select 1 from pg_policies
                 where schemaname='public' and tablename='spare_consumption'
                   and policyname='cons_write' and with_check ilike '%Reconciliation%')),
    (81, 'spares: the engineer is told when the part is REFURBISHED', 'notify_spare_dispatched carries 0064''s refurbished line. `notifications` runs AFTER `handstock`, so 0054''s version had been overwriting it on every apply and the notice has never been sent. Restore: notifications.sql',
        coalesce((select pg_get_functiondef(p.oid) ilike '%refurb%'
                    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                   where n.nspname='public' and p.proname='notify_spare_dispatched'), false)),
    (82, 'spare requests: the per-stage approval guard is 0016''s', 'spare_requests_stage_guard knows the receipt columns, courier / dispatch remarks and reject_reason. Replaying rbac.sql used to put 0008''s back, which refuses an engineer acknowledging receipt. Restore: rbac.sql',
        coalesce((select pg_get_functiondef(p.oid) ilike '%received_at%'
                    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                   where n.nspname='public' and p.proname='spare_requests_stage_guard'), false)),
    (83, 'notifications: signing out clears them', 'clear_my_notifications() -- the bell empties in the DATABASE at sign-out, read and unread alike, so the next session starts clean on every device. Takes no arguments and filters on auth.uid(), and `authenticated` is not granted execute on it by PUBLIC (0123). Restore: notifications.sql',
        to_regprocedure('public.clear_my_notifications()') is not null),
    (84, 'DCCR: Review 2 answers itself the morning after', 'auto_answer_review2() -- a call logged today stays pending all day; from 9:15 am Asia/Kolkata the next morning its Review 2 is answered No. Never a first-year failure, never an unknown age, never an answer somebody already gave; recorded as "Auto (9:15 am)" so Review 3 can tell (0124). The scheduled run needs pg_cron -- see row 85. Restore: daily_review.sql',
        to_regprocedure('public.auto_answer_review2()') is not null),
    (85, 'DCCR: ...at a quarter past nine, not just when somebody opens it', 'the pg_cron job `auto-answer-review2`, 03:45 UTC = 09:15 Asia/Kolkata. WITHOUT IT the rule still applies -- the register runs the same function when it loads -- but only once somebody opens the Daily Call Review that day. Enable pg_cron (Dashboard -> Database -> Extensions) and re-run daily_review.sql',
        -- cron.job is READ THROUGH query_to_xml, not named directly: a plain
        -- reference is resolved when this statement is PLANNED, so on a project
        -- without pg_cron the whole report would fail with "relation cron.job
        -- does not exist" instead of reporting the one row as NO -- which is
        -- exactly the project that needs to be told.
        (case when to_regclass('cron.job') is null then false
              else coalesce((xpath('/row/c/text()', query_to_xml(
                     'select count(*) as c from cron.job where jobname = ''auto-answer-review2''',
                     false, true, '')))[1]::text::int > 0, false)
         end)),
    (86, 'calls: the UCN counter restarts every day, per call type', 'ucn_counters + next_ucn() reading Asia/Kolkata. It used to be ONE running sequence for the whole database (ucn_seq), so the date changed daily and the number behind it just kept climbing -- and the date itself rolled at 5:30 am, because next_ucn read UTC. Numbers already issued are untouched: a day is seeded past whatever it already carries (0125). Restore: call_requests.sql',
        (to_regclass('public.ucn_counters') is not null
     and to_regclass('public.ucn_seq') is null)),
    (87, 'calls: re-allocating one is its OWN permission', 'calls.allot -- "Re-allocate a call to another engineer", which now appears on Roles & Permissions and can be granted apart from calls.edit. Every role that had calls.edit was MERGED with it, so nobody lost anything. Enforced by zz_calls_allot_guard on all three call tables, not only by hiding the tick-boxes (0126). Restore: call_requests.sql',
        (exists (select 1 from public.app_roles where permissions ? 'calls.allot')
     and (select count(*) from pg_trigger t join pg_class c on c.oid = t.tgrelid
           where t.tgname = 'zz_calls_allot_guard' and not t.tgisinternal) = 3)),
    (88, 'calls: editing one is FOUR rights, not one', 'calls.edit.complaint / .customer / .vigilance / .contact, with calls.edit as their PARENT -- so a role holding the whole right keeps everything and nothing changed on the day it ran. To narrow a manager, untick "Edit calls" and tick the sections they should have. Enforced by zz_calls_edit_section_guard on all three call tables (0127). Restore: call_requests.sql',
        (select count(*) from pg_trigger t join pg_class c on c.oid = t.tgrelid
          where t.tgname = 'zz_calls_edit_section_guard' and not t.tgisinternal) = 3),
    (89, 'calls: a section right can actually reach the call', 'calls_update admits calls.allot and the four section rights, not only calls.edit / calls.report. WITHOUT THIS every finer right is decoration: the row does not match the policy, the update reports 0 rows, and nothing says why (0127). Restore: call_requests.sql',
        exists (select 1 from pg_policies
                 where schemaname='public' and tablename='field_calls'
                   and policyname='calls_update' and qual ilike '%calls.edit.vigilance%')),
    (90, 'calls: every change to a vigilance answer is kept', 'call_vigilance_changes -- Public Health Threat / Death / Serious Incident are Review 1, so each change after registration is written with who, when, and from what to what, in the same statement that makes it. No insert or update policy: the trigger is the only author (0127). Restore: call_requests.sql',
        (to_regclass('public.call_vigilance_changes') is not null
     and not exists (select 1 from pg_policies
                      where schemaname='public' and tablename='call_vigilance_changes'
                        and cmd in ('INSERT','UPDATE')))),
    (91, 'KPI: the workbook''s Field_INST tab, from the register', 'kpi_field_inst -- columns A-AB in the workbook''s own order and spelling. Cancelled calls are excluded entirely (the sheet counted them as Close); Close means Solved - Report Completed and nothing else; Call Attended On is the EARLIER of the first visit and the first spare request; Call Solved is the visit date of the entry that completed it. AC-AG are workbook formulas -- Phase 2 (0128). Restore: performance.sql',
        -- Looked up BY NAME, never `'public.kpi_field_inst'::regclass`: a cast
        -- is resolved when this statement is PLANNED, so on a project without
        -- the view the WHOLE report would fail with "relation does not exist"
        -- instead of reporting this one row as NO -- which is exactly the
        -- project that needs telling. (Same trap as cron.job in row 85.)
        (to_regclass('public.kpi_field_inst') is not null
     and coalesce((select array_to_string(c.reloptions, ',') like '%security_invoker=on%'
                     from pg_class c join pg_namespace n on n.oid = c.relnamespace
                    where n.nspname = 'public' and c.relname = 'kpi_field_inst'), false))),
    (92, 'products: one machine can be found by its serial WITHOUT a scan', 'products.serial_key -- a STORED lower(btrim(serial_number)) with its own index, so a client can match one machine by EQUALITY. It used to ask for serial_number ILIKE ''%serial%'': a 4-character pattern gives the trigram index no selectivity, so the planner scanned all ~21k machines and Supabase cancelled the statement -- "canceling statement due to statement timeout" on Pending Registrations. 0037''s expression index cannot be reached through PostgREST, which is why an index alone never fixed it (0129). Restore: masters.sql',
        (exists (select 1 from information_schema.columns
                  where table_schema='public' and table_name='products' and column_name='serial_key')
     and exists (select 1 from pg_indexes
                  where schemaname='public' and tablename='products' and indexname='products_serial_key_col_idx'))),
    (93, 'Objective: the Quality & Business Objectives register', 'quality_objectives -- the twelve objectives for the year with their targets, frequency, who is responsible and the month-by-month actual, on their own page. A month not measured is NULL, never 0 ("NA" on a quarterly objective is not zero). Every figure is TYPED today (source = manual); the column is there so the page can say which are automated as they are. Re-running the seed never overwrites one somebody typed. Also grants mod:/objective to every role holding mod:/kpi (0130). Restore: objective.sql',
        (to_regclass('public.quality_objectives') is not null
     and exists (select 1 from pg_policies
                  where schemaname='public' and tablename='quality_objectives' and policyname='qo_write'))),
    (94, 'KPI: the computed columns (Phase 2)', 'AC-AG by the workbook''s own formulas -- days counted from the LATER of complaint and registration and never negative, the band from the FINER of the two LOOKUPVALUES tables (61-90D, 91-180D, >180D, >1 yr ... >5 yrs), Failure Month off the REGISTRATION date. Plus Pending Days, which the workbook has no column for: the sheet computes 0 for a call nobody has been to, so every unattended call reads as attended and solved the same day. Open/Close is now Close for ANY Solved... status, report-pending included, per the sheet (0131). Restore: performance.sql',
        (to_regprocedure('public.kpi_days_band(integer)') is not null
     and exists (select 1 from information_schema.columns
                  where table_schema='public' and table_name='kpi_field_inst'
                    and column_name = 'Pending Days'))),
    (95, 'Objective: the figures compute themselves, and can show their working', 'quality_objectives.calc_key + calc_params, recalc_quality_objectives() and objective_evidence(). Re-Calc is EXPLICIT -- never on a page load -- writes only the objectives that have a calc_key, only up to this month, and NEVER touches a typed figure. Each month is measured as at the END of that month, so a call closed since does not move an earlier figure. The evidence is the same query that produced the number, so counting it reproduces the fraction (0132). Restore: objective.sql',
        -- 0138 gave it a cut-off argument and 0139 took it away again: a cut-off
        -- is set per month, in one place, and Re-Calculate only reads them.
        (to_regprocedure('public.recalc_quality_objectives(integer)') is not null
     and to_regprocedure('public.objective_evidence(bigint,integer)') is not null
     and exists (select 1 from information_schema.columns
                  where table_schema='public' and table_name='quality_objectives'
                    and column_name='calc_key'))),
    (96, 'Objective: a rate can be narrowed by SERIAL, not only product', 'failure_rate_12m takes an optional `serial` in calc_params -- how the Indian Extend is told from the rest ("Extend XT with serial numbers starting from INXT"), since no column says Indian. It narrows the FAILURES AND THE MACHINES they are counted against: narrowing only the failures would read LOWER than the truth, and a rate that flatters itself is the one nobody questions (0133). Restore: objective.sql',
        coalesce((select calc_params ? 'serial' from public.quality_objectives
                   where year = 2026 and calc_key = 'failure_rate_12m'
                     and parameter ilike '%extend%' limit 1), false)),
    (97, 'Objective: the evidence lists the MACHINES, not just a count', 'objective_evidence returns the installed base one row per machine (role = machine), so the denominator can be COUNTED rather than taken on trust -- a denominator of 47 nobody can list is as good as none. The page puts the calls, the machines and the arithmetic on three tabs of one workbook, and Sheet 3 is counted from Sheets 1 and 2 so the file adds up to itself (0134). Restore: objective.sql',
        -- The word "machine" alone does NOT discriminate: 0133's version says
        -- "machines in the field" in its summary row. What is new in 0134 is
        -- the ROLE — machines come back as rows labelled 'machine'.
        coalesce((select pg_get_functiondef(p.oid) like '%''machine''::text%'
                    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                   where n.nspname = 'public' and p.proname = 'objective_evidence'
                   limit 1), false)),
    (98, 'Objective: the installation base is a Product Master listing, and says what filtered it', 'objective_evidence returns each machine as its PRODUCT MASTER ROW -- warranty and contract with the rest -- so Sheet 2 reconciles line by line against that screen instead of merely resembling it, and a leading role=filter row names the product pattern and the serial pattern actually applied. Every product except Extend XT is filtered on the PRODUCT ALONE, and the file now says so in words rather than leaving it to be inferred (0135). Restore: objective.sql',
        -- Checked on the SIGNATURE, not on any word in the body: the return
        -- type gaining contract_type is the thing 0135 did, and no earlier
        -- version can accidentally satisfy it.
        coalesce((select pg_get_function_result(p.oid) like '%contract_type%'
                    and pg_get_functiondef(p.oid) like '%''filter''::text%'
                    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                   where n.nspname = 'public' and p.proname = 'objective_evidence'
                   limit 1), false)),
    (99, 'Objective: a QUARTERLY objective is measured over its quarter, cumulatively', 'objective_period() reads the register''s own Monitoring Frequency: Monthly measures the month, "3 Months" measures the WHOLE QUARTER and reports it in the quarter''s last month only -- the other two are NA (NULL), and Re-Calc clears them on an objective it computes. Cumulative means POOLED, not averaged: one fraction over the three months, so a month with four calls does not weigh the same as a month with ninety (0136). Restore: objective.sql',
        (to_regprocedure('public.objective_period(bigint,integer)') is not null
     and to_regprocedure('public.objective_is_quarterly(text)') is not null)),
    (100, 'Objective: calls 8-10 count their OWN register, and 11 counts attended-in-days', 'calc_params.family names the register -- field / pm / installation -- so Preventive Maintenance Calls counts pm_calls and Installation call counts installation_calls, rather than all three reading the field register. Breakdown Calls (8), PM Calls (9) and Installation call (10) are one formula over three registers: calls registered in the period by REGISTRATION DATE, less those solved by its end. Problem Call attending within 3 days (11) is attended_within_days, the attended date being the EARLIER of first visit and first spare request, boundary inclusive. b.Customer feedback (12) stays TYPED -- its logic has not been given (0136). Restore: objective.sql',
        -- Checked on the THREE NAMED objectives, not on a count: a count is
        -- satisfied by any three rows, and a test fixture or an administrator's
        -- own objective would answer for the ones this is about.
        (to_regprocedure('public.objective_call_table(jsonb)') is not null
     and coalesce((select count(*) = 3 from public.quality_objectives o
                    join (values ('breakdown calls', 'field'),
                                 ('preventive maintenance calls', 'pm'),
                                 ('installation call', 'installation')) v(param, fam)
                      on lower(btrim(o.parameter)) = v.param
                   where o.year = 2026 and o.calc_key = 'open_rate_monthly'
                     and o.calc_params->>'family' = v.fam), false)
     and coalesce((select count(*) = 1 from public.quality_objectives
                    where year = 2026 and calc_key = 'attended_within_days'
                      and lower(btrim(parameter)) = 'problem call attending within 3 days'), false))),
    (101, 'Objective: the evidence states its ASSUMPTIONS and its HARD STOPS', 'objective_notes() returns them as rows for the Calculation sheet, told apart on purpose: an ASSUMPTION is a choice that could have gone another way and an administrator can change it (which register, which product pattern, which date the clock runs from); a HARD STOP is what the number MEANS and will not bend (cancelled calls never counted, the cutoff never later than today, no calls means no rate rather than 0%). Derived from the objective''s own definition, so it cannot go on describing a register the objective no longer reads (0136). Restore: objective.sql',
        (to_regprocedure('public.objective_notes(bigint,integer)') is not null
     and coalesce((select pg_get_functiondef(p.oid) like '%HARD STOP%'
                     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                    where n.nspname = 'public' and p.proname = 'objective_notes'
                    limit 1), false))),
    (102, 'Objective: the "solved by" cut-off is settable, and separate from the registration window', 'objective_period() now returns solve_cutoff alongside period_start/period_end. The WINDOW decides which calls are counted and does not move; the CUT-OFF decides whether each was closed, and calc_params can set it as cutoff_days (a grace after the period, for reports written up late) or cutoff_date (one fixed day, for reporting as at a stated date). Nothing set = the period end, exactly as before. ALWAYS capped at today: a future cut-off would count a period the record cannot yet know about, and can only ever move a call from open to closed -- it would flatter the figure (0137). Restore: objective.sql',
        coalesce((select pg_get_function_result(p.oid) like '%solve_cutoff%'
                    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                   where n.nspname = 'public' and p.proname = 'objective_period'
                   limit 1), false)),
    (103, 'Objective: the evidence carries the ACTUAL closure date and names what the cut-off excluded', 'objective_evidence returns closure_date (the VISIT that solved the call -- the Call Solved Date rule) and closure_recorded_on (when that report was ENTERED, which is what the cut-off tests), plus after_cutoff spelling out that a call was solved after the cut-off and is therefore counted as OPEN. Both dates are carried because they disagree -- a visit late in a period written up after it -- and "still open" and "solved, but later" are different facts that the file must not make look the same (0137). Restore: objective.sql',
        coalesce((select pg_get_function_result(p.oid) like '%after_cutoff%'
                     and pg_get_function_result(p.oid) like '%closure_date%'
                    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                   where n.nspname = 'public' and p.proname = 'objective_evidence'
                   limit 1), false)),
    (104, 'Objective: a call closes on the VISIT DATE, not the date the report was typed up', 'open_rate_monthly tests coalesce(reports.visit_at, reports.updated_at) against the cut-off. A visit on 30 May entered on 3 June is CLOSED in May -- the user''s decision after 0137 put both dates on the sheet. The fallback to the entry date where a solving report carries NO visit date is deliberate and stated in the evidence: treating a blank as "never solved" would move a closed call into the open column for a missing keystroke, making the figure worse for a data-entry lapse (0138). Restore: objective.sql',
        coalesce((select pg_get_functiondef(p.oid) like '%coalesce(r.visit_at::date, r.updated_at::date) <= $4%'
                    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                   where n.nspname = 'public' and p.proname = 'objective_value'
                   limit 1), false)),
    (105, 'Objective: a cut-off date PER MONTH, and Re-Calculate only reads them', 'objective_cutoffs holds one row per month per year, SHARED by every objective -- the cut-off is a property of the reporting round, not of any one measure. Setting September''s never touches January''s, so a figure already reported cannot be re-based by a later round (which is exactly what 0138''s year-wide date did). A month with no row measures to the end of its own period, the Default EMONTH; a quarterly objective takes its quarter-end month''s date. recalc_quality_objectives is back to ONE argument -- it READS the cut-offs and does not set one, because two ways to set a thing is how a figure ends up disagreeing with the setting behind it (0139). Restore: objective.sql',
        (to_regclass('public.objective_cutoffs') is not null
     and to_regprocedure('public.set_objective_cutoff(integer,integer,date)') is not null
     and to_regprocedure('public.recalc_quality_objectives(integer)') is not null
     and to_regprocedure('public.recalc_quality_objectives(integer,date)') is null)),
    (106, 'Objective: an ADMIN can lock the cut-off, and the lock holds at the table', 'objective_cutoff_locked() / set_objective_cutoff_lock() in app_settings, the same shape as Audit Mode (0114), plus a TRIGGER on quality_objectives -- because a lock the definition screen''s JSON box walks around is decoration. Locked, nobody but an administrator can change cutoff_date or cutoff_days, through Re-Calculate or by editing the row. OFF by default. An administrator is NOT blocked: the lock exists to stop whoever else holds config.manage re-basing the figure, and locking the admin out of their own switch only teaches them to leave it off (0138). Restore: objective.sql',
        -- The lock has ONE door: objective_cutoffs carries a read policy and NO
        -- write policy, so set_objective_cutoff() is the only way in. The
        -- trigger still guards the older per-objective cutoff_date/cutoff_days.
        (to_regprocedure('public.objective_cutoff_locked()') is not null
     and to_regprocedure('public.set_objective_cutoff_lock(boolean)') is not null
     and exists (select 1 from pg_trigger
                  where tgrelid = 'public.quality_objectives'::regclass
                    and tgname = 'zz_quality_objectives_cutoff_guard')
     and not exists (select 1 from pg_policies
                      where schemaname = 'public' and tablename = 'objective_cutoffs'
                        and cmd <> 'SELECT'))),
    (107, 'Objective: the Installation Base carries the WHOLE Product Master row', 'objective_evidence returns `details` jsonb on a machine row -- everything the Product Master upload kept in products.extra under the SPREADSHEET''S OWN HEADINGS (Item Details Long, Item Details, Sold Through, State, City, Address, Item Code, PO No., PO Date). Nine of the sixteen columns Failure Analysis needs have no column anywhere; the importer is declared extraInto:extra and keeps them. ONE jsonb rather than nine typed columns, so the next field wanted is a line on the page and not another drop-and-recreate of a function four files define (0140). Restore: objective.sql',
        coalesce((select pg_get_function_result(p.oid) like '%details%'
                    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                   where n.nspname = 'public' and p.proname = 'objective_evidence'
                   limit 1), false)),
    (108, 'Reliability template: the "Merge WRR" sheet, filled from the register', 'reliability_wrr(product) returns the fourteen columns of the reliability workbook''s Merge WRR sheet -- ONE ROW PER VISIT, because a call attended three times is three services in a reliability study. Failure fields come from the DCCR, whose columns ARE the template''s headings (any_potential_effect, spare_category, root_cause_keyword). PM calls are excluded: the sheet carries its own "Date of last preventive maintenance" column, which would be meaningless if a PM were a service row. Cancelled calls never appear (0141). Restore: objective.sql',
        to_regprocedure('public.reliability_wrr(text)') is not null),
    (109, 'Reports: the spare consumption report', 'consumption_report -- one row per spare booked, with its call and that call''s LATEST visit around it. The first sixteen columns are the user''s own sheet in its own order (mandatory on the screen); the rest of spare_consumption and the call fields follow, off by default. `part` is "CODE|Description" in the table and two columns on the sheet, so the view splits it ONCE. The two visit dates disagree on purpose -- entry is when the register was told, visit is when the engineer was there. security_invoker, so a reader sees only the calls their role allows (0142). Restore: performance.sql',
        (to_regclass('public.consumption_report') is not null
     and coalesce((select array_to_string(reloptions, ',') like '%security_invoker=on%'
                     from pg_class where relname = 'consumption_report'
                       and relnamespace = 'public'::regnamespace), false)
     and coalesce((select column_name = 'UC Number' from information_schema.columns
                    where table_schema = 'public' and table_name = 'consumption_report'
                      and ordinal_position = 1), false))),
    (110, 'Tracker: the shared activity list', 'tracker_items + tracker_list -- the in-app backlog. ONE permission does everything: mod:/tracker grants the page AND the right to add and edit, because "all who have access should be able add, edit" is the whole access model and two rights would take two ticks to undo. Granted to ADMIN only on apply; anyone else is added by hand on Roles & Permissions, because "a few other" is a choice and not a default. created_by/updated_by are stamped by a TRIGGER, and an edit cannot rewrite who raised it. Nothing is auto-deleted: Done and Dropped stay on the list and the page hides them (0143). Restore: tracker.sql',
        (to_regclass('public.tracker_items') is not null
     and exists (select 1 from pg_policies
                  where schemaname='public' and tablename='tracker_items' and policyname='tracker_rw')
        -- BY NAME, not `'public.tracker_items'::regclass` -- that cast resolves
        -- at PLAN time and takes the WHOLE report down on a project without the
        -- table. Third time this trap has come up; it is always the same shape.
     and exists (select 1 from pg_trigger tg
                  join pg_class c on c.oid = tg.tgrelid
                  join pg_namespace n on n.oid = c.relnamespace
                 where n.nspname = 'public' and c.relname = 'tracker_items'
                   and tg.tgname = 'zz_tracker_items_stamp')
     and coalesce((select array_to_string(reloptions, ',') like '%security_invoker=on%'
                     from pg_class where relname = 'tracker_list'
                       and relnamespace = 'public'::regnamespace), false))),
    (111, 'RBAC: the Technical Support role', 'app_roles carries `technical_support` -- EVERY module key the admin role holds, so no page is hidden, plus `data.view_all` so the call pages are not empty, and only actions that READ. What makes it read-only is what it does NOT hold: every write in this database is gated by a policy naming the action it needs, so the refusal is Postgres''s and not a hidden button. TWO EXCEPTIONS, both by earlier design: the Tracker is one permission for view and edit (the user''s own rule), and fb_write accepts feedback.view -- so this role can add on those two pages. Untick the module or the action to close either. `admin.view` is the new key that opens the administration screens read-only (0145). Restore: rbac.sql',
        (to_regclass('public.app_roles') is not null
     and exists (select 1 from public.app_roles r where r.role = 'technical_support'
                  and r.permissions ? 'data.view_all' and r.permissions ? 'admin.view'
                  and r.permissions ? 'mod:/users')
        -- Read-only is the CLAIM, so it is what gets checked: not one action
        -- that any write policy asks for, bar the two known exceptions above.
     and not exists (
           select 1 from public.app_roles r,
                lateral jsonb_array_elements_text(r.permissions) g(v)
            where r.role = 'technical_support'
              and g.v in ('calls.create','calls.edit','calls.report','calls.cancel','calls.allot',
                          'masters.edit','cover.edit','ownership.transfer','review.edit',
                          'spare.request','spare.dispatch','spare.drop','stock.transfer','stock.return',
                          'consumption.reconcile','pending.register','request.create','install.create',
                          'docs.manage','qms.manage','users.manage','config.manage','rbac.manage')))),
    (112, 'Reports: Not Consumed Against this Call', 'unused_spare_report -- spare lines DISPATCHED or RECEIVED against a call and not fully accounted for in that call''s consumption: NOT USED where none of the part was booked, SHORT where less was booked than was sent. Aggregated per call and part rather than per line, so a part sent twice and booked once is not two false findings. Refused and dropped lines are EXCLUDED: nothing arrived, so nothing could be fitted, and flagging them would send somebody to look for a part that was never in the van. Matched on the part CODE, because both sides store CODE|Description and the description drifts -- matching the whole string reports a part as unused when somebody re-typed its name. A voided consumption still counts as booked (0049 keeps the row). security_invoker, so a reader sees only the calls their role allows (0147). Restore: performance.sql',
        (to_regclass('public.unused_spare_report') is not null
     and coalesce((select array_to_string(reloptions, ',') like '%security_invoker=on%'
                     from pg_class where relname = 'unused_spare_report'
                       and relnamespace = 'public'::regnamespace), false))),
    (113, 'Spare Insights, and the Part Master that feeds it', 'spare_insights(date,date) -- consumption over a window, five ways: the biggest consumers, the cover fitted under, the products, the consumable/spare split and the shape by month. SECURITY INVOKER, so a reader sees only the consumption their role allows; a definer would hand an engineer the whole company''s figures through a dashboard. Voided lines are excluded (a corrected entry is not consumption) and both ends of the window are inclusive. Plus the Item Master''s own fields on `parts` -- category (Spare/Consumable/Product/Labour, blank on 86% of that file and reported as Unclassified rather than guessed), product family, purchase cost, and the superseded system''s stamps as source_* (0148/0149). Restore: performance.sql',
        (to_regprocedure('public.spare_insights(date,date)') is not null
     and exists (select 1 from information_schema.columns
                  where table_schema='public' and table_name='parts' and column_name='category')
     and exists (select 1 from information_schema.columns
                  where table_schema='public' and table_name='parts' and column_name='purchase_cost')
        -- NOT a definer: that is the property, not the presence of the function.
     and not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                      where n.nspname='public' and p.proname='spare_insights' and p.prosecdef))),
    (114, 'RBAC: the stored roles carry every page', 'A new page is INVISIBLE until a role holds its key: DEFAULT_PERMS in the app is only a fallback for a role whose app_roles row is EMPTY, and every role here has a populated row. So adding a module in code grants it to nobody -- the nav asks can(''mod:/x''), the stored list lacks it, and the page never appears, with no error. 0151 catches the stored rows up: Spare Insights to every role that already holds consumption.view (derived, so an administrator''s own tuning decides it), and PM Bulk Upload + Software Validation to admin and technical_support -- the latter because "every module key the admin holds" is what that role IS, and a new admin page skipping it would break that silently. Restore: rbac.sql',
        (to_regclass('public.app_roles') is null
      or (exists (select 1 from public.app_roles where role = 'admin'
                   and permissions ?& array['mod:/spare-insights','mod:/pm-bulk-upload','mod:/software-validation'])
         -- The property, not the presence: Technical Support must still hold
         -- every module key the admin does.
     and not exists (
           select 1 from public.app_roles a, lateral jsonb_array_elements_text(a.permissions) m(v)
            where a.role = 'admin' and m.v like 'mod:%'
              and not exists (select 1 from public.app_roles ts
                               where ts.role = 'technical_support' and ts.permissions ? m.v))))),
    (115, 'Part category: free text, so a bulk upload cannot be refused over it', 'A CHECK on parts.category can ABORT AN IMPORT PART-WRITTEN -- it did, on the Item Master: 173 rows written, then "violates check constraint parts_category_check" and a half-updated table. 0148 named the right four words but put them in the wrong place. 0152 drops the constraint and replaces it with nothing: a word the vocabulary does not know now lands in the data and shows in Spare Insights as its own bar, which is how somebody notices it, rather than the row never arriving. Blank still means "nobody has said" and still reads as Unclassified. NO means the constraint is still there and a non-standard category will stop the next Part Master upload. Restore: performance.sql',
        (to_regclass('public.parts') is null
      or not exists (select 1 from pg_constraint where conname = 'parts_category_check'))),
    (74, 'masters: write rights are PER LIST', '0067 replaced the blanket masters_write with per-list insert/update/delete. 0008 recreates it through execute format(), so replaying rbac.sql used to bring it back -- and policies are OR''d, so masters.edit wrote every list again. 0121 drops it at the end of rbac.sql now. Restore: masters.sql',
        not exists (select 1 from pg_policies
                     where schemaname='public' and tablename='masters' and policyname='masters_write')),
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
