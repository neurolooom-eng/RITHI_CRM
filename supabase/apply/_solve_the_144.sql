-- ===========================================================================
-- MAKE THE 144 VISITS FROM Report.csv THE DECIDING ENTRY ON THEIR CALLS.
--
-- CHECKED ON 21-Sep-2026 AND NOT NEEDED. The probe came back Solved (144):
-- every one of those calls already reads Solved. 40 of them are decided by a
-- visit that is not from this file, and row 7 said 0 of those are blank --
-- they are genuine WEB- visits an engineer entered later, saying Solved too.
-- There is nothing for this file to beat. Left here for the situation it was
-- written for, not as a step in that repair.
--
-- Run this ONLY after _why_are_the_144_not_solved.sql shows rows 6 and 7 above
-- zero -- i.e. a blank-status visit is outranking the one this file wrote.
--
-- IT NO LONGER TOUCHES A ROW THAT ALREADY WINS. An earlier version also
-- bumped those, for idempotency, and that was backwards: once a row has won,
-- bumping it again is a write to a quality record that changes nothing --
-- audited, now that 0225 is armed, as 104 amendments to show for nothing.
-- Beating a blank is the only reason to write, and after the first run there
-- is no blank left to beat, which is idempotency by construction.
--
-- WHAT IT CHANGES: `updated_at` on exactly the 144 rows named below, and
-- nothing else. That column is WHEN THE VISIT WAS ENTERED, which is what
-- `sync_call_last_visit` (0032) orders by. The VISIT DATE the engineer
-- recorded (`visit_at`) is untouched, and no status is invented anywhere --
-- each call is recomputed from the visit history it already has.
--
-- WHY NOT JUST SET THE STATUS ON THE CALL: because the call's status is
-- DERIVED. Writing it directly would be overwritten by the next visit that
-- touches the call, and would leave the history saying something different
-- from the register. This makes the history right, and the register follows.
--
-- IT ONLY EVER BEATS A BLANK. A call whose latest entry carries a real status
-- -- including 'Unsolved' on a call that reopened after this visit -- is left
-- exactly as it is, and shows up as the difference between rows 6 and 7 of the
-- probe. Running it twice does the same thing twice; it is not cumulative.
-- ===========================================================================
with file_uid(uid) as (values
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
-- ONLY WHERE A BLANK-STATUS VISIT IS WHAT IS WINNING. This is the whole
-- safety of the statement. Bumping all 144 unconditionally would also outrank
-- a visit that was genuinely filed LATER and says something real -- 'Unsolved'
-- on a call that reopened -- and quietly turn it Solved. A blank status is the
-- only thing this is allowed to beat, because a blank one is not a judgement:
-- it is a visit whose status was never loaded.
winner as (
  select distinct on (r.ucn) r.ucn, r.uid, r.call_status
    from public.reports r
   where r.ucn in (select r2.ucn from public.reports r2 join file_uid f on f.uid = r2.uid)
   order by r.ucn, r.updated_at desc nulls last, r.id desc
),
target as (
  select f.uid
    from file_uid f
    join public.reports r on r.uid = f.uid
    join winner w on w.ucn = r.ucn
   where coalesce(btrim(w.call_status), '') = ''     -- a blank one is winning
),
bumped as (
  update public.reports r
     set updated_at = now()
    from target t
   where t.uid = r.uid
  returning r.ucn
),
resynced as (
  select public.sync_call_last_visit(ucn) from (select distinct ucn from bumped) u
)
select (select count(*) from file_uid)  as rows_in_the_file,
       (select count(*) from bumped)    as visits_bumped,
       (select count(*) from resynced)  as calls_recomputed,
       (select count(*) from file_uid) - (select count(*) from bumped) as left_alone;

-- Then read it back:
--   select open_state, count(*) from public.calls
--    where ucn in (select ucn from public.reports where uid like 'IMP-%')
--    group by open_state;
