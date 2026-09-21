-- ===========================================================================
-- DID Report.csv LAND ANYWHERE IT SHOULD NOT? A SWEEP OF ALL TEN DESTINATIONS.
--
-- Read-only. Paste the whole file into the Supabase SQL editor. Row 1 first.
--
-- The earlier probe asked only about the three CALL tables, and I reported its
-- zero as "nothing went anywhere wrong". That was too strong: measured against
-- the real importer, TEN of the thirty-two registers accept this file with all
-- 144 rows and nothing held back, because a register only has to recognise the
-- columns it needs -- a call needs a UCN, a feedback row needs a UCN, and
-- everything it does not recognise is kept verbatim in a bag.
--
-- So this asks about every one of them. Each destination has a fingerprint
-- nothing else writes:
--
--   the three call tables  ->  extra->>'Row ID' starting IMP-
--   feedback               ->  answers->>'Row ID' starting IMP-
--   call_reviews (DCCR)    ->  a row for one of these UCNs with EVERY review
--                              field still blank (it keeps no bag)
--   sale_items             ->  uid 'SA-UNKNOWN||'   (one row, all blank)
--   contract_items         ->  uid 'MC-UNKNOWN||'   (one row, all blank)
--   reports                ->  the RIGHT destination, counted for contrast
--
-- Nothing here changes anything. Row 9 is the verdict.
-- ===========================================================================
with file_ucn(ucn) as (values
    ('26G30F0004'),('26I09F0009'),('26H04F0009'),('26H19F0031'),('26G01F0007'),('26H19F0026'),
    ('26I15F0018'),('26G23F0003'),('26G01F0008'),('26I15F0019'),('26H26F0031'),('26G01F0009'),
    ('26I03F0003'),('26I03F0001'),('26I03F0002'),('26H26F0026'),('26H13F0014'),('26I17F0006'),
    ('26I11F0008'),('26I11F0007'),('26I11F0006'),('26I11F0005'),('26I16F0026'),('26I16F0020'),
    ('26I16F0001'),('26I11F0010'),('26I11F0009'),('26I16F0002'),('26H07F0001'),('26H20F0009'),
    ('26H20F0008'),('26I08F0001'),('26I09F0002'),('26G30F0037'),('26G30F0032'),('26H18F0028'),
    ('26I07F0010'),('26H18F0019'),('26H18F0020'),('26I07F0034'),('26H26F0002'),('26I09F0012'),
    ('26I05F0062'),('26H25F0003'),('26H29F0003'),('26H31F0001'),('26I05F0047'),('26H21F0005'),
    ('26H21F0004'),('26H27F0008'),('26I16F0024'),('26I16F0025'),('26I09F0007'),('26I16F0023'),
    ('26H20F0002'),('26I07F0030'),('26I05F0063'),('26I16F0004'),('26I09F0010'),('26I05F0049'),
    ('26I05F0066'),('26I15F0012'),('26I15F0015'),('26I15F0014'),('26H26F0013'),('26H26F0014'),
    ('26I05F0048'),('26I07F0018'),('26I07F0019'),('26I07F0021'),('26I07F0020'),('26I07F0023'),
    ('26I07F0009'),('26I07F0008'),('26I07F0007'),('26H13F0011'),('26I07F0032'),('26I07F0031'),
    ('26I07F0028'),('26I10F0001'),('26H20F0010'),('26I12F0005'),('26I07F0049'),('26H18F0002'),
    ('26H06F0015'),('26I07F0037'),('26I07F0038'),('26I07F0039'),('26H28F0008'),('26H12F0016'),
    ('26I05F0045'),('26I10F0011'),('26F01P0181'),('26G01P0040'),('26G01P0039'),('26G01P0038'),
    ('26G01P0036'),('26G01P0035'),('26G01P0034'),('26G01P0033'),('26G01P0322'),('26G01P0321'),
    ('26H01P0243'),('26H01P0242'),('26I01P0316'),('26I01P0315'),('26I01P0314'),('26I01P0313'),
    ('26I01P0307'),('26I01P0308'),('26I01P0309'),('26I01P0310'),('26I01P0311'),('26I01P0312'),
    ('26I01P0133'),('26I01P0132'),('26I01P0131'),('26I01P0129'),('26I01P0080'),('26I01P0255'),
    ('26I01P0256'),('26I01P0081'),('26I01P0305'),('26G01P0101'),('26G01P0102'),('26G01P0277'),
    ('26G01P0276'),('26G01P0275'),('26H01P0164'),('26H01P0159'),('26H01P0158'),('26H01P0157'),
    ('26H01P0156'),('26H01P0290'),('26H01P0291'),('26I01P0279'),('26I01P0269'),('26H01P0359'),
    ('26I01P0013'),('26I01P0014'),('26H01P0128'),('26H01P0129'),('26B19I0015'),('26B19I0016')
)
select * from (
  select 1 as n, 'Stray rows in Field Calls' as question,
         (select count(*) from public.field_calls where extra->>'Row ID' like 'IMP-%')::text as answer,
         'Should be 0. Above 0 means the file went to Calls -> Field Calls.' as what_it_means
  union all
  select 2, 'Stray rows in Installation Calls',
         (select count(*) from public.installation_calls where extra->>'Row ID' like 'IMP-%')::text,
         'Should be 0.'
  union all
  select 3, 'Stray rows in PM Calls',
         (select count(*) from public.pm_calls where extra->>'Row ID' like 'IMP-%')::text,
         'Should be 0.'
  union all
  select 4, 'Stray rows in Customer Feedback',
         (select count(*) from public.feedback where answers->>'Row ID' like 'IMP-%')::text,
         'Should be 0. This register takes the file too -- it needs only a UCN -- and would file 144 feedback records with no answers in them.'
  union all
  select 5, 'Empty DCCR rows for these UCNs',
         (select count(*) from public.call_reviews cr join file_ucn f on f.ucn = cr.ucn
           where coalesce(btrim(cr.risk_to_patient), '') = '' and coalesce(btrim(cr.warranty_failure), '') = ''
             and coalesce(btrim(cr.frequent_failure), '') = '' and coalesce(btrim(cr.complaint_grouping), '') = ''
             and coalesce(btrim(cr.root_cause_keyword), '') = '' and coalesce(btrim(cr.spare_category), '') = ''
             and coalesce(btrim(cr.service_observation), '') = '' and coalesce(btrim(cr.action_taken), '') = '')::text,
         'The DCCR register keeps no bag, so this is the only signal: a review row with every field blank. Some may be legitimate and simply unreviewed -- row 6 dates them.'
  union all
  select 6, '   ...of those, created in the last 3 days',
         (select count(*) from public.call_reviews cr join file_ucn f on f.ucn = cr.ucn
           where cr.created_at > now() - interval '3 days'
             and coalesce(btrim(cr.risk_to_patient), '') = '' and coalesce(btrim(cr.action_taken), '') = '')::text,
         'A blank review row created since the upload is the one worth looking at. An older one predates this file and is not from it.'
  union all
  select 7, 'Stray row in Sale Details',
         (select count(*) from public.sale_items where uid = 'SA-UNKNOWN||')::text,
         'Should be 0. This register accepts only ONE row of the file and writes it as SA-UNKNOWN with everything blank.'
  union all
  select 8, 'Stray row in Contract Details',
         (select count(*) from public.contract_items where uid = 'MC-UNKNOWN||')::text,
         'Should be 0. Same shape as row 7, as MC-UNKNOWN.'
  union all
  select 9, 'VERDICT',
         case when (select count(*) from public.field_calls where extra->>'Row ID' like 'IMP-%')
                 + (select count(*) from public.installation_calls where extra->>'Row ID' like 'IMP-%')
                 + (select count(*) from public.pm_calls where extra->>'Row ID' like 'IMP-%')
                 + (select count(*) from public.feedback where answers->>'Row ID' like 'IMP-%')
                 + (select count(*) from public.sale_items where uid = 'SA-UNKNOWN||')
                 + (select count(*) from public.contract_items where uid = 'MC-UNKNOWN||') = 0
              then 'CLEAN -- nothing to clean up (still read rows 5 and 6)'
              else 'STRAY ROWS EXIST -- see rows 1-8, and the statements below' end,
         'Rows 5 and 6 are judgement rather than fingerprint, so the verdict does not include them.'
  union all
  select 10, 'Rows in the RIGHT place (visit history)',
         (select count(*) from public.reports r join file_ucn f on f.ucn = r.ucn
           where r.uid like 'IMP-%')::text,
         'For contrast. This is where the file was meant to go.'
  union all
  select 11, 'CLEAN-UP, calls -- run only for a table above that is not 0',
         'delete from public.field_calls where extra->>''Row ID'' like ''IMP-%'' and exists (select 1 from public.calls c where c.ucn = field_calls.ucn and c.id <> field_calls.id);',
         'ONLY a row whose UCN also exists in another call table -- i.e. a copy, not a real call this file merely updated. Swap in installation_calls / pm_calls as needed. The retention guard (0049) lets this through in the SQL editor and refuses it from the app.'
  union all
  select 12, 'CLEAN-UP, feedback',
         'delete from public.feedback where answers->>''Row ID'' like ''IMP-%'';',
         'These carry no answers, so nothing real is lost. Check row 4 first.'
  union all
  select 13, 'CLEAN-UP, cover',
         'delete from public.sale_items where uid = ''SA-UNKNOWN||''; delete from public.contract_items where uid = ''MC-UNKNOWN||'';',
         'One row each, entirely blank, with a placeholder number. Nothing references them.'
) rows order by n;
