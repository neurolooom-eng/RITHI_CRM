-- ===========================================================================
-- HOW MANY CALLS WERE GIVEN ANOTHER MACHINE'S COVER?
--
-- Read-only. Paste into the Supabase SQL editor. Row 1 first.
--
-- The user, 2026-09-21: "in Call Registration - Field Calls the item status is
-- incorrect ... in Product Master it is WGP, but when I register the call it
-- shows as OGP".
--
-- THE CAUSE, found in the code and not guessed at: registering a call from a
-- request looked the machine up by SERIAL ALONE --
-- `.eq('serial_key', ...).limit(1)` -- and `serial_key` is
-- `lower(btrim(serial_number))`, which is NOT unique. `machine_key` is
-- `model|serial` and IS. So where two machines share a serial the lookup
-- returned AN ARBITRARY ONE, and its item status, warranty and contract were
-- filled onto a call for the other one. This system's own rule, written after
-- the eleven machines numbered 219: A MACHINE IS ITS MODEL AND ITS SERIAL.
--
-- Fixed in the application (v0.9.329): it keys on model+serial, and where no
-- product is known an ambiguous serial fills NOTHING and says so, rather than
-- picking one.
--
-- THIS FILE IS ABOUT THE CALLS ALREADY REGISTERED. Row 4 is the number that
-- matters. Nothing here changes anything.
-- ===========================================================================
with amb as (        -- serials worn by more than one MODEL
  select serial_key, count(distinct lower(btrim(item_name))) as models
    from public.products
   where coalesce(btrim(serial_number), '') <> ''
   group by serial_key having count(distinct lower(btrim(item_name))) > 1
),
paired as (          -- each call beside ITS OWN machine, keyed properly
  select c.ucn, c.call_type, c.product_name, c.serial, c.item_status as on_the_call,
         p.item_status as on_the_machine,
         (lower(btrim(coalesce(c.serial, ''))) in (select serial_key from amb)) as serial_is_ambiguous
    from public.calls c
    join public.products p
      on p.machine_key = lower(btrim(coalesce(c.product_name, ''))) || '|' || lower(btrim(coalesce(c.serial, '')))
   where coalesce(btrim(c.serial), '') <> ''
)
select * from (
  select 1 as n, 'Serials worn by more than one model' as question,
         (select count(*)::text from amb) as answer,
         'The machines this can happen to at all. Zero here means the fault could never have fired on your data.' as what_it_means
  union all
  select 2, '   ...the machines involved',
         (select coalesce(sum(models), 0)::text from amb),
         'Each of these is a machine that could have lent its cover to another.'
  union all
  select 3, 'Calls matched to their own machine',
         (select count(*)::text from paired),
         'Calls whose model+serial names exactly one machine in Product Database. The rest cannot be judged from here.'
  union all
  select 4, '   ...whose item status DISAGREES with that machine',
         (select count(*)::text from paired where coalesce(btrim(on_the_call), '') is distinct from coalesce(btrim(on_the_machine), '')),
         'THE NUMBER THAT MATTERS. Not all of these are this bug -- cover legitimately changes when a warranty runs out, and a call records what was true THEN.'
  union all
  select 5, '   ...and of those, how many are on an AMBIGUOUS serial',
         (select count(*)::text from paired
           where coalesce(btrim(on_the_call), '') is distinct from coalesce(btrim(on_the_machine), '')
             and serial_is_ambiguous),
         'THIS bug''s fingerprint. A disagreement on a serial only ONE machine wears is something else -- most likely the cover changing with time, which is correct.'
  union all
  select 6, '   ...an example (UCN | model | serial | on the call | on the machine)',
         coalesce((select ucn || '  |  ' || product_name || '  |  ' || serial || '  |  '
                     || coalesce(nullif(btrim(on_the_call), ''), '(blank)') || '  |  '
                     || coalesce(nullif(btrim(on_the_machine), ''), '(blank)')
                     from paired
                    where coalesce(btrim(on_the_call), '') is distinct from coalesce(btrim(on_the_machine), '')
                      and serial_is_ambiguous limit 1), 'none'),
         'Check this one in Product Database before deciding anything.'
  union all
  select 7, 'What the disagreements look like',
         coalesce((select string_agg(pair || ' (' || c || ')', ', ' order by c::int desc)
                     from (select coalesce(nullif(btrim(on_the_call), ''), '(blank)') || ' -> '
                                  || coalesce(nullif(btrim(on_the_machine), ''), '(blank)') as pair,
                                  count(*)::text as c
                             from paired
                            where coalesce(btrim(on_the_call), '') is distinct from coalesce(btrim(on_the_machine), '')
                            group by 1 order by count(*) desc limit 6) x), 'none'),
         'Reads "what the call says -> what the machine says". WGP -> OGP and OGP -> WGP both appearing is the signature of a lookup picking arbitrarily.'
  union all
  select 8, 'REPAIR',
         'Not offered here, deliberately.',
         'A call''s cover is a record of what was true WHEN IT WAS RAISED, and a warranty that has since expired SHOULD disagree with the machine today. Correcting them wholesale would overwrite history to fix a subset. Send me rows 5 and 7 and we will scope it to the ones that are really this bug.'
) rows order by n;
