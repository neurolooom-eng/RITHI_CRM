-- ===========================================================================
-- WHO CAN RECORD AN OWNERSHIP TRANSFER? Read-only. Nothing is changed.
--
-- Reported 2026-10-06: "The Transfer button is not Visible for the Commercial
-- Department user". Two buttons and the keys each asks:
--
--   * ⇄ Transfer on a Product Database row   ownership.transfer
--                                             AND mod:/ownership-transfer
--                                             (the screen it opens)
--   * ＋ Record a transfer on Ownership       ownership.transfer
--     Transfer                                (and mod:/ownership-transfer to
--                                             open the screen at all)
--
-- A person holds a key through their ROLE's row in app_roles, or through their
-- own extra_permissions; an EMPTY role row falls back to the engineer row, and
-- an admin holds everything (has_perm()). Each line below says which.
--
-- ROWS 1-99: every role -- does it hold each key?
-- ROWS 101+: every active person on the Commercial or Hotline role, or whose
--            DESIGNATION says Commercial (whatever role they are on -- the
--            designation and the permission routinely differ), with whether
--            they would see ⇄ Transfer and, if not, which key is missing.
-- ===========================================================================
with roles as (
  select r.role,
         coalesce(r.permissions, '[]'::jsonb) as stored,
         jsonb_array_length(coalesce(r.permissions, '[]'::jsonb)) = 0 as empty
    from public.app_roles r
),
eng as (select coalesce(permissions, '[]'::jsonb) as p from public.app_roles where role = 'engineer'),
eff as (
  select ro.role, ro.empty,
         case when ro.empty then (select p from eng) else ro.stored end as p
    from roles ro
),
role_rows as (
  select row_number() over (order by e.role) as n,
         'role: ' || e.role as "check",
         case when e.role = 'admin' then 'admin -- holds every key'
              else concat_ws('  ·  ',
                     'ownership.transfer: '         || case when e.p ? 'ownership.transfer'        then 'yes' else 'NO' end,
                     'mod:/ownership-transfer: '    || case when e.p ? 'mod:/ownership-transfer'   then 'yes' else 'NO' end,
                     'mod:/product-database: '      || case when e.p ? 'mod:/product-database'     then 'yes' else 'NO' end,
                     case when e.empty then '(row EMPTY -- reads the engineer row)' end)
         end as answer
    from eff e
),
people as (
  select p.email, coalesce(p.role, '') as role, coalesce(p.designation, '') as designation,
         coalesce(p.extra_permissions, '[]'::jsonb) as extra,
         coalesce((select e.p from eff e where e.role = p.role), (select p from eng)) as rp
    from public.profiles p
   where p.active
     and (p.role in ('commercial', 'hotline') or coalesce(p.designation, '') ilike '%commercial%')
),
missing as (
  select pe.email, pe.role, pe.designation,
         concat_ws(', ',
           case when not (pe.rp ? 'ownership.transfer' or pe.extra ? 'ownership.transfer') then 'ownership.transfer' end,
           case when not (pe.rp ? 'mod:/ownership-transfer' or pe.extra ? 'mod:/ownership-transfer') then 'mod:/ownership-transfer' end) as lacks
    from people pe
)
select * from (
  select 0 as n, '— which keys each ROLE holds —' as "check", '' as answer
  union all select n, "check", answer from role_rows
  union all select 100, '— Commercial / Hotline people: would they see ⇄ Transfer? —', ''
  union all
  select 100 + row_number() over (order by m.role, m.email),
         m.email || '  (role: ' || coalesce(nullif(m.role, ''), 'none') || ', designation: '
           || coalesce(nullif(m.designation, ''), '—') || ')',
         case when m.role = 'admin' then 'yes (admin)'
              when m.lacks = '' then 'yes'
              else 'NO -- lacks ' || m.lacks end
    from missing m
) x
order by n;
