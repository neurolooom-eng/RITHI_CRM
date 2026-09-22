-- ===========================================================================
-- SET EACH CALL'S COVER TO WHAT THE REGISTERS HELD FOR ITS OWN DATE.
--
-- Run _cover_as_at_the_complaint_date.sql FIRST and check row 6 by hand.
--
-- WHAT IT CHANGES: `item_status` on the calls that disagree with the warranty
-- or contract period covering THEIR OWN complaint date. Nothing else, and no
-- call the registers cannot speak for.
--
-- WHY THIS IS SAFE WHERE "MATCH THE MACHINE TODAY" IS NOT: a call records what
-- was true when it was raised, so a warranty that has since expired SHOULD
-- disagree with the machine now -- that is history, not an error. This asks a
-- different question: on the day this call was raised, did a warranty or
-- contract period cover this machine? A call that contradicts THAT is wrong on
-- its own terms and stays wrong however long it sits there.
--
-- FIVE REFUSALS BUILT IN, each one a case where being wrong is worse:
--   * OGP is NOT written onto a machine with no warranty record on file --
--     "no period covers this date" then means "nothing was imported", not
--     "the warranty had ended". Every other verdict is a FOUND fact; this one
--     alone is inferred from a gap, so it needs evidence the gap is real;
--   * a machine with NO dated warranty or contract record gets no opinion --
--     unknown is not the same as out of cover;
--   * a contract whose TYPE was never recorded is not guessed into CMC;
--   * a call with no complaint date, no serial or no model is not judged;
--   * the match is MODEL + SERIAL, so a shared serial cannot lend its cover.
--
-- WARRANTY DECIDES BEFORE CONTRACT, as product_database_v2 has it: a machine
-- inside its guarantee period is WGP even where a contract also runs.
--
-- Every change is recorded by record_audit (0225) with the row before and
-- after. Re-running it changes nothing: the second pass finds no disagreement.
-- Take _backup_before_repair.sql first if you have not.
-- ===========================================================================

with call_machine as (
  select c.ucn, c.product_name, c.serial, c.complaint_date,
         coalesce(btrim(c.item_status), '') as on_the_call,
         lower(btrim(coalesce(c.product_name, ''))) as pkey,
         lower(btrim(coalesce(c.serial, ''))) as skey
    from public.calls c
   where coalesce(btrim(c.serial), '') <> ''
     and coalesce(btrim(c.product_name), '') <> ''
     and c.complaint_date is not null
),
warranted as (       -- a warranty period covering the complaint date
  select m.ucn from call_machine m
   where exists (select 1 from public.sale_items s
                  where lower(btrim(coalesce(s.product_name, ''))) = m.pkey
                    and lower(btrim(coalesce(s.serial_number, ''))) = m.skey
                    and s.warranty_start is not null and s.warranty_end is not null
                    and m.complaint_date between s.warranty_start and s.warranty_end)
),
contracted as (      -- a contract period covering it, with its type
  select distinct on (m.ucn) m.ucn, public.cover_code(c.contract_type) as ctype
    from call_machine m
    join public.contract_items c
      on lower(btrim(coalesce(c.product_name, ''))) = m.pkey
     and lower(btrim(coalesce(c.serial_number, ''))) = m.skey
   where c.contract_start is not null and c.contract_end is not null
     and m.complaint_date between c.contract_start and c.contract_end
   order by m.ucn, c.contract_end desc
),
judged as (
  select m.*,
         case
           when w.ucn is not null                              then 'WGP'
           when k.ucn is not null and coalesce(k.ctype,'') <> '' then k.ctype
           when k.ucn is not null                              then ''      -- contract, type not recorded
           -- NO PERIOD COVERS IT, and that is only OGP if the registers HOLD
           -- periods for this machine. A machine with no dated record at all
           -- is unknown, not out of cover.
           when exists (select 1 from public.sale_items s
                         where lower(btrim(coalesce(s.product_name,''))) = m.pkey
                           and lower(btrim(coalesce(s.serial_number,''))) = m.skey
                           and s.warranty_start is not null)
             or exists (select 1 from public.contract_items c2
                         where lower(btrim(coalesce(c2.product_name,''))) = m.pkey
                           and lower(btrim(coalesce(c2.serial_number,''))) = m.skey
                           and c2.contract_start is not null)
                                                               then 'OGP'
           else ''                                                          -- nothing dated: no opinion
         end as in_force
    from call_machine m
    left join warranted  w on w.ucn = m.ucn
    left join contracted k on k.ucn = m.ucn
)
, targets as (
  select ucn, on_the_call, in_force from judged j
   where in_force <> '' and on_the_call <> in_force
     -- AN "OGP" VERDICT IS INFERRED FROM ABSENCE, AND ABSENCE LIES.
     --
     -- Every other verdict is a FOUND fact: a warranty or contract row whose
     -- dates span the complaint date. OGP is the opposite -- nothing was found
     -- -- and that is only out-of-cover if the machine's records are COMPLETE.
     -- A machine whose CONTRACT was imported and whose WARRANTY never was gets
     -- judged OGP on no warranty evidence at all, and writing it would turn
     -- missing data into a fact on a quality record.
     --
     -- So OGP is written only where the machine HAS a warranty on file that
     -- simply does not cover this date. Then the warranty really had ended.
     -- _is_the_ogp_verdict_safe.sql counts what this excludes.
     and (j.in_force <> 'OGP'
          or exists (select 1 from public.sale_items s
                      where lower(btrim(coalesce(s.product_name, ''))) = j.pkey
                        and lower(btrim(coalesce(s.serial_number, ''))) = j.skey
                        and s.warranty_start is not null))
),
done as (
  update public.calls c set item_status = t.in_force
    from targets t where t.ucn = c.ucn
  returning c.ucn, t.on_the_call as was, t.in_force as now_is
)
select (select count(*) from done)::text as calls_corrected,
       coalesce((select string_agg(p || ' (' || n || ')', ', ' order by n::int desc)
                   from (select was || ' -> ' || now_is as p, count(*)::text as n
                           from done group by 1 order by count(*) desc limit 8) x), 'none') as what_changed,
       'Run the probe again -- row 4 should now be 0.' as next;
