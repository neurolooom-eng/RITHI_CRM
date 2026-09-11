-- ===========================================================================
-- 0164 — cr_read asks its questions ONCE per query, not once per row.
--
-- Reported 2026-09-11: "the Party drop-down keeps failing for the engineers ...
-- it works perfectly fine for me". The browser showed `canceling statement due
-- to statement timeout`.
--
-- WHAT IT IS. `cr_read` called its helpers BARE:
--
--   can_view_all_calls() or created_by = auth.uid() or lower(email) = ...
--
-- so Postgres evaluated them FOR EVERY ROW of call_requests. The sister policy
-- on the call tables (`calls_scoped_read`, 0127) wraps each one as
-- `(select f())`, which makes it an InitPlan evaluated ONCE — the same
-- treatment hso_write was given in 0095. cr_read never got it.
--
-- WHY IT HITS ENGINEERS AND NOT THE ADMINISTRATOR. The OR short-circuits. For
-- an administrator `can_view_all_calls()` is true at its first test
-- (`is_admin()`), so the row is admitted after one lookup. For an engineer it
-- is false, and only after all three of its branches have run; then
-- `auth.uid()` runs, then `auth.email()`. Every row, every time.
--
-- AND THE COST IS THE WHOLE TABLE, NOT WHAT THEY SEE. An engineer who can see
-- 112 requests still makes the database test all of them to find those 112.
--
-- MEASURED, on 3,000 requests with genuinely partial visibility (the engineer
-- sees 1,220 of 3,000):
--
--     engineer   1,840 ms  ->  7.4 ms
--     admin        189 ms  ->  5.5 ms
--
-- The 10x gap between the two IS the reported symptom, and it grows linearly
-- with the register: at the volume this database is heading for, an engineer's
-- read of the Call Request page approaches the 20-second statement timeout —
-- and a saturated instance is what takes the party search down with it.
--
-- VISIBILITY IS UNCHANGED, and that was proved rather than assumed: the rows
-- returned to an engineer and to an administrator were captured under the old
-- policy and the new one and diffed — byte-identical both times, on data where
-- each branch of the OR actually admits a different set (300 by registrant, 30
-- by e-mail, 1,000 by team).
--
-- MUST STAY LAST in the `call_requests` module of build-apply-bundles.mjs:
-- 0003 and 0053 both define cr_read, and a bundle replayed alone would put the
-- per-row version back.
-- ===========================================================================

drop policy if exists cr_read on public.call_requests;
create policy cr_read on public.call_requests for select to authenticated
  using (
    -- Each of these is now an InitPlan: one evaluation for the whole query.
        (select public.can_view_all_calls())
     or created_by = (select auth.uid())
     or lower(email) = lower((select auth.email()))
    -- Already a hashed SubPlan (one execution, then a hash probe per row), so
    -- it is left as it is.
     or lower(btrim(engineer)) in (
          select lower(btrim(v.n)) from public.visible_engineer_names() v(n))
  );
