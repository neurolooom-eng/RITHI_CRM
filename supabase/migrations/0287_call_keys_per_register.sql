-- ===========================================================================
-- 0287 — EACH CALL REGISTER IS GOVERNED BY ITS OWN KEYS
--
-- Findings 57-67 (docs/PERMISSIONS_REVIEW.md), the user's decisions of
-- 2026-09-30: "63, 64: It should show the Individual View's Control Action and
-- its Check Box" -- each screen gets keys of its own, today's grants copied
-- across (0298) so nobody gains or loses anything on the day it ships -- and
-- "67: Break it down", with the old key kept as the PARENT of the new ones, so
-- a role holding it keeps everything until an administrator unticks it.
-- The parent rule itself is in has_perm() (0286, public.perm_parents).
--
-- This file: Installation and PM calls are edited, re-allocated, reported,
-- cancelled and re-opened with install.* and pm.* keys, and Field calls with
-- calls.* -- the section guard and the allot guard read the table they fire
-- on, and the functions that take a UCN ask call_perm() (0286).
-- ===========================================================================

-- ---- the write policies, per register ------------------------------------
-- 0127's policy with the register's own keys. The children name every way in:
-- a section of the call, a visit, or a re-allocation; the parents (edit,
-- report) satisfy their children through has_perm().
do $rls$
declare t text; reg text; vis text; may text;
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
  foreach t in array array['field_calls', 'installation_calls', 'pm_calls'] loop
    reg := case t when 'installation_calls' then 'install' when 'pm_calls' then 'pm' else 'calls' end;
    may := format($m$ (select (public.has_perm('%1$s.edit.complaint')
                   or public.has_perm('%1$s.edit.customer')
                   or public.has_perm('%1$s.edit.vigilance')
                   or public.has_perm('%1$s.edit.contact')
                   or public.has_perm('%1$s.report.visit')
                   or public.has_perm('%1$s.allot'))) $m$, reg);
    execute format('drop policy if exists calls_update on public.%I', t);
    execute format('create policy calls_update on public.%1$I for update using (%2$s and (%3$s)) with check (%2$s and (%3$s))', t, may, vis);
  end loop;

  -- A PM call is created with the PM register's own key.
  drop policy if exists calls_insert on public.pm_calls;
  create policy calls_insert on public.pm_calls for insert with check (public.has_perm('pm.create'));
end $rls$;

CREATE OR REPLACE FUNCTION public.calls_edit_section_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  reg     text := case tg_table_name when 'installation_calls' then 'install' when 'pm_calls' then 'pm' else 'calls' end;
  me      uuid := auth.uid();
  free    boolean;
  changed boolean;
begin
  -- No signed-in user (import, definer, scheduled) is not a person, and an
  -- administrator is every person. `calls.edit` is the parent of all four.
  free := me is null or public.is_admin() or public.has_perm(reg || '.edit');

  if not free then
    changed := new.standard_complaint is distinct from old.standard_complaint
            or new.complaint_reported is distinct from old.complaint_reported
            or new.breakdown_date     is distinct from old.breakdown_date;
    if changed and not public.has_perm(reg || '.edit.complaint') then
      raise exception 'RBAC: changing the complaint needs the "Edit the complaint" permission';
    end if;

    changed := new.party_name   is distinct from old.party_name
            or new.city         is distinct from old.city
            or new.state        is distinct from old.state
            or new.product_name is distinct from old.product_name
            or new.serial       is distinct from old.serial
            or new.item_status  is distinct from old.item_status;
    if changed and not public.has_perm(reg || '.edit.customer') then
      raise exception 'RBAC: changing the customer or the machine needs the "Edit customer & product" permission';
    end if;

    changed := new.customer_name        is distinct from old.customer_name
            or new.customer_number      is distinct from old.customer_number
            or new.customer_designation is distinct from old.customer_designation;
    if changed and not public.has_perm(reg || '.edit.contact') then
      raise exception 'RBAC: changing the customer contact needs the "Edit customer contact details" permission';
    end if;

    changed := new.public_health_threat is distinct from old.public_health_threat
            or new.death                is distinct from old.death
            or new.serious_incident     is distinct from old.serious_incident;
    if changed and not public.has_perm(reg || '.edit.vigilance') then
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
end $function$;

