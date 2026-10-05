-- ===========================================================================
-- HAND STOCK: THE WHOLE BALANCE IN ONE REQUEST (2026-10-05, the user: "Go
-- ahead with the Hand Stock one-aggregate change").
--
-- `handstock_balance` is a GROUP BY over every movement there is (nine arms,
-- 0023/0102), and it costs the same whether one page or the whole result is
-- asked for -- measured on 300,000 movements: ~1.2 s either way. PostgREST
-- caps a response at 1,000 rows, so the Hand Stock screen asked for the
-- balance a page at a time (k full aggregates per load) and asked it AGAIN for
-- every search keystroke; on the live project's statement export those pages
-- took 4.6-7.3 s each, 650 times in two weeks.
--
-- This function returns the whole balance as ONE jsonb array, so a load is
-- ONE aggregate and the screens search what they already hold. Three rules:
--
--   SECURITY INVOKER. The view is security_invoker and so is this, so the
--   reader's own row-level security bounds every arm exactly as before: an
--   engineer gets their stock and their team's, an office role everything.
--   A definer function here would hand every engineer's stock to anybody.
--
--   work_mem = 64MB, FOR THIS FUNCTION ONLY. Under the default 4MB the
--   aggregate sorts 300,000 rows to disk (external merge, 25 MB); at 64MB it
--   is a HashAggregate in memory -- 1.23 s -> 0.88 s on the same data. A
--   function-level SET lasts the call and touches nothing else.
--
--   ORDERED BY ENGINEER THEN PART CODE, as the paged read was, so the screens
--   show the same sequence. An empty balance is '[]', never null.
--
-- The paged read (`listHandstockBalance`) stays for `handstockForEngineer`,
-- whose equality on engineer_key is pushed below the GROUP BY. In the
-- handstock module, LAST, since it reads the view every earlier file defines.
-- ===========================================================================

create or replace function public.handstock_balance_all()
returns jsonb
language sql stable security invoker
set search_path = public
set work_mem = '64MB'
as $$
  select coalesce(jsonb_agg(to_jsonb(b) order by b.engineer, b.part_code), '[]'::jsonb)
    from public.handstock_balance b;
$$;

comment on function public.handstock_balance_all() is
  'The whole hand-stock balance as one jsonb array (0384): one aggregate per load instead of one per page and per search; security invoker, so the reader''s RLS applies.';

revoke execute on function public.handstock_balance_all() from public, anon;
grant execute on function public.handstock_balance_all() to authenticated;
