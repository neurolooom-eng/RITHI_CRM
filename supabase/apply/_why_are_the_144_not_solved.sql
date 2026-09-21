-- ===========================================================================
-- THE 144 CALLS FROM Report.csv -- WHY ARE THEY NOT SOLVED?
--
-- Read-only. Paste the whole file into the Supabase SQL editor. Row 1 first.
--
-- THE FIRST PROBE ASKED THE WRONG QUESTION. It filtered on `uid like 'IMP-%'`,
-- which is the uid EVERY Visit Reports bulk upload has ever derived -- so it
-- counted 3,744 visits from every load this system has had, not the 144 in one
-- file. This one names the 144 UCNs and the 144 row ids outright, so nothing
-- else can get into the answer.
--
-- That grid already said the file landed: 3,744 rows, 3,600 of them
-- blank-status, and 3,744 - 3,600 = exactly 144. What it could not say is
-- WHICH VISIT DECIDES each call. A call's status comes from its LATEST ENTRY
-- (updated_at desc, id desc), and these rows were dated at the VISIT date on
-- purpose so they could not overwrite a real later visit. If a blank-status
-- visit from an earlier load was entered later, it wins -- and the call reads
-- "Report pending" however right this file is.
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
),
file_uid(uid) as (values
    ('IMP-26G30F0004-20260915000000'),('IMP-26I09F0009-20260918000000'),('IMP-26H04F0009-20260819000000'),('IMP-26H19F0031-20260819000000'),('IMP-26G01F0007-20260819000000'),('IMP-26H19F0026-20260819000000'),
    ('IMP-26I15F0018-20260909000000'),('IMP-26G23F0003-20260918000000'),('IMP-26G01F0008-20260819000000'),('IMP-26I15F0019-20260912000000'),('IMP-26H26F0031-20260914000000'),('IMP-26G01F0009-20260918000000'),
    ('IMP-26I03F0003-20260918000000'),('IMP-26I03F0001-20260918000000'),('IMP-26I03F0002-20260918000000'),('IMP-26H26F0026-20260918000000'),('IMP-26H13F0014-20260918000000'),('IMP-26I17F0006-20260916000000'),
    ('IMP-26I11F0008-20260911000000'),('IMP-26I11F0007-20260911000000'),('IMP-26I11F0006-20260911000000'),('IMP-26I11F0005-20260911000000'),('IMP-26I16F0026-20260918000000'),('IMP-26I16F0020-20260918000000'),
    ('IMP-26I16F0001-20260918000000'),('IMP-26I11F0010-20260918000000'),('IMP-26I11F0009-20260918000000'),('IMP-26I16F0002-20260918000000'),('IMP-26H07F0001-20260901000000'),('IMP-26H20F0009-20260911000000'),
    ('IMP-26H20F0008-20260911000000'),('IMP-26I08F0001-20260917000000'),('IMP-26I09F0002-20260917000000'),('IMP-26G30F0037-20260909000000'),('IMP-26G30F0032-20260909000000'),('IMP-26H18F0028-20260917000000'),
    ('IMP-26I07F0010-20260917000000'),('IMP-26H18F0019-20260907000000'),('IMP-26H18F0020-20260907000000'),('IMP-26I07F0034-20260902000000'),('IMP-26H26F0002-20260917000000'),('IMP-26I09F0012-20260917000000'),
    ('IMP-26I05F0062-20260917000000'),('IMP-26H25F0003-20260828000000'),('IMP-26H29F0003-20260831000000'),('IMP-26H31F0001-20260831000000'),('IMP-26I05F0047-20260917000000'),('IMP-26H21F0005-20260824000000'),
    ('IMP-26H21F0004-20260917000000'),('IMP-26H27F0008-20260831000000'),('IMP-26I16F0024-20260916000000'),('IMP-26I16F0025-20260916000000'),('IMP-26I09F0007-20260917000000'),('IMP-26I16F0023-20260916000000'),
    ('IMP-26H20F0002-20260917000000'),('IMP-26I07F0030-20260917000000'),('IMP-26I05F0063-20260907000000'),('IMP-26I16F0004-20260916000000'),('IMP-26I09F0010-20260916000000'),('IMP-26I05F0049-20260916000000'),
    ('IMP-26I05F0066-20260915000000'),('IMP-26I15F0012-20260911000000'),('IMP-26I15F0015-20260912000000'),('IMP-26I15F0014-20260916000000'),('IMP-26H26F0013-20260916000000'),('IMP-26H26F0014-20260916000000'),
    ('IMP-26I05F0048-20260915000000'),('IMP-26I07F0018-20260915000000'),('IMP-26I07F0019-20260915000000'),('IMP-26I07F0021-20260915000000'),('IMP-26I07F0020-20260915000000'),('IMP-26I07F0023-20260915000000'),
    ('IMP-26I07F0009-20260915000000'),('IMP-26I07F0008-20260910000000'),('IMP-26I07F0007-20260910000000'),('IMP-26H13F0011-20260915000000'),('IMP-26I07F0032-20260915000000'),('IMP-26I07F0031-20260915000000'),
    ('IMP-26I07F0028-20260915000000'),('IMP-26I10F0001-20260915000000'),('IMP-26H20F0010-20260908000000'),('IMP-26I12F0005-20260909000000'),('IMP-26I07F0049-20260907000000'),('IMP-26H18F0002-20260915000000'),
    ('IMP-26H06F0015-20260807000000'),('IMP-26I07F0037-20260907000000'),('IMP-26I07F0038-20260907000000'),('IMP-26I07F0039-20260907000000'),('IMP-26H28F0008-20260914000000'),('IMP-26H12F0016-20260914000000'),
    ('IMP-26I05F0045-20260914000000'),('IMP-26I10F0011-20260914000000'),('IMP-26F01P0181-20260815000000'),('IMP-26G01P0040-20260725000000'),('IMP-26G01P0039-20260920000000'),('IMP-26G01P0038-20260920000000'),
    ('IMP-26G01P0036-20260920000000'),('IMP-26G01P0035-20260725000000'),('IMP-26G01P0034-20260725000000'),('IMP-26G01P0033-20260725000000'),('IMP-26G01P0322-20260920000000'),('IMP-26G01P0321-20260920000000'),
    ('IMP-26H01P0243-20260920000000'),('IMP-26H01P0242-20260920000000'),('IMP-26I01P0316-20260918000000'),('IMP-26I01P0315-20260918000000'),('IMP-26I01P0314-20260918000000'),('IMP-26I01P0313-20260918000000'),
    ('IMP-26I01P0307-20260918000000'),('IMP-26I01P0308-20260918000000'),('IMP-26I01P0309-20260918000000'),('IMP-26I01P0310-20260918000000'),('IMP-26I01P0311-20260918000000'),('IMP-26I01P0312-20260918000000'),
    ('IMP-26I01P0133-20260914000000'),('IMP-26I01P0132-20260914000000'),('IMP-26I01P0131-20260914000000'),('IMP-26I01P0129-20260914000000'),('IMP-26I01P0080-20260910000000'),('IMP-26I01P0255-20260911000000'),
    ('IMP-26I01P0256-20260911000000'),('IMP-26I01P0081-20260913000000'),('IMP-26I01P0305-20260913000000'),('IMP-26G01P0101-20260902000000'),('IMP-26G01P0102-20260917000000'),('IMP-26G01P0277-20260916000000'),
    ('IMP-26G01P0276-20260916000000'),('IMP-26G01P0275-20260916000000'),('IMP-26H01P0164-20260916000000'),('IMP-26H01P0159-20260916000000'),('IMP-26H01P0158-20260916000000'),('IMP-26H01P0157-20260916000000'),
    ('IMP-26H01P0156-20260916000000'),('IMP-26H01P0290-20260916000000'),('IMP-26H01P0291-20260916000000'),('IMP-26I01P0279-20260915000000'),('IMP-26I01P0269-20260915000000'),('IMP-26H01P0359-20260915000000'),
    ('IMP-26I01P0013-20260915000000'),('IMP-26I01P0014-20260915000000'),('IMP-26H01P0128-20260915000000'),('IMP-26H01P0129-20260915000000'),('IMP-26B19I0015-20260217000000'),('IMP-26B19I0016-20260217000000')
),
mine as (
  select r.* from public.reports r join file_uid f on f.uid = r.uid
),
winner as (            -- the visit that currently decides each of these calls
  select distinct on (r.ucn) r.ucn, r.uid, r.call_status, r.updated_at, r.visit_at
    from public.reports r join file_ucn f on f.ucn = r.ucn
   order by r.ucn, r.updated_at desc nulls last, r.id desc
)
select * from (
  select 1 as n, 'UCNs in the file' as question, (select count(*) from file_ucn)::text as answer,
         'Should be 144.' as what_it_means
  union all
  select 2, '   ...that exist as a call',
         (select count(*) from file_ucn f join public.calls c on c.ucn = f.ucn)::text,
         'A gap means the visit is attached to nothing and no status can change.'
  union all
  select 3, 'Rows from THIS file now in the visit history', (select count(*) from mine)::text,
         'Matched on the exact Row IDs in the file. 144 means the upload wrote every row.'
  union all
  select 4, '   ...carrying their Solved status',
         (select count(*) filter (where coalesce(btrim(call_status), '') <> '') from mine)::text,
         'Should equal row 3. Lower means the status column did not map.'
  union all
  select 5, 'WHAT THOSE 144 CALLS READ NOW',
         coalesce((select string_agg(open_state || ' (' || cnt || ')', ', ' order by open_state) from
           (select c.open_state, count(*)::text as cnt from file_ucn f join public.calls c on c.ucn = f.ucn
             group by c.open_state) x), 'none'),
         'THE ANSWER. Solved = done. Report pending = a blank-status visit is winning. Unattended = no visit attached.'
  union all
  select 6, 'Calls where the deciding visit is NOT this file''s row',
         (select count(*) from winner w where w.uid not in (select uid from file_uid))::text,
         'THE CAUSE, if it is not zero. Another visit on the same call was ENTERED later, so it decides the status.'
  union all
  select 7, '   ...and how many of those deciding visits are BLANK',
         (select count(*) from winner w where w.uid not in (select uid from file_uid)
            and coalesce(btrim(w.call_status), '') = '')::text,
         'A visit with no status can only read "Report pending" -- it is not neutral. This is what is beating the file.'
  union all
  select 8, '   ...an example (UCN | winning row id | its status | when it was entered)',
         coalesce((select w.ucn || '  |  ' || w.uid || '  |  '
                     || coalesce(nullif(btrim(w.call_status), ''), '(blank)') || '  |  '
                     || to_char(w.updated_at, 'DD-Mon-YYYY HH24:MI')
                     from winner w where w.uid not in (select uid from file_uid) limit 1),
                  'none -- this file decides every one'),
         'Compare its entry time with this file''s rows, which are dated at the VISIT date on purpose.'
  union all
  select 9, '   ...how many visits those 144 calls have between them',
         (select count(*) from public.reports r join file_ucn f on f.ucn = r.ucn)::text,
         'More than 144 means some of these calls already had a visit on record.'
  union all
  select 10, 'REPAIR -- run _solve_the_144.sql',
         'It sets updated_at = now() on exactly the 144 row ids in this file, so each becomes the deciding entry.',
         'Only those 144 rows, and only their ENTRY time -- the visit date the engineer recorded is untouched.'
  union all
  select 11, 'THE BIGGER FINDING, separate from this file',
         (select count(*) from public.reports where uid like 'IMP-%' and coalesce(btrim(call_status), '') = '')::text
           || ' of ' || (select count(*) from public.reports where uid like 'IMP-%')::text
           || ' bulk-loaded visits carry NO status',
         'This is why so many calls read "Report pending" across the whole register. Worth fixing at the source, not here.'
) rows order by n;
