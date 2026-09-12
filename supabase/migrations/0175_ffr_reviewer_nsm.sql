-- ===========================================================================
-- 0175 — FINDING BAGYARAJ BY WHAT HE IS, NOT ONLY BY HOW HIS NAME IS SPELT.
--
-- The user, 2026-09-12: "Bagyaraj would be mapped as nsm."
--
-- 0173 looked him up with `lower(name) like 'bagyaraj%'` — a PREFIX match on
-- the spelling alone, and both halves of that are fragile:
--
--   * the master may hold "M Bagyaraj", "Bagyaraj M", "BAGYARAJ.M" or a name
--     with an initial in front, and a prefix match finds none of those;
--   * a name is not unique, and a second Bagyaraj joining later would make the
--     match silently pick one of them by string length.
--
-- The ROLE is the second key, and a much better one: there is one National
-- Sales Manager. So the lookup now asks for both and says which it used.
--
-- IT REFUSES TO GUESS. If the two keys disagree, or several people match, it
-- changes NOTHING and says so. A quality record naming the wrong person is
-- worse than one naming nobody: blank is a question somebody asks, and a
-- plausible name is one nobody ever checks.
--
-- A FUNCTION, NOT ONLY A MIGRATION STEP. He may not be on User Master yet —
-- 0173 raised a notice to that effect rather than inventing a name — so this
-- has to be runnable AFTER he is added, without re-running a whole bundle:
--
--     select * from public.ffr_reviewer_backfill();          -- report only
--     select * from public.ffr_reviewer_backfill(p_apply => true);
--
-- IT FILLS SILENCE, IT DOES NOT REASSIGN WORK. Only records naming nobody are
-- touched; a review or a report that already records a person is left exactly
-- as it is, on every run.
-- ===========================================================================

create or replace function public.ffr_reviewer_backfill(
  p_apply     boolean default false,
  p_name_like text    default 'bagyaraj',
  p_role      text    default 'nsm')
returns table (name_used text, matched_on text, ffr_rows integer, review2_rows integer, review3_rows integer, note text)
language plpgsql security definer set search_path = public as $$
declare
  v_name  text;
  v_how   text;
  v_count integer;
  v_by_api boolean := coalesce(nullif(current_setting('request.jwt.claims', true), ''), '') <> '';
  v_like  text := '%' || lower(btrim(coalesce(p_name_like, ''))) || '%';
  v_role  text := lower(btrim(coalesce(p_role, '')));
