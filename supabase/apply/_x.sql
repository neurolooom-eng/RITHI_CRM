-- READ-ONLY PROBE (2026-10-13): what the live project already holds before
-- 08-Jun-2022, ahead of the 2018-2022 historical call load. One grid.
select t.tbl, t.calls, t.before_jun22, t.ucn_18_22, t.imported, t.min_reg, t.max_reg_before
  from (
    select 'field' as tbl, count(*) as calls,
           count(*) filter (where reg_date <= date '2022-06-08') as before_jun22,
           count(*) filter (where ucn ~ '^(18|19|20|21|22)[A-L][0-9]{5}$') as ucn_18_22,
           count(*) filter (where extra ? 'imported_from') as imported,
           min(reg_date)::text as min_reg,
           max(reg_date) filter (where reg_date <= date '2022-06-08')::text as max_reg_before
      from public.field_calls
    union all
    select 'installation', count(*), count(*) filter (where reg_date <= date '2022-06-08'),
           count(*) filter (where ucn ~ '^(18|19|20|21|22)[A-L][0-9]{5}$'), count(*) filter (where extra ? 'imported_from'),
           min(reg_date)::text, max(reg_date) filter (where reg_date <= date '2022-06-08')::text
      from public.installation_calls
    union all
    select 'pm', count(*), count(*) filter (where reg_date <= date '2022-06-08'),
           count(*) filter (where ucn ~ '^(18|19|20|21|22)[A-L][0-9]{5}$'), count(*) filter (where extra ? 'imported_from'),
           min(reg_date)::text, max(reg_date) filter (where reg_date <= date '2022-06-08')::text
      from public.pm_calls
    union all
    select 'reports with ucn 18-22', count(*), null, null, null, null, null
      from public.reports where ucn ~ '^(18|19|20|21|22)[A-L][0-9]{5}$'
  ) t;
