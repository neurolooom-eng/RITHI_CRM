-- ===========================================================================
-- WHAT DID 0318 CLEAR FROM THE WARRANTY MACHINE LINES?  (read-only, one grid)
--
-- 0318 (merged in #492, applied on the live project 2026-10-02 11:13 UTC:
-- "3663 sale(s) updated from the Party Master; 17279 machine line(s) put back
-- on their sale") set the thirteen fields a machine line inherits to NULL on
-- every line, so each machine shows its sale entry's value instead. That is
-- what was asked. But where the ENTRY holds no value for a field, the machine
-- now shows NOTHING -- the line's own value was the only record, and it is now
-- only in sale_items_inherit_backup. A machine imported under a stand-in entry
-- (sale_items_stub_header writes only the SA number) lost its warranty dates
-- that way: reproduced on a database built from every migration (D-097).
--
-- Per field:
--   lost    the line had a value, the entry has none -> the machine shows blank
--   changed the line had a value, the entry has a DIFFERENT one -> the machine
--           now shows the entry's (what 0318 was asked to do, counted so the
--           size of it is known)
-- Rows 101+ list up to 200 machines that lost a warranty date, with the value
-- the backup holds. Nothing here writes. Row 1 says whether 0318 has run.
-- ===========================================================================
with ran as (
  select (to_regclass('public.sale_items_inherit_backup') is not null) as has_backup,
         exists (select 1 from pg_class where relname = 'one_time_fixes_done')
           and coalesce((select true from public.one_time_fixes_done
                          where name = '0318_warranty_party_refresh'), false) as done
),
b as (
  select k.id as backup_id, k.item_id, k.sa_number, k.serial_number, k.before, e.id as entry_id,
         to_jsonb(e) as entry
    from public.sale_items_inherit_backup k
    left join public.sale_entries e on e.sa_number = k.sa_number
),
f(name, o) as (values ('warranty_start',1),('warranty_end',2),('warranty_years',3),('warranty_months',4),
                      ('pm_visits',5),('warranty_status',6),('invoice_no',7),('invoice_date',8),
                      ('sold_through',9),('other_details',10),('state',11),('city',12),('engineer',13)),
per as (
  select f.o, f.name,
         count(*) filter (where b.before ? f.name
                            and nullif(btrim(coalesce(b.entry->>f.name, '')), '') is null) as lost,
         count(*) filter (where b.before ? f.name
                            and nullif(btrim(coalesce(b.entry->>f.name, '')), '') is not null
                            and btrim(b.entry->>f.name) is distinct from btrim(b.before->>f.name)) as changed
    from f cross join b
   group by f.o, f.name
)
select 1 as row, '0318 has run on this project' as check,
       case when (select done from ran) then 'yes' else 'NO -- nothing below applies' end as answer
union all
select 2, 'machine lines in the backup (lines 0318 cleared)', count(*)::text from b
union all
select 3, 'of them, lines whose sale entry is missing altogether', count(*) filter (where entry_id is null)::text from b
union all
select 10 + o, name || ': lost (entry has none) / changed (entry differs)', lost || ' / ' || changed from per
union all
select * from (
  select 100 + row_number() over (order by b.sa_number, b.serial_number)::int,
         b.sa_number || ' / ' || coalesce(b.serial_number, '?'),
         'line had warranty ' || coalesce(b.before->>'warranty_start', '?') || ' to ' || coalesce(b.before->>'warranty_end', '?')
           || '; entry has ' || coalesce(b.entry->>'warranty_start', 'none') || ' to ' || coalesce(b.entry->>'warranty_end', 'none')
    from b
   where (b.before ? 'warranty_end' and nullif(btrim(coalesce(b.entry->>'warranty_end', '')), '') is null)
      or (b.before ? 'warranty_start' and nullif(btrim(coalesce(b.entry->>'warranty_start', '')), '') is null)
   order by b.sa_number, b.serial_number
   limit 200
) detail
order by 1;
