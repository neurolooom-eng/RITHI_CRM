-- ===========================================================================
-- 0427 -- EVERY SLA HAS A NAME (the user, 2026-10-13: "Segregate the SLA
-- Breach. Name it. Add Provision to Name the SLA. And use that name to
-- Display. Every SLA should display a List separately").
--
-- sla_rules.label was always there and always editable by whoever holds
-- Admin config (sla_write, 0044); the SLA Targets card now offers it, and the
-- Dashboard shows one tile and one list per SLA under that name. A blank name
-- would be a tile and a list with no heading, so it is refused here as well as
-- on the form. The existing names are all filled, so the check validates at
-- once.
-- ===========================================================================
do $$
begin
  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.sla_rules'::regclass and conname = 'sla_rules_label_named') then
    alter table public.sla_rules add constraint sla_rules_label_named check (btrim(label) <> '');
  end if;
end $$;
