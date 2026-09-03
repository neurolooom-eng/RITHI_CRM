-- ===========================================================================
-- THE PRODUCT LIST COMES FROM THE PRODUCT REGISTER.
--
-- Product & Party Search was filling its product dropdown from the `product`
-- master value list. That is a list somebody maintains, and it can be empty,
-- short, or spelled differently from the register — which is what the screen
-- showed. The register itself is the authority on what products exist: a
-- machine is in it or it is not.
--
-- PostgREST cannot ask for `select distinct`, so the distinct list is a view.
-- It carries the count as well, because "MONNAL T75 (1,204)" tells the person
-- choosing far more than the name alone, and it costs nothing to group once.
--
-- The serial dropdown that depends on it needs no view: it is
-- `item_name = <the one chosen>`, which 0052's btree on products(item_name)
-- already serves. (A trigram index does NOT serve equality — that lesson cost
-- this project a fortnight of timeouts.)
-- ===========================================================================

create or replace view public.product_register_names as
  select item_name,
         count(*)::int as machines
    from public.products
   where coalesce(item_name, '') <> ''
   group by item_name;

-- `create or replace view` does NOT carry `security_invoker` forward, so it is
-- asserted every time the view is written. Without it the view would read the
-- register as its owner and hand back rows RLS meant to withhold.
alter view public.product_register_names set (security_invoker = on);

grant select on public.product_register_names to authenticated;
