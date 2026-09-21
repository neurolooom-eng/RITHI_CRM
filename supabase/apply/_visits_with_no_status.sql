-- ===========================================================================
-- VISITS THAT CARRY NO CALL STATUS -- HOW MANY, AND WHAT CAN FILL THEM?
--
-- Read-only. Paste the whole file into the Supabase SQL editor. Row 1 first.
--
-- The user, 2026-09-21: "Clean up data - Where Visit entry is present, but
-- there is no Status". A visit with a blank status can only read
-- "Report pending" -- 0032's expression, where blank is NOT neutral -- so
-- these are why that word appears across the register.
--
-- NOTHING HERE FILLS A STATUS FROM A GUESS, and that is the whole design. A
-- visit with a document attached LOOKS like a solved call and is not evidence
-- of one; writing "Solved" because a file exists puts a judgement nobody made
-- into a quality record, which is worse than a blank that reads as odd. Only
-- two sources count:
--
--   A. the visit's OWN `data` bag -- the upload keeps every heading the file
--      carried that it did not recognise, verbatim under its own name. If the
--      export had a status column under a heading the importer did not map,
--      the value is still there and is the record's own word.
--   B. ANOTHER VISIT on the same call that does carry a status. That does not
--      fill the blank one; it means the call's status is already decided by a
--      real entry and the blank is harmless.
--
-- Rows 4 to 8 size those two. Row 9 is what is left with neither, which is a
-- question for a person and not something to write.
-- ===========================================================================
with blanks as (
  select r.id, r.uid, r.ucn, r.visit_at, r.updated_at, r.manual_report, r.data
    from public.reports r
   where coalesce(btrim(r.call_status), '') = ''
),
winner as (            -- the visit that currently decides each affected call
  select distinct on (r.ucn) r.ucn, r.uid, r.call_status
    from public.reports r
   where r.ucn in (select ucn from blanks)
   order by r.ucn, r.updated_at desc nulls last, r.id desc
),
-- Which key in `data` holds something status-shaped? Discovered rather than
-- assumed: exports name that column half a dozen ways.
candidates as (
  select b.id, kv.key, kv.value
    from blanks b, lateral jsonb_each_text(coalesce(b.data, '{}'::jsonb)) kv
   where kv.value ~* '^(solved|unsolved|cancel|closed|pending|re-?open)'
)
select * from (
  select 1 as n, 'Visits in the register' as question,
         (select count(*)::text from public.reports) as answer,
         'Everything, for scale.' as what_it_means
  union all
  select 2, '   ...with NO call status',
         (select count(*)::text from blanks),
         'A visit with no status can only read "Report pending". Blank is not neutral.'
  union all
  select 3, '   ...on how many distinct calls',
         (select count(distinct ucn)::text from blanks),
         'Fewer than row 2 means some calls carry several blank visits.'
  union all
  select 4, 'Calls DECIDED by a blank visit',
         (select count(*)::text from winner w where coalesce(btrim(w.call_status), '') = ''),
         'THE NUMBER THAT MATTERS. Only these read the wrong thing; the rest are already decided by a real entry (case B) and their blanks are harmless.'
  union all
  select 5, '   ...and the rest, already decided by a real visit',
         (select count(*)::text from winner w where coalesce(btrim(w.call_status), '') <> ''),
         'Nothing to do for these. Leave the blank visits where they are -- they are the history.'
  union all
  select 6, 'Blank visits whose own `data` carries a status (case A)',
         (select count(distinct id)::text from candidates),
         'RECOVERABLE FROM THE RECORD ITSELF. The upload kept every unmapped heading verbatim; if the export named the status column something it did not recognise, the value is still on the row.'
  union all
  select 7, '   ...under which heading(s)',
         coalesce((select string_agg(k || ' (' || c || ')', ', ' order by c desc)
                     from (select key as k, count(*)::text as c from candidates group by key
                            order by count(*) desc limit 6) x), 'none'),
         'Read this before running any repair: the heading has to be one that really is the call status, not a different question that happens to answer "Solved".'
  union all
  select 8, '   ...and what those values say',
         coalesce((select string_agg(v || ' (' || c || ')', ', ' order by c desc)
                     from (select value as v, count(*)::text as c from candidates group by value
                            order by count(*) desc limit 8) y), 'none'),
         'The register''s own vocabulary. Anything unexpected here is a reason to stop.'
  union all
  select 9, 'Blank, DECIDING, and nothing to fill them from',
         (select count(*)::text from winner w
           where coalesce(btrim(w.call_status), '') = ''
             and not exists (select 1 from blanks b join candidates c on c.id = b.id where b.uid = w.uid)),
         'A QUESTION FOR A PERSON, not something to write. These calls have a visit and no record anywhere of how it ended.'
  union all
  select 10, '   ...of which, how many have a report document attached',
         (select count(*)::text from blanks b join winner w on w.uid = b.uid
           where coalesce(btrim(w.call_status), '') = ''
             and coalesce(btrim(b.manual_report), '') <> ''),
         'SUGGESTIVE, NOT EVIDENCE. A document means somebody wrote a report; it does not say the call was solved. Listed so you can judge, NOT so it can be written automatically.'
  union all
  select 11, 'What those blank visits ARE (their row ids, first 4 shapes)',
         coalesce((select string_agg(pre || ' (' || c || ')', ', ' order by c desc)
                     from (select split_part(uid, '-', 1) as pre, count(*)::text as c
                             from blanks group by 1 order by count(*) desc limit 4) z), 'none'),
         'WHICH LOAD MADE THEM. `IMP-` is a Bulk Upload that derived the id from the call and the visit date -- a file with no id column of its own. Anything else came from a file that carried its own.'
  union all
  select 12, 'Blank visits that have a STATUSED visit on the SAME CALL, SAME DAY',
         (select count(*)::text from blanks b
           where exists (select 1 from public.reports r
                          where r.ucn = b.ucn and r.id <> b.id
                            and coalesce(btrim(r.call_status), '') <> ''
                            and r.visit_at::date = b.visit_at::date)),
         'THE LIKELIEST CLEAN-UP. These are the SAME visit loaded twice -- once bare, once with its status -- because the two files keyed it differently. The bare copy adds nothing and doubles the visit history.'
  union all
  select 13, '   ...and blank visits with NO work details either (report fields 0)',
         (select count(*)::text from blanks where coalesce(data, '{}'::jsonb) = '{}'::jsonb),
         'A visit carrying a date, a call and an engineer and nothing else. "Report pending" is then not a wrong answer -- it is an accurate one: somebody went, and no report was ever filed here.'
  union all
  select 14, 'REPAIR (case A only) -- run _fill_status_from_the_record.sql',
         'It copies the status the record already carries in `data` onto the visit, and recomputes the call. Nothing else is touched.',
         'Read rows 7 and 8 first and tell me the heading is right. If row 6 is 0 there is nothing to run.'
) rows order by n;
