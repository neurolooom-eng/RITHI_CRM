-- ===========================================================================
-- "EDIT A CALL" IS NOT ONE RIGHT. IT IS FOUR.
--
-- Reported 2026-09-06: "edit gives access to edit the whole call.. which is not
-- required for the managers. at the same time the Hotline engineer can edit the
-- complete call.. so 1 single edit permission will not suffice."
--
-- `calls.edit` let anyone who could correct a customer's phone number also
-- rewrite the machine, the complaint and the vigilance answers. The Hotline
-- desk genuinely needs all of that. A manager needs almost none of it, and
-- until now the only choice was to give them everything or nothing.
--
--   calls.edit.complaint   standard_complaint, complaint_reported, breakdown_date
--   calls.edit.customer    party_name, city, state, product_name, serial, item_status
--   calls.edit.vigilance   public_health_threat, death, serious_incident
--   calls.edit.contact     customer_name, customer_number, customer_designation
--
-- `calls.edit` REMAINS, and is the PARENT of all four — the same shape as
-- `masters.edit` over the per-list keys (0067). A role holding it keeps
-- everything it had, so this migration changes nobody's access on the day it
-- runs. To narrow a manager, an administrator unticks "Edit calls" and ticks
-- the sections they should have; that is the whole point of the split.
--
-- Registration and Warranty & Contract get no section of their own on purpose.
-- Those fields are assigned by the database or locked from Product Master, so a
-- right to edit them would be a right over almost nothing; `calls.edit` still
-- covers them, and it is Hotline's.
--
-- ENFORCED HERE, not on the form. The form locks a section it may not change,
-- but the call policy asks only for `calls.edit OR calls.report`, so PostgREST
-- would take any of these columns from anyone who can update the call at all.
--
-- ---------------------------------------------------------------------------
-- AND EVERY CHANGE TO THE VIGILANCE ANSWERS IS KEPT (user's choice).
--
-- Public Health Threat / Death / Serious Incident are Review 1 — the vigilance
-- record the DCCR reads and an auditor asks about. Whoever may change them can
-- change a quality answer after the fact, so each change is written with who,
-- when, and what it moved from and to, in the same statement that makes it:
-- a change cannot exist without its record, or a record without its change.
-- Registration is not a change, so it writes nothing.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- FIRST, THE POLICY HAS TO LET THEM IN AT ALL.
--
-- `calls_update` asks for `calls.edit OR calls.report`, so a role holding only
-- a section right — or only `calls.allot` (0126) — cannot update the call at
-- all: the row simply does not match and the statement reports 0 rows with no
-- error. Every finer right would have been decoration. Found by giving a test
-- role `calls.edit.contact` and watching its perfectly legitimate change do
-- nothing at all.
--
-- So the policy admits the new rights and the TRIGGER below decides which
-- columns each one may actually move. Same division 0067 made for masters: the
-- policy opens the table, the finer rule says what may change.
--
-- This re-creates 0114's policy verbatim apart from that one list, including
-- the InitPlan wrappers `(select ...)` that 0095 added to stop the reporting
-- tree being rebuilt for every row.
-- ---------------------------------------------------------------------------
do $rls$
declare t text; vis text; may text;
begin
  if to_regclass('public.field_calls') is null then
    raise notice 'skip calls_update: the split call tables are not present yet';
    return;
  end if;
  vis := $v$ (select public.can_view_all_calls())
             or created_by = (select auth.uid())
             or actual_created_by = (select auth.uid())
             or coalesce(allocated_to, '') = ''
             or lower(trim(allocated_to)) in (select lower(trim(n)) from public.visible_engineer_names() as v(n)) $v$;
  may := $m$ (select (public.has_perm('calls.edit')
                   or public.has_perm('calls.report')
                   or public.has_perm('calls.allot')
                   or public.has_perm('calls.edit.complaint')
                   or public.has_perm('calls.edit.customer')
                   or public.has_perm('calls.edit.vigilance')
                   or public.has_perm('calls.edit.contact'))) $m$;
  foreach t in array array['field_calls', 'installation_calls', 'pm_calls'] loop
    execute format('drop policy if exists calls_update on public.%I', t);
    execute format('create policy calls_update on public.%1$I for update using (%2$s and (%3$s)) with check (%2$s and (%3$s))', t, may, vis);
  end loop;
end $rls$;

create table if not exists public.call_vigilance_changes (
  id         bigint generated always as identity primary key,
  ucn        text not null,
  field      text not null,                       -- public_health_threat | death | serious_incident
  was        text not null default '',
  now_is     text not null default '',
  changed_by uuid,
  changed_at timestamptz not null default now()
);
create index if not exists call_vigilance_changes_ucn_idx on public.call_vigilance_changes (ucn, changed_at desc);
alter table public.call_vigilance_changes enable row level security;

-- Readable by anyone who may see the daily review or the call register; written
-- ONLY by the trigger below, which is why there is no insert policy.
drop policy if exists cvc_read on public.call_vigilance_changes;
create policy cvc_read on public.call_vigilance_changes for select
  using (public.has_perm('calls.view') or public.has_perm('review.edit'));
grant select on public.call_vigilance_changes to authenticated;

create or replace function public.calls_edit_section_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  me      uuid := auth.uid();
  free    boolean;
  changed boolean;
begin
  -- No signed-in user (import, definer, scheduled) is not a person, and an
  -- administrator is every person. `calls.edit` is the parent of all four.
  free := me is null or public.is_admin() or public.has_perm('calls.edit');

  if not free then
    changed := new.standard_complaint is distinct from old.standard_complaint
            or new.complaint_reported is distinct from old.complaint_reported
            or new.breakdown_date     is distinct from old.breakdown_date;
    if changed and not public.has_perm('calls.edit.complaint') then
      raise exception 'RBAC: changing the complaint needs the "Edit the complaint" permission';
    end if;

    changed := new.party_name   is distinct from old.party_name
            or new.city         is distinct from old.city
            or new.state        is distinct from old.state
            or new.product_name is distinct from old.product_name
            or new.serial       is distinct from old.serial
            or new.item_status  is distinct from old.item_status;
    if changed and not public.has_perm('calls.edit.customer') then
      raise exception 'RBAC: changing the customer or the machine needs the "Edit customer & product" permission';
    end if;

    changed := new.customer_name        is distinct from old.customer_name
            or new.customer_number      is distinct from old.customer_number
            or new.customer_designation is distinct from old.customer_designation;
    if changed and not public.has_perm('calls.edit.contact') then
      raise exception 'RBAC: changing the customer contact needs the "Edit customer contact details" permission';
    end if;

    changed := new.public_health_threat is distinct from old.public_health_threat
            or new.death                is distinct from old.death
            or new.serious_incident     is distinct from old.serious_incident;
    if changed and not public.has_perm('calls.edit.vigilance') then
      raise exception 'RBAC: changing the vigilance answers needs the "Edit the vigilance answers" permission';
    end if;
  end if;

  -- The record, in the same statement as the change — including an
  -- administrator's, and including one made with no signed-in user, because
  -- "who changed the vigilance answer" is a question about the answer and not
  -- about permissions.
  insert into public.call_vigilance_changes (ucn, field, was, now_is, changed_by)
  select new.ucn, f.name, coalesce(f.was, ''), coalesce(f.now_is, ''), me
    from (values
      ('public_health_threat', old.public_health_threat, new.public_health_threat),
      ('death',                old.death,                new.death),
      ('serious_incident',     old.serious_incident,     new.serious_incident)
    ) as f(name, was, now_is)
   where f.now_is is distinct from f.was;

  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['field_calls', 'installation_calls', 'pm_calls'] loop
    if to_regclass('public.' || t) is null then
      raise notice 'skip %: not present yet', t;
      continue;
    end if;
    execute format('drop trigger if exists zz_calls_edit_section_guard on public.%I', t);
    execute format(
      'create trigger zz_calls_edit_section_guard before update on public.%I
         for each row execute function public.calls_edit_section_guard()', t);
  end loop;
end $$;
