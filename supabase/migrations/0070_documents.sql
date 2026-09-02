-- ===========================================================================
-- DOCUMENT LIBRARY — service manuals and QMS documents.
--
-- The FILES live in Google Drive (uploaded through the CallReg bridge, the same
-- path a manual report already takes); what lives here is the CATALOGUE that
-- makes one findable: which product a manual covers, its revision, and the link.
-- That is the whole point of the table — an engineer on a call must be handed
-- THE RIGHT manual for the machine in front of them, and a Drive folder cannot
-- answer that question.
--
-- One table, two kinds:
--   'service_manual' — keyed by PRODUCT; surfaced on the call as a supporting
--                      document for the machine the call is against.
--   'qms'            — the controlled quality documents (SOPs, work
--                      instructions, forms), carrying a document number,
--                      revision and effective date.
-- They differ only in which fields matter and who may maintain them, so they
-- share the table and split on `kind`.
--
-- Maintaining them is two separate rights, because they are two separate jobs:
--   docs.manage — service manuals and general documents
--   qms.manage  — the QMS shelf (quality's own)
-- Everyone signed in READS both: a manual nobody can open is no use in the
-- field, and a QMS document the team cannot find is not controlled, it is lost.
-- ===========================================================================

create table if not exists public.documents (
  id             bigint generated always as identity primary key,
  kind           text not null default 'service_manual',
  title          text not null,
  -- The product/model a manual covers. BLANK deliberately means "every
  -- product" — a general manual still has to reach every call.
  product        text not null default '',
  doc_no         text not null default '',   -- QMS document number
  revision       text not null default '',
  effective_date date,
  tags           text not null default '',   -- comma-separated, matched against a call
  url            text not null,              -- the Drive link
  file_name      text not null default '',
  notes          text not null default '',
  active         boolean not null default true,
  uploaded_by      uuid references auth.users (id),
  uploaded_by_name text not null default '',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

alter table public.documents add column if not exists effective_date date;
alter table public.documents add column if not exists notes text not null default '';

-- A call looks a manual up BY PRODUCT, every time a call is opened, so that
-- lookup gets its own index rather than a scan of the shelf.
create index if not exists documents_kind_idx     on public.documents (kind);
create index if not exists documents_product_idx  on public.documents (lower(product));
create index if not exists documents_active_idx   on public.documents (active);

-- Stamp who uploaded it (cannot be spoofed) and keep updated_at honest.
create or replace function public.documents_before_write()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.uploaded_by := coalesce(new.uploaded_by, auth.uid());
  else
    new.uploaded_by := old.uploaded_by;   -- authorship is not editable
    new.created_at  := old.created_at;
  end if;
  new.kind := lower(trim(coalesce(new.kind, 'service_manual')));
  if new.kind = '' then new.kind := 'service_manual'; end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists documents_biu on public.documents;
create trigger documents_biu before insert or update on public.documents
  for each row execute function public.documents_before_write();

alter table public.documents enable row level security;
grant select, insert, update, delete on public.documents to authenticated;

-- Read: everyone signed in, both kinds.
drop policy if exists documents_read on public.documents;
create policy documents_read on public.documents for select
  using (auth.role() = 'authenticated');

-- Write: the right that matches the kind. Admins hold both via has_perm().
drop policy if exists documents_insert on public.documents;
create policy documents_insert on public.documents for insert
  with check (case when kind = 'qms' then public.has_perm('qms.manage')
                   else public.has_perm('docs.manage') end);

-- Both sides tested, so a document cannot be moved between shelves by someone
-- who may only maintain one of them.
drop policy if exists documents_update on public.documents;
create policy documents_update on public.documents for update
  using      (case when kind = 'qms' then public.has_perm('qms.manage')
                   else public.has_perm('docs.manage') end)
  with check (case when kind = 'qms' then public.has_perm('qms.manage')
                   else public.has_perm('docs.manage') end);

drop policy if exists documents_delete on public.documents;
create policy documents_delete on public.documents for delete
  using (case when kind = 'qms' then public.has_perm('qms.manage')
              else public.has_perm('docs.manage') end);

-- ---------------------------------------------------------------------------
-- Grant the new rights to the roles that already do this work, by MERGING into
-- app_roles — never by overwriting, since an admin may have tuned the role.
-- Service manuals: the roles that maintain masters. QMS: admin only, until
-- quality says who else keeps it.
-- ---------------------------------------------------------------------------
do $$
declare r record;
begin
  if to_regclass('public.app_roles') is null then
    raise notice 'public.app_roles is not present — run the rbac bundle first';
    return;
  end if;

  for r in select role, coalesce(permissions, '[]'::jsonb) as perms from public.app_roles loop
    if r.role in ('admin', 'hotline', 'nsm', 'spare_coordinator')
       and not (r.perms ? 'docs.manage') then
      update public.app_roles
         set permissions = r.perms || '["docs.manage"]'::jsonb, updated_at = now()
       where role = r.role;
    end if;
    if r.role = 'admin' and not (r.perms ? 'qms.manage') then
      update public.app_roles
         set permissions = coalesce(permissions, '[]'::jsonb) || '["qms.manage"]'::jsonb, updated_at = now()
       where role = r.role;
    end if;
  end loop;

  -- And the modules themselves, so the two screens are reachable at all.
  update public.app_roles
     set permissions = coalesce(permissions, '[]'::jsonb) || '["mod:/service-manuals"]'::jsonb, updated_at = now()
   where not (coalesce(permissions, '[]'::jsonb) ? 'mod:/service-manuals');
  update public.app_roles
     set permissions = coalesce(permissions, '[]'::jsonb) || '["mod:/qms"]'::jsonb, updated_at = now()
   where role in ('admin', 'nsm', 'hotline')
     and not (coalesce(permissions, '[]'::jsonb) ? 'mod:/qms');
end $$;
