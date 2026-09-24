-- ===========================================================================
-- WHERE IS THIS MACHINE, REGISTER BY REGISTER?   Read-only. Nothing is written.
--
-- Run this when a Call Registration Request refuses a machine you can see
-- elsewhere in the app -- "that serial is not on the register, so no customer
-- came with it" -- and you want to know WHICH register is missing it rather
-- than guessing.
--
-- WHY THAT QUESTION IS THE RIGHT ONE. The Call Request's Product box and its
-- serial search both read ONE table, `public.products` (the install base,
-- labelled Product Database). The Warranty Register, the Contract Register and
-- Product Database 2.0 read DIFFERENT tables. So a machine can be perfectly
-- visible on one screen and invisible to the request form, and that is not a
-- contradiction -- it is the two screens reading two registers.
--
-- >>> EDIT THE TWO VALUES IN `ask` BELOW AND RUN THE WHOLE FILE. <<<
--
-- Row 1 prints back what it searched for, and is read FIRST every time: left
-- unchanged it says so, rather than returning a confident grid about nothing.
-- ===========================================================================

with ask as (
  select
    -- The product as the Product box spells it, or any part of it.
    'CHANGE-ME-PRODUCT'::text as product,      -- e.g.  EXTEND XT
    -- The serial as you would type it.
    'CHANGE-ME-SERIAL'::text  as serial        -- e.g.  INXT 0105
),
k as (
  select product, serial,
         lower(btrim(product))                               as p_key,
         lower(btrim(serial))                                as s_key,
         -- SPACES SQUASHED, because "INXT 0105" and "INXT0105" are the same
         -- machine to a person and two different values to Postgres. If the
         -- registers disagree only here, that IS the answer.
         replace(lower(btrim(serial)), ' ', '')              as s_squash
    from ask
)
select 1 as sort_order, 'what this run searched for' as section,
       'product [' || k.product || ']  serial [' || k.serial || ']' as finding,
       null::int as n,
       case when k.product like 'CHANGE-ME%' or k.serial like 'CHANGE-ME%'
            then 'NOT CHANGED -- edit the two values in `ask` at the top and run it again'
            else 'read this row first, every time' end as detail
  from k
union all
-- 2. CAN THE PRODUCT BOX EVEN OFFER THIS PRODUCT? It is filled by grouping
--    products.item_name, so a product with no machine in `products` is not on
--    that list at all.
select 2, 'product names in the install base matching your text',
       '[' || p.item_name || ']', count(*)::int,
       'this is what the Product box offers, and the search then matches it exactly'
  from public.products p, k
 where lower(btrim(coalesce(p.item_name, ''))) like '%' || k.p_key || '%'
 group by p.item_name
union all
-- 3. THE MACHINE ITSELF, in the register the request form reads.
select 3, 'the install base (public.products) -- WHAT THE REQUEST FORM SEARCHES',
       '[' || coalesce(p.item_name, '') || ']  ' || coalesce(p.party_name, '(no customer)'),
       1,
       'serial as stored: [' || coalesce(p.serial_number, '') || ']'
  from public.products p, k
 where lower(btrim(coalesce(p.serial_number, ''))) = k.s_key
    or replace(lower(btrim(coalesce(p.serial_number, ''))), ' ', '') = k.s_squash
union all
-- 4. THE MACHINE IS ITS MODEL AND ITS SERIAL, NEVER THE SERIAL ALONE. The
--    install base holds eleven machines numbered 219, so "something with that
--    serial exists" is not the question and answering it is how this probe's
--    own first draft reported a DIFFERENT machine as the one being looked for.
select 4, 'the install base -- rows for THIS MODEL AND THIS SERIAL', 'model + serial',
       (select count(*) from public.products p, k
         where lower(btrim(coalesce(p.item_name, ''))) = k.p_key
           and (lower(btrim(coalesce(p.serial_number, ''))) = k.s_key
             or replace(lower(btrim(coalesce(p.serial_number, ''))), ' ', '') = k.s_squash))::int,
       'the form can only offer a machine that is here'
