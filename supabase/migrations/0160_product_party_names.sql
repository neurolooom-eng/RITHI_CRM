-- ===========================================================================
-- THE PARTY LIST COMES FROM THE PRODUCT REGISTER.
--
-- The user, 2026-09-10: "In all Party-Product-Serial no search mechanism - loop
-- the Product Master instead of Party Master + Product Master. Party Name =
-- Unique of Party Name from Product Master."
--
-- WHY IT IS THE RIGHT SOURCE, and it is the same reasoning already applied to
-- PRODUCT names on Product & Party Search (0098): the Party Master is a list
-- somebody maintains, and the Product Register is the record of what actually
-- exists. A Party→Product→Serial cascade starts by asking "whose machine is
-- this?" — and a party with no machines cannot answer it. Offering one is
-- offering a dead end: the reader picks it, the product list comes back empty,
-- and nothing on screen explains why.
--
-- It also closes the case-mismatch class for good. The party you pick now comes
-- from the same column the machines are looked up by, so the name in hand is by
-- construction a name the register holds — which is what
-- "CAPTAIN SAURABH KALIA MEMORIAL KAYDEE HOSPITAL" was not, against a Party
-- Master row spelled in Title Case (2026-09-09).
--
-- ONE REQUEST, NOT TWENTY-ONE. The client's own distinct-column helper pages
-- through the whole table 1,000 rows at a time — 21 round trips on a register
-- of 21,000 machines, every time a form opens. Postgres does the DISTINCT here
-- in one.
--
-- THE COUNT IS CARRIED because the picker can show it, and it answers the
-- question a reader actually has when two similar names are on screen: which of
-- these is the one with the machines on it.
--
-- SECURITY INVOKER, so `products_read` decides who sees it rather than the
-- view's owner — the fault that has exposed data three times here (0040, 0050,
-- 0057). `products_read` is `auth.role() = 'authenticated'`, so this is cheap:
-- no per-row function, unlike the call tables.
-- ===========================================================================

create or replace view public.product_party_names as
  select party_name,
         count(*)::integer as machines
    from public.products
   where coalesce(btrim(party_name), '') <> ''
   group by party_name;

alter view public.product_party_names set (security_invoker = on);
grant select on public.product_party_names to authenticated;

-- The GROUP BY reads every row, so give it an index to group from rather than
-- sorting 21,000 rows on each form open.
create index if not exists products_party_name_group_idx
  on public.products (party_name);

comment on view public.product_party_names is
  'Distinct party names FROM THE PRODUCT REGISTER, with how many machines each holds — the source for every Party→Product→Serial picker. The Party Master is a maintained list; this is the record of what exists, and a party with no machines cannot answer "whose machine is this?". Installation call requests are the one exception and fall back to the Party Master and free text, because an installation reaches a customer who has no machine yet (0160).';
