-- ===========================================================================
-- Master value lists gain an ACTIVE flag, as the part catalogue already has.
--
-- A value that is no longer used cannot simply be deleted: it is already on
-- calls, reports and spare requests, and removing it would leave those records
-- referring to something that no longer exists. Deactivating keeps the history
-- and takes the value out of the pickers — the same rule the parts catalogue
-- follows, and the same rule the rest of this system follows for records that
-- matter.
-- ===========================================================================

alter table public.masters
  add column if not exists active boolean not null default true;

create index if not exists masters_active_idx on public.masters (name, active);
