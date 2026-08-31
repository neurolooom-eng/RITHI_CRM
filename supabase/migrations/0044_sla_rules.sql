-- ===========================================================================
-- SLA rules — the service-level targets, editable in Admin Config. Each rule is
-- a named target in hours with an on/off switch; the app computes each open
-- call's status (on track / due soon / breached) against the active rules and
-- highlights it for engineers. The rule LOGIC is fixed (which event each rule
-- measures); the hours and whether it applies are what admins edit.
-- ===========================================================================

create table if not exists public.sla_rules (
  key          text primary key,   -- fixed rule id (see seed)
  label        text not null,
  target_hours integer not null,
  active       boolean not null default true,
  sort_order   integer not null default 0,
  updated_at   timestamptz not null default now()
);

-- Seed the agreed rules (idempotent — an admin's later edits are preserved).
insert into public.sla_rules (key, label, target_hours, sort_order) values
  ('first_visit',             'First visit',                         72,  1),
  ('closure',                 'Call closure',                        120, 2),
  ('closure_spare',           'Closure — call includes a spare',     168, 3),
  ('closure_spare_noncover',  'Closure — spare & not in CMC / WGP',  240, 4),
  ('stores_dispatch',         'Stores dispatch — from final approval', 72, 5)
on conflict (key) do nothing;

create or replace function public.sla_rules_touch()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists sla_rules_touch on public.sla_rules;
create trigger sla_rules_touch before update on public.sla_rules
  for each row execute function public.sla_rules_touch();

alter table public.sla_rules enable row level security;
grant select, insert, update, delete on public.sla_rules to authenticated;

drop policy if exists sla_read on public.sla_rules;
create policy sla_read on public.sla_rules for select using (auth.role() = 'authenticated');

drop policy if exists sla_write on public.sla_rules;
create policy sla_write on public.sla_rules for all
  using (public.is_admin() or public.has_perm('config.manage'))
  with check (public.is_admin() or public.has_perm('config.manage'));
