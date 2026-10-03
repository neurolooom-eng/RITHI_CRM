-- ===========================================================================
-- HAVE THE 2026-10-03 RE-REVIEW'S FINDINGS ALREADY LEFT A MARK ON LIVE DATA?
-- (read-only, one grid)
--
-- The second re-review of 3 October (docs/MODULE_REVIEW_LOG.md) measured what
-- CAN happen on a database built from every migration. It could not say what
-- HAS happened on the live project. This file counts that, for the findings a
-- wrong record would show up in:
--   D-118  a stock movement marked "imported" by somebody who may not upload
--   D-118, D-119, D-122, D-123  a hand-stock balance below zero
--   D-126  Product Database 2.0's stored copy readable without signing in
--   D-128  a review or a Field Failure Report on a call that does not exist
--   D-149  two installation calls with the same call number
-- A count here is a lead, not a verdict: a negative balance can also be an
-- honest load in the wrong order. Rows 101+ list up to 100 of each kind.
-- Nothing here writes.
-- ===========================================================================
with uploader as (            -- logins whose role may upload (bulk.upload) -- the importers
  select p.id
    from public.profiles p
    left join public.app_roles r on r.role = p.role
   where p.role = 'admin' or coalesce(r.permissions, '[]'::jsonb) ? 'bulk.upload'
),
odd_cons as (                 -- consumption carrying an import reference, written by a signed-in non-uploader
  select c.id::text as ref, c.ucn, c.engineer, c.part, c.qty::text as qty, c.source_ref
    from public.spare_consumption c
   where btrim(coalesce(c.source_ref, '')) <> ''
     and c.sys_created_by is not null
     and c.sys_created_by not in (select id from uploader)
),
odd_st as (
  select t.uid as ref, t.from_engineer, t.to_engineer
    from public.stock_transfers t
   where t.source = 'import' and t.sys_created_by is not null
     and t.sys_created_by not in (select id from uploader)
),
odd_mr as (
  select m.id::text as ref, m.engineer
    from public.material_returns m
   where m.source = 'import' and m.sys_created_by is not null
     and m.sys_created_by not in (select id from uploader)
),
neg as (
  select engineer, part, qty from public.engineer_stock where qty < 0
),
orphan_rev as (
  select r.ucn from public.call_reviews r
   where not exists (select 1 from public.calls c where c.ucn = r.ucn)
),
orphan_ffr as (
  select f.ffr_no, f.ucn from public.field_failure_reports f
   where btrim(coalesce(f.ucn, '')) <> ''
     and not exists (select 1 from public.calls c where c.ucn = f.ucn)
),
dup_ic as (
  select call_number, count(*) as n from public.installation_calls
   where btrim(coalesce(call_number, '')) <> ''
   group by call_number having count(*) > 1
)
select 1 as row, 'D-126: Product Database 2.0 stored copy readable WITHOUT signing in (anon)' as check,
       case when to_regclass('public.product_database_v2_mv') is null then 'not on this project'
            when has_table_privilege('anon', 'public.product_database_v2_mv', 'select') then 'YES -- exposed'
            else 'no' end as answer
union all select 2, 'D-118: consumption lines with an import reference, written by a non-uploader', count(*)::text from odd_cons
union all select 3, 'D-118: stock transfers marked import, written by a non-uploader', count(*)::text from odd_st
union all select 4, 'D-118: material returns marked import, written by a non-uploader', count(*)::text from odd_mr
union all select 5, 'hand-stock balances below zero (engineer x part)', count(*)::text from neg
union all select 6, 'D-128: reviews on a call that does not exist', count(*)::text from orphan_rev
union all select 7, 'D-128: Field Failure Reports naming a call that does not exist', count(*)::text from orphan_ffr
union all select 8, 'D-149: installation call numbers carried by more than one call', count(*)::text from dup_ic
union all
select * from (
  select 100 + row_number() over (order by o, d)::int, k, d from (
    select 1 as o, 'negative balance' as k, engineer || ' / ' || part || ' = ' || qty::text as d from neg
    union all select 2, 'import-marked consumption', ref || ' ' || coalesce(ucn, '') || ' ' || engineer || ' ' || part || ' x' || qty || ' ref ' || source_ref from odd_cons
    union all select 3, 'import-marked transfer', ref || ' ' || from_engineer || ' -> ' || to_engineer from odd_st
    union all select 4, 'import-marked return', ref || ' ' || engineer from odd_mr
    union all select 5, 'review on no call', ucn from orphan_rev
    union all select 6, 'FFR on no call', ffr_no || ' ' || ucn from orphan_ffr
    union all select 7, 'duplicate installation call number', call_number || ' x' || n::text from dup_ic
  ) x
  order by o, d
  limit 100
) detail
order by 1;
