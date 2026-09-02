-- ===========================================================================
-- RECONCILIATION CONSUMPTION — an Admin / Spare Coordinator can book a spare
-- against a call directly into consumption, without waiting for the engineer's
-- call report.
--
-- These rows are stock adjustments made by the office, not something the
-- engineer wrote, so they are FLAGGED: `source` is 'Reconciliation' rather than
-- the default 'Report'. Hand stock already treats consumption as stock leaving
-- the engineer's hands, so a reconciliation line corrects the balance the same
-- way a reported one does — the flag is what keeps the two tellable apart.
--
-- Guarded by its own permission (consumption.reconcile) so an engineer cannot
-- write one, and stamped with who entered it. spare_consumption is already an
-- audited table (0048), so every reconciliation carries a full before/after
-- trail.
-- ===========================================================================

alter table public.spare_consumption
  add column if not exists source      text not null default 'Report',   -- Report | Reconciliation
  add column if not exists remarks     text default '',                  -- why the adjustment was made
  add column if not exists recorded_by text default '';                  -- who entered it (name)

create index if not exists spare_consumption_source_idx on public.spare_consumption (source);

-- Stamp the author so the register's Created By stops coming back empty.
create or replace function public.consumption_before_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.created_by is null then new.created_by := auth.uid(); end if;
  if coalesce(new.source, '') = '' then new.source := 'Report'; end if;
  return new;
end $$;
drop trigger if exists consumption_biu on public.spare_consumption;
create trigger consumption_biu before insert on public.spare_consumption
  for each row execute function public.consumption_before_insert();

-- Writing a RECONCILIATION line needs the new permission; an ordinary reported
-- line keeps the existing rule (the engineer reporting, or Stores).
drop policy if exists cons_write on public.spare_consumption;
create policy cons_write on public.spare_consumption for insert
  with check (
    case when coalesce(source, 'Report') = 'Reconciliation'
         then public.has_perm('consumption.reconcile')
         else (public.has_perm('calls.report') or public.has_perm('spare.dispatch'))
    end
  );

-- Grant it to the roles that do the reconciling (merge — anything an admin has
-- already tuned on these roles is kept).
do $$
declare r text;
begin
  foreach r in array array['admin', 'spare_coordinator'] loop
    insert into public.app_roles as ar (role, label, permissions)
    values (r, initcap(replace(r, '_', ' ')), '["consumption.reconcile"]'::jsonb)
    on conflict (role) do update set
      permissions = (
        select coalesce(jsonb_agg(distinct v), '[]'::jsonb)
        from (
          select jsonb_array_elements_text(ar.permissions) as v
          union
          select 'consumption.reconcile' as v
        ) u
      ),
      updated_at = now();
  end loop;
end $$;
