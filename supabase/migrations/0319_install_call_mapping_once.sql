-- ===========================================================================
-- 0319 — ONE TIME: every warranty machine mapped to its installation call,
-- and an administrators' list of the machines that still have none.
--
-- The user, 2026-10-02: "As a 1 time activity - look for all installation
-- calls using this - Product, Serial No, Party Name or WI-<Product>-<SerialNo>.
-- And map it. If it does not have an installation call give it as a separate
-- list in reports - view only for Admins."
--
-- 0234 already mapped a machine where EXACTLY ONE installation call named its
-- product and serial. This pass widens the search in the order the evidence is
-- strongest, and still maps only where the answer is ONE call:
--
--   1. WI-<Product>-<Serial>. The call number this application gives an
--      installation call it raises from a sale (installCallNumber), compared
--      trimmed and case-insensitive.
--
-- ONLY INSTALLATION CALLS, under every rule (the user, 2026-10-02: "Map only
-- installation call"). A field or PM call carrying a WI- number is not this
-- machine's installation and is never mapped or offered.
--   2. Product + Serial + Party Name, on an installation call. Settles a
--      machine two installation calls name, where only one was for this
--      customer.
--   3. Product + Serial alone, on an installation call -- 0234's rule, re-run
--      for calls raised or imported since.
--
-- WHAT IS NEVER DONE:
--   * a machine whose INST Call already holds a call number is not touched;
--   * a call already mapped to a machine is not mapped to a second one;
--   * where two machine lines would take the same call, neither does --
--     a duplicate line is a question, not an answer;
--   * where a rule finds several calls, nothing is written: picking one would
--     be a guess recorded as a fact. Those machines are on the list below,
--     with the candidate calls named.
-- Every change is logged in inst_call_repair_log (0234), old value beside new,
-- with the rule that made it.
--
-- ONCE, AND ENFORCED, as 0318: a row in one_time_fixes_done stops any re-run,
-- so replaying sales_contracts.sql never maps anything a second time.
--
-- THE LIST is install_calls_unmapped(): every warranty machine line without a
-- mapped installation call, why, and the candidates. A definer function with
-- the check inside, gated on the page's own key `mod:/install-calls-unmapped`,
-- which 0319 grants to admin (the user: "view only for Admins") and to
-- technical_support, because that role carries every page key the admin role
-- holds (0145; _status.sql row 114 holds the property) -- the Hand Stock
-- Report (0241) and Device Cache Status (0249) do the same. An administrator
-- can untick it, or tick it for another role, on Roles & Permissions. LIVE, so
-- it shrinks as calls are raised.
-- ===========================================================================

create table if not exists public.one_time_fixes_done (
  name       text primary key,
  applied_at timestamptz not null default now(),
  detail     text
);
alter table public.one_time_fixes_done enable row level security;
revoke all on public.one_time_fixes_done from anon, authenticated;

do $$
declare
  n1 int := 0; n2 int := 0; n3 int := 0;
begin
  if exists (select 1 from public.one_time_fixes_done where name = '0319_install_call_mapping') then
    raise notice '0319: done before -- no machine was mapped again';
    return;
  end if;
  if to_regclass('public.sale_items') is null or to_regclass('public.sale_entries') is null
     or to_regclass('public.calls') is null or to_regclass('public.inst_call_repair_log') is null
     or to_regprocedure('public.is_call_number(text)') is null then
    raise notice '0319: sale_items, sale_entries, calls, inst_call_repair_log or is_call_number() missing -- nothing mapped (and not marked done)';
    return;
  end if;

  -- The machines still waiting, with what identifies them.
  create temporary table _m on commit drop as
  select si.id, si.sa_number, si.product_name, si.serial_number, coalesce(si.inst_call, '') as old_value,
         upper(btrim(si.product_name)) as p, upper(btrim(si.serial_number)) as s,
         upper(btrim(coalesce(h.party_name, ''))) as party,
         upper('WI-' || btrim(si.product_name) || '-' || btrim(si.serial_number)) as wi
    from public.sale_items si
    left join public.sale_entries h on h.sa_number = si.sa_number
   where btrim(coalesce(si.product_name, '')) <> '' and btrim(coalesce(si.serial_number, '')) <> ''
     and not public.is_call_number(si.inst_call);

  -- Calls, once, in the comparable shape. A call already on a machine is out.
  create temporary table _c on commit drop as
  select c.ucn, upper(btrim(coalesce(c.call_number, ''))) as cn,
         upper(btrim(coalesce(c.product_name, ''))) as p, upper(btrim(coalesce(c.serial, ''))) as s,
         upper(btrim(coalesce(c.party_name, ''))) as party
    from public.calls c
   where public.is_call_number(c.ucn)
     and upper(coalesce(c.call_type, '')) like 'INSTALL%'
     and not exists (select 1 from public.sale_items x where upper(btrim(x.inst_call)) = upper(btrim(c.ucn)));

  create temporary table _pick (id bigint, ucn text, why text) on commit drop;

  -- One rule: the machines it gives exactly one call, where that call is
  -- wanted by exactly one machine. Applied in turn, each rule seeing what the
  -- previous one left.
  for i in 1..3 loop
    delete from _pick;
    insert into _pick (id, ucn, why)
    select m.id, min(c.ucn),
           case i when 1 then 'mapped by call number WI-<Product>-<Serial> on an installation call (0319)'
                  when 2 then 'mapped by product + serial + party on an installation call (0319)'
                  else        'mapped by product + serial on the only installation call for it (0319)' end
      from _m m
      join _c c on case i
                     when 1 then c.cn = m.wi
                     when 2 then c.p = m.p and c.s = m.s and c.party = m.party and m.party <> ''
                     else        c.p = m.p and c.s = m.s end
     group by m.id
    having count(distinct c.ucn) = 1;
    -- A call two machine lines both want goes to neither.
    delete from _pick where ucn in (select ucn from _pick group by ucn having count(*) > 1);

    insert into public.inst_call_repair_log (sale_item_id, sa_number, product_name, serial_number, old_value, new_value, why)
    select m.id, coalesce(m.sa_number, ''), coalesce(m.product_name, ''), coalesce(m.serial_number, ''),
           m.old_value, k.ucn, k.why
      from _pick k join _m m on m.id = k.id;
    update public.sale_items si set inst_call = k.ucn from _pick k where si.id = k.id;
    if i = 1 then get diagnostics n1 = row_count;
    elsif i = 2 then get diagnostics n2 = row_count;
    else get diagnostics n3 = row_count; end if;

    delete from _c where ucn in (select ucn from _pick);
    delete from _m where id in (select id from _pick);
  end loop;

  insert into public.one_time_fixes_done (name, detail)
  values ('0319_install_call_mapping',
          format('%s mapped by WI- number, %s by product + serial + party, %s by product + serial; %s machine line(s) still without one',
                 n1, n2, n3, (select count(*) from _m)));
  raise notice '0319: % mapped by WI- number, % by product + serial + party, % by product + serial; % machine line(s) still without one',
               n1, n2, n3, (select count(*) from _m);
end $$;

-- ---- the list: machines without an installation call -----------------------
create or replace function public.install_calls_unmapped()
returns table (
  sale_item_id   bigint,
  sa_number      text,
  party_name     text,
  product_code   text,
  product_name   text,
  serial_number  text,
  warranty_start date,
  warranty_end   date,
  inst_call      text,
  reason         text,
  candidates     text
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.has_perm('mod:/install-calls-unmapped') then
    raise exception 'RBAC: Machines Without an Installation Call needs the mod:/install-calls-unmapped permission.'
      using errcode = '42501';
  end if;
  return query
  -- EQUALITY JOINS ONLY. The first version matched calls with an OR across
  -- two keys and tested "already mapped" with NOT IN per row: 2 min 47 s at
  -- 20,000 machine lines. Both keys are now joined by equality and unioned,
  -- and "mapped" is a set joined once.
  with m as (
    select si.id, si.sa_number, h.party_name, si.product_code, si.product_name, si.serial_number,
           coalesce(si.warranty_start, h.warranty_start) as ws,
           coalesce(si.warranty_end, h.warranty_end) as we,
           coalesce(si.inst_call, '') as ic,
           upper(btrim(coalesce(si.product_name, ''))) as p, upper(btrim(coalesce(si.serial_number, ''))) as s
      from public.sale_items si
      left join public.sale_entries h on h.sa_number = si.sa_number
     where not public.is_call_number(si.inst_call)
  ),
  ic as materialized (
    -- INSTALLATION CALLS ONLY (the user: "Map only installation call").
    select c.ucn, upper(btrim(c.ucn)) as u, btrim(c.party_name) as party,
           upper(btrim(coalesce(c.call_number, ''))) as cn,
           upper(btrim(coalesce(c.product_name, ''))) as p, upper(btrim(coalesce(c.serial, ''))) as s
      from public.calls c
     where public.is_call_number(c.ucn) and upper(coalesce(c.call_type, '')) like 'INSTALL%'
  ),
  mapped as materialized (
    select distinct upper(btrim(x.inst_call)) as u from public.sale_items x where public.is_call_number(x.inst_call)
  ),
  hit as (
    select m.id, ic.ucn, ic.u, ic.party from m join ic on ic.p = m.p and ic.s = m.s where m.p <> '' and m.s <> ''
    union
    select m.id, ic.ucn, ic.u, ic.party from m join ic on ic.cn = 'WI-' || m.p || '-' || m.s where m.p <> '' and m.s <> ''
  ),
  cand as (
    select h.id,
           string_agg(distinct h.ucn || coalesce(' (' || nullif(h.party, '') || ')', ''), ', ') as list,
           count(distinct h.ucn) as n,
           count(distinct h.ucn) filter (where mp.u is null) as n_free
      from hit h left join mapped mp on mp.u = h.u
     group by h.id
  )
  select m.id, m.sa_number, m.party_name, m.product_code, m.product_name, m.serial_number, m.ws, m.we,
         m.ic,
         case when m.p = '' or m.s = '' then 'The line has no product or no serial, so no call can be matched to it'
              when coalesce(cand.n, 0) = 0 then 'No installation call found for this product and serial'
              when cand.n_free = 0 then 'The installation call for this product and serial is already mapped to another machine line'
              when cand.n_free = 1 then 'One installation call matches but was not mapped automatically (another line claims it, or it arrived later) -- put its UCN in INST Call'
              else 'Several installation calls name this machine -- choose one and put its UCN in INST Call' end,
         coalesce(cand.list, '')
    from m left join cand on cand.id = m.id;
end $$;
revoke execute on function public.install_calls_unmapped() from public, anon;
grant execute on function public.install_calls_unmapped() to authenticated;

-- ---- the key: administrators to begin with ---------------------------------
-- MERGED, never overwritten, and a role with an empty set is left alone (its
-- empty array means "not configured"). Other roles are ticked on Roles &
-- Permissions.
do $$
declare n integer;
begin
  if to_regclass('public.app_roles') is null then return; end if;
  update public.app_roles ar
     set permissions = (
           select coalesce(jsonb_agg(distinct v), '[]'::jsonb)
             from (select jsonb_array_elements_text(ar.permissions) as v
                   union select 'mod:/install-calls-unmapped') u),
         updated_at = now()
   where jsonb_array_length(ar.permissions) > 0
     and ar.role in ('admin', 'technical_support')
     and not (ar.permissions ? 'mod:/install-calls-unmapped');
  get diagnostics n = row_count;
  raise notice '0319: % of 2 role(s) given mod:/install-calls-unmapped (admin + technical_support -- grant the rest on Roles & Permissions)', n;
end $$;
