-- ===========================================================================
-- TABLE HEALTH -- orphans, duplicates, blanks, full-table scans, and the
-- security settings the table review flagged.
--
-- READ-ONLY, no editing. Paste and run. ONE result grid, one row per check:
--   area | check | n | what_it_means
--
-- Written for the table review of 2026-09-26, which was done on a database
-- BUILT FROM THE MIGRATIONS -- one with no real data in it. Everything below
-- is what only the live project can answer: how many rows are actually
-- affected, and whether the live grants match the repository's.
--
-- It uses only tables and columns that have existed for months, so it runs on
-- a project that has NOT yet applied 0243, 0244 or 0245.
--
-- HOW TO READ n: 0 is good on every row EXCEPT the "Full scans" rows, where n
-- is how many times the table was read end to end since the statistics were
-- last reset -- a large n on a large table is the one worth an index.
-- ===========================================================================
with calls_all as (
  select ucn from public.field_calls
  union all select ucn from public.installation_calls
  union all select ucn from public.pm_calls
),
checks(area, sort, chk, n, meaning) as (
  -- ---- ORPHANS: a link that points at nothing ------------------------------
  select 'Orphans', 1, 'Visits whose UCN matches no call',
         (select count(*) from public.reports r
           where coalesce(btrim(r.ucn), '') <> ''
             and not exists (select 1 from calls_all c where c.ucn = r.ucn)),
         'A visit in no register: it gives no call a status and is on no call''s history. reports.ucn has no foreign key, so nothing stops it.'
  union all
  select 'Orphans', 2, 'Spare consumption lines whose UCN matches no call',
         (select count(*) from public.spare_consumption s
           where coalesce(btrim(s.ucn), '') <> ''
             and not exists (select 1 from calls_all c where c.ucn = s.ucn)),
         'A spare booked against a call that does not exist. It still comes off hand stock.'
  union all
  select 'Orphans', 3, 'Customer feedback whose UCN matches no call',
         (select count(*) from public.feedback f
           where coalesce(btrim(f.ucn), '') <> ''
             and not exists (select 1 from calls_all c where c.ucn = f.ucn)),
         'Feedback that cannot be tied to the call it is about.'
  union all
  select 'Orphans', 4, 'Spare requests naming a UCN that matches no call',
         (select count(*) from public.spare_requests r
           where coalesce(btrim(r.ucn), '') <> ''
             and not exists (select 1 from calls_all c where c.ucn = r.ucn)),
         'A call-based spare request whose call cannot be found; its cover cannot be checked against the call.'
  union all
  select 'Orphans', 5, 'Complaint reviews whose UCN matches no call',
         (select count(*) from public.call_reviews v
           where not exists (select 1 from calls_all c where c.ucn = v.ucn)),
         'A Daily Complaint Review answer for a call that is not in any register.'
  union all
  select 'Orphans', 6, 'Field Failure Reports whose UCN matches no call',
         (select count(*) from public.field_failure_reports f
           where coalesce(btrim(f.ucn), '') <> ''
             and not exists (select 1 from calls_all c where c.ucn = f.ucn)),
         'An FFR that cannot be traced back to its complaint. Check these by hand -- see also the Security rows.'
  union all
  select 'Orphans', 7, 'Contract lines naming a sale (SA number) that does not exist',
         (select count(*) from public.contract_items i
           where coalesce(btrim(i.sa_number), '') <> ''
             and not exists (select 1 from public.sale_entries s where s.sa_number = i.sa_number)),
         'contract_items.sa_number has no foreign key, so a mistyped SA number is accepted.'
  union all
  select 'Orphans', 8, 'Dispatch lines naming a Delivery Challan that does not exist',
         (select count(*) from public.spare_dispatch_lines l
           where coalesce(btrim(l.dispatch_uid), '') <> ''
             and not exists (select 1 from public.spare_dispatches d where d.uid = l.dispatch_uid)),
         'A shipped spare with no challan behind it. dispatch_uid has no foreign key.'

  -- ---- DUPLICATES: one thing recorded twice ----------------------------------
  union all
  select 'Duplicates', 1, 'User Master: emails that appear on more than one row',
         (select count(*) from (select lower(btrim(email)) e from public.user_directory
                                 where coalesce(btrim(email), '') <> '' group by 1 having count(*) > 1) x),
         'The same person twice in the directory. The reporting tree and "who sees what" are built from it.'
  union all
  select 'Duplicates', 2, 'User Master: names that appear on more than one row',
         (select count(*) from (select lower(btrim(name)) nm from public.user_directory
                                 where coalesce(btrim(name), '') <> '' group by 1 having count(*) > 1) x),
         'Visibility is matched on NAMES, so two rows with one name can widen or narrow what a manager sees.'
  union all
  select 'Duplicates', 3, 'Machines (product + serial) recorded more than once',
         (select count(*) from (select lower(btrim(item_name)), lower(btrim(serial_number)) from public.products
                                 where coalesce(btrim(item_name), '') <> '' and coalesce(btrim(serial_number), '') <> ''
                                 group by 1, 2 having count(*) > 1) x),
         'One machine on two Product Database rows: calls and cover can attach to either.'
  union all
  select 'Duplicates', 4, 'Part codes that appear on more than one Part Master row',
         (select count(*) from (select upper(btrim(code)) from public.parts
                                 where coalesce(btrim(code), '') <> '' group by 1 having count(*) > 1) x),
         'Hand stock and consumption match on the part CODE, so a duplicate code splits or merges stock.'
  union all
  select 'Duplicates', 5, 'Party names that appear on more than one Party Master row',
         (select count(*) from (select lower(btrim(party_name)) from public.parties
                                 where coalesce(btrim(party_name), '') <> '' group by 1 having count(*) > 1) x),
         'One customer as two parties: machines and calls split between them.'

  -- ---- BLANKS: a value the process needs and does not have -----------------
  union all
  select 'Blanks', 1, 'Open calls with no engineer allotted',
         (select count(*) from public.calls c
           where c.open_state <> 'Solved' and c.cancelled_at is null
             and coalesce(btrim(c.allocated_to), '') = ''),
         'Open calls nobody is assigned to. The visibility rule shows these to every engineer.'
  union all
  select 'Blanks', 2, 'Calls with no cover (Item Status)',
         (select count(*) from public.calls c where coalesce(btrim(c.item_status), '') = ''),
         'Spare approvals decide Commercial/NSM from the cover, so a blank one decides nothing.'
  union all
  select 'Blanks', 3, 'Spare request lines with no part',
         (select count(*) from public.spare_request_lines l where coalesce(btrim(l.part), '') = ''),
         'A line that cannot be dispatched, received or counted in hand stock.'
  union all
  select 'Blanks', 4, 'Machines with no serial number',
         (select count(*) from public.products p where coalesce(btrim(p.serial_number), '') = ''),
         'A machine is its model AND its serial; without one it cannot be matched to calls, sales or contracts.'

  -- ---- SECURITY: the grants the review flagged -----------------------------
  union all
  select 'Security', 1, 'party_key_seq: row-level security is OFF',
         (select case when c.relrowsecurity then 0 else 1 end from pg_class c
           where c.oid = to_regclass('public.party_key_seq')),
         '1 = OFF. With the default Supabase grants, anyone holding the app''s public key -- signed in or not -- can read and rewrite the Party Key counter.'
  union all
  select 'Security', 2, 'party_key_seq: privileges the NOT-signed-in role holds',
         (select count(*) from information_schema.role_table_grants g
           where g.table_schema = 'public' and g.table_name = 'party_key_seq' and g.grantee = 'anon'),
         'Number of privileges (SELECT, INSERT, UPDATE, DELETE...) the anon role has on it. 0 is what it should be.'
  union all
  select 'Security', 3, 'SECURITY DEFINER functions the NOT-signed-in role can call',
         (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.prosecdef and p.prorettype <> 'trigger'::regtype
             and has_function_privilege('anon', p.oid, 'EXECUTE')),
         'Functions that run with the owner''s full rights and that anyone with the public key can call. The next row names the ones the review found doing writes.'
  union all
  select 'Security', 4, 'Of those, the ones that WRITE and check nobody',
         (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.prosecdef
             and has_function_privilege('anon', p.oid, 'EXECUTE')
             and p.proname in ('raise_ffr', 'refresh_product_cover', 'cover_unpin_inherited',
                               'upsert_product_from_sale', 'purge_audit_log', 'sync_product_cover',
                               'sync_call_last_visit', 'next_party_key', 'next_ucn')),
         'Callable here without signing in: ' || coalesce((select string_agg(p.proname, ', ' order by p.proname)
             from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.prosecdef and has_function_privilege('anon', p.oid, 'EXECUTE')
              and p.proname in ('raise_ffr', 'refresh_product_cover', 'cover_unpin_inherited',
                                'upsert_product_from_sale', 'purge_audit_log', 'sync_product_cover',
                                'sync_call_last_visit', 'next_party_key', 'next_ucn')), 'none')
  union all
  select 'Security', 5, 'Tables with row-level security OFF',
         (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity),
         coalesce('Tables: ' || (select string_agg(c.relname, ', ' order by c.relname) from pg_class c
           join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity), 'none')
)
select area, "check", n, what_it_means
  from (
    select area, sort, chk as "check", n, meaning as what_it_means
      from checks
    union all
    -- ---- PERFORMANCE: which tables are read end to end, and how often --------
    select 'Full scans', 100 + row_number() over (order by s.seq_tup_read desc)::int,
           'Full scans: ' || s.relname, s.seq_scan,
           format('%s rows in the table; read end to end %s times vs %s index lookups since the statistics were reset; %s rows read that way in all.',
                  s.n_live_tup, s.seq_scan, coalesce(s.idx_scan, 0), s.seq_tup_read)
      from (select * from pg_stat_user_tables where schemaname = 'public'
             order by seq_tup_read desc limit 10) s
  ) x
 order by case area when 'Security' then 1 when 'Orphans' then 2 when 'Duplicates' then 3
                    when 'Blanks' then 4 else 5 end, sort;
