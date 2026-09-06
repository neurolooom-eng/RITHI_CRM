-- ===========================================================================
-- WHO REGISTERED A CALL IS THE DATABASE'S TO SAY, NOT THE CALLER'S.
--
-- Only the Hotline engineer is trained on the vigilance questions — Public
-- Health Threat / Death / Serious Incident, answered at Review 1 on the
-- registration form itself. A call registered by anyone else has those three
-- answered by somebody untrained, which is a compliance matter, so the register
-- has to be able to show who actually registered each call (the user's reason,
-- 2026-09-05).
--
-- `calls_before_insert` already stamps it — but only as a FALLBACK:
--
--     if new.created_by is null then new.created_by := auth.uid(); end if;
--
-- so a caller who SENDS a `created_by` keeps it. Nothing in the app sends one
-- (neither the call forms nor Bulk Uploads map that column), but "nothing sends
-- it today" is not a control: the REST API takes whatever a signed-in client
-- posts, and a record that can be attributed to somebody else on request is not
-- evidence of anything.
--
-- So: WHEN THERE IS A SIGNED-IN USER, THAT USER IS RECORDED, and what the
-- caller supplied is discarded.
--
-- WHEN THERE IS NOT — a migration, a restore, an administrative load running as
-- `postgres` — `auth.uid()` is null, and whatever was supplied is kept. Forcing
-- null there would erase the provenance of a restored row, which is the
-- opposite of the point.
--
-- A SECOND TRIGGER rather than a rewrite of `calls_before_insert`: that function
-- is defined in 0001 and redefined in 0050 (it is one of the twelve objects
-- `check:bundles` lists as split across modules), and reproducing it here to
-- change one line would put a stale copy of everything else back. BEFORE
-- triggers fire in NAME order, so `zz_` guarantees this one runs last and has
-- the final say on the column.
-- ===========================================================================

create or replace function public.calls_stamp_creator()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- auth.uid() is null for an administrative connection; only an authenticated
  -- caller is overridden, and only ever with their own identity.
  if auth.uid() is not null then
    new.created_by := auth.uid();
  end if;
  return new;
end $$;

do $stamp$
declare
  t      text;
  tables text[] := case when to_regclass('public.field_calls') is not null
                        then array['field_calls', 'installation_calls', 'pm_calls']
                        else array['calls'] end;
begin
  if to_regclass('public.field_calls') is null
     and (select c.relkind from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relname = 'calls') <> 'r' then
    raise notice 'calls is neither a table nor split — nothing to stamp';
    return;
  end if;

  foreach t in array tables loop
    execute format('drop trigger if exists zz_calls_stamp_creator on public.%I', t);
    execute format(
      'create trigger zz_calls_stamp_creator before insert on public.%I
         for each row execute function public.calls_stamp_creator()', t);
  end loop;
end $stamp$;
