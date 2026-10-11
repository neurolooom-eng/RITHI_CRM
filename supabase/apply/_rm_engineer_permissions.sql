-- TEMPORARY PROBE: what the live Reporting Manager and Engineer roles hold, for the training material. Read-only, one grid.
select r.role, coalesce(r.label, '') as label,
       jsonb_array_length(r.permissions) as n_keys,
       (select string_agg(k, ' ' order by k) from jsonb_array_elements_text(r.permissions) k) as keys,
       (select count(*) from public.profiles p where p.role = r.role) as people
  from public.app_roles r
 where r.role in ('rm', 'rgm', 'engineer')
 order by r.role;
