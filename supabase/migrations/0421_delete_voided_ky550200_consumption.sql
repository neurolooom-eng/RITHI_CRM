-- ===========================================================================
-- 0421 -- THE VOIDED KY550200 CONSUMPTION ON 26G06F0006 DELETED (the user,
-- 2026-10-12, on that line's detail: "delete this consumption entry").
--
-- The line: UCN 26G06F0006, call R17857-VEGA-70, KY550200 MOTHER BOARD -
-- OSIRIS 3, AJAY G (INDOOR SERVICE), booked 25-Sep-2026 from a visit report
-- and already VOIDED -- quantity 0, adjusted by VIGNESH, reason "Wrongly
-- Enter". It moves no stock; 0420 removed the unit it was booked against.
--
-- A consumption line is a quality record and is normally voided, never
-- deleted (0049): block_hard_delete() refuses the signed-in app role, and a
-- migration -- the database owner -- is the controlled exception it names.
-- The row audit (record_audit_d) photographs the row as it goes. It is
-- deleted only when EXACTLY ONE row matches all of the above, so a re-run, or
-- a database where it differs, deletes nothing.
-- ===========================================================================
do $once$
declare n integer;
begin
  select count(*) into n
    from public.spare_consumption c
   where c.ucn = '26G06F0006' and public.part_code(c.part) = 'KY550200'
     and c.engineer = 'AJAY G (INDOOR SERVICE)' and coalesce(c.qty, 0) = 0
     and coalesce(c.adjustment_reason, '') = 'Wrongly Enter';
  if n = 1 then
    delete from public.spare_consumption c
     where c.ucn = '26G06F0006' and public.part_code(c.part) = 'KY550200'
       and c.engineer = 'AJAY G (INDOOR SERVICE)' and coalesce(c.qty, 0) = 0
       and coalesce(c.adjustment_reason, '') = 'Wrongly Enter';
    raise notice '0421: the voided KY550200 consumption on 26G06F0006 deleted';
  else
    raise notice '0421: % matching line(s) -- nothing deleted', n;
  end if;
end $once$;
