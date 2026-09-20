-- ===========================================================================
-- "HOW DOES A SUPER ADMIN NOT HAVE ACCESS TO SOMETHING???" — they do not, and
-- this was never a permission decision. It was a bug in 0220, and the answer to
-- the question is that NOTHING should have been refusing anybody here.
--
--   The user, 2026-09-20, as Rithi Admin / Permission · Admin:
--   "Your role does not have permission to read this."
--   ...and then: "RBAC is creaking my setup, so i am not running it."
--
-- WHAT 0220 GOT WRONG, precisely. It made `product_database_v2` a
-- `security_invoker` view — which reads AS THE CALLER — over a materialised
-- view it had just REVOKED from `authenticated`. Those two lines contradict
-- each other: the caller is required to hold a privilege that was deliberately
-- taken away, so the view refused EVERY reader, administrators included, with
-- `permission denied for materialized view product_database_v2_mv`. It is not
-- a role that is missing something; it is a view that cannot read its own
-- storage.
--
-- WHY THE TESTS DID NOT CATCH IT, WHICH MATTERS MORE THAN THE BUG. The suite
-- said `set local role authenticated` — and **SET LOCAL OUTSIDE A TRANSACTION
-- BLOCK IS A NO-OP**, a warning and nothing else. So every "as authenticated"
-- assertion in it actually ran as `postgres`, which is a superuser and bypasses
-- exactly the privilege check that was broken. The suite passed, twice, while
-- proving nothing about roles at all. It uses `set role` now, and
-- `product_database_2_materialised_test.sql` asserts an ADMIN CAN READ —
-- an assertion that FAILS against 0220 and passes against this file.
--
-- AND THE GATE ITSELF IS GONE, NOT REPAIRED. 0220 invented a permission
-- predicate for this screen that nothing else in its family has, and it is the
-- thing that broke. Four of the five sources this view assembles are already
-- readable by any signed-in user (`products` — the OLD Product Database, and
-- the ~20,000 machines on it — `product_additional_entries`,
-- `ownership_transfers`, and `machine_cover`, which publishes the same machine
-- and cover facts to everybody). The screen is gated where every other screen
-- is gated: by `mod:/product-database-2`, which 0219 put on the roles that hold
-- the old Product Database.
--
-- SAID PLAINLY, BECAUSE IT IS A REAL CHANGE: the warranty and contract detail
-- assembled here is now readable by any signed-in user who can open the screen,
-- where 0220 asked for `masters.view`, `cover.edit` or admin. That brings 2.0
-- into line with the Product Database beside it rather than out of line in the
-- other direction. Putting the gate back is one predicate and a grant, and it
-- is a decision for the user rather than for this file.
-- ===========================================================================

-- The storage the view reads. Granted, because a `security_invoker` view reads
-- AS THE CALLER — this is the half 0220 revoked and then required.
grant select on public.product_database_v2_mv to authenticated;

-- No predicate. A plain, fast pass-through: the machines, and when they were
-- last built. `security_invoker` is re-asserted because `create or replace`
-- drops it (0040/0050/0057), and it is re-asserted on a view that no longer
-- needs it, deliberately — the setting costs nothing and the next person to
-- add an RLS-protected table to this view inherits the right default.
drop view if exists public.product_database_v2 cascade;
create view public.product_database_v2 as
  select m.*, s.refreshed_at
    from public.product_database_v2_mv m
    cross join public.product_database_v2_state s;
alter view public.product_database_v2 set (security_invoker = on);
grant select on public.product_database_v2 to authenticated;
comment on view public.product_database_v2 is
  'Product Database 2.0 — one row per machine, as of refreshed_at. Readable by any signed-in user, like the Product Database beside it; the SCREEN is gated by mod:/product-database-2 (0219). 0220 gated the view itself and, by revoking the matview it reads as the caller, refused everybody including administrators (0221).';

-- The state row is read through the view above, so it needs the same audience.
-- Its policy stays as it is for anyone reading the table directly.
do $$ begin
  create policy pdv2_state_read_all on public.product_database_v2_state for select
    using (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;
