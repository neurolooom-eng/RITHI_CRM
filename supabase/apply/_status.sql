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
    (77, 'DCCR: the register answers "is this a frequent failure?"', 'frequent_failure(ucn) -- the PROCEDURE''s rule (0153), not 0117''s approximation of it: earlier calls on the same machine within the window, matched on the same complaint OR the SAME PART fitted, counted INCLUDING the call under review against the threshold. Window, threshold and whether the equipment path needs a matching complaint are editable in Admin Config; the defaults are the procedure''s (1 month, 2, on). NO means 0117 is still in force -- a six-month window that flags failures the procedure would not, a count that reads one short, and no same-part path at all. Restore: daily_review.sql',
        (to_regprocedure('public.frequent_failure(text)') is not null
     and to_regprocedure('public.frequent_failure_rule()') is not null
         -- The property, not the presence: the old shape must be GONE, or a
         -- stale caller keeps getting the old answer.
     and to_regprocedure('public.frequent_failure_history(text,integer)') is null)),
    (78, 'spares: reject and drop in bulk, and somebody can actually drop', 'decide_spare_lines() -- approve / reject / drop many at once, each at the stage it is AT, a reason required for the last two. AND the spare.drop permission 0036 never granted to any role (0118). Restore: Spare_1.sql',
        (to_regprocedure('public.decide_spare_lines(bigint[],text,text,text)') is not null
     and exists (select 1 from public.app_roles where permissions ? 'spare.drop'))),
    (79, 'DCCR: Review 2 in bulk, except inside the first year', 'bulk_set_review2() -- answers Review 2 for many calls at once and REFUSES any that failed under 366 days or whose age is unknown; those are reviewed one by one (0119). Restore: daily_review.sql',
        to_regprocedure('public.bulk_set_review2(text[],text,text,text,text)') is not null),
    (80, 'registers: a layout can be set for a ROLE', 'role_table_views + set_role_table_view() / my_table_view() -- columns, order, widths and grouping, per role (role '' = everyone). set_at is stamped by the database, so the reader''s own arrangement and the administrator''s are ranked by WHEN, not by who (0120). Restore: rbac.sql',
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
    (111, 'RBAC: the Technical Support role', 'app_roles carries `technical_support` with EVERY module key the admin role holds, plus `data.view_all` so the call pages are not empty and `admin.view` for the administration screens read-only (0145). THIS ROW TESTS WHAT THE BUNDLE PROVIDES, and no longer tests that the role holds nothing that writes -- which it did, and which made it LIE. An administrator ticked `review.edit` on this role deliberately (2026-09-13) and chose to keep it; the row then read NO on a project where rbac.sql was fully applied, and sent somebody to re-run a bundle that cannot fix it, because 0145 MERGES and never removes. A row that answers NO when nothing is missing is worse than no row -- it teaches the reader that a NO here may mean nothing. What makes the role read-only is still what it does NOT hold, and that is now a QUESTION rather than a verdict: run _zoho_diag.sql, which reports the write actions on this role and on Zoho Migration and says plainly that a grant is somebody''s decision to review, not a bundle to run. NO here means the role is absent or the bundle has not been applied. Restore: rbac.sql',
        (to_regclass('public.app_roles') is not null
     and exists (select 1 from public.app_roles r where r.role = 'technical_support'
                  and r.permissions ? 'data.view_all' and r.permissions ? 'admin.view'
                  and r.permissions ? 'mod:/users'))),
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
    (116, 'RM Approval sees the REQUEST, not just the part', 'spare_pending_rm carries the complaint as well as the call, customer, product, SERIAL, cover, request type and date (0154). "Is this part plausible for this fault?" is most of what an approver decides, and the queue could not answer it. NO means the complaint column reads blank on that screen; everything else on it was already in the view and needed no SQL. The view is DROPPED and rebuilt rather than replaced, because create-or-replace can only append columns and 0116''s narrower definition has to stay replayable after this -- and security_invoker is re-asserted, or every signed-in user reads every engineer''s requests. Restore: Spare_1.sql',
        (to_regclass('public.spare_pending_rm') is null
      or (exists (select 1 from information_schema.columns
                   where table_schema='public' and table_name='spare_pending_rm' and column_name='complaint')
          -- The property, not the presence: a view over RLS tables without this
          -- reads as its OWNER, silently.
     and coalesce((select 'security_invoker=on' = any(reloptions) from pg_class
                    where relname = 'spare_pending_rm'
                      and relnamespace = 'public'::regnamespace), false)))),
    (117, 'Zoho Migration: read-only, and free to diverge', 'zoho_migration exists and holds NO WRITE ACTION (0155 seeds it, 0180 keeps it honest). A CLONE SEEDS A ROLE ONCE AND IS NOT A STANDING MIRROR (the user''s rule, 2026-09-13, and it applies to all cloning here) -- so this row NO LONGER TESTS THAT THE TWO MATCH. It used to, and that was wrong twice over: two roles kept identical forever are one role with two names, and the point of a separate role is that it CAN diverge -- narrowed as the migration proceeds, revoked when it ends, without touching the support login. Divergence is the expected state, not drift. What is left is the property that actually defines the role: it holds none of the actions a write policy names, so a refusal is Postgres''s and not the browser''s. THIS ROW EARNED ITS KEEP: it reported NO on the live project and the cause was real. `review.edit` grants ALL commands on call_reviews, and a user on the role answered Review 2 with Risk to Patient = Yes, fired the 0167 trigger and raised FFR - 001/26 in their own name -- a record 0166 means can never be deleted. It arrived by the old merge: an administrator ticked review.edit on TECHNICAL SUPPORT deliberately (it stays there, the user''s decision) and every run of rbac.sql copied it across. NO means the role is absent, or holds a write action -- check WHICH with _zoho_diag.sql before changing a permission, since one of those is somebody''s decision and the other is a leak. Restore: rbac.sql',
        (to_regclass('public.app_roles') is null
      or (exists (select 1 from public.app_roles where role = 'zoho_migration')
          -- The property that defines the role. NOT that it mirrors its source.
     and not exists (
           select 1 from public.app_roles zm, lateral jsonb_array_elements_text(zm.permissions) m(v)
            where zm.role = 'zoho_migration'
              and m.v in ('calls.edit','masters.edit','users.manage','rbac.manage','spare.dispatch',
                          'review.edit','cover.edit','consumption.reconcile'))))),
    (118, 'Super admin: mmdev74@gmail.com is revoked', 'Asked for 2026-09-09. SUPER ADMIN IS THREE PLACES and all three had to change, or the account keeps real access: `app_super_admins` (what is_super_admin() reads, so what POSTGRES allows), SUPER_ADMINS in src/lib/auth.tsx (what the BROWSER offers -- leave it and the screens hand them every button while the database refuses each one, which reads as the app being broken rather than as access withdrawn), and profiles.role, since is_admin() is role=''admin'' OR the super-admin row -- dropping only the row can leave an ordinary Admin standing. 0156 does the first and third; the second shipped in the same change and `npm run check:ui` compares the two lists. Downgraded to `engineer`, the least this codebase can express -- there is no "no access" ROLE; locking the account out entirely is deactivating the User Master row, deliberately NOT assumed. NO means they are still a super admin or still an Admin. Restore: rbac.sql',
        (to_regclass('public.app_super_admins') is null
      or (not exists (select 1 from public.app_super_admins where lower(email) = 'mmdev74@gmail.com')
     and not exists (select 1 from public.profiles
                      where lower(email) = 'mmdev74@gmail.com' and lower(coalesce(role,'')) = 'admin')))),
    (119, 'Tracker: the points open at the end of 2026-09-09 are on the list', 'The six items 0157 seeds -- assign the Zoho Migration role, un-park the auto-apply pipeline, Indoor Service Phase 1, the condemn/salvage decision, the optional party tidy-up, and the unlabelled error in the spare_bulk_approval suite. Checked by TITLE, which is also how the seed decides whether to add: the file is additive and idempotent, so it never re-adds one and never closes one. This row exists because a SEED had no way of being told apart from a bundle that was never run -- every other row here tests an object, and rows are not objects. It reads yes once ANY status: an item somebody has since marked Done or Dropped still counts as on the list, since closing it is the point. NO means tracker.sql has not been run since v0.9.181. Restore: tracker.sql',
        -- tracker_items is READ THROUGH query_to_xml for the same reason
        -- cron.job is on row 85: a plain reference is resolved when this
        -- statement is PLANNED, so a project that has never run tracker.sql
        -- would fail the WHOLE report rather than report this one row as NO --
        -- and that is precisely the project the row is for.
        (case when to_regclass('public.tracker_items') is null then false
              else coalesce((xpath('/row/c/text()', query_to_xml(
                     $q$select count(*) as c from public.tracker_items where title in (
                          'Assign the Zoho Migration role to a login',
                          'Un-park the auto-apply pipeline (one character)',
                          'Indoor Service: Phase 2 (the call loop) and Phase 3 (QC criteria)',
                          'DECISION: who may condemn a unit, and where a salvaged part goes',
                          'Party spellings: run the tidy-up, or leave it',
                          'The spare_bulk_approval suite emits an unlabelled error')$q$,
                     false, true, '')))[1]::text::int = 6, false)
         end)),
    (120, 'Indoor Service: the workshop register', 'indoor_jobs + indoor_job_accessories + indoor_job_parts + indoor_job_checks, and the guard that makes the rights real (0158, procedure 4.5). TWO AXES: `kind` says whose property the unit is, which turns the custody duties of 7.5.10 on or off; `activity` says what is being done to it. The call is OPTIONAL -- a DEMO unit has no call -- which is why this is a register in its own right rather than a stage a call can be in. This row tests the PROPERTY, not the presence: it fails if indoor_job_list has lost security_invoker (a workshop register reading as its owner hands every signed-in user every job), if the guard trigger is missing (indoor.qc, indoor.dispatch and indoor.condemn would become hidden buttons rather than rights), or if the decontamination gate on harvested parts is gone. NO means the page will be empty or absent. Restore: indoor.sql',
        (to_regclass('public.indoor_jobs') is not null
     and to_regprocedure('public.next_indoor_job_no()') is not null
     and exists (select 1 from pg_policies
                  where schemaname='public' and tablename='indoor_jobs' and policyname='indoor_read')
        -- The two triggers are what turn the separated rights into rights. A
        -- register with the tables and neither guard looks identical on screen.
     and exists (select 1 from pg_trigger tg join pg_class c on c.oid = tg.tgrelid
                  join pg_namespace n on n.oid = c.relnamespace
                 where n.nspname='public' and c.relname='indoor_jobs'
                   and tg.tgname='zz_indoor_jobs_guard')
     and exists (select 1 from pg_trigger tg join pg_class c on c.oid = tg.tgrelid
                  join pg_namespace n on n.oid = c.relnamespace
                 where n.nspname='public' and c.relname='indoor_job_parts'
                   and tg.tgname='zz_indoor_job_parts_guard')
     and coalesce((select array_to_string(reloptions, ',') like '%security_invoker=on%'
                     from pg_class where relname = 'indoor_job_list'
                       and relnamespace = 'public'::regnamespace), false))),
    (121, 'KPI export: the date range narrows the calls FIRST', 'kpi_field_inst looks up reports and spare_requests through LATERAL joins keyed on the call in hand, instead of pre-aggregating the WHOLE of both tables into CTEs the caller''s date range could not reach (0159). It matters far more than it sounds: under RLS, reading `reports` re-runs the call-visibility stack -- reports_read carries an EXISTS over the `calls` VIEW, which is itself three RLS-protected tables -- so scanning every visit row ran that nest per row. Measured on a register of 24,000 calls / 55,000 visits, one month of the export: 27,273 ms as a signed-in Hotline engineer, 618 ms after. As SUPERUSER it was 160 ms either way, which is why nothing caught it -- every check runs as the owner unless somebody signs in. This row tests for the lateral shape AND re-asserts security_invoker, which create-or-replace drops. NO means the export still times out for anyone who is not an administrator. Restore: performance.sql',
        (to_regclass('public.kpi_field_inst') is not null
     and coalesce((select definition ilike '%lateral%' from pg_views
                    where schemaname='public' and viewname='kpi_field_inst'), false)
     and coalesce((select array_to_string(reloptions, ',') like '%security_invoker=on%'
                     from pg_class where relname = 'kpi_field_inst'
                       and relnamespace = 'public'::regnamespace), false)
     and to_regclass('public.spare_requests_ucn_idx') is not null)),
    (122, 'Cascades read the party list from the PRODUCT register', 'product_party_names -- distinct party_name from `products`, with the machine count, in ONE request (0160). Every Party->Product->Serial picker reads it: the Party Master is a list somebody maintains, the product register is the record of what EXISTS, and a party with no machines cannot answer "whose machine is this?" -- picking one returned an empty product list with nothing on screen to say why. It also closes the case-mismatch class, since the name you pick now comes from the same column the machines are looked up by. Installation calls are the one exception and fall back to the Party Master and free text, because an installation reaches a customer who has no machine yet. Tests security_invoker as well: without it the view reads as its owner. NO means the pickers fall back to the Party Master -- they still work, they just offer parties that cannot cascade. Restore: performance.sql',
        (to_regclass('public.product_party_names') is not null
     and coalesce((select array_to_string(reloptions, ',') like '%security_invoker=on%'
                     from pg_class where relname = 'product_party_names'
                       and relnamespace = 'public'::regnamespace), false))),
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
                  and definition ilike '%spare_consumption_history%'))),
    (139, 'Customer Feedback: one per call, so a re-load corrects it', 'feedback.ucn_key + feedback_ucn_key_uniq (0186). The user: "Feedback has KEY - Simply use it." They were right and the export proves it -- v2Feedback has 24,749 rows and 24,748 DISTINCT UC Numbers with ZERO repeats. One feedback per call is what the register always was; nothing enforced it, and the upload''s own note admitted "No natural key, so a re-run ADDS rows". THE INDEX IS TOTAL, NOT PARTIAL, and the first version of the file got that wrong: `where ucn_key <> ''` looks like the careful thing and check:upserts refused it -- NO INFERABLE UNIQUE INDEX -- because a partial index is no more inferable than an expression one. A blank UCN keys off ITS OWN ROW (row-<id>) instead, so it is unique by construction, the index covers every row, and no feedback is deleted to tidy an index. FILED IN data_integrity, not base: base creates the table in 0001 but REFUSES to run once RBAC is in, so a migration there would never reach a live project. NO means loading the export twice duplicates the register. Restore: data_integrity.sql',
        -- BY SHAPE, NOT BY NAME, and 0188 is why. The first version of this
        -- row looked for `feedback_ucn_key_uniq` and checked its definition
        -- for a WHERE -- right about the predicate, and blind to an index
        -- under any other name. PostgREST does not read names either: it
        -- needs SOME unique index on (ucn_key) that is neither partial nor an
        -- expression. Ask what it asks.
        (to_regclass('public.feedback') is null
         or exists (select 1 from pg_index i
                     where i.indrelid = 'public.feedback'::regclass
                       and i.indisunique and i.indpred is null and i.indexprs is null
                       and pg_get_indexdef(i.indexrelid) ilike '%(ucn_key)%'))),
    (138, 'Additional Entry Details: keyed on the machine, not the serial', 'product_additional_entries is keyed on the MODEL AND THE SERIAL, and carries `extra` (0185). Reported from use as "nothing loadable, every row is missing serial number" when loading the AppSheet AdditionalEntryDetails export -- which read as the FILE being wrong. The missing serial was an alias gap (the export says "Product Serial Number"), and fixing it exposed the real fault underneath. MEASURED, not read off the SQL: that file has 2,263 rows and 1,920 distinct serials, and 298 SERIALS BELONG TO MORE THAN ONE PRODUCT -- serial 15 is an ANAVENT and an ORION, serial 239 is four machines -- so 640 rows would have collapsed to 298 and THREE HUNDRED AND FORTY-TWO MACHINES would have vanished on a load reporting success. This project already wrote the rule down in src/lib/machine.ts: a machine is its MODEL plus its SERIAL, never the serial alone, recorded there with the incident where an ORION-G 201 request was offered an open call for VEGA 201. 0077 keyed this table on serial_key alone, contradicting it. A GENERATED STORED column so the index is a plain btree, not an expression one check:upserts refuses. The table also gained `extra`: the export has 24 columns and this table names nine, so the other seventeen -- AE Number, PM VISITS, ACCESSORIES INCLUDED?, Already Sold TO -- were being dropped, alone among the importers here. NO means the serial-only key is still in force and loading that export loses machines quietly. Restore: sales_contracts.sql',
        (exists (select 1 from pg_indexes where schemaname='public'
                  and indexname='product_additional_entries_machine_key_uniq')
     and not exists (select 1 from pg_indexes where schemaname='public'
                      and indexname='product_additional_entries_serial_key_uniq')
     and exists (select 1 from information_schema.columns
                  where table_schema='public' and table_name='product_additional_entries'
                    and column_name='extra'))),
    (137, 'Ownership Transfer: a machine already there does not stop the file', 'ownership_transfer_apply() fills from_party ONLY WHERE THE MASTER CAN ANSWER (0182). Reported from use: loading the Ownership Transfer register answered "violates check constraint ownership_transfer_parties_differ (row ~1) (0 written before it stopped)". 0072 fills a blank from_party from the MACHINE MASTER -- right while the master still shows the PREVIOUS owner, wrong the moment it has caught up, because the fill then returns the DESTINATION party itself: from and to come out identical and the constraint refuses the row. One such row stopped the whole file. Not a rare corner either -- a Product Master imported from the live system already names each machine''s CURRENT owner, so loading the transfer HISTORY into it hits this on the last hop of every machine, and the register is least loadable exactly when the master is most correct. Filling it with the destination is NEVER right: "Apollo to Apollo" is not a fact, it is the master saying it cannot answer, so from_party is left EMPTY instead -- which is what the column''s own default already means. The CONSTRAINT IS UNTOUCHED on purpose: a transfer between one party and itself is not a transfer, and that invariant is worth keeping; what was wrong was manufacturing a value that broke it. NO means 0072''s unconditional fill is still in force and the register will stop on its first already-current machine. Restore: sales_contracts.sql',
        (to_regprocedure('public.ownership_transfer_apply()') is not null
     and coalesce((select prosrc like '%v_holder%'
                     from pg_proc where proname = 'ownership_transfer_apply'), false)
          -- the constraint must still be there: the fix is the fill, not the rule
     and exists (select 1 from pg_constraint
                  where conname = 'ownership_transfer_parties_differ'))),
    (136, 'Field Failure Register: one report can cover several machines', 'ffr_no_machine_uniq (0181), and the single-column key is GONE. Found while loading the register back to 2016: EIGHT FFR numbers in the 2016-2019 tabs appear on more than one row, and they are not mistakes -- 16/18 covers serials 252, 253, 254 and 255, one report written for four units that failed the same way, and FQI-18-0113 covers three. Keyed on the number ALONE, 20 rows became 8 and TWELVE MACHINES VANISHED: not with an error, but overwritten by the next row carrying the same number, which is the worst way for a quality record to go. The identity is now the report AND the machine, so each keeps its own serial and installation date and a failure can still be counted per unit. A plain btree over two columns rather than a coalesce, because product_serial is already not null default '''' -- an expression index is not a conflict target check:upserts will accept, and two rows with no serial must still collide rather than multiply on every re-load. WHAT IS GIVEN UP: the database no longer refuses a second report reusing a number with a different machine. That guarantee was doing less than it appeared -- next_ffr_no(yr) issues from the highest already on record and ffr_stamp refuses to let an issued number be edited -- so a report raised HERE still cannot collide. NO means the pair index is missing, and loading the old years will silently lose rows. Restore: daily_review.sql',
        (exists (select 1 from pg_indexes
                  where schemaname = 'public' and indexname = 'ffr_no_machine_uniq'
                    and indexdef like '%(ffr_no, product_serial)%')
     and not exists (select 1 from pg_constraint
                      where conname = 'field_failure_reports_ffr_no_key'))),
    (135, 'Field Failure Register: a row loaded from a sheet says so', 'imported_from + the exception in ffr_stamp() (0179). The user, 2026-09-13: "I want Provision to upload FFR Data from 2016 -- I think every year it has a Different Format -- But it needs to be able to merge all into 1 Table." One table, one uploader, keyed on the FFR number, and every heading a year does not share with the others kept verbatim on the row. This is what has to be TRUE IN THE DATABASE for that to be safe. `imported_from` names the file a row came in from and EMPTY means this system raised it -- a real column rather than a flag in `extra`, because the point of it is to FILTER and to COUNT (URS-037: migrated data stays distinguishable, and a figure over both reports the split). AND ffr_stamp() no longer claims the report: it sets raised_by from auth.uid() on a report raised here, and leaves it NULL on an imported one, or whoever ran the upload is recorded as having raised a failure report nine years before they touched it. The sheet''s own "Raised by" still lands in raised_by_name, which is what the document prints; the uuid is left null, because there is no account behind that name and inventing a link is worse than admitting there is none. The register VIEW is dropped and rebuilt rather than replaced -- it selects f.*, so a new column arrives in the MIDDLE of its output and create-or-replace can only APPEND -- and security_invoker is re-asserted with it, or every signed-in user reads every report. NO means the upload will be refused for an unknown column, so this row is the one to check before loading a year. Restore: daily_review.sql',
        (exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'field_failure_reports'
                    and column_name = 'imported_from')
     and coalesce((select prosrc like '%imported_from%'
                     from pg_proc where proname = 'ffr_stamp'), false)
     and exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'field_failure_register'
                    and column_name = 'imported_from')
     and coalesce((select array_to_string(c.reloptions, ',') like '%security_invoker=on%'
                     from pg_class c join pg_namespace n on n.oid = c.relnamespace
                    where n.nspname = 'public' and c.relname = 'field_failure_register'), false))),
    (134, 'The visits and spares behind a report are readable', 'ffr_call_context() (0178). Reported with two screenshots: an ADMINISTRATOR saw the register''s right-hand pane populated and somebody granted ffr.view saw "0 visits" on the SAME report. 0176 made READING THE REGISTER a right; it could not on its own make the CALL readable, and the pane loads `reports` and `spare_consumption` — both scoped to CALL VISIBILITY. So a role that may read every report still saw an empty pane beside every one of them: the same half-granted shape as the register itself, one layer down. A FUNCTION rather than five policy edits, deliberately: widening it through the policies would mean touching reports_read (owned by call_requests), cons_read (owned through a GUARDED MIRROR that check:bundles compares word for word) and the three call tables — five policies across three modules, each a chance to widen something nobody asked for. NARROW BY CONSTRUCTION: it returns nothing unless the caller may read the register AND the UCN actually has a report, so it is not a general call reader; and it returns NULL rather than raising to anybody else, so the application falls back to the tables and nobody loses a visit their own policies already allow. NO means the right-hand pane is empty for everyone without call visibility. Restore: daily_review.sql',
        (to_regprocedure('public.ffr_call_context(text)') is not null
     and coalesce((select prosrc like '%field_failure_reports%'
                     from pg_proc where proname = 'ffr_call_context'), false))),
    (133, 'Reading the Field Failure Register is its own right', 'ffr.view + ffr_read (0176) and ffrh_read (0177). Reported from use: a role holding ffr.manage AND the page key opened the register and it was EMPTY. ffr_read (0165) tested NEITHER permission — its only clause reaching an ordinary user was "a call you can see", and `calls` is security_invoker, so the register was scoped to CALL VISIBILITY and ffr.manage granted the right to WRITE a register its holder could not READ. That is the "role that sees NOTHING" fault wearing a new coat, and worse than a missing permission because everything LOOKS granted — menu entry present, page opens, box ticked. `ffr.view` now grants the whole register, and the screen says so when it comes up empty rather than looking broken. IT WIDENS NOTHING ON APPLY: only roles that already held ffr.manage are given it, and the old scope is KEPT — a report on your own call is still yours without being granted anything. From here an administrator grants the register role by role (the user''s decision, 2026-09-12). NO means the register is still scoped to call visibility and granting the page will not put rows on it. Restore: daily_review.sql, then data_integrity.sql',
        (exists (select 1 from pg_policy p join pg_class c on c.oid = p.polrelid
                  where c.relname = 'field_failure_reports' and p.polname = 'ffr_read'
                    and pg_get_expr(p.polqual, p.polrelid) like '%ffr.view%')
     and exists (select 1 from pg_policy p join pg_class c on c.oid = p.polrelid
                  where c.relname = 'ffr_history' and p.polname = 'ffrh_read'
                    and pg_get_expr(p.polqual, p.polrelid) like '%ffr.view%'))),
    (132, 'Field Failure Register: every change is recorded', 'ffr_history + its two triggers (0174). "I need to be able to capture everytime it is updated - For log keeping." ONE ROW PER UPDATE holding {column: {from, to}} for only the columns that actually differ, with the person and the time. IN THE DATABASE, not the client: the application''s audit trail is client-written, so it records what a screen chose to report and NOTHING of an edit made straight through the API — a change history a caller can decline to write is not a change history. An update that changes nothing writes nothing, and updated_at is never an entry on its own. APPEND-ONLY BY OMISSION: there is no insert, update or delete policy on the table, so it cannot be forged, edited or tidied through the application, and 0166''s deletion guard is armed on it as well. Reading needs ffr.manage or admin. NO means amendments to a report are not being recorded anywhere. Restore: data_integrity.sql',
        (to_regclass('public.ffr_history') is not null
     and exists (select 1 from pg_trigger tg join pg_class c on c.oid = tg.tgrelid
                  where c.relname = 'field_failure_reports' and tg.tgname = 'zz_ffr_history')
     and not exists (select 1 from pg_policy p join pg_class c on c.oid = p.polrelid
                      where c.relname = 'ffr_history' and p.polcmd in ('a','w','d')))),
    (131, 'The Daily Call Review records WHO reviewed it', 'call_reviews.review2_by_uid / review3_by_uid + zzz_call_review_reviewer (0173). The screen stamped a reviewer only when somebody pressed Save — but the same review is completed by AUTO-SAVE and by the bulk path, neither of which sends a name, so reports were raised naming "Daily Call Review": a screen, not a person. The identity now comes from auth.uid() in the database at the moment a stage becomes COMPLETE, on every write path, and the display name is filled from User Master where the client sent none. A LATER EDIT DOES NOT RE-STAMP — the person who answered the review is the reviewer, not whoever last fixed a typo. The trigger evaluates completion from the SOURCE columns rather than reading review2_done, because Postgres computes a GENERATED column AFTER the BEFORE triggers: the first version read it, got NULL and stamped nothing everywhere. raise_ffr() carries the name onto the report and no longer writes a screen''s name at all. OLD records take their reviewer from ffr_reviewer_backfill() (0175), which finds the person by NAME AND ROLE — "Bagyaraj would be mapped as nsm" — because a prefix match on the spelling alone misses "M Bagyaraj" and cannot tell two people apart. It REFUSES TO GUESS: several matches, or keys that disagree, change nothing, since a quality record naming the wrong person is worse than one naming nobody. Dry run by default; re-runnable after somebody is added to User Master (select * from public.ffr_reviewer_backfill(p_apply => true)). NO means new reviews record nobody. Restore: daily_review.sql',
        (to_regprocedure('public.call_review_reviewer_stamp()') is not null
     and exists (select 1 from information_schema.columns
                  where table_schema='public' and table_name='call_reviews' and column_name='review2_by_uid')
     and exists (select 1 from pg_trigger tg join pg_class c on c.oid = tg.tgrelid
                  where c.relname = 'call_reviews' and tg.tgname = 'zzz_call_review_reviewer')
     and coalesce((select prosrc not like '%Daily Call Review%' from pg_proc where proname = 'raise_ffr'), false)
     and to_regprocedure('public.ffr_reviewer_backfill(boolean,text,text)') is not null)),
    (130, 'A user may save their signature', 'user_signatures + remove_user_signature() + user_signature_status() (0172). The user''s ask (2026-09-12). READ AND WRITTEN BY ITS OWNER AND NOBODY ELSE — not a manager, not an administrator: a mark a second person can obtain is one they can put on anything, and a mark a second person can SET is one nobody signed. Its own table rather than a column on profiles, because RLS grants by ROW: a policy letting somebody save a signature on their profile row lets them rewrite every other field on it, and that row is where privilege lives. An administrator can ask WHO has saved one (user_signature_status(), a definer FUNCTION and deliberately not a view — a definer view over RLS tables is the fault 0040/0050/0057 shipped three times) and can REMOVE a leaver''s (remove_user_signature()), but never read one: a plain DELETE policy for an administrator does not work at all, because Postgres applies the SELECT policy to a DELETE that has to find its row. A document prints a saved signature only when the person printing it is the person the block names. NO means nobody can save one and every signature block prints empty, as it does today. Restore: rbac.sql',
        (to_regclass('public.user_signatures') is not null
     and to_regprocedure('public.remove_user_signature(uuid)') is not null
     and to_regprocedure('public.user_signature_status()') is not null
     and exists (select 1 from pg_policy p join pg_class c on c.oid = p.polrelid
                  where c.relname = 'user_signatures' and p.polname = 'usig_read'
                    and pg_get_expr(p.polqual, p.polrelid) not ilike '%is_admin%')
     and coalesce((select relrowsecurity from pg_class
                    where relname = 'user_signatures'
                      and relnamespace = 'public'::regnamespace), false))),
    (129, 'Stock Out is a page of its own', 'mod:/stock-out on every role that has mod:/spare-dispatch (0171). The flat list of what Stores has ISSUED was a tab on Pending Dispatch, so the right to read it was the right to open the queue — one key for two questions asked by different people. Nobody loses anything: the grant MERGES into app_roles, so every role reading the tab yesterday reads the page today, and from here the two can be granted apart. A role with NO permissions at all is deliberately left alone — an empty array means "not configured" and has_perm() falls back to the code defaults, so writing one key into it would turn the fallback off and leave the role holding exactly one permission. NO means the roles that could open Pending Dispatch have not been given the new page; an administrator can also tick it on Roles & Permissions. Restore: rbac.sql',
        (exists (select 1 from public.app_roles
                  where permissions ? 'mod:/spare-dispatch'
                    and permissions ? 'mod:/stock-out')
      or not exists (select 1 from public.app_roles where permissions ? 'mod:/spare-dispatch'))),
    (128, 'Field Failure Register: the catch-up is available', 'raise_ffr() + backfill_ffrs() + next_ffr_no(smallint) (0169). "Create all the FFRs till date": every review already answered YES for Any Potential Effect before 0167 shipped has no report, and this raises them. ONE CODE PATH — the trigger and the catch-up both call raise_ffr(), or the catch-up would be a second, subtly different register. THE NUMBER IS IN THE REVIEW''S YEAR, not today''s: a 2025 review numbered /26 is wrong on the face of the document, so next_ffr_no() now takes the year (the zero-argument signature is DROPPED, because a defaulted argument beside it leaves the call site ambiguous). DRY RUN BY DEFAULT — select * from public.backfill_ffrs() reports what it would create and issues nothing; backfill_ffrs(false) creates them, oldest review first, and skips any call that already has a report, so running it twice is harmless. Administrator only THROUGH THE API — 0170 aims the gate at callers that arrive through PostgREST, because 0169''s is_admin() reads auth.uid(), which is NULL in the Supabase SQL editor: it refused the administrator typing the catch-up into the only place it is ever run. A direct database connection already has every table, so a role check inside one guards nothing. NO means the catch-up cannot be run. Restore: daily_review.sql',
        (to_regprocedure('public.raise_ffr(public.call_reviews)') is not null
     and to_regprocedure('public.backfill_ffrs(boolean)') is not null
     and to_regprocedure('public.next_ffr_no(smallint)') is not null
     and to_regprocedure('public.next_ffr_no()') is null
     and coalesce((select prosrc like '%raise_ffr%' from pg_proc where proname='ffr_from_review'), false)
     -- 0170's gate, or the SQL editor is still locked out of it.
     and coalesce((select prosrc like '%request.jwt.claims%' from pg_proc
                    where proname = 'backfill_ffrs'), false))),
    (127, 'Field Failure Register: the REVIEW raises it', 'zz_ffr_from_review on call_reviews + the field_failure_register view (0167). The user''s rule (2026-09-12): a call answered YES for ANY POTENTIAL EFFECT in the Daily Call Review creates an FFR from the review''s own details, dated the day REVIEW 2 WAS COMPLETED. It is a trigger rather than a screen action because any_potential_effect is a GENERATED column — the answer is made by writing the review, and a register that waits for somebody to press a button afterwards has holes in it. ONE PER CALL: review 2 is edited and re-saved constantly and every write fires this, so all but the first must do nothing. It never undoes itself either — an answer later changed to NO leaves the report standing (0049''s rule), and the register shows that as "withdrawn" rather than deleting a quality record. The VIEW is the record beside the call as it stands now, which is what the register is read for; it carries security_invoker, or every signed-in user would read every report. NO means reports are not raised automatically and the register shows no live data. Restore: daily_review.sql',
        (exists (select 1 from pg_trigger tg join pg_class c on c.oid = tg.tgrelid
                  join pg_namespace n on n.oid = c.relnamespace
                 where n.nspname='public' and c.relname='call_reviews'
                   and tg.tgname='zz_ffr_from_review')
     and to_regclass('public.field_failure_register') is not null
     and coalesce((select array_to_string(reloptions, ',') like '%security_invoker=on%'
                     from pg_class where relname = 'field_failure_register'
                       and relnamespace = 'public'::regnamespace), false)
     -- THE DATE RULE MOVED. "The FFR is dated the day Review 2 was completed"
     -- was tested inside ffr_from_review; 0169 made the trigger a thin wrapper
     -- so the trigger and the catch-up share ONE definition of the record, and
     -- the rule now lives in raise_ffr(). Testing the old home reported NO on a
     -- database where the rule is present and working.
     and coalesce((select prosrc like '%review2_at%' from pg_proc
                    where proname = 'raise_ffr'), false)
     and coalesce((select prosrc like '%raise_ffr%' from pg_proc
                    where proname = 'ffr_from_review'), false))),
    (126, 'Field Failure Register: the register, its number and its retention', 'field_failure_reports + next_ffr_no() + the stamp and retention triggers (0165, 0166). The format is the Field_Failure_Register workbook''s 2026 tab; the report is R-SER-03 Rev 02, generated by the app. Raised from the Daily Call Review, where somebody decides a failure goes to manufacturing. THE NUMBER IS THE DATABASE''S: FFR - NNN/YY restarting each year, and SEEDED PAST WHAT IS ALREADY ON RECORD — the 2026 tab reaches FFR - 035/26, so a counter starting at one would re-issue numbers that exist on paper. This row tests the PROPERTY: the table, the number generator, the stamp trigger (which also refuses to let an issued number be edited), the retention trigger (filed in data_integrity, because block_hard_delete lives there and that module runs later — putting it beside the table failed a fresh apply), and that the write policy asks for the right rather than admitting anyone. NO means the page will be empty or nobody can raise a report. Restore: daily_review.sql, then data_integrity.sql for the retention trigger.',
        (to_regclass('public.field_failure_reports') is not null
     -- THE NUMBER GENERATOR, IN ITS CURRENT SIGNATURE. This asked for
     -- next_ffr_no() — the ZERO-ARGUMENT form — which 0169 DROPPED on purpose,
     -- so the row read NO on a fully-applied database and sent somebody to
     -- re-run a bundle that was already in. A check must follow the definition
     -- it tests when a later migration replaces it; the one that does not goes
     -- on reporting a fault that is not there, which is worse than no check
     -- because it is acted upon.
     and to_regprocedure('public.next_ffr_no(smallint)') is not null
     and exists (select 1 from pg_trigger tg join pg_class c on c.oid = tg.tgrelid
                  join pg_namespace n on n.oid = c.relnamespace
                 where n.nspname='public' and c.relname='field_failure_reports'
                   and tg.tgname='zz_ffr_stamp')
     and exists (select 1 from pg_trigger tg join pg_class c on c.oid = tg.tgrelid
                  join pg_namespace n on n.oid = c.relnamespace
                 where n.nspname='public' and c.relname='field_failure_reports'
                   and tg.tgname='no_hard_delete')
     and exists (select 1 from pg_policies
                  where schemaname='public' and tablename='field_failure_reports'
                    and policyname='ffr_write' and with_check ilike '%ffr.manage%')
     and exists (select 1 from public.app_roles where role='admin' and permissions ? 'ffr.manage'))),
    (125, 'Call requests: the read policy is an InitPlan, not per-row', 'cr_read asks can_view_all_calls(), auth.uid() and auth.email() ONCE per query rather than once per ROW (0164). Reported as "the Party drop-down keeps failing for the engineers -- it works perfectly fine for me", with `canceling statement due to statement timeout` on screen. The OR short-circuits at is_admin() for an administrator and does not for an engineer, which is exactly why one person saw it and the other did not; and the cost is the WHOLE TABLE rather than what the reader sees, since an engineer entitled to 112 requests still makes the database test every row to find them. Measured on 3,000 requests with genuinely partial visibility: engineer 1,840 ms -> 7.4 ms, administrator 189 ms -> 5.5 ms, with the rows returned to each proved byte-identical before and after. NO means the per-row version is in force and the Call Request page gets slower for engineers as the register grows. Restore: call_requests.sql -- 0164 must stay LAST in that module, because 0003 and 0053 both define cr_read.',
        coalesce((select qual like '%( SELECT can_view_all_calls%'
                    and qual like '%( SELECT auth.uid%'
                    and qual like '%( SELECT auth.email%'
                    from pg_policies
                   where schemaname='public' and tablename='call_requests' and policyname='cr_read'), false)),
    (124, 'Call Review: the second review, on the REPORT', 'call_report_reviews + the two rights (0163). A SECOND review and not the Daily Call Review: the DCCR asks what the failure WAS, this asks whether the report the engineer filed stands. It lists SOLVED calls only and lets the reviewer book a spare the engineer did not (a Reconciliation line -- "Reco"), re-open the call, or mark it Report Reviewed. This row tests the PROPERTY: the table, the stamp trigger (which discards a caller-supplied reviewer, as 0113 does on a call -- a review naming somebody who did not do it is worse than one naming nobody), and that the write policy asks for the right rather than admitting anyone who can see the call. The PAGE goes to six roles; the ACTION deliberately NOT to Technical Support or Zoho Migration, since what makes those read-only is what they do not hold -- one tick on Roles & Permissions grants it. NO means the page is absent or nobody can record a review. Restore: daily_review.sql',
        (to_regclass('public.call_report_reviews') is not null
     and exists (select 1 from pg_trigger tg join pg_class c on c.oid = tg.tgrelid
                  join pg_namespace n on n.oid = c.relnamespace
                 where n.nspname='public' and c.relname='call_report_reviews'
                   and tg.tgname='zz_call_report_reviews_stamp')
     and exists (select 1 from pg_policies
                  where schemaname='public' and tablename='call_report_reviews'
                    and policyname='crr_write' and with_check ilike '%callreview.mark%')
     and exists (select 1 from public.app_roles
                  where role = 'admin' and permissions ? 'callreview.mark'))),
    (123, 'Tracker: nobody is assigned to "Claude"', 'The tracker''s With whom names a TEAM somebody can chase, never a tool (the user''s rule, 2026-09-11): 0162 renames the eight seeded rows to NL Team. Like row 119 this tests ROWS rather than an object, and for the same reason -- a rename has nothing to point at. It also tests something an object check could not: 0162 must run LAST in the tracker module, because the bundles are replayed one at a time and the seeds that wrote the old value (0144, 0150, 0157) run in the same one. So a NO here does not mean the migration is missing; it means the ORDER broke and the seeds put the old value back, which is invisible from the migration alone. Restore: tracker.sql',
        -- Read through query_to_xml for row 119''s reason: a plain reference is
        -- resolved when this statement is PLANNED, so a project that has never
        -- run tracker.sql would fail the WHOLE report instead of this one row.
        (case when to_regclass('public.tracker_items') is null then true
              else coalesce((xpath('/row/c/text()', query_to_xml(
                     $q$select count(*) as c from public.tracker_items
                         where btrim(coalesce(owner, '')) ilike 'claude'$q$,
                     false, true, '')))[1]::text::int = 0, false)
         end)),
    (141, 'Cover: "about to expire" is the sheet''s thirty days', 'cover_state() bands the last THIRTY days before an end date, not sixty (0187). 0036 wrote 60 and said openly that the number was this application''s: the supplied AppSheet documentation described the four Status columns only as "a spreadsheet formula ... emits values including ABOUT TO EXPIRE, ACTIVE, INACTIVE" -- it named the outputs and withheld the rule. The formula export (Appsheet - Forms.xlsx) prints the rule, identically on all four sheets that carry the column -- SaleEntry M2, WarrantySaleDetails V2, ContractEntry L2, ContractDetails W2 -- as IF(end>=Today(),IF(end<=(Today()+30),"ABOUT TO EXPIRE","ACTIVE"),"INACTIVE"). Not cosmetic: the registers FILTER and COUNT by this value, so at sixty a contract with 45 days to run was listed as about to expire and chased a month early, and the tile''s count was a month too big. Tested by asking the function rather than by reading it, because that is the only way to tell 30 from 60 in a project that has run one bundle and not the other. NO means the sixty-day band is still live. Restore: sales_contracts.sql',
        (to_regprocedure('public.cover_state(date)') is null
         or (public.cover_state(current_date + 30) = 'ABOUT TO EXPIRE'
         and public.cover_state(current_date + 31) = 'ACTIVE'))),
    (142, 'Customer Feedback: a re-load may CORRECT, not only add', 'fb_update on public.feedback (0189). Reported from use the moment the key went live: "Your role does not have permission for this action. (row ~24093) (24092 written before it stopped.)" -- 24,092 rows inserted, then one COLLIDED, the upsert became an UPDATE, and the table had no UPDATE policy at all. 0001 gave it a read and an insert, 0008 narrowed those two to rights, and nothing ever updated a feedback row until 0186 gave the table a key. GIVING A TABLE A CONFLICT TARGET CHANGES WHICH POLICY THE IMPORTER NEEDS, and the gap shows only at the one moment an upsert earns its keep: the re-load. The audience is copied from fb_write VERBATIM, so this grants no new person any new reach -- whoever may file a feedback may correct one, which is the rule 0186 wrote down. NO means the feedback upload still stops at the first row that is already there. Restore: data_integrity.sql',
        (to_regclass('public.feedback') is null
         or exists (select 1 from pg_policies where schemaname='public'
                     and tablename='feedback' and cmd in ('ALL','UPDATE')))),
    (143, 'Stock Transfer Register: a re-load may CORRECT, not only add', 'st_update on public.stock_transfers (0123). The SAME hole the feedback key had, found by the check written for it -- check:upserts now asks whether the caller may WRITE the row it can infer, not only whether it can infer one. stock_transfers upserts on `uid` and 0020 gave it a read and an insert and no third, so the register loads once and stops dead on the first repeated transfer number of a re-load. It has not bitten only because nobody has re-loaded it. THE QUANTITIES ARE NOT AFFECTED: they live in stock_transfer_lines, which declares no conflict target at all. The audience is st_insert''s verbatim (`stock.transfer`), so nobody gains reach they had not got. NO means that register is load-once. Restore: stock_transfer.sql',
        (to_regclass('public.stock_transfers') is null
         or exists (select 1 from pg_policies where schemaname='public'
                     and tablename='stock_transfers' and cmd in ('ALL','UPDATE')))),
    (144, 'Objective 1 calculates itself', 'quality_objectives.calc_key = ''ffr_count_monthly'' on "No.of Field failures registered in FFR", and objective_value/objective_evidence/objective_notes answer it (0142). The user''s ask: "Automate / Calculate -> No.of Field failures registered in FFR ; Logic = No of FFRs registered for the Month". It was the last SERVICE objective still TYPED. The figure counts DISTINCT FFR NUMBERS rather than rows, because 0181 made the register one row per MACHINE and one report can cover several -- counting rows would report twelve failures where four reports exist. It is also the first COUNT on a page of RATES, so zero is an answer here where a rate over nothing stays blank. NO means the figure is still typed and Re-Calculate leaves it alone. Restore: objective.sql',
        (to_regclass('public.quality_objectives') is null
         or (exists (select 1 from public.quality_objectives where calc_key = 'ffr_count_monthly')
             and to_regprocedure('public.objective_value(bigint,integer)') is not null))),
    (145, 'Customer Feedback: the date on the record is the record''s own', 'feedback.entry_at + feedback.imported_from, with the dates backfilled out of `answers` (0190). Reported from use the moment the export loaded: "I think the Date is taken as 14Sep2026 for all Uploads , I wanted the Actual Dates as per the CSV not the Upload date -- It creates a Complaint issue." The register''s Date column read `created_at`, which is when the ROW was written, so twenty-four thousand feedbacks collected over two years all read as one afternoon. On a complaint record the date a customer complained is part of the record, not a detail of the storage. THE VALUES WERE NEVER LOST: the importer is `extraInto: ''answers''`, which keeps every unmapped column under its ORIGINAL SPREADSHEET HEADING, so "Visit Entry Date" was on every row -- measured at 24,748 of 24,749 filled in the user''s own file -- and 0190 reads it back out rather than asking for the upload again. `imported_from` answers the other half of the same question, "Can I segregate the Uploaded ones and the Ones that were entered in the new CRM?", in the same shape the Field Failure Register uses (0179). NO means the register is still showing the upload date. Restore: data_integrity.sql',
        (to_regclass('public.feedback') is null
         or (exists (select 1 from information_schema.columns
                      where table_schema='public' and table_name='feedback' and column_name='entry_at')
         and exists (select 1 from information_schema.columns
                      where table_schema='public' and table_name='feedback' and column_name='imported_from')))),
    (146, 'Reports: the Call Report and the Customer Feedback Report', 'call_report + feedback_report, both security_invoker (0191). The user: "Add Call Report , Customer Feedback Report -- Follow the Same concept of Consumption Report." One row per CALL on the first -- never per visit, or every count in the file would be wrong -- with the LATEST ENTRY''s visit beside it, which is sync_call_last_visit()''s ordering and not the latest visit date. One row per FEEDBACK on the second, with the export''s own questions as named columns, measured against the user''s v2Feedback file rather than invented: two are asked of every visit (24,748 of 24,749), four of a PM or field visit (23,759), four of an installation (1,009) -- so a BLANK on a question means it was not put, and the file says so. BOTH ARE security_invoker, which is the whole of their access story: a report view running as its OWNER hands every call in the company to anybody who can open the screen, and this project has shipped that fault twice. NO means the two report screens have nothing to read and will error rather than show an empty file. Restore: performance.sql',
        (to_regclass('public.call_report') is not null
     and to_regclass('public.feedback_report') is not null)),
    (147, 'Product Master: the catalogue of product LINES', 'public.product_master + product_line_sellable() (0193), and the module rename in 0192. The user: "Rename Product Master to Product Database" and "Add a Separate Product Master - Which is the Actual List of Product Lines ... All Inactive Products can never have a new Sale Entry, But can still have Contract or Calls". THE TWO NAMES SWAPPED, which is the risk this row exists for: public.products is the INSTALL BASE (one row per MACHINE) and is now labelled PRODUCT DATABASE at /product-database; public.product_master is the CATALOGUE (one row per PRODUCT CODE, 53 of them) at /product-master. KEYED ON THE CODE, measured rather than assumed: the user''s ProductList export has 53 rows, 53 distinct codes and 43 distinct NAMES -- CPX CARE alone has nine codes and they disagree about being active, so a rule written on the name would be wrong eight times on that product. 0192 CARRIES THE AUDIENCE: the module key IS the route, so without it every role holding mod:/product-master would silently stop seeing the install base and start seeing the catalogue; it merges mod:/product-database into every role that had the old key. NO means the catalogue is absent and the Sale Entry has no list of active lines to offer -- the form still works, because free text stays open. Restore: masters.sql and rbac.sql',
        (to_regclass('public.product_master') is not null
     and to_regprocedure('public.product_line_sellable(text,text)') is not null
     and exists (select 1 from public.app_roles where permissions ? 'mod:/product-database'))),
    (148, 'Product Database: every column of its export', 'Twenty-one new columns on public.products, and the backfill that reads them back out of `extra` (0194). The user: "Product Database has to retain all Columns - Attached a Sample. [v2_ProdMaster (1).csv]". Measured against that sample rather than guessed: it has 32 columns and eleven had a column here. THE OTHER TWENTY-ONE WERE NEVER LOST -- the importer is `extraInto: ''extra''` and kept every unnamed heading verbatim -- but a value in a jsonb blob cannot be sorted, filtered, grouped or shown as a column, which is exactly the fault 0148 fixed for the Part Master. So nobody is asked to upload again: the migration reads them out of what is already stored. THREE ARE NOT SIMPLY TEXT. `item_code` is the one that does WORK rather than display -- the Product Database had no product code at all, and it is what joins a machine to its line on the Product Master (0193). `warranty_status_keyed`/`contract_status_keyed` carry the export''s OWN ACTIVE/INACTIVE words, named apart from the state this system computes from the dates so the two can never be mistaken for each other. `pm_visits` is an integer and a blank stays NULL, because on a service schedule "nobody said" and "none" are different answers. The row tests the CODE, since that is the column another register depends on. NO means those values are still only in `extra`. Restore: masters.sql',
        (to_regclass('public.products') is null
         or exists (select 1 from information_schema.columns
                     where table_schema='public' and table_name='products'
                       and column_name in ('item_code','pm_visits','warranty_status_keyed')
                    group by table_name having count(*) = 3))),
    (150, 'Part Master: a part can be renamed without moving stock', 'public.rename_part() + part_rename_impact() + the part_rename_ticket capability (0196). The user: "I need to be able to Edit Part Master", and, asked before building: "Rename carries the history". A part''s identity here is the STRING CODE|Description and NOTHING HAS A FOREIGN KEY TO public.parts -- nine TABLES carry that string as a value (consumption and its history, issues, opening hand stock, request lines, dispatch lines, stock transfers, material returns, indoor job parts). HAND STOCK IS DERIVED from them, so a half-done rename does not merely lose a link: an engineer''s BALANCE CHANGES. One function, one transaction, all nine or none. IT IS NOT A MERGE: a name already taken is refused, because merging two parts means deciding what happens to two sets of stock. AND THE EXEMPTION IS UNFORGEABLE, which took two goes: the first version declared the rename in a transaction-local set_config, and set_config is callable by ANYBODY, so anyone who could update a consumption line could set the flag and re-point the line -- the one thing 0062''s guard exists to prevent. Proved by doing it, before it shipped. The ticket replaces it: a row in a table with RLS on, NO policy and no grants, written only by the definer-owned function and read only by the definer-owned guard. NO means the Edit button on Part Master will fail on any part that has history. Restore: handstock.sql',
        (to_regprocedure('public.rename_part(bigint,text,text)') is not null
     and to_regprocedure('public.part_rename_impact(text)') is not null
     and to_regclass('public.part_rename_ticket') is not null
     and (select relrowsecurity from pg_class where oid = 'public.part_rename_ticket'::regclass)
     and not exists (select 1 from pg_policies where tablename = 'part_rename_ticket'))),
    (151, 'DCCR: the review may correct which product failed', 'call_reviews.actual_product + field_failure_register.live_product_name / live_product_changed (0197). The user: "Accessory Issues are also Logged in the Main Product -- Like CPX Care Failure is logged in Extend-XT or Orion-G ... I can select the Actual Product [Accessory in this case] and the Failure is included in the Accessory and Excluded from the Main Product." THE ASK HAS TWO HALVES and one effective value satisfies both by construction: the report is counted ONCE, under whatever that value is. Two columns, or a flag beside the original, would let a count include it twice or neither -- and a Pareto that double-counts is worse than one merely wrong. THE CALL IS NEVER REWRITTEN: it says a machine was down and an engineer went to it, which stays true; the review records what actually FAILED, and both are readable with the difference exposed rather than hidden. The row tests the VIEW COLUMN rather than the table column, because the column alone changes no count -- it is the view every rate and Pareto reads. NO means Change product? saves and nothing moves. Restore: daily_review.sql',
        (to_regclass('public.field_failure_register') is null
         or exists (select 1 from information_schema.columns
                     where table_schema='public' and table_name='field_failure_register'
                       and column_name in ('live_product_name','live_product_changed')
                    group by table_name having count(*) = 2))),
    (152, 'Frequent failure: the second rule, across the fleet', 'frequent_failure() returns rule2_is_frequent, and frequent_failure_rule() returns rule2_window_days / rule2_serials / rule2_enabled (0198). The user: "Add more rule. Rule 2, Same Complaint across same product, but multiple serial nos in the last 30 days." THE TWO RULES ANSWER DIFFERENT QUESTIONS, which is why this is a second rule and not a wider first: rule 1 is one MACHINE repeating (same product AND serial); rule 2 is one MODEL failing the same way on DIFFERENT units -- the thing rule 1 can never see, because each of those calls is a first failure on its own machine. IT COUNTS DISTINCT SERIALS, NOT CALLS, and that is load-bearing: five visits to one machine are rule 1''s finding and must not read as a batch problem. The window is THIRTY DAYS held in days, not a month, those being different lengths in February. is_frequent is now EITHER rule -- a rule that did not change the verdict would be a report. NO means the second rule is not running and the screen answers on rule 1 alone. Restore: daily_review.sql',
        (to_regprocedure('public.frequent_failure_rule()') is null
         or ((public.frequent_failure_rule() ? 'rule2_window_days')
         and (public.frequent_failure_rule() ? 'rule2_serials')
         and (public.frequent_failure_rule() ? 'rule2_enabled')))),
    (149, 'Machine History and the two new Reports can be SEEN', 'mod:/machine-history, mod:/exports/calls and mod:/exports/feedback merged into every configured role (0195). The user: "Update the Roles & Permissions - Always when a New UI is introduced or when a UI is re-arranged -- This is often missed." Three screens shipped whose module key NO MIGRATION EVER GRANTED. A code default is not enough and that is the whole point of this row: permsForRole() returns the STORED set whenever it is non-empty, so DEFAULT_PERMS applies only to a role whose app_roles row is EMPTY -- and on a project in use every role has a tuned row. The screen ships, the menu entry exists, the permission is ticked in the code, and the page is invisible to all twelve roles with no error anywhere. Machine History is the severe one: it has no parent key, so nothing stood in for it. The two reports were partly covered by parentAction() making mod:/exports stand in for every mod:/exports/* -- but 0155 gave zoho_migration the report sub-pages ONE BY ONE, and a list written out in full goes stale. MERGED, never overwritten, and a role with ZERO permissions is left alone so its code fallback stays live. Tested on the machine-history key, which is the one with no parent to mask a failure. NO means those three screens are still invisible to everyone. Restore: rbac.sql',
        (to_regclass('public.app_roles') is null
         or not exists (select 1 from public.app_roles
                         where jsonb_array_length(permissions) > 0)
         or not exists (select 1 from public.app_roles
                         where jsonb_array_length(permissions) > 0
                           and not (permissions ? 'mod:/machine-history'))))
,
    (153, 'User Master is the master: a role set there reaches the sign-in', 'sync_profile_from_user_directory() + the user_directory_profile_sync trigger (0199). The user''s rule: "The intent and the fact has to match 100% -- the user master is the only place I can map and configure." TWO VALUES ANSWER TO THE NAME ROLE: user_directory.role is what User Master shows, profiles.role is what the sign-in RUNS ON -- the menu-bar chip, has_perm(), every policy. 0033 copies the first into the second exactly once, inside ensure_my_profile(), which returns early for a row that already exists; after that the only thing that copied it was a BUTTON IN THE BROWSER. So a role changed after somebody first signed in stayed in User Master and the application went on enforcing the old one, with nothing reporting the difference. Reported twice -- "Why is it now Engineer" (2026-09-11, which produced the drift banner: a repair for a problem still being created) and "Why is it showing as engineer and not Zoho Migration" (2026-09-15). THE ROW TESTS THE TRIGGER, NOT THE FUNCTION: a function nothing fires syncs nothing, and that is the failure mode a definition check would miss. It weakens no guard -- profiles_role_guard still refuses a self-change and still refuses to grant admin -- and it never applies a role the matrix does not know, so a typo grants nothing rather than something unintended. NO means User Master and the sign-in can disagree again, silently. Restore: rbac.sql',
        (to_regclass('public.user_directory') is null
         or exists (select 1 from pg_trigger
                     where tgrelid = 'public.user_directory'::regclass
                       and tgname = 'user_directory_profile_sync'
                       and not tgisinternal)))
,
    (154, 'Party Master: who looks after the customer', 'parties.service_engineer + party_service_engineer() (0200). The user: "In Party Master, my old source has service engineer details. So during any new field call or Installation calls or PM Call, it has to map the engineer as per the party master. In case of creating a call from a request, then it has to map it to the requestor. All the fields to be retained as is." The supplied export has a Serviceman on 4,677 of its 4,752 parties, 49 distinct names. IT IS A REAL COLUMN AND NOT A KEY IN `extra`: the importer is extraInto so the value arrives either way, but the call form has to LOOK IT UP on every registration and a jsonb blob is worst at exactly that -- the fault 0148 fixed for the Part Master and 0194 for the Product Database. PRECEDENCE, settled with the user before any of it was built: the MACHINE''s own Service Engineer still wins and the party answers only where the machine has none, so this widens where an engineer can be FOUND and changes no call that already found one. It matters most for an INSTALLATION, which reaches a customer who has no machine here at all, so the machine can never answer for it. IT IS A PREFILL AND NOTHING MORE -- allocated_to keeps no default and gains no trigger, because an assignment the database made would be a rule nobody could see on the form and nobody could correct at the keyboard once the party master went stale. The row tests the FUNCTION as well as the column: the column alone prefills nothing. NO means the Party Master cannot name an engineer and the box is empty wherever the machine has none. Restore: masters.sql',
        (to_regclass('public.parties') is null
         or (exists (select 1 from information_schema.columns
                      where table_schema='public' and table_name='parties'
                        and column_name='service_engineer')
         and to_regprocedure('public.party_service_engineer(text)') is not null)))
,
    (155, 'Party Master: the customer''s own columns, and somewhere for KYC', 'parties gains profile / route / pincode / the two contact blocks / gstin / pan / kyc_status, kyc_gstin() + kyc_pan(), and the parties_kyc_stamp trigger (0201). The user: "Additionally add provision to capture the KYC details of the customer. Clean up the columns, de-dupe the column headers." COUNTED, NOT ASSUMED, against the supplied export (4,752 parties): Profile is filled on every row with PRIVATE/GOVERNMENT and was being THROWN AWAY, because the importer aliased party_type to [type, profile] and Type wins; Office Name is OUR OWN COMPANY on all 4,752 rows so it gets no column; Under, Salesman and Tax 3 are entirely EMPTY so they get none either. DE-DUPED BY NAMING, not by numbering: the file carries Tel 1, Tel 2, Fax and Email ID TWICE -- once per address -- and the second of each reached NOTHING AT ALL until 0200, not even the kept-as-is blob. KYC IS THE FRAME AND NOT THE FIELDS: asked which to capture, the user said "I don''t know.. there is some format for KYC, I will update", so only what was decided is built -- every party starts PENDING (4,752 of them, because a number on file is not a verification and marking five rows Verified would be inventing an audit record) -- plus GSTIN and PAN, which are statutory and have a shape. THE NUMBER IS FOUND BY SHAPE, NOT BY FORMAT: the five values on record are PAN NO:..., GST NO:..., GSTIN:... and GSTIN: ... -- a label, a separator that is sometimes a colon and sometimes a space, then the number. ONE DEFINITION, called by the backfill AND by the trigger, or a file loaded next year is read differently from the file loaded today. The row tests the TRIGGER as well as the columns: columns nothing fills answer nothing. NO means Profile, the territory and the billing contacts are still in the blob and KYC has nowhere to go. Restore: masters.sql',
        (to_regclass('public.parties') is null
         or ((select count(*) from information_schema.columns
               where table_schema='public' and table_name='parties'
                 and column_name in ('profile','route','pincode','phone','billing_address',
                                     'billing_phone','billing_email','gstin','pan','kyc_status')) = 10
         and to_regprocedure('public.kyc_gstin(text)') is not null
         and exists (select 1 from pg_trigger
                      where tgrelid = 'public.parties'::regclass
                        and tgname = 'parties_kyc_stamp' and not tgisinternal))))
,
    (156, 'My Workload can be SEEN', 'mod:/workload merged into every configured role (0202). The user: "Remove such cards in Main Views. Move those to a Separate KPI Cards Page where ever applicable. It should be interactive." A NEW SCREEN IS NOT DONE UNTIL ROLES & PERMISSIONS KNOWS, and this is the part that bites: permsForRole() returns the STORED set whenever it is non-empty, so DEFAULT_PERMS reaches ONLY a role whose app_roles row is EMPTY -- and on a project in use every role has a tuned row. Without the migration the page ships, the menu entry exists, the permission is ticked in code, and the screen is invisible to every role with no error anywhere. That happened four times before 0195; check:ui caught it on this screen''s first build, which is what it is for. THE KEY GRANTS NO REACH: the page holds no authority of its own -- it shows a register''s section only where the reader already holds that register''s key, and a section they cannot open is never even requested, so a queue they may not read is never counted at them. MERGED, never overwritten, and a role with ZERO permissions is left alone so its code fallback stays live. NO means My Workload is invisible to everyone. Restore: rbac.sql',
        (to_regclass('public.app_roles') is null
         or not exists (select 1 from public.app_roles where jsonb_array_length(permissions) > 0)
         or not exists (select 1 from public.app_roles
                         where jsonb_array_length(permissions) > 0
                           and not (permissions ? 'mod:/workload'))))
,
    (157, 'Product Failure Analysis counts under the CORRECTED product', 'field_call_review carries actual_product / live_product_name / live_product_changed (0203), and mod:/product-failure is merged into every configured role (0204, renamed by 0205). The user: "Add one more analytics page to analyse all the data that is part of the daily call review." 0197 gave Review 2 a "Change product?" and taught field_failure_register to count under it; FIELD_CALL_REVIEW NEVER LEARNED. It is the view the register reads and the one the new page groups by, so every "which product fails" chart would have counted under the MAIN product and the correction would have changed nothing on the one screen built to see it -- the failure still reading as EXTEND-XT''s when somebody had said it was the CPX CARE''s. ONE EFFECTIVE VALUE, exactly as 0197 argued: live_product_name is the corrected product where one was chosen and the call''s where none was, so a failure is counted ONCE under whatever that is; two columns would let a count include it twice or neither, and a Pareto that double-counts is worse than one merely wrong. THE WHOLE VIEW IS RESTATED rather than appended to: the first version wrote `select fcr.* from field_call_review fcr` -- appending by selecting from ITSELF -- which Postgres accepts at creation and then answers with "infinite recursion detected in rules for relation". And security_invoker is re-asserted, because create-or-replace drops it and a view without it reads as its OWNER, which this project has shipped three times. THE ROW TESTS THE COLUMN AND THE KEY: a view nobody can open analyses nothing. THE KEY IS THE ROUTE, so the rename from mod:/dccr-insights was a permissions change: the moment the route moved, every role''s old key stopped opening anything and the page went invisible with no error anywhere -- which is the case the standing rule hides best, because the screen was already working for everybody. NO means the page counts under the uncorrected product, or is invisible. Restore: daily_review.sql, then rbac.sql',
        (to_regclass('public.field_call_review') is null
         or (exists (select 1 from information_schema.columns
                      where table_schema='public' and table_name='field_call_review'
                        and column_name = 'live_product_name')
         and (to_regclass('public.app_roles') is null
           or not exists (select 1 from public.app_roles where jsonb_array_length(permissions) > 0)
           or not exists (select 1 from public.app_roles
                           where jsonb_array_length(permissions) > 0
                             and not (permissions ? 'mod:/product-failure'))))))
,
    (158, 'A chart somebody builds can be kept, and shared safely', 'saved_charts + its three policies and the stamp trigger (0206). The user: "Add a provision to create a chart by myself and save it", having asked earlier whether it could be saved "for Everyone or for Specific roles" -- so scope is part of the feature. MODELLED ON role_table_views (0120) DELIBERATELY: that table already answers "this configuration belongs to a role, or to everyone" for register layouts, and a second answer to the same question would be a second set of rules to keep in step. THREE SCOPES and the difference is who else is affected -- MINE (owner = the person, role NULL, anybody may make one), A ROLE, and EVERYONE; the last two need config.manage or an administrator, the same authority 0120 requires to set a layout for a role, because it is the same act. SHARING A CHART CAN NEVER SHARE DATA: the row holds a DIMENSION and a chart type, never numbers, and the counting happens in the reader''s own session over rows their own RLS allowed -- so a chart shared with somebody who may see less simply shows less. THE OWNER IS STAMPED, NOT SENT (0113''s rule): a caller-supplied owner is DISCARDED rather than refused, which is the better behaviour -- refusing makes an honest client fail, discarding makes a dishonest one harmless. The row tests the TABLE and the WRITE policies together, because a table anybody could share from would be worse than none. NO means saved charts are gone, or shareable by anyone. Restore: rbac.sql',
        (to_regclass('public.saved_charts') is null
         or ((select relrowsecurity from pg_class where oid = 'public.saved_charts'::regclass)
         and (select count(*) from pg_policies
               where tablename = 'saved_charts'
                 and policyname in ('sc_read','sc_write_mine','sc_write_shared')) = 3
         and exists (select 1 from pg_trigger
                      where tgrelid = 'public.saved_charts'::regclass
                        and tgname = 'saved_charts_stamp' and not tgisinternal))))
,
    (159, 'The two analysis roles can read the data they analyse', 'data.view_all + the read gates merged into vptechnical and rndengg (0207). Reported from use: "Spare Insights is blank for VPTechnical Role", then "Product Failure Analysis is also Blank for VpTechnical." Both pages were in the menu, both opened, both showed zeros. THE MODULE KEY OPENS A SCREEN; IT DOES NOT SHOW THE ROWS, and that is the whole bug -- the failure mode the standing rule about Roles & Permissions does not cover, because the screen WAS granted correctly and the database still answered with nothing. Product Failure Analysis reads field_call_review, which is built FROM field_calls, so what a reader sees is bounded by the CALL policies (has_perm(''calls.view'') AND visibility); Spare Insights reads spare_consumption, whose cons_read is can_view_all_calls() OR mine OR my team''s, and an analysis role raises no consumption and has no reporting team, so every branch is false. can_view_all_calls() names the OFFICE roles literally and neither of these is one, so the per-role grant built for exactly this case -- data.view_all -- is what they are given, together with the has_perm gates each read path tests FIRST: a role that sees nothing is usually the gate rather than the scope, and here it was both. READ ONLY: not one key granted here writes anything. ONLY THOSE TWO ROLES ARE TOUCHED (the user: "Never Touch those Roles & Permissions. Modify only the VPTechnical and RnDEngg Role") -- rgm, rm and engineer cannot match either pattern the migration uses. NO means the analytics pages are blank for whoever analyses them. Restore: rbac.sql',
        (to_regclass('public.app_roles') is null
         or not exists (select 1 from public.app_roles
                         where regexp_replace(lower(coalesce(role, '')), '[^a-z0-9]', '', 'g')
                               in ('vptechnical', 'rndengg', 'rndengineer')
                           and jsonb_array_length(permissions) > 0)
         or not exists (select 1 from public.app_roles
                         where regexp_replace(lower(coalesce(role, '')), '[^a-z0-9]', '', 'g')
                               in ('vptechnical', 'rndengg', 'rndengineer')
                           and jsonb_array_length(permissions) > 0
                           and not (permissions ? 'data.view_all' and permissions ? 'calls.view'
                                and permissions ? 'consumption.view'))))
,
    (160, 'Cover is one word, and WARRANTY is WGP', 'cover_code() + the stamp triggers and the backfill (0208). Reported from use, looking at Failures per cover: "What is this Warranty? It has to be Normalized -- Warranty is WGP -- Where ever this DAta is feeding - Fix that as well." The chart read CMC 880, OGP 374, WGP 56, AMC 3 and WARRANTY 1 -- not a fifth kind of cover, one cover spelled differently by whatever loaded it. A SECOND SPELLING IS WORSE THAN A WRONG ONE on this dimension: every count and share is a GROUP BY, so two spellings do not read as a small error, they SPLIT the total silently and the reader believes both halves. One row was the visible edge; the same load could have carried a thousand. NORMALISED AT THE DATABASE, NOT IN THE CHART -- rewriting the label where it is drawn leaves the stored value wrong for the DCCR grid, the exports and the spare-approval rule that asks whether an item is AMC or OGP, and the next screen shows the split again. THE TRAP, and the reason the match is on the whole squashed string: "OUT OF WARRANTY" contains the word, so a substring rule turns one cover into its OPPOSITE, which is a worse answer than the split it was fixing. AN UNRECOGNISED VALUE IS LEFT EXACTLY AS IT IS, never guessed into a bucket: a wrong cover on a failure answers "manufacturing question or wear question" wrongly, and a spelling nobody anticipated staying visible as itself is how this one was found. THE ROW TESTS THE FUNCTION AND THE TRIGGERS: the function alone corrects history and lets the next import undo it. NO means the covers can split again. Restore: data_integrity.sql',
        (to_regclass('public.field_calls') is null
         or (exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                      where n.nspname = 'public' and p.proname = 'cover_code')
         and (select count(*) from pg_trigger
               where tgname in ('field_calls_cover_code', 'installation_calls_cover_code',
                                'pm_calls_cover_code', 'products_cover_code',
                                'spare_requests_cover_code', 'contract_items_cover_code')
                 and not tgisinternal) = 6
         and not exists (select 1 from public.field_calls
                          where item_status is distinct from public.cover_code(item_status)))))
,
    (161, 'How RITHI Functions reaches four roles and no others', 'mod:/knowledge-base/how-it-works merged into admin, nsm, zoho_migration and technical_support (0209). The user: "How RITHI Functions - Limit Exposure to Admin, NSM, Zoho, Technical Support." The page shipped that morning as alwaysOpen -- not a module at all, open to everybody, like the two help pages beside it -- and is a module with a key now. REMOVING A MENU ENTRY DOES NOT RESTRICT A PAGE: the route still answers and anybody sent the address still reaches it, so the permission is the restriction and the menu merely follows it. AND A CODE DEFAULT REACHES NOBODY: permsForRole() returns the STORED set whenever it is non-empty, so on a project in use -- where every role has a tuned row -- ticking the box in DEFAULT_PERMS grants it to no one until this runs. The standing rule, and the direction is the same whether the change WIDENS or NARROWS. THE ROW CHECKS BOTH HALVES, because "limit exposure" is two statements and a migration that grants the four while leaking to a fifth passes every check that only looks at the four: every one of the four holds it, and nobody outside them does. A role with ZERO permissions is left alone, here as everywhere -- an empty array means "not configured" and writing one key into it would switch the fallback off and take everything else away. NO means the page is either invisible to the people who need it or visible to people who should not have it. Restore: rbac.sql',
        (to_regclass('public.app_roles') is null
         or not exists (select 1 from public.app_roles where jsonb_array_length(permissions) > 0)
         or (not exists (select 1 from public.app_roles
                          where role in ('admin','nsm','zoho_migration','technical_support')
                            and jsonb_array_length(permissions) > 0
                            and not (permissions ? 'mod:/knowledge-base/how-it-works'))
         and not exists (select 1 from public.app_roles
                          where permissions ? 'mod:/knowledge-base/how-it-works'
                            and role not in ('admin','nsm','zoho_migration','technical_support')))))
,
    (162, 'A HandStock request goes to NSM', 'spare_needs_nsm() + spare_is_handstock() and the line guard (0210). The user: "For Handstock request - NSM has to approve the request." Before this ONE rule decided both middle stages -- spare_needs_review(item_status) = AMC or OGP -- and a HandStock request has NO MACHINE, so no item status, so the rule was FALSE: the RM''s approval stamped BOTH Commercial and NSM ''Auto-Approved'' in the same write and the line went straight to Stores. Replenishment left the building on one signature. The two stages stop sharing a rule because they no longer ask the same question: Commercial is AMC/OGP as before, NSM is AMC/OGP OR HandStock. THE RULE MOVED OUT OF THE STAGE FUNCTION AND INTO WHAT IS STAMPED, which is why spare_line_stage keeps its six arguments: SEVEN migrations call it (0016, 0025, 0031, 0055, 0116, 0118, 0154) and three define views whose current definitions live in the later files, so a seventh argument would be a lot of surface for one rule -- and a six-argument version left beside a seven-argument one answers the OLD rule, correctly-looking, for anything still calling it. The stage now reads the recorded columns alone, which is the more honest reading: a stage reports the decisions on the record rather than re-deriving from the cover whether a decision was required. THAT IS ONLY SAFE BECAUSE 0210 FIRST PINS TODAY''S MEANING INTO THE DATA -- every line the old rule waved through has ''Auto-Approved'' written into the columns it waved through, without a by/at, because nobody decided them and inventing an approver on a quality record is worse than an outcome with no name against it. Without that step every settled line would march backwards out of Stores into Commercial. THE ROW TESTS THE RULE AND THE GUARD: the rule alone would be decoration, since the RM would simply stamp NSM themselves in the same write, exactly as they legitimately may on a Call-Based CMC line. AND IT COUNTS ALL THREE GUARDS STEP 2 DROPS. The backfill has to switch off spare_request_lines_guard, spare_request_lines_dispatch_guard and spare_requests_stage_guard to write approval columns nobody decided, and this migration''s first version put back only the first two -- nothing caught it, because check:replay compares FUNCTIONS and the function was untouched; only the TRIGGER was gone. What that cost was measured, not guessed: an engineer holding spare.request alone is the requester, so sr_update lets them write their own request, and with that trigger off ONE update carried it past RM, Commercial, NSM and Stores to Received -- the per-line RBAC never ran because no line was touched. So the count is 3 and not 1: a migration that drops a guard to do its work and leaves it off is a class, not an incident. NO means HandStock replenishment goes out on one signature again, or one of the three guards is off the table. Restore: Spare_1.sql',
        (to_regclass('public.spare_requests') is null
         or (exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                      where n.nspname = 'public' and p.proname = 'spare_needs_nsm')
         and public.spare_needs_nsm('', 'HandStock')
         and public.spare_needs_nsm('AMC', 'Call Based')
         and not public.spare_needs_nsm('CMC', 'Call Based')
         and not public.spare_needs_commercial('')
         and (select count(*) from pg_trigger
               where not tgisinternal
                 and (tgrelid, tgname) in (
                   ('public.spare_request_lines'::regclass, 'spare_request_lines_guard'),
                   ('public.spare_request_lines'::regclass, 'spare_request_lines_dispatch_guard'),
                   ('public.spare_requests'::regclass,      'spare_requests_stage_guard'))) = 3)))
,
    (163, 'Who dispatched a stock out is stamped, not sent', 'my_display_name() + the spare_dispatches_stamp_actor trigger (0211). Reported from use: "dispatched_by -- Is not actually taking the Name based on the USer. Kasturi is Dispatching whereas it still shows Jagadesh." THE NAME ON A DELIVERY CHALLAN IS DATA, and it came from the CALLER -- dispatch_spare_lines(..., p_actor) writes whatever the app sent into spare_dispatches.dispatched_by, and the line rows copy it from there. So a fault in the app was a fault on a document that leaves the building with the company''s mark on it. And the app was sending the wrong thing: SpareDispatch.tsx read user?.name, and the User type has no `name` -- it has fullName. It type-checked ONLY because BaseRecord carries an index signature, so the value was undefined at runtime every time and fell through to the email, with no error anywhere. THE SAME RULE AS A CALL''S REGISTRANT (0113/0114): a caller-supplied value is DISCARDED, not refused -- refusing makes an honest client fail, discarding makes a buggy one harmless. A TRIGGER RATHER THAN A REWRITE, and that is the design: this migration''s first draft edited dispatch_spare_lines against 0027''s version, which is FOUR revisions out of date -- the live one carries partial dispatch (per-line quantities, the outstanding balance, the refurbished flags, the spare_dispatch_lines rows) and a tidied copy of the old body would have silently deleted all of it. AN ADMINISTRATIVE CONNECTION HAS NO SESSION, so there the supplied value is kept: blanking it would lose the only record of who booked the stock out. NOTHING ALREADY DISPATCHED IS REWRITTEN. NO means a delivery challan can name somebody who did not send it. Restore: Spare_1.sql',
        (to_regclass('public.spare_dispatches') is null
         or (exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                      where n.nspname = 'public' and p.proname = 'my_display_name')
         and exists (select 1 from pg_trigger
                      where tgrelid = 'public.spare_dispatches'::regclass
                        and tgname = 'spare_dispatches_stamp_actor' and not tgisinternal))))
    -- NOT A ROW HERE: the missing "Monthly" payment schedule. It was a fault in
    -- the FORM (a picker with three of the sheet's four values and no free-text
    -- fallback), not in the database -- contract_entries.payment_schedule is
    -- free text and always accepted it. A row that can only ever answer yes is
,
    (164, 'A blank name is not a manager', 'visible_engineer_names() refuses to recurse from an empty name (0212). Reported from use: "Why is a Regional Manager able to see everyone''s call and every spare request?" The function walks the directory DOWNWARDS from the caller -- everyone whose reporting_manager or regional_manager is the caller, then everyone under them -- and the walk matched on name equality with NOTHING excluding the empty string from either side. So a caller whose own user_directory row has a blank name asked for everyone whose manager is '''' and got every row with no manager recorded. That is the shape a partial import, a trimmed cell or a row keyed only by email leaves behind. MEASURED ON A FIXTURE, BOTH WAYS: with the name present a regional manager saw his three and himself; with it blank he saw two STRANGERS and lost one of his own, because the root no longer matched the people who name him. The second list is the dangerous one -- it is not obviously wrong, it just looks like a different region, and nobody reading it could tell. THE FIX ONLY EVER NARROWS: a tree node with a blank name stops recursing, so a caller the directory cannot name sees no team at all -- the honest answer, and they still see their own work through the read policies'' other branches, which match on user id and email rather than on name. The comparison itself is left exactly as it was: adding btrim() to both sides would also make '' HARSH RM '' match ''HARSH RM'', which is a WIDENING and a different decision. NO means a manager with no name on the directory sees strangers'' calls and spare requests. Restore: user_directory.sql',
        (to_regprocedure('public.visible_engineer_names()') is null
         or pg_get_functiondef(to_regprocedure('public.visible_engineer_names()')) ~ 'btrim\(coalesce\(t\.name'))
