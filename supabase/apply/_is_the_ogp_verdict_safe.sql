-- ===========================================================================
-- IS THE "OGP" VERDICT SAFE? IT IS INFERRED FROM ABSENCE, AND ABSENCE LIES.
--
-- Read-only. Paste into the Supabase SQL editor. Row 1 first.
--
-- _cover_as_at_the_complaint_date.sql found 1,580 calls disagreeing with the
-- registers for their own date, and two groups are almost all of it:
--
--   OGP -> CMC   935   the call said no cover; a contract period covered it
--   WGP -> OGP   588   the call said warranty; NO period covered it
--
-- THE FIRST IS EVIDENCE. A contract row with dates spanning the complaint date
-- is a positive fact: something was found.
--
-- THE SECOND IS AN INFERENCE FROM A GAP, and a gap has two causes:
--   (a) the machine really was out of warranty  -> OGP is right
--   (b) the warranty was never imported         -> OGP is WRONG, and writing
--       it overwrites a correct WGP with a guess drawn from missing data
--
-- The report treats a machine as judgeable if it has ANY dated record, so a
-- machine whose CONTRACT was imported and whose WARRANTY was not is judged OGP
-- on no warranty evidence at all. This file measures how much of the 588 sits
-- in that hole -- and it is the difference between a repair and a second
-- incident.
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
, wrong as (
  select j.*, 
         exists (select 1 from public.sale_items s
                  where lower(btrim(coalesce(s.product_name,''))) = j.pkey
                    and lower(btrim(coalesce(s.serial_number,''))) = j.skey
                    and s.warranty_start is not null) as has_warranty_record,
         exists (select 1 from public.contract_items c
                  where lower(btrim(coalesce(c.product_name,''))) = j.pkey
                    and lower(btrim(coalesce(c.serial_number,''))) = j.skey
                    and c.contract_start is not null) as has_contract_record
    from judged j
   where j.in_force <> '' and j.on_the_call <> j.in_force
)
select * from (
  select 1 as n, 'Calls the repair would change' as question,
         (select count(*)::text from wrong) as answer,
         'Row 4 of the other file, split below by how much evidence is behind each verdict.' as what_it_means
  union all
  select 2, 'SAFE -- corrected TO a cover that was FOUND (not inferred)',
         (select count(*)::text from wrong where in_force <> 'OGP'),
         'A warranty or contract row with dates spanning the complaint date. A positive fact: something was there. This is the OGP -> CMC group and the small ones.'
  union all
  select 3, 'INFERRED -- corrected TO OGP, because nothing was found',
         (select count(*)::text from wrong where in_force = 'OGP'),
         'THE GROUP TO BE CAREFUL WITH. "No period covers this date" is only out-of-cover if the records are COMPLETE for that machine.'
  union all
  select 4, '   ...of those, how many have a WARRANTY record at all',
         (select count(*)::text from wrong where in_force = 'OGP' and has_warranty_record),
         'SAFE ENOUGH. The machine''s warranty IS on file, it simply does not cover this date -- so the warranty really had ended.'
  union all
  select 5, '   ...and how many have NO warranty record, only a contract',
         (select count(*)::text from wrong where in_force = 'OGP' and not has_warranty_record),
         'DO NOT CORRECT THESE. Nothing says the machine was out of warranty -- only that no warranty was ever imported for it. Writing OGP would turn missing data into a fact.'
  union all
  select 6, '   ...an example of the unsafe kind',
         coalesce((select ucn || ' | ' || product_name || ' | ' || serial || ' | raised ' || complaint_date::text
                     || ' | call says ' || coalesce(nullif(on_the_call,''),'(blank)')
                     || ' | warranty on file: no | contract on file: yes'
                     from wrong where in_force = 'OGP' and not has_warranty_record order by ucn limit 1), 'none'),
         'Look this machine up. If it plainly had a warranty that is simply not in Sale Details, that is a master-data gap to fill, not a call to rewrite.'
  union all
  select 7, 'WHAT TO RUN',
         case when (select count(*) from wrong where in_force = 'OGP' and not has_warranty_record) = 0
              then 'All of it is safe: _fix_cover_as_at_the_complaint_date.sql as written.'
              else 'Run the SAFE subset only -- _fix_cover_as_at_the_complaint_date.sql with the guard in its PART 2 note.' end,
         'The repair file carries the narrowed form; it excludes an OGP verdict on a machine with no warranty record on file.'
) rows order by n;
