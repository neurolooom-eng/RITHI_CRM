-- ===========================================================================
-- 0460 -- A DEVICE'S COPY OF THE MACHINE REGISTER AND THE PARTY MASTER ASKS
-- WHETHER ANYTHING CHANGED (the user, 2026-10-27, after 0457 re-mapped
-- VEGA | 31 to LOTUS on the database: "Why is VEGA|31 still with the Wrong
-- customer?").
--
-- The copy each phone and laptop keeps (machinestore.ts) refreshed on AGE
-- alone -- every six hours, the Party Master every ten days -- and never asked
-- the server, so a change made there (an edit, an upload, a one-time mapping)
-- stayed invisible on a device for hours. Now, on its regular check, a device
-- asks: is any row's sys_updated_on (0244, stamped by the database) later than
-- the latest one in my copy? One indexed lookup, LIMIT 1. These two indexes
-- are what make it one.
-- ===========================================================================
create index if not exists products_sys_updated_on_idx on public.products (sys_updated_on desc);
create index if not exists parties_sys_updated_on_idx on public.parties (sys_updated_on desc);