CREATE OR REPLACE FUNCTION public.calls_allot_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.allocated_to is not distinct from old.allocated_to then
    return new;                                   -- not a re-allocation
  end if;
  if auth.uid() is null then
    return new;                                   -- import / definer / scheduled
  end if;
  if public.is_admin() then
    return new;
  end if;
  if not public.has_perm(case tg_table_name when 'installation_calls' then 'install' when 'pm_calls' then 'pm' else 'calls' end || '.allot') then
    raise exception
      'RBAC: moving a call to another engineer needs the "Re-allocate a call to another engineer" permission';
  end if;
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.cancel_call(p_ucn text, p_reason text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_cancelled timestamptz; v_exists boolean;
begin
  if not public.call_perm(p_ucn, 'cancel') then
    raise exception 'RBAC: your role cannot cancel a call';
  end if;
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'A cancellation needs a reason';
  end if;

  select true, cancelled_at into v_exists, v_cancelled
    from public.calls where ucn = p_ucn;
  if v_exists is null then raise exception 'No call with UCN %', p_ucn; end if;
  if v_cancelled is not null then raise exception 'Call % is already cancelled', p_ucn; end if;

  update public.calls
     set cancelled_at  = now(),
         cancel_reason = btrim(p_reason),
         cancelled_by  = auth.uid()
   where ucn = p_ucn;

  return p_ucn;
end $function$;

CREATE OR REPLACE FUNCTION public.restore_call(p_ucn text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_cancelled timestamptz; v_exists boolean;
begin
  if not public.call_perm(p_ucn, 'cancel') then
    raise exception 'RBAC: your role cannot restore a call';
  end if;

  select true, cancelled_at into v_exists, v_cancelled
    from public.calls where ucn = p_ucn;
  if v_exists is null then raise exception 'No call with UCN %', p_ucn; end if;
  if v_cancelled is null then raise exception 'Call % is not cancelled', p_ucn; end if;

  update public.calls set cancelled_at = null, cancelled_by = null where ucn = p_ucn;
  return p_ucn;
end $function$;

CREATE OR REPLACE FUNCTION public.reopen_call(p_ucn text, p_reason text DEFAULT ''::text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_solved boolean; v_reopened timestamptz;
begin
  if not public.call_perm(p_ucn, 'reopen') then
    raise exception 'RBAC: your role cannot re-open a call';
  end if;

  select open_state = 'Solved', reopened_at into v_solved, v_reopened
    from public.calls where ucn = p_ucn;
  if v_solved is null then raise exception 'No call with UCN %', p_ucn; end if;
  if v_reopened is not null then raise exception 'Call % is already re-opened', p_ucn; end if;
  if not v_solved then raise exception 'Call % is not closed, so there is nothing to re-open', p_ucn; end if;

  update public.calls
     set reopened_at = now(), reopen_count = coalesce(reopen_count, 0) + 1
   where ucn = p_ucn;

  return p_ucn;
end $function$;

CREATE OR REPLACE FUNCTION public.close_call(p_ucn text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_found boolean; v_state text; v_reopened timestamptz; v_cancelled timestamptz;
begin
  -- The same gate as re-opening: whoever may put a call back on the open list
  -- may take one off it.
  if not public.call_perm(p_ucn, 'reopen') then
    raise exception 'RBAC: your role cannot close a call';
  end if;

  select true, open_state, reopened_at, cancelled_at
    into v_found, v_state, v_reopened, v_cancelled
    from public.calls where ucn = p_ucn;
  if v_found is null then raise exception 'No call with UCN %', p_ucn; end if;
  if v_cancelled is not null then
    raise exception 'Call % is cancelled — restore it before closing it', p_ucn;
  end if;
  if v_reopened is not null then
    raise exception 'Call % is re-opened — use Close again, which gives the re-open back', p_ucn;
  end if;
  if v_state = 'Solved' then raise exception 'Call % is already closed', p_ucn; end if;

  -- No visit is invented: last_visit_at is untouched, so the visit history
  -- still says what actually happened, which is nothing.
  update public.calls set last_status = 'Solved' where ucn = p_ucn;

  return p_ucn;
end $function$;

CREATE OR REPLACE FUNCTION public.close_reopened_call(p_ucn text, p_reason text DEFAULT ''::text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_reopened timestamptz; v_found boolean;
begin
  if not public.call_perm(p_ucn, 'reopen') then
    raise exception 'RBAC: your role cannot close a re-opened call';
  end if;

  select true, reopened_at into v_found, v_reopened
    from public.calls where ucn = p_ucn;
  if v_found is null then raise exception 'No call with UCN %', p_ucn; end if;
  if v_reopened is null then
    raise exception 'Call % is not re-opened — close it by entering the visit that solved it', p_ucn;
  end if;

  update public.calls
     set reopened_at  = null,
         reopen_count = greatest(coalesce(reopen_count, 0) - 1, 0)
   where ucn = p_ucn;

  return p_ucn;
end $function$;
