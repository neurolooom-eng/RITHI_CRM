-- ===========================================================================
-- THE `calls` VIEW WAS READING AS ITS OWNER — SO EVERY USER SAW EVERY CALL.
--
-- 0040 created the view over the three typed tables and set `security_invoker`
-- on it, which is what makes row-level security apply to the person reading
-- rather than to the view's owner. 0050 re-created the view and correctly set
-- it again. 0057 re-created the view and DID NOT.
--
-- `create or replace view` does not carry the setting over. There is no error
-- and no warning; the view simply starts running as its owner, and RLS stops
-- applying to everything read through it.
--
-- Measured on a database with every migration applied, as an engineer holding
-- twelve calls that belong to somebody else:
--
--     field_calls (the table)   0 rows      <- RLS working
--     calls (the view)         12 rows      <- RLS bypassed
--     pending_calls            12 rows      <- reads `calls`, so it leaks too
--     call_state               12 rows      <- same
--     failure_modes_by_product  visible     <- same
--
-- pending_calls and call_state carry `security_invoker` themselves and were
-- still wide open, because a view marked invoker that reads a view running as
-- its owner inherits the owner's reach. Marking the outer view is no protection
-- if an inner one is unmarked.
--
-- That defeats URS-002 (role-based visibility), FRS-003/004, R-01 and OQ-02 —
-- an engineer could read every call in the register, and the KPI screens
-- counted the whole fleet for everybody.
--
-- WHAT CHANGES WHEN THIS IS APPLIED: engineers and managers will see FEWER
-- calls on Pending Calls, the registers and the KPIs — the ones their role
-- actually permits. That is the intended behaviour and what the validation
-- package has always claimed; it will nonetheless look like something broke to
-- anyone who had grown used to seeing everything.
--
-- A SECURITY DEFINER function reading the view is unaffected: inside one, the
-- invoker IS the function's owner, so `suggest_standard_complaint()` still
-- draws on every call, which is the whole point of defining it that way.
--
-- THIS LIVES IN THE `call_requests` BUNDLE, after 0057, because that is the
-- bundle that defines the view. Anywhere else and replaying call_requests.sql
-- would put the leak straight back.
-- ===========================================================================

do $$
begin
  if to_regclass('public.calls') is not null
     and (select relkind from pg_class where oid = 'public.calls'::regclass) = 'v' then
    execute 'alter view public.calls set (security_invoker = on)';
    raise notice 'calls: row-level security now applies to the reader, not the view owner.';
  end if;
end $$;

-- The views built ON it, re-asserted for the same reason: cheap, and it removes
-- any doubt about the order these were last written in.
do $$
declare v text;
begin
  foreach v in array array['pending_calls', 'call_state'] loop
    if to_regclass('public.' || v) is not null then
      execute format('alter view public.%I set (security_invoker = on)', v);
    end if;
  end loop;
end $$;