begin
  -- Same gate as 0170, for the same reason: this is run from the SQL editor,
  -- where auth.uid() is NULL, so an is_admin() test alone would refuse the
  -- administrator running it. A call that ARRIVED THROUGH THE API must be an
  -- administrator; a direct database connection already has every table.
  if v_by_api and not public.is_admin() then
    raise exception 'Only an administrator may set the reviewer on old Field Failure Reports.';
  end if;

  -- 1. BOTH KEYS. The strongest answer, and the one the user described.
  select d.name, 'name and role' into v_name, v_how
    from public.user_directory d
   where lower(btrim(coalesce(d.name, ''))) like v_like
     and lower(btrim(coalesce(d.role, ''))) = v_role
     and coalesce(d.validity, true)
   limit 2;
  select count(*) into v_count
    from public.user_directory d
   where lower(btrim(coalesce(d.name, ''))) like v_like
     and lower(btrim(coalesce(d.role, ''))) = v_role
     and coalesce(d.validity, true);
  if v_count > 1 then
    name_used := ''; matched_on := 'name and role'; ffr_rows := 0; review2_rows := 0; review3_rows := 0;
    note := format('%s people on User Master match the name AND the role — nothing changed. Narrow it and run again.', v_count);
    return next; return;
  end if;

  -- 2. THE NAME ALONE, anywhere in it — "M Bagyaraj" and "Bagyaraj M" both.
  if v_name is null then
    select count(*) into v_count from public.user_directory d
     where lower(btrim(coalesce(d.name, ''))) like v_like and coalesce(d.validity, true);
    if v_count = 1 then
      select d.name, 'name only (role not set on User Master)' into v_name, v_how
        from public.user_directory d
       where lower(btrim(coalesce(d.name, ''))) like v_like and coalesce(d.validity, true);
    elsif v_count > 1 then
      name_used := ''; matched_on := 'name'; ffr_rows := 0; review2_rows := 0; review3_rows := 0;
      note := format('%s people on User Master match that name and none carries the %s role — nothing changed.', v_count, upper(v_role));
      return next; return;
    end if;
  end if;

  -- 3. THE ROLE ALONE — he is on the master under a spelling this did not
  -- guess, and there is exactly one person in the role.
  if v_name is null then
    select count(*) into v_count from public.user_directory d
     where lower(btrim(coalesce(d.role, ''))) = v_role and coalesce(d.validity, true);
    if v_count = 1 then
      select d.name, format('role %s only (the name did not match)', upper(v_role)) into v_name, v_how
        from public.user_directory d
       where lower(btrim(coalesce(d.role, ''))) = v_role and coalesce(d.validity, true);
    elsif v_count > 1 then
      name_used := ''; matched_on := 'role'; ffr_rows := 0; review2_rows := 0; review3_rows := 0;
      note := format('%s people hold the %s role and none matches the name — nothing changed.', v_count, upper(v_role));
      return next; return;
    end if;
  end if;

  if v_name is null then
    name_used := ''; matched_on := 'nothing'; ffr_rows := 0; review2_rows := 0; review3_rows := 0;
    note := format('Nobody on User Master matches "%s" or holds the %s role. Add the person to User Master and run this again.',
                   p_name_like, upper(v_role));
    return next; return;
  end if;

  -- How many records name nobody today. Counted whether or not this applies,
  -- because the report IS the point of the dry run.
  select count(*) into ffr_rows from public.field_failure_reports
   where coalesce(btrim(raised_by_name), '') in ('', 'Daily Call Review');
  select count(*) into review2_rows from public.call_reviews
   where coalesce(review2_done, false) and coalesce(btrim(coalesce(review2_by, '')), '') = '';
  select count(*) into review3_rows from public.call_reviews
   where coalesce(review3_done, false) and coalesce(btrim(coalesce(review3_by, '')), '') = '';

  if p_apply then
    update public.field_failure_reports set raised_by_name = v_name
     where coalesce(btrim(raised_by_name), '') in ('', 'Daily Call Review');
    update public.call_reviews set review2_by = v_name
     where coalesce(review2_done, false) and coalesce(btrim(coalesce(review2_by, '')), '') = '';
    update public.call_reviews set review3_by = v_name
     where coalesce(review3_done, false) and coalesce(btrim(coalesce(review3_by, '')), '') = '';
    note := 'set';
  else
    note := 'would set — run with p_apply => true to make the change';
  end if;

  name_used := v_name;
  matched_on := v_how;
  return next;
end $$;

revoke all on function public.ffr_reviewer_backfill(boolean, text, text) from public;
grant execute on function public.ffr_reviewer_backfill(boolean, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- AND RUN IT ON APPLY, so a database where he IS already on User Master is
-- corrected without anybody having to remember. Idempotent: once the records
-- name somebody there is nothing left matching, so a re-run changes nothing.
--
-- The notice is the whole output — a `select` inside a migration goes nowhere.
-- ---------------------------------------------------------------------------
do $$
declare r record;
begin
  select * into r from public.ffr_reviewer_backfill(p_apply => true);
  if coalesce(r.name_used, '') = '' then
    raise notice 'FFR reviewer NOT set: %', r.note;
  else
    raise notice 'FFR reviewer set to "%" (matched on %): % report(s), % Review 2, % Review 3.',
      r.name_used, r.matched_on, r.ffr_rows, r.review2_rows, r.review3_rows;
  end if;
end $$;
