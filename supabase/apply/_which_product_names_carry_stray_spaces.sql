-- ===========================================================================
-- WHICH PRODUCT NAMES DO NOT SAY WHAT THEY LOOK LIKE.  Read-only.
--
-- Run this after: "This happens in Extend XT product only" (2026-09-24), where
-- the Call Registration Request offered a product, found no machine under it,
-- and refused the request for serials that are plainly on the register.
--
-- A NAME WITH A STRAY SPACE IS TWO PRODUCTS TO POSTGRES AND ONE TO A READER.
-- `EXTEND-XT ` and `EXTEND-XT` are different values, so a `group by item_name`
-- SPLITS the machine count in two, silently, and whoever reads it believes both
-- halves -- the same argument this project settled for the cover vocabulary in
-- 0208. The Product picker shows both, one looking like a duplicate of the
-- other.
--
-- THE APPLICATION SIDE IS ALREADY FIXED (v0.9.366): the machine search matches
-- the name exactly as the picker offered it, so Extend XT works today whatever
-- this report says. This is the DATA side, and it is a decision rather than a
-- repair, because merging two groups changes counts people may have quoted.
--
-- TWO KINDS OF STRAY CHARACTER, AND THEY ARE NOT EQUALLY SAFE TO CORRECT:
--
--   A SPACE AT EITHER END is free to fix. `products.machine_key` is generated
--   as lower(btrim(item_name)) || '|' || lower(btrim(serial_number)), so the
--   key ALREADY ignores it: trimming the name leaves every machine_key byte for
--   byte the same, nothing can collide, and nothing downstream that joins on
--   the key moves. Row 4 proves that on your own data rather than asserting it.
--
--   A NON-BREAKING OR ZERO-WIDTH CHARACTER (U+00A0 from a spreadsheet paste,
--   U+200B from a web copy) is NOT free. btrim() does not remove it -- it reads
--   as a space, prints as a space, and is a different character -- so it IS
--   part of machine_key, and replacing it CHANGES the key. If a machine with
--   the same serial already exists under the real-space name, the unique index
--   refuses the update. Row 5 counts exactly those.
--
-- NOTHING IS WRITTEN BY THIS FILE.
-- ===========================================================================

with names as (
  select coalesce(item_name, '')                                          as raw,
         -- The name as a reader sees it: the invisible characters swept to
         -- ordinary spaces, then the ends trimmed.
         btrim(translate(coalesce(item_name, ''), e' ​‌‍﻿\t\r\n', '       ')) as clean,
         count(*)::int                                                    as machines
    from public.products
   group by 1, 2
),
odd as (select * from names where raw <> clean)
select
  1                                                            as sort_order,
  'names carrying something invisible'                         as section,
  '[' || o.raw || ']'                                          as finding,
  o.machines                                                   as n,
  'length ' || length(o.raw) || ', as a reader sees it ' || length(o.clean)
    || case when btrim(o.raw) = o.clean then ' -- a plain space at one end, SAFE to trim'
            else ' -- NON-BREAKING OR ZERO-WIDTH, see row 5 before changing it' end
                                                               as detail
  from odd o
union all
-- The clean name it would merge INTO, where one already exists. A row cannot
-- appear here as its own twin: everything in `odd` has raw <> clean, and this
-- asks only for names where raw = clean.
select 2, 'the clean name it would merge into',
       '[' || n.raw || ']', n.machines,
       'already on the register under this exact spelling'
  from names n
 where n.raw = n.clean
   and exists (select 1 from odd o where o.clean = n.raw)
union all
select 3, 'machines sitting under a name with a stray character',
       'across ' || (select count(*) from odd) || ' name(s)',
       coalesce((select sum(machines) from odd), 0)::int,
       'the machines whose Product box could not find them'
union all
-- ROW 4 PROVES THE CLAIM ABOVE RATHER THAN REPEATING IT: trimming the ends
-- leaves machine_key identical, so a trim can collide with nothing.
select 4, 'machines whose machine_key would CHANGE if the ends were trimmed',
       case when count(*) = 0 then 'none -- trimming the ends is safe here'
            else 'unexpected: trimming would move the key, look before updating' end,
       count(*)::int,
       'machine_key is lower(btrim(item_name))|lower(btrim(serial)) -- it already ignores the ends'
  from public.products p
 where lower(btrim(coalesce(p.item_name, ''))) is distinct from lower(btrim(btrim(coalesce(p.item_name, ''))))
union all
-- ROW 5 IS THE ONE THAT DECIDES whether the invisible-character names can be
-- swept: their key DOES move, so a machine of the same serial already under the
-- real-space name would collide with the unique index.
select 5, 'machines that would COLLIDE if the invisible characters were swept',
       case when count(*) = 0 then 'none -- a sweep would apply cleanly'
            else 'DO NOT RUN A BLIND UPDATE -- look at these rows first' end,
       count(*)::int,
       'same serial already exists under the real-space spelling'
  from public.products p
  join odd o on o.raw = coalesce(p.item_name, '') and btrim(o.raw) <> o.clean
 where exists (
   select 1 from public.products q
    where q.id <> p.id
      and lower(btrim(coalesce(q.item_name, ''))) = lower(o.clean)
      and lower(btrim(coalesce(q.serial_number, ''))) = lower(btrim(coalesce(p.serial_number, ''))))
union all
-- AND THE SAME QUESTION OF THE TWO REGISTERS THAT NAME A MACHINE, because the
-- Product Database matches a contract and an installation call to a machine by
-- product + serial + party (0239): a stray character on either side stops it.
select 6, 'sale lines whose product name carries a stray character',
       'sale_items (Warranty Sale Details)', count(*)::int,
       'these will not match their machine in Product Database'
  from public.sale_items s
 where coalesce(s.product_name, '')
    <> btrim(translate(coalesce(s.product_name, ''), e' ​‌‍﻿\t\r\n', '       '))
union all
select 7, 'contract lines whose product name carries a stray character',
       'contract_items (Contract Details)', count(*)::int,
       'these will not match their machine in Product Database'
  from public.contract_items ci
 where coalesce(ci.product_name, '')
    <> btrim(translate(coalesce(ci.product_name, ''), e' ​‌‍﻿\t\r\n', '       '))
order by sort_order, n desc, finding;
