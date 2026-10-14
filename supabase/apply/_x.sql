-- Read-only probe: why are three calls missing from the KPI export?
with u(ucn) as (values ('26H07F0011'), ('26H07F0010'), ('26H31F0009'))
select u.ucn,
       (select string_agg(t, ',') from (
          select 'field' t from public.field_calls f where f.ucn = u.ucn
          union all select 'installation' from public.installation_calls i where i.ucn = u.ucn
          union all select 'pm' from public.pm_calls p where p.ucn = u.ucn
          union all select 'call_history' from public.call_history h where h.ucn = u.ucn
          union all select 'call_request' from public.call_requests r where r.ucn = u.ucn) x) as found_in,
       c.call_type, c.cancelled_at, c.cancel_reason, c.reg_at, c.reg_date, c.complaint_date, c.open_state,
       c.allocated_to,
       (select count(*) from public.kpi_field_inst k where k."UC Number" = u.ucn) as in_kpi_view,
       (select k."Call Registeration Date"::text from public.kpi_field_inst k where k."UC Number" = u.ucn limit 1) as kpi_reg,
       (select count(*) from public.calls c2 where lower(btrim(c2.ucn)) = lower(btrim(u.ucn))) as loose_match,
       (select string_agg(c3.ucn || ' [' || c3.call_number || ']', ', ') from public.calls c3
         where c3.call_number ilike '%' || right(u.ucn, 4) || '%' and c3.reg_date >= date '2026-08-01' and c3.reg_date < date '2026-09-05'
           and c3.ucn ilike left(u.ucn, 5) || '%') as similar
  from u
  left join public.calls c on c.ucn = u.ucn
 order by u.ucn;
