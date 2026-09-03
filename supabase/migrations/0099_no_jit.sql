-- ===========================================================================
-- THE HAND STOCK TIMEOUT WAS JIT COMPILATION, NOT THE QUERY.
--
-- Hand Stock timed out, then took 11-14 seconds, then 3-5 after 0095. Every
-- reading pointed at row-level security, because switching RLS off made it
-- instant. It was the right symptom and the wrong cause. `EXPLAIN ANALYZE`
-- with the JIT block showing says it plainly:
--
--     Timing: Generation 23 ms, Inlining 145 ms,
--             Optimization 2134 ms, Emission 1440 ms, Total 3742 ms
--     Execution Time: 3912 ms
--
-- Three and three-quarter seconds COMPILING a query that then runs in under
-- two hundred milliseconds. The trigger is `jit_above_cost` (100,000): the
-- planner's ESTIMATE for the nine-arm movement view is half a million, almost
-- all of it invented by the cost of RLS sub-plans it will barely run. So the
-- more access rules a query carries, the more certain Postgres is to spend
-- seconds compiling it — and that is why turning RLS off "fixed" it.
--
-- With JIT off, and NOTHING else changed, the whole 102,893-row history reads
-- in 323 ms. Closed through 2025 it is 174 ms. Measured on a copy of the live
-- data, as the `authenticated` role, with every policy in force.
--
-- Nothing in this application benefits from JIT. These are sub-second API
-- queries; compiling them can only ever cost more than it saves. Off is the
-- right setting for the whole database, not a special case for one screen.
--
-- TO PUT IT BACK: `alter database postgres reset jit;`
--
-- It applies to CONNECTIONS MADE AFTER IT RUNS. Pooled connections already
-- open keep the old setting, so give it a few minutes — or restart the project
-- — before judging whether it worked.
-- ===========================================================================

do $$
begin
  execute format('alter database %I set jit = off', current_database());
  raise notice 'JIT disabled for database % — new connections only.', current_database();
exception
  when insufficient_privilege then
    raise notice 'Could not disable JIT: this role does not own the database. Set it in the Supabase dashboard, or run: alter database postgres set jit = off;';
end $$;
