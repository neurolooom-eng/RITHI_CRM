-- ===========================================================================
-- WHAT IS ACTUALLY IN `manual_report`? Read-only. Nothing is changed.
--
-- Asked because "the links are not getting converted into Drive links" has at
-- least four different causes and they need OPPOSITE fixes:
--
--   * the column was never written          -> the upload did not read the heading
--   * it holds an AppSheet PATH             -> Bulk Report Mapping section 0 converts it
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
--
-- ---------------------------------------------------------------------------
-- THREE FAULTS CORRECTED ON 2026-09-23, EACH FOUND BY READING THIS FILE'S OWN
-- OUTPUT. All three made it ANSWER CONFIDENTLY AND WRONGLY, which is worse
-- than not answering:
--
--  1. THE EXAMPLE WAS CUT WHERE THE ANSWER IS. It printed `left(min(link), 70)`
--     with no ellipsis, and the AppSheet URL on this project is
--     `https://www.appsheet.com/image/getimageurl?appName=Reportsv2-RITHI-391`
--     -- EXACTLY 70 CHARACTERS. So the example read as a complete URL carrying
--     no `fileName`, when the cut had simply landed in front of it. A URL's
--     distinguishing part is at the END; a head-only excerpt of one is not a
--     shortened answer but a different one. It now prints the head AND the
--     tail and SAYS how much it removed.
--  2. NOTHING COUNTED THE ONE THING THAT DECIDES the AppSheet URLs' fate --
--     whether they carry a `fileName` to look up. Row 5 asks that directly.
--     An AppSheet URL without one cannot be resolved by anything and must not
--     be guessed at.
--  3. "WHEN VISITS WERE LAST ENTERED" WAS NOT IN DATE ORDER. It sorted the
--     FORMATTED string `DD-Mon-YYYY` descending as text, so 31-Oct-2023 came
--     first and 31-May-2026 second -- a list that reads as chronological and
--     is alphabetical. It also ran to one row per day (700+), burying every
--     other row in the report. It is the twenty BIGGEST days now, which is
--     what the question ("did a bulk load land?") actually wants, with the
--     total said out loud so nobody reads the twenty as all of them.
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
           when coalesce(nullif(col, ''), in_data) ilike '%appsheet.com%'     then '2 · an AppSheet URL (Bulk Report Mapping section 0)'
           when coalesce(nullif(col, ''), in_data) ~* '^https?://'            then '3 · some other URL'
           when coalesce(nullif(col, ''), in_data) ~ '\.[A-Za-z0-9]{1,5}$'    then '4 · an AppSheet file PATH (Bulk Report Mapping section 0)'
           else '5 · text, not a link (nothing to convert)'
         end                                                            as shape
    from v
)
select sort, section, finding, n, example from (
  -- 1. the headline
  select 1 as sort, 0::numeric as ord, 'every visit' as section, 'rows in public.reports' as finding,
         count(*) as n, '' as example from v
  union all
  select 2, 0, 'every visit', 'have a report on the COLUMN (manual_report)',
         count(*) filter (where col <> ''), '' from v
  union all
  select 3, 0, 'every visit', 'have one only inside data->>''Manual Report''',
         count(*) filter (where col = '' and in_data <> ''), '' from v

  -- 2. WHAT SHAPE IS IT? This is the row that decides what to do next.
  --    THE EXAMPLE SHOWS BOTH ENDS. See fault 1 at the top of this file.
  union all
  select 4, 0, 'what shape is it', shape, count(*),
         case when length(min(link)) <= 120 then min(link)
              else left(min(link), 64) || ' …[' || (length(min(link)) - 104)::text
                   || ' characters removed]… ' || right(min(link), 40) end
    from shaped group by shape

  -- 3. OF THE APPSHEET URLS, HOW MANY CAN BE RESOLVED AT ALL?
  --    `fileName` is the parameter that names the document; everything else in
  --    the URL identifies the app. One without it resolves to nothing, and
  --    guessing a document for a service record is worse than leaving the
  --    reference as it is. This is the number that says whether the AppSheet
  --    URLs are a job or a dead end -- and NOTHING here counted it.
  union all
  select 5, 0, 'of the AppSheet URLs',
         case when link ilike '%fileName=%'
              then 'carry a fileName — these can be converted'
              else 'carry NO fileName — nothing to look up, leave them alone' end,
         count(*),
         case when length(min(link)) <= 120 then min(link)
              else left(min(link), 64) || ' …[' || (length(min(link)) - 104)::text
                   || ' characters removed]… ' || right(min(link), 40) end
    from shaped
   where shape like '2 %'
   -- POSITIONAL, AND THE POSITION IS 4: the select list is
   -- (sort, ord, section, finding, n, example), so `group by 3` grouped by the
   -- literal section name and Postgres refused. Counting the columns is the
   -- point of writing it down.
   group by 4

  -- 4. Did a bulk load land? Its uids start IMP-.
  union all
  select 6, 0, 'bulk-loaded visits (uid like IMP-%)', 'rows', count(*), ''
    from v where uid like 'IMP-%'
  union all
  -- "carrying SOMETHING", not "carrying a link": a row reading `see attached`
  -- is a row the upload wrote and is not a link, and counting it as one would
  -- answer the wrong question. Line 4 is where the shapes are separated.
  select 7, 0, 'bulk-loaded visits (uid like IMP-%)', 'of those, with something in the report field',
         count(*) filter (where link <> ''), ''
    from shaped where uid like 'IMP-%'

  -- 5. WHEN was the register last written, so a load that did not happen is
  --    visible as an absence rather than inferred from one that did.
  --    THE TWENTY BIGGEST DAYS, and the total said out loud. See fault 3.
  union all
  select 8, 0, 'when visits were entered', 'distinct days in the register',
         count(distinct updated_at::date), '' from v
  union all
  -- ORDERED BY THE NUMBERS, NEVER BY THE PRINTED DATE. `DD-Mon-YYYY` sorts
  -- alphabetically -- which is fault 3 at the top of this file -- so both keys
  -- are packed into `ord`: the count dominates (no day here approaches a
  -- million visits) and the date breaks the ties, both descending.
  select 9, -(t.n::numeric * 1000000 + (t.d - date '1970-01-01')),
         'when visits were entered (the 20 busiest days)',
         to_char(t.d, 'DD-Mon-YYYY'), t.n, ''
    from (select updated_at::date as d, count(*) as n
            from v group by 1 order by 2 desc, 1 desc limit 20) t
  order by sort, ord, finding
) report;
