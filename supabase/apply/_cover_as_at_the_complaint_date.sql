-- ===========================================================================
-- WHAT COVER WAS ACTUALLY IN FORCE WHEN THE CALL WAS RAISED?
--
-- Read-only. Paste into the Supabase SQL editor. Row 1 first.
--
-- The user, 2026-09-22: "i want to fix existing calls as well".
--
-- IT CANNOT BE FIXED AGAINST THE MACHINE'S COVER TODAY. That comparison
-- produced 2,532 "disagreements" and the test showed them to be cover changing
-- over time -- a contract expiring, a warranty running out -- which the call is
-- RIGHT to have recorded differently. Writing today's value onto them would
-- destroy correct history to chase a fault that measured as absent.
--
-- THE DEFENSIBLE COMPARISON IS THE DATED ONE. Both cover registers carry
-- periods: `sale_items` has warranty_start/warranty_end, `contract_items` has
-- contract_start/contract_end. So for a call raised on a known date, the
-- registers can say what was in force ON THAT DATE -- and a call disagreeing
-- with THAT is wrong on its own terms, whenever it was raised and whatever has
-- happened since.
--
-- THE ORDER IS WARRANTY FIRST, as `product_database_v2` has it: a machine
-- inside its guarantee period is WGP even where a contract also exists.
-- A contract with no type recorded is left as a QUESTION rather than guessed
-- into CMC -- the same refusal 2.0 makes.
--
-- A MACHINE IS MODEL + SERIAL throughout. A call whose model+serial names more
-- than one machine, or none, is not judged here at all.
--
-- Nothing here changes anything. Row 7 is the repair, and it is not run.
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
select * from (
  select 1 as n, 'Calls with a model, a serial and a complaint date' as question,
         (select count(*)::text from judged) as answer,
         'The most that can be judged. Anything missing one of the three is left alone.' as what_it_means
  union all
  select 2, '   ...where the registers can say what was in force',
         (select count(*) filter (where in_force <> '')::text from judged),
         'A machine with NO dated warranty or contract record is UNKNOWN, not out of cover -- it gets no opinion here.'
  union all
  select 3, 'Calls that AGREE with the registers for their date',
         (select count(*) filter (where in_force <> '' and on_the_call = in_force)::text from judged),
         'Correct, whenever they were raised.'
  union all
  select 4, 'Calls that DISAGREE with what was in force then',
         (select count(*) filter (where in_force <> '' and on_the_call <> in_force)::text from judged),
         'THE REPAIRABLE SET. Unlike a disagreement with today''s cover, this one is wrong on its own terms.'
  union all
  select 5, '   ...how they are wrong',
         coalesce((select string_agg(p || ' (' || c || ')', ', ' order by c::int desc)
                     from (select coalesce(nullif(on_the_call,''),'(blank)') || ' -> ' || in_force as p,
                                  count(*)::text as c
                             from judged where in_force <> '' and on_the_call <> in_force
                            group by 1 order by count(*) desc limit 8) x), 'none'),
         'Reads "what the call says -> what the registers say for that date".'
  union all
  select 6, '   ...an example (UCN | model | serial | raised | says | should be)',
         coalesce((select ucn || ' | ' || product_name || ' | ' || serial || ' | '
                     || complaint_date::text || ' | ' || coalesce(nullif(on_the_call,''),'(blank)')
                     || ' | ' || in_force
                     from judged where in_force <> '' and on_the_call <> in_force
                    order by ucn limit 1), 'none'),
         'CHECK THIS ONE BY HAND before running anything. Open the machine in Product Database and read its warranty and contract dates against the complaint date.'
  union all
  select 7, 'REPAIR -- run _fix_cover_as_at_the_complaint_date.sql',
         'It sets item_status on exactly the calls in row 4, to the value the registers hold for that call''s own date.',
         'Read row 6 first and check one by hand. With the audit armed (0225) every change is recorded with the row before and after.'
) rows order by n;