,
    (165, 'Stores and Spare Coordinator see every row', 'data.view_all merged into stores_incharge and spare_coordinator, and INTO NOBODY ELSE (0213). The user, 2026-09-18: "data.view_all --- Stores In Charge, Spare Co-ordinator should be able to view all Rows." THE ROW CHECKS BOTH HALVES, because a grant is two statements: everyone named holds it, and nobody else does. The second is the one that matters here -- the user''s standing rule is that Regional Manager, Reporting Manager and Engineer are exactly as they set them, so the second half names those three explicitly and fails if any of them picks it up. It does NOT police a whitelist of everyone else: technical_support and zoho_migration hold data.view_all legitimately from 0145, and the first version of this row asserted against a fixed list and therefore read NO on a perfectly correct database -- which is the one thing a row here must never do. Commercial was named in the same message as a MODULE being worked on rather than a role to grant, so it is deliberately not included and is checked against. WHAT THIS DOES AND DOES NOT CHANGE: both roles ALREADY pass can_view_all_calls(), which names them directly, and every policy in this database consulting data.view_all consults that function too -- all three of them (handstock_opening, spare_consumption_history, spare_issue_history). So the grant is belt and braces: it states the intent on Roles & Permissions and keeps working for a role KEY that is not one of the six hard-coded names. IF ROWS ARE STILL MISSING AFTER THIS THE PERMISSION WAS NOT THE CAUSE -- both routes read profiles.role, so somebody whose profile says ''stores'' rather than ''stores_incharge'' matches neither; _who_can_this_person_see.sql row 2 prints what their profile actually holds. A role with ZERO permissions is skipped on purpose, since an empty array means not-configured and writing one key into it switches the engineer fallback off. NO means those two cannot see every row, or somebody else can. Restore: rbac.sql',
        (to_regclass('public.app_roles') is null
         or (not exists (select 1 from public.app_roles
                          where role in ('stores_incharge', 'spare_coordinator')
                            and jsonb_array_length(permissions) > 0
                            and not (permissions ? 'data.view_all'))
         and not exists (select 1 from public.app_roles
                          where permissions ? 'data.view_all'
                            and role in ('rgm', 'rm', 'engineer')))))
    -- worse than no row: this report is read to decide WHAT TO RUN.
)
select bundle,
       case when present then 'yes' else 'NO  <-- apply this' end as applied,
       provides
  from checks order by sort_order;
