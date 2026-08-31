-- ===========================================================================
-- An engineer's delivery address, on the User Master.
--
-- The Declaration form that travels with the parcel ("TO WHOMSOEVER IT MAY
-- CONCERN") addresses it to the engineer. The User Master is where that
-- belongs — its sheet already has ADDRESS / CITY / STATE / Contact No columns,
-- and the User Master screen already showed City, State and Contact — but
-- user_directory never carried them, so on Supabase those columns were blank
-- and the form had nothing to read.
--
-- The four join the directory row, beside the name every other module already
-- refers to an engineer by, so one address serves every future document.
--
-- WHO MAY WRITE THEM is a separate migration (0030_engineer_address_write),
-- because its policy calls has_perm(), which the RBAC module defines and which
-- applies after this one. The columns themselves belong here, with the rest of
-- the User Master.
-- ===========================================================================

alter table public.user_directory
  add column if not exists address text default '',
  add column if not exists city    text default '',
  add column if not exists state   text default '',
  add column if not exists phone   text default '';

-- A directory imported before these were columns put them in `extra` (the
-- in-app importer kept every unmapped sheet column there). Lift them across,
-- so an existing deployment does not have to re-import to address a parcel.
--
-- The write guard is dropped first when it exists: this is a data migration,
-- not somebody editing the directory, and auth.uid() is NULL in the SQL
-- editor, so the guard would refuse it. It is put back below — and on a first
-- run there is nothing to put back, since 0030 has not created it yet.
drop trigger if exists user_directory_address_guard on public.user_directory;

update public.user_directory u
   set address = coalesce(nullif(btrim(u.address), ''),
                          nullif(btrim(u.extra ->> 'ADDRESS'), ''),
                          nullif(btrim(u.extra ->> 'Address'), ''), ''),
       city    = coalesce(nullif(btrim(u.city), ''),
                          nullif(btrim(u.extra ->> 'CITY'), ''),
                          nullif(btrim(u.extra ->> 'City'), ''), ''),
       state   = coalesce(nullif(btrim(u.state), ''),
                          nullif(btrim(u.extra ->> 'STATE'), ''),
                          nullif(btrim(u.extra ->> 'State'), ''), ''),
       phone   = coalesce(nullif(btrim(u.phone), ''),
                          nullif(btrim(u.extra ->> 'Contact  No'), ''),
                          nullif(btrim(u.extra ->> 'Contact No'), ''),
                          nullif(btrim(u.extra ->> 'Contact'), ''), '')
 where u.extra <> '{}'::jsonb;

do $$
begin
  if to_regprocedure('public.user_directory_address_guard()') is not null then
    create trigger user_directory_address_guard
      before update on public.user_directory
      for each row execute function public.user_directory_address_guard();
  end if;
end $$;
