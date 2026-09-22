-- ===========================================================================
-- WHAT IS ACTUALLY IN `manual_report`? Read-only. Nothing is changed.
--
-- Asked because "the links are not getting converted into Drive links" has at
-- least four different causes and they need OPPOSITE fixes:
--
--   * the column was never written          -> the upload did not read the heading
--   * it holds an AppSheet PATH             -> Bulk Report Mapping section 2 resolves it
--   * it holds a Drive link already         -> nothing to convert; look at the screen
--   * it is a note, not a link              -> nothing to convert, and nothing is wrong
--
-- A screen showing no link is consistent with all four, so guessing which one
-- costs a round trip. This counts them.
--
-- THE VALUE IS ON THE ROW TWICE and both are checked: `manual_report` is the
-- column the registers write, and `Manual Report` is the report form's own
-- field, which lands inside the `data` jsonb. A reader who has turned on one
-- and not the other sees a blank where the other holds the link.
-- ===========================================================================
with v as (
  select r.uid, r.ucn, r.call_status, r.updated_at,
         btrim(coalesce(r.manual_report, ''))                          as col,
         btrim(coalesce(r.data ->> 'Manual Report', ''))               as in_data
    from public.reports r
),
shaped as (
  select *,
         coalesce(nullif(col, ''), nullif(in_data, ''), '')            as link,
         case
           when coalesce(nullif(col, ''), nullif(in_data, ''), '') = ''      then '0 · nothing recorded'
           when coalesce(nullif(col, ''), in_data) ilike '%drive.google.com%' then '1 · a Drive link (nothing to convert)'
           when coalesce(nullif(col, ''), in_data) ilike '%appsheet.com%'     then '2 · an AppSheet URL (Bulk Report Mapping resolves it)'
           when coalesce(nullif(col, ''), in_data) ~* '^https?://'            then '3 · some other URL'
           when coalesce(nullif(col, ''), in_data) ~ '\.[A-Za-z0-9]{1,5}$'    then '4 · an AppSheet file PATH (Bulk Report Mapping resolves it)'
           else '5 · text, not a link (nothing to convert)'
         end                                                            as shape
    from v
)
select * from (
  -- 1. the headline
  select 1 as sort, 'every visit' as section, 'rows in public.reports' as finding,
         count(*) as n, '' as example from v
  union all
  select 2, 'every visit', 'have a report on the COLUMN (manual_report)',
         count(*) filter (where col <> ''), '' from v
  union all
  select 3, 'every visit', 'have one only inside data->>''Manual Report''',
         count(*) filter (where col = '' and in_data <> ''), '' from v

  -- 2. WHAT SHAPE IS IT? This is the row that decides what to do next.
  union all
  select 4, 'what shape is it', shape, count(*), left(min(link), 70)
    from shaped group by shape

  -- 3. Did a bulk load land? Its uids start IMP-.
  union all
  select 5, 'bulk-loaded visits (uid like IMP-%)', 'rows', count(*), ''
    from v where uid like 'IMP-%'
  union all
  -- "carrying SOMETHING", not "carrying a link": a row reading `see attached`
  -- is a row the upload wrote and is not a link, and counting it as one would
  -- answer the wrong question. Line 4 is where the shapes are separated.
  select 6, 'bulk-loaded visits (uid like IMP-%)', 'of those, with something in the report field',
         count(*) filter (where link <> ''), ''
    from shaped where uid like 'IMP-%'

  -- 4. WHEN was the register last written, so a load that did not happen is
  --    visible as an absence rather than inferred from one that did.
  union all
  select 7, 'when visits were last entered', to_char(updated_at::date, 'DD-Mon-YYYY'),
         count(*), ''
    from v group by updated_at::date
   order by 1, 3 desc, 2
) report;
