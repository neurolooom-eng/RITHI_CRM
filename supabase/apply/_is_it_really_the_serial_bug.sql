-- ===========================================================================
-- ARE THE 1,439 REALLY THE SERIAL BUG? PROBABLY NOT, AND HERE IS THE TEST.
--
-- Read-only. Paste into the Supabase SQL editor. Row 1 first.
--
-- _calls_with_the_wrong_cover.sql reported 2,532 calls whose item status
-- disagrees with their machine, 1,439 of them on an ambiguous serial, and said
-- that CMC->OGP and OGP->CMC appearing together "is the signature of a lookup
-- picking arbitrarily". THAT LINE WAS WRONG AND I WROTE IT.
--
-- Every pair in that breakdown is explained by TIME alone:
--
--   CMC -> OGP   a contract expired after the call
--   OGP -> CMC   a contract was bought after the call
--   WGP -> OGP   the warranty ran out
--   WGP -> CMC   the warranty ended and a contract began
--
-- A call records what was true WHEN IT WAS RAISED. Cover changing since is the
-- system working, not a fault. So a disagreement proves nothing on its own,
-- and "1,439" is not a count of anything broken.
--
-- THE REAL TEST IS WHETHER AMBIGUITY IS ASSOCIATED WITH DISAGREEMENT. If the
-- serial bug caused these, calls on an ambiguous serial would disagree MORE
-- OFTEN than calls on a serial only one machine wears. Rows 3 and 4 are those
-- two rates, on the same denominator -- calls, not machines, which is the
-- comparison I got wrong in chat.
--
-- Row 6 is sharper still: if the bug filled the cover, the value on the call
-- should be the value on ONE OF THE OTHER MACHINES WEARING THAT SERIAL.
-- ===========================================================================
with amb as (
  select serial_key from public.products
   where coalesce(btrim(serial_number), '') <> ''
   group by serial_key having count(distinct lower(btrim(item_name))) > 1
),
paired as (
  select c.ucn, c.product_name, c.serial, c.item_status as on_the_call,
         p.item_status as on_the_machine,
         lower(btrim(coalesce(c.serial, ''))) as skey,
         (lower(btrim(coalesce(c.serial, ''))) in (select serial_key from amb)) as ambiguous,
         (coalesce(btrim(c.item_status), '') is distinct from coalesce(btrim(p.item_status), '')) as disagrees
    from public.calls c
    join public.products p
      on p.machine_key = lower(btrim(coalesce(c.product_name, ''))) || '|' || lower(btrim(coalesce(c.serial, '')))
   where coalesce(btrim(c.serial), '') <> ''
)
select * from (
  select 1 as n, 'Calls matched to their own machine' as question,
         (select count(*)::text from paired) as answer,
         'The denominator for everything below. CALLS, not machines.' as what_it_means
  union all
  select 2, '   ...of which, on an ambiguous serial',
         (select count(*) filter (where ambiguous)::text || ' of ' || count(*)::text
            || '  (' || round(100.0 * count(*) filter (where ambiguous) / nullif(count(*), 0)) || '%)' from paired),
         'THE BASE RATE. Compare rows 3 and 4 against this, not against a count of machines.'
  union all
  select 3, 'Disagreement rate ON an ambiguous serial',
         (select round(100.0 * count(*) filter (where disagrees) / nullif(count(*), 0))::text || '%'
            || '  (' || count(*) filter (where disagrees)::text || ' of ' || count(*)::text || ')'
            from paired where ambiguous),
         'If the serial bug were doing this, THIS number would be the high one.'
  union all
  select 4, 'Disagreement rate on a serial only ONE machine wears',
         (select round(100.0 * count(*) filter (where disagrees) / nullif(count(*), 0))::text || '%'
            || '  (' || count(*) filter (where disagrees)::text || ' of ' || count(*)::text || ')'
            from paired where not ambiguous),
         'THE CONTROL. The serial bug CANNOT touch these calls -- there is only one machine to find. Whatever rate they show is what TIME alone produces.'
  union all
  select 5, 'VERDICT on rows 3 and 4',
         case
           when (select count(*) from paired where ambiguous) = 0
             or (select count(*) from paired where not ambiguous) = 0 then 'not enough of one kind to compare'
           when (select 1.0 * count(*) filter (where disagrees) / count(*) from paired where ambiguous)
              > (select 1.2 * count(*) filter (where disagrees) / count(*) from paired where not ambiguous)
             then 'AMBIGUOUS SERIALS DISAGREE MORE -- the bug is doing real damage; size it from row 6'
           else 'NO ASSOCIATION -- the disagreements are cover changing over time, not the serial bug' end,
         'A rate that is the same either side means ambiguity explains nothing, however large 1,439 looks.'
  union all
  select 6, 'THE SHARP TEST: the call''s status matches a SIBLING machine',
         (select count(*)::text from paired q
           where q.ambiguous and q.disagrees
             and exists (select 1 from public.products s
                          where s.serial_key = q.skey
                            and lower(btrim(s.item_name)) is distinct from lower(btrim(q.product_name))
                            and coalesce(btrim(s.item_status), '') = coalesce(btrim(q.on_the_call), ''))),
         'If the lookup filled the cover, the value on the call IS some other machine''s. Read row 7 before believing this one.'
  union all
  select 7, '   ...but how often would that happen BY CHANCE?',
         (select round(100.0 * count(*) filter (
                    where exists (select 1 from public.products s
                                   where s.serial_key = q.skey
                                     and lower(btrim(s.item_name)) is distinct from lower(btrim(q.product_name))
                                     and coalesce(btrim(s.item_status), '') = coalesce(btrim(q.on_the_machine), '')))
                  / nullif(count(*), 0))::text || '%'
            from paired q where q.ambiguous and q.disagrees),
         'THE SAME TEST WITH THE MACHINE''S OWN value instead of the call''s. There are only four cover codes, so a sibling match happens often by luck -- if this is near row 6''s share, row 6 is luck too.'
) rows order by n;
