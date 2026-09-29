-- ===========================================================================
-- WHY DO THESE _status.sql ROWS SAY NO?  Rows 55, 117, 149, 157, 183, 184, 185.
--
-- READ-ONLY. Changes nothing. Run it in the Supabase SQL editor; it returns
-- ONE grid.
--
-- Each of those rows answers yes/no for several things at once, and they do
-- not all fail for the same kind of reason. This splits every one into its
-- parts and says which part failed, because the remedy differs completely:
--
--   MIGRATION  an object is missing. Run the bundle named. The automatic
--              migration ledger must NOT be baselined until it is in, or the
--              ledger would record it as applied and hide it for good.
--   PERMISSION a role holds, or lacks, a key. Somebody may have chosen that
--              on Roles & Permissions. Re-running rbac.sql MERGES keys back
--              into roles and would undo that choice -- decide first.
--   DATA       rows in a table. Nothing to apply; the named file explains.
--
-- Read the `kind` column before acting on any line. A line reading OK is a
-- part that passes.
--
-- Rows are numbered by status row: 55xx is row 55, 117xx is row 117 and so
-- on, so the grid sorts in the order of _status.sql.
-- ===========================================================================
with roles as (
  select role, permissions
    from public.app_roles
   where jsonb_array_length(permissions) > 0
),
rv as (
  select pg_get_viewdef(to_regclass('public.product_database'), true) as def
),
lines(n, status_row, kind, part, answer) as (

  -- ROW 55 -- opening stock held under names that are not active users.
  select 5500, 55, 'DATA', 'opening-stock pools under a name that is not an active user',
         coalesce((select count(distinct o.engineer_key)::text || ' name(s) -- run _handstock_opening_engineers.sql and read its section A first: a name can be a dealer, a DEACTIVATED engineer or a SPELLING difference, and only the first should be deleted'
                     from public.handstock_opening o
                    where not exists (select 1 from public.user_directory u
                                       where u.validity and lower(btrim(u.name)) = o.engineer_key)
                   having count(*) > 0), 'OK -- none')

  -- ROW 117 -- Zoho Migration holds a write action.
  union all
  select 11700, 117, 'MIGRATION', 'zoho_migration role exists (0155, rbac.sql)',
         case when exists (select 1 from public.app_roles where role = 'zoho_migration')
              then 'OK' else 'MISSING -- rbac.sql' end
  union all
  select 11700 + (row_number() over (order by m.v))::int, 117, 'PERMISSION',
         'zoho_migration holds the write action ' || m.v,
         case when exists (select 1 from public.app_roles ts
                            where ts.role = 'technical_support' and ts.permissions ? m.v)
              then 'technical_support holds it too, so it was probably copied across by an old rbac.sql run. Somebody decides whether Zoho keeps it; _zoho_diag.sql has the detail'
              else 'technical_support does NOT hold it, so somebody ticked it on Zoho Migration itself. Somebody decides whether it stays' end
    from public.app_roles zm, lateral jsonb_array_elements_text(zm.permissions) m(v)
   where zm.role = 'zoho_migration'
     and m.v in ('calls.edit','masters.edit','users.manage','rbac.manage','spare.dispatch',
                 'review.edit','cover.edit','consumption.reconcile')

  -- ROW 149 -- every configured role should hold mod:/machine-history.
  union all
  select 14900, 149, 'PERMISSION', 'configured roles WITHOUT mod:/machine-history (0195, rbac.sql)',
         coalesce((select count(*)::text || ' of ' || (select count(*) from roles)::text
                     from roles where not (permissions ? 'mod:/machine-history')
                   having count(*) > 0), 'OK -- every configured role holds it')
  union all
  select 14900 + (row_number() over (order by r.role))::int, 149, 'PERMISSION',
         'role ' || r.role || ' lacks mod:/machine-history',
         case when not exists (select 1 from roles x where x.permissions ? 'mod:/machine-history')
              then 'NO role holds it -- 0195 has probably never run: rbac.sql'
              else 'other roles hold it -- either this role was created after 0195 ran, or somebody unticked it. Tick it on Roles & Permissions if it should have it' end
    from roles r where not (r.permissions ? 'mod:/machine-history')

  -- ROW 157 -- the view column (0203) and the page key (0204/0205).
  union all
  select 15700, 157, 'MIGRATION', 'field_call_review carries live_product_name (0203, daily_review.sql)',
         case when to_regclass('public.field_call_review') is null then 'view absent -- daily_review.sql'
              when exists (select 1 from information_schema.columns
                            where table_schema = 'public' and table_name = 'field_call_review'
                              and column_name = 'live_product_name')
              then 'OK' else 'MISSING -- daily_review.sql' end
  union all
  select 15701, 157, 'PERMISSION', 'configured roles WITHOUT mod:/product-failure (0204/0205, rbac.sql)',
         coalesce((select count(*)::text || ' of ' || (select count(*) from roles)::text
                     from roles where not (permissions ? 'mod:/product-failure')
                   having count(*) > 0), 'OK -- every configured role holds it')
  union all
  select 15710 + (row_number() over (order by r.role))::int, 157, 'PERMISSION',
         'role ' || r.role || ' lacks mod:/product-failure',
         case when r.permissions ? 'mod:/dccr-insights'
              then 'it still holds the OLD key mod:/dccr-insights -- the rename (0205) has not run: rbac.sql'
              when not exists (select 1 from roles x where x.permissions ? 'mod:/product-failure')
              then 'NO role holds it -- 0204/0205 have probably never run: rbac.sql'
              else 'other roles hold it -- created after 0205 ran, or unticked by somebody. Tick it on Roles & Permissions if it should have it' end
    from roles r where not (r.permissions ? 'mod:/product-failure')

  -- ROW 183 -- two migrations in two bundles.
  union all
  select 18300, 183, 'MIGRATION', 'machine_current_party() (0238, sales_contracts.sql)',
         case when to_regprocedure('public.machine_current_party(text,text)') is not null
              then 'OK' else 'MISSING -- sales_contracts.sql' end
  union all
  select 18301, 183, 'MIGRATION', 'zz_transfer_to_product trigger on ownership_transfers (0238, sales_contracts.sql)',
         case when exists (select 1 from pg_trigger
                            where tgrelid = to_regclass('public.ownership_transfers')
                              and tgname = 'zz_transfer_to_product' and not tgisinternal)
              then 'OK' else 'MISSING -- sales_contracts.sql' end
  union all
  select 18302, 183, 'MIGRATION', 'product_database matches the contract and the installation call on the party (0239, product_database_2.sql)',
         case when (select def from rv) is null then 'view absent -- product_database_2.sql'
              when (select def from rv) ~ 'cp\.party_key = lower\(btrim'
               and (select def from rv) ~ 'ip\.party_key = lower\(btrim'
               and (select def from rv) ~ 'AS contract_number_keyed'
               and (select def from rv) ~ 'AS inst_call_keyed'
              then 'OK' else 'OLD DEFINITION -- product_database_2.sql' end

  -- ROW 184 -- admin holds the key, and nobody outside three roles does.
  union all
  select 18400, 184, 'MIGRATION', 'admin holds mod:/handstock-report (0241, rbac.sql)',
         case when exists (select 1 from public.app_roles
                            where role = 'admin' and permissions ? 'mod:/handstock-report')
              then 'OK' else 'MISSING -- rbac.sql' end
  union all
  select 18400 + (row_number() over (order by a.role))::int, 184, 'PERMISSION',
         'role ' || a.role || ' also holds mod:/handstock-report',
         'the row reads this as a LEAK. If you granted it on Roles & Permissions -- which the ask allowed ("Rest of the Access I will select") -- it is your choice and the ROW is wrong, not the data; say so and the row will be corrected'
    from public.app_roles a
   where a.role not in ('admin', 'technical_support', 'zoho_migration', 'super_admin')
     and a.permissions ? 'mod:/handstock-report'

  -- ROW 185 -- cancel_calls() exists, is not a definer, and delegates.
  union all
  select 18500, 185, 'MIGRATION', 'cancel_calls(text[], text) exists (0242, call_requests.sql)',
         case when to_regprocedure('public.cancel_calls(text[],text)') is not null
              then 'OK' else 'MISSING -- call_requests.sql' end
  union all
  select 18501, 185, 'MIGRATION', 'cancel_calls is SECURITY INVOKER and calls cancel_call()',
         case when to_regprocedure('public.cancel_calls(text[],text)') is null then 'n/a -- absent'
              when (select p.prosecdef from pg_proc p
                     where p.oid = to_regprocedure('public.cancel_calls(text[],text)'))
              then 'WRONG -- it is a SECURITY DEFINER; call_requests.sql restores the invoker version'
              when pg_get_functiondef(to_regprocedure('public.cancel_calls(text[],text)')) ~ 'cancel_call\('
              then 'OK' else 'WRONG -- it no longer calls cancel_call(); call_requests.sql' end
)
select n, status_row, kind, part, answer
  from lines
 order by n;
