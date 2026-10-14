-- ===========================================================================
-- 0428 -- THE TOTAL COLUMN IS CALCULATED (the user, 2026-10-13: "Yes,
-- calculate the Total column in RITHI", answering whether RITHI should work
-- out the Total the shared sheet "Service Quality Objective -2026.xlsx" shows).
--
-- THE SHEET'S OWN RULE, read off its figures, not invented:
--   * a COUNT objective (No. of Field failures registered in FFR) -- the SUM of
--     its months: 0+9+7+6+2+4+6 = 34;
--   * every PERCENTAGE objective -- the plain AVERAGE of the periods that carry
--     a figure: CPXcare (0.01+0.01+0+0+0+0+0)/7 = 0.2857%, Problem Call
--     attending within 3 days (0.92+...+0.96)/7 = 94.29%, Preventive
--     Maintenance (10%+10%)/2 = 10%. A month with no figure (an NA quarter, a
--     month not yet measured) is in neither the sum nor the count.
-- An average of the months, not the year's calls pooled -- that is what the
-- sheet does, and the figure is reported against it.
--
-- WHICH ROWS: a CALCULATED objective (calc_key set). A typed objective keeps
-- the Total somebody typed, exactly as before. Worked out by a trigger on
-- every insert and update, so Re-Calculate, a month typed over by hand and a
-- bulk load all leave it right; a Total sent for a calculated objective is
-- replaced. Then every existing calculated objective is restated once.
-- ===========================================================================

create or replace function public.objective_total(o public.quality_objectives)
returns numeric language sql immutable set search_path = public as $$
  with v(x) as (
    select unnest(array[o.m01, o.m02, o.m03, o.m04, o.m05, o.m06, o.m07, o.m08, o.m09, o.m10, o.m11, o.m12])
  )
  select case when o.calc_key = 'ffr_count_monthly' then (select sum(x) from v where x is not null)
              else (select avg(x) from v where x is not null) end
$$;
comment on function public.objective_total(public.quality_objectives) is
  'The Total of a calculated objective, the shared sheet''s way (0428): the sum of the months for the FFR count, the plain average of the months that carry a figure for every percentage objective.';

create or replace function public.quality_objectives_total()
returns trigger language plpgsql set search_path = public as $$
begin
  if coalesce(new.calc_key, '') <> '' then
    new.total := public.objective_total(new);
  end if;
  return new;
end $$;
revoke execute on function public.quality_objectives_total() from public, anon, authenticated;

drop trigger if exists zx_quality_objectives_total on public.quality_objectives;
create trigger zx_quality_objectives_total before insert or update on public.quality_objectives
  for each row execute function public.quality_objectives_total();

-- Every calculated objective restated once. Marked as Re-Calculate's own
-- write, so the manual-override marks (0349) are left exactly as they are.
do $$
begin
  perform set_config('rithi.objective_recalc', 'on', true);
  update public.quality_objectives set total = total where coalesce(calc_key, '') <> '';
  perform set_config('rithi.objective_recalc', '', true);
end $$;
