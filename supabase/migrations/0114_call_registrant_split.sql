-- ===========================================================================
-- TWO FACTS, NOT ONE: THE DESK OF RECORD, AND THE PERSON AT THE KEYBOARD.
--
-- 0113 made `created_by` unforgeable — whoever is signed in is who is recorded.
-- That is right for the compliance question but it collapses two different
-- facts into one column, and the user's instruction (2026-09-06) separates
-- them:
--
--   created_by         THE DESK OF RECORD. Defaults to the Hotline engineer,
--                      who at present is SIVARANI and is the only person
--                      trained on the three vigilance questions (Public Health
--                      Threat / Death / Serious Incident) asked at Review 1 of
--                      a registration. A call belongs to that desk whoever
--                      happened to type it in.
--
--   actual_created_by  THE PERSON AT THE KEYBOARD. Today that is one of
--                      service.almsind@gmail.com, devika.m@airliquide.com or
--                      karthiksundar.b@airliquide.com when the Hotline
--                      engineer is on leave or otherwise unavailable.
--
-- The two agreeing is the ordinary case. The two DISAGREEING is the finding: an
-- untrained person answered the vigilance questions, and the register can now
-- produce that list instead of somebody reconstructing it from memory.
--
-- WHICH ONE IS UNFORGEABLE. `actual_created_by`, always. It is set from
-- auth.uid() and whatever the caller sent is discarded, exactly as 0113 did for
-- created_by — because it is the column an enquiry rests on. `created_by` is a
-- CHOICE (which hotline engineer's desk), so it is accepted from the caller,
-- but only when it names a hotline-role profile; anything else falls back to
-- the default. A choice that cannot be abused is still a choice.
--
-- ADMINISTRATIVE CONNECTIONS (auth.uid() null — a migration, a restore, a bulk
-- load) keep what they supply, and 0113's reasoning holds: forcing null there
-- would erase a restored row's provenance.
--
-- THE HISTORY. Every row that already carries a `created_by` got it from
-- auth.uid(), i.e. it recorded the person at the keyboard — so the backfill is
-- `actual_created_by := created_by`, and it is exact rather than a guess. Rows
-- bulk-loaded from the sheet era carry neither, and still say so;
-- `supabase/apply/_registered_by_check.sql` reports where that line falls.
-- ===========================================================================

-- ---- 1. the column -------------------------------------------------------
do $split$
declare
  t      text;
  tables text[] := case when to_regclass('public.field_calls') is not null
                        then array['field_calls', 'installation_calls', 'pm_calls']
                        else array['calls'] end;
begin
  if to_regclass('public.field_calls') is null
     and (select c.relkind from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relname = 'calls') <> 'r' then
    raise notice 'calls is neither a table nor split — nothing to alter';
    return;
  end if;

  foreach t in array tables loop
    -- Appended, never inserted: `public.calls` is `select *` over the three
    -- tables, and `create or replace view` can only ADD columns at the end.
    -- All three gain it in the same statement order, so the union stays aligned.
    execute format('alter table public.%I add column if not exists actual_created_by uuid references auth.users (id)', t);
    -- The read policy gains an `actual_created_by = auth.uid()` arm below, and
    -- that arm is only cheap with an index behind it.
    execute format('create index if not exists %I on public.%I (actual_created_by)',
                   t || '_actual_created_by_idx', t);
    -- Exact, not approximate: until now `created_by` WAS the person at the
    -- keyboard, so copying it across loses nothing and invents nothing.
    execute format('update public.%I set actual_created_by = created_by
                     where actual_created_by is null and created_by is not null', t);
  end loop;
end $split$;

-- ---- 2. whose desk a call belongs to by default ---------------------------
-- Resolution order, most specific first:
--   1. app_settings['calls.default_registrant_email'] — an administrator has
--      named the desk explicitly. An EMAIL rather than a UUID, because the
--      person setting it reads email addresses, not UUIDs.
--   2. the single profile whose role is 'hotline' — true today (SIVARANI) and
--      the reason this needs no configuration to work.
--   3. null, when there are none or several and nobody has said which. The
--      caller then falls back to the signed-in user, which is what 0113 did:
--      an unknown desk must not become an EMPTY one.
create or replace function public.default_registrant()
returns uuid language sql stable security definer set search_path = public as $$
  select coalesce(
    (select p.id from public.profiles p
      join public.app_settings s on s.key = 'calls.default_registrant_email'
      where lower(p.email) = lower(btrim(s.value)) and btrim(s.value) <> ''
      limit 1),
    -- Only when there is exactly ONE. Two hotline engineers and no setting is
    -- an ambiguity, and picking one arbitrarily would put a name on calls that
    -- nobody chose.
    (select p.id from public.profiles p
      where lower(coalesce(p.role, '')) = 'hotline'
        and (select count(*) from public.profiles q
              where lower(coalesce(q.role, '')) = 'hotline') = 1
      limit 1)
  )
$$;
revoke all on function public.default_registrant() from public;
grant execute on function public.default_registrant() to authenticated;

-- Is this user allowed to be named as the desk of record? Only a hotline-role
-- profile, or the configured default itself (which an administrator chose and
-- may have given a different role).
create or replace function public.is_registrant_desk(p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select p_user is not null
     and (p_user = public.default_registrant()
          or exists (select 1 from public.profiles p
                      where p.id = p_user and lower(coalesce(p.role, '')) = 'hotline'))
$$;
revoke all on function public.is_registrant_desk(uuid) from public;
grant execute on function public.is_registrant_desk(uuid) to authenticated;

-- The list a form can offer. `profiles` only lets most people read themselves,
-- so this reaches past that — deliberately, and as a FUNCTION rather than a
-- view: a SECURITY DEFINER view over an RLS-protected table is the exact shape
-- `npm run check:views` exists to reject, and a function makes the boundary
-- explicit instead of hiding it in a view option. It returns three columns of
-- the hotline desks and nothing else about those people.
create or replace function public.registrant_desks()
returns table (id uuid, name text, email text, is_default boolean)
language sql stable security definer set search_path = public as $$
  select p.id,
         coalesce(nullif(btrim(p.full_name), ''), p.email) as name,
         p.email,
         (p.id = public.default_registrant()) as is_default
    from public.profiles p
   where lower(coalesce(p.role, '')) = 'hotline'
      or p.id = public.default_registrant()
   order by (p.id = public.default_registrant()) desc, 2
$$;
revoke all on function public.registrant_desks() from public;
grant execute on function public.registrant_desks() to authenticated;

-- ---- 3. the stamp ---------------------------------------------------------
-- Replaces 0113's version. Still `zz_`-prefixed and still the last BEFORE
-- trigger to run (they fire in name order), so it has the final say.
create or replace function public.calls_stamp_creator()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null then
    -- Not negotiable. Whatever the caller sent is discarded.
    new.actual_created_by := auth.uid();

    -- The desk. A caller may name one, but only a real one.
    if new.created_by is null or not public.is_registrant_desk(new.created_by) then
      new.created_by := coalesce(public.default_registrant(), auth.uid());
    end if;
  else
    -- Administrative: a migration, a restore, a bulk load. Keep what was
    -- supplied; only fill a gap, and only from the other column.
    if new.actual_created_by is null then new.actual_created_by := new.created_by; end if;
    if new.created_by is null then new.created_by := new.actual_created_by; end if;
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
    return;
  end if;
  foreach t in array tables loop
    execute format('drop trigger if exists zz_calls_stamp_creator on public.%I', t);
    execute format(
      'create trigger zz_calls_stamp_creator before insert on public.%I
         for each row execute function public.calls_stamp_creator()', t);
  end loop;
end $stamp$;

-- ---- 4. the views carry the new column ------------------------------------
-- `select *` fixed the column list when the view was created, so it has to be
-- REPLACED (not dropped) to pick the new one up — dropping would take the
-- INSTEAD OF triggers and the KPI views built on it with it.
do $views$
begin
  if to_regclass('public.field_calls') is null then return; end if;
  create or replace view public.calls as
    select * from public.field_calls
    union all select * from public.installation_calls
    union all select * from public.pm_calls;
end $views$;

-- `create or replace view` DROPS security_invoker, and a view without it reads
-- as its OWNER — every signed-in user seeing every call, with no error and no
-- warning. It has happened three times in this project (0040/0050/0057), so it
-- is re-asserted on EVERY rebuild, here included.
alter view public.calls set (security_invoker = on);

-- pending_calls is `select * from calls`, so it needs the same treatment to
-- gain the column — and marking it invoker is not optional either: a view
-- marked invoker that reads a view running as its owner inherits the owner's
-- reach.
create or replace view public.pending_calls as
  select * from public.calls
   where cancelled_at is null
     and (open_state <> 'Solved' or reopened_at is not null);
alter view public.pending_calls set (security_invoker = on);
alter view public.call_state    set (security_invoker = on);

-- ---- 5. writes through the view carry it too ------------------------------
-- The INSTEAD OF functions were generated from the column list as it was.
-- Regenerated here, and the RETURNING clause gains `actual_created_by` so the
-- client sees the stamp it did not send.
do $regen$
declare ins_cols text; ins_vals text; set_list text;
begin
  if to_regclass('public.field_calls') is null then return; end if;
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position),
         string_agg(
           case when column_default is not null
                then format('coalesce(new.%I, %s)', column_name, column_default)
                else 'new.' || quote_ident(column_name) end,
           ', ' order by ordinal_position),
         string_agg(quote_ident(column_name) || ' = new.' || quote_ident(column_name), ', ' order by ordinal_position)
    into ins_cols, ins_vals, set_list
    from information_schema.columns
   where table_schema = 'public' and table_name = 'field_calls'
     and is_generated = 'NEVER' and column_name <> 'id';

  execute format($f$
    create or replace function public.calls_view_insert() returns trigger language plpgsql as $b$
    begin
      case public.call_table_for(new.call_type)
        when 'installation' then
          insert into public.installation_calls (%1$s) values (%2$s)
            returning id, ucn, call_number, reg_date, created_by, actual_created_by, open_state, added_on, reg_at
            into new.id, new.ucn, new.call_number, new.reg_date, new.created_by, new.actual_created_by, new.open_state, new.added_on, new.reg_at;
        when 'pm' then
          insert into public.pm_calls (%1$s) values (%2$s)
            returning id, ucn, call_number, reg_date, created_by, actual_created_by, open_state, added_on, reg_at
            into new.id, new.ucn, new.call_number, new.reg_date, new.created_by, new.actual_created_by, new.open_state, new.added_on, new.reg_at;
        else
          insert into public.field_calls (%1$s) values (%2$s)
            returning id, ucn, call_number, reg_date, created_by, actual_created_by, open_state, added_on, reg_at
            into new.id, new.ucn, new.call_number, new.reg_date, new.created_by, new.actual_created_by, new.open_state, new.added_on, new.reg_at;
      end case;
      return new;
    end $b$;
  $f$, ins_cols, ins_vals);

  execute format($f$
    create or replace function public.calls_view_update() returns trigger language plpgsql as $b$
    begin
      case public.call_table_for(old.call_type)
        when 'installation' then update public.installation_calls set %1$s where ucn = old.ucn;
        when 'pm'           then update public.pm_calls           set %1$s where ucn = old.ucn;
        else                     update public.field_calls        set %1$s where ucn = old.ucn;
      end case;
      return new;
    end $b$;
  $f$, set_list);
end $regen$;

-- ---- 6. the person who registered it can still see it ---------------------
-- The visibility test has an arm for "a call you created". With `created_by`
-- now naming the DESK, that arm stops matching for the very people this change
-- is about: Devika registers a call, it is filed to the Hotline desk, and she
-- can no longer open the thing she just typed in. So the arm is widened to
-- either column.
--
-- This re-creates the 0040 policies verbatim apart from that one line. It is
-- the same shape deliberately: the InitPlan wrappers `(select ...)` are what
-- 0095 added to stop the reporting-tree set being rebuilt per row.
do $rls$
declare t text; vis text;
begin
  if to_regclass('public.field_calls') is null then return; end if;
  vis := $v$ (select public.can_view_all_calls())
             or created_by = (select auth.uid())
             or actual_created_by = (select auth.uid())
             or coalesce(allocated_to, '') = ''
             or lower(trim(allocated_to)) in (select lower(trim(n)) from public.visible_engineer_names() as v(n)) $v$;
  foreach t in array array['field_calls', 'installation_calls', 'pm_calls'] loop
    execute format('drop policy if exists calls_scoped_read on public.%I', t);
    execute format('create policy calls_scoped_read on public.%I for select using ((select public.has_perm(''calls.view'')) and (%s))', t, vis);
    execute format('drop policy if exists calls_update on public.%I', t);
    execute format('create policy calls_update on public.%1$I for update using ((select (public.has_perm(''calls.edit'') or public.has_perm(''calls.report''))) and (%2$s)) with check ((select (public.has_perm(''calls.edit'') or public.has_perm(''calls.report''))) and (%2$s))', t, vis);
  end loop;
end $rls$;

comment on column public.field_calls.actual_created_by is
  'The signed-in user who registered the call. Stamped by the database, never accepted from the caller. created_by is the DESK of record (the Hotline engineer); the two disagreeing is the vigilance finding.';