union all
select 5, 'the install base -- OTHER models carrying that serial', 'serial alone',
       (select count(*) from public.products p, k
         where lower(btrim(coalesce(p.item_name, ''))) <> k.p_key
           and (lower(btrim(coalesce(p.serial_number, ''))) = k.s_key
             or replace(lower(btrim(coalesce(p.serial_number, ''))), ' ', '') = k.s_squash))::int,
       'a serial is not unique on its own -- these are DIFFERENT machines'
union all
-- 5..7  THE OTHER REGISTERS. If the machine is HERE and not above, the install
--       base simply has not been told about it.
select 6, 'the Warranty Register (sale_items)',
       '[' || coalesce(si.product_name, '') || ']  SA ' || coalesce(si.sa_number, ''), 1,
       'serial as stored: [' || coalesce(si.serial_number, '') || ']'
  from public.sale_items si, k
 where lower(btrim(coalesce(si.serial_number, ''))) = k.s_key
    or replace(lower(btrim(coalesce(si.serial_number, ''))), ' ', '') = k.s_squash
union all
select 7, 'the Contract Register (contract_items)',
       '[' || coalesce(ci.product_name, '') || ']  MC ' || coalesce(ci.mc_number, ''), 1,
       'serial as stored: [' || coalesce(ci.serial_number, '') || ']'
  from public.contract_items ci, k
 where lower(btrim(coalesce(ci.serial_number, ''))) = k.s_key
    or replace(lower(btrim(coalesce(ci.serial_number, ''))), ' ', '') = k.s_squash
union all
select 8, 'installation calls',
       '[' || coalesce(c.product_name, '') || ']  ' || coalesce(c.ucn, ''), 1,
       'serial as stored: [' || coalesce(c.serial, '') || ']'
  from public.installation_calls c, k
 where lower(btrim(coalesce(c.serial, ''))) = k.s_key
    or replace(lower(btrim(coalesce(c.serial, ''))), ' ', '') = k.s_squash
union all
-- 8. THE VERDICT, stated rather than left to be inferred from five sections.
select 9, 'so what is it?',
       case
         when (select count(*) from public.products p, k
                where lower(btrim(coalesce(p.item_name,''))) = k.p_key
                  and (lower(btrim(coalesce(p.serial_number,''))) = k.s_key
                    or replace(lower(btrim(coalesce(p.serial_number,''))),' ','') = k.s_squash)) > 0
           then 'THIS MACHINE IS IN THE INSTALL BASE. A missing row is not the fault -- compare the product SPELLING in section 2 with what the Product box shows you, and check the serial spelling in section 3.'
         when (select count(*) from public.products p, k
                where lower(btrim(coalesce(p.serial_number,''))) = k.s_key
                   or replace(lower(btrim(coalesce(p.serial_number,''))),' ','') = k.s_squash) > 0
           then 'A DIFFERENT MACHINE CARRIES THAT SERIAL. Section 5 names it. The one you are after is not in the install base under this model, and a serial does not identify a machine on its own -- eleven of them are numbered 219.'
         when (select count(*) from public.sale_items si, k
                where lower(btrim(coalesce(si.serial_number,''))) = k.s_key
                   or replace(lower(btrim(coalesce(si.serial_number,''))),' ','') = k.s_squash) > 0
           then 'SOLD BUT NEVER ADDED TO THE INSTALL BASE. The Warranty Register has it and public.products does not, so the Call Request form cannot offer it. Migration 0237 is what puts every sold machine into the install base, and it backfills the ones already sold.'
         else 'Not in any register under that serial. Check the spelling against section 2, or the machine has not been loaded yet.'
       end,
       null::int,
       'the sections above are the evidence for this line'
union all
-- 9. HOW MANY MACHINES THE WHOLE PRODUCT IS MISSING, since one serial is an
--    example and the decision is about the product.
select 10, 'sold machines of this product that are NOT in the install base',
       'across the whole Warranty Register', count(*)::int,
       'each of these is a machine the Call Request form cannot offer'
  from public.sale_items si, k
 where lower(btrim(coalesce(si.product_name, ''))) like '%' || k.p_key || '%'
   and not exists (
     select 1 from public.products p
      where lower(btrim(coalesce(p.item_name, ''))) = lower(btrim(coalesce(si.product_name, '')))
        and lower(btrim(coalesce(p.serial_number, ''))) = lower(btrim(coalesce(si.serial_number, ''))))
order by sort_order, n desc nulls last, finding;
