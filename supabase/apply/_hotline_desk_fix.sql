-- ===========================================================================
-- MOVE THE HOTLINE DESK ON REGISTERED FIELD CALLS
--
-- The user, 2026-09-08: "Give me a SQL Script to update this field to
-- 'SIVARANI' for all the Registered Field Calls 'Created By (Hotline Desk)' --
-- She was using the Admin ID for Some Urgent work".
--
-- READ THIS BEFORE RUNNING IT. It rewrites attribution on a quality record, so
-- it is written to be checked first and run second.
--
--   * IT IS A DRY RUN UNTIL YOU CHANGE ONE WORD. `v_apply` on the first line of
--     the block below is `false`. Run it as it is: it changes nothing and
--     prints exactly what it would change. Set it to `true` and run it again to
--     apply. KEEP THE OUTPUT of both runs — see the note on the trail at the
--     bottom.
--
--   * IT MOVES THE DESK ONLY. `created_by` is the Hotline DESK a call is filed
--     to; `actual_created_by` is the person who was at the keyboard, stamped
--     from the session and never settable by the app (0114). Sivarani WAS
--     signed in as the admin, so `actual_created_by` correctly says the admin
--     login and this script does not touch it. Changing it would not be a
--     correction, it would be a false statement about who did the work — and
--     the two DIFFERING is the finding the split exists to surface.
--
--   * FIELD CALLS ONLY. `field_calls`, not PM or installation, because that is
--     what was asked for. The other two tables are named at the bottom if the
--     same correction is needed there.
--
--   * NARROW IT WITH A DATE WINDOW if you can. `v_from` / `v_to` are NULL,
--     which means every field call ever filed to that desk. If Sivarani used
--     the admin login for a known stretch, put those dates in: the admin
--     account may legitimately have registered other calls, and this cannot
--     tell them apart — `actual_created_by` says "the admin login" for both.
-- ===========================================================================

do $fix$
declare
  v_apply    boolean := false;                 -- <<< set to true to apply

  v_from     date    := null;                  -- optional: only calls from this date
  v_to       date    := null;                  -- optional: only calls up to this date

  v_from_name text   := 'Rithi Admin';         -- the desk the calls carry NOW
  v_to_name   text   := 'SIVARANI';            -- the desk they should carry

  v_from_id  uuid;
  v_to_id    uuid;
  v_n        int;
  v_to_role  text;
  r          record;
begin
  -- ---- resolve both people, and refuse anything ambiguous ------------------
  -- By name OR email, case-insensitively, across the profile directory. An
  -- ambiguous name is a stop, not a guess: picking the wrong Sivarani would
  -- re-attribute a register and nothing downstream would notice.
  select p.id into v_from_id
    from public.profiles p
   where lower(btrim(coalesce(p.full_name, ''))) = lower(btrim(v_from_name))
      or lower(btrim(coalesce(p.email, '')))     = lower(btrim(v_from_name));
  get diagnostics v_n = row_count;
  if v_n <> 1 then
    raise exception 'Found % people matching "%" — name it exactly, or use the email.', v_n, v_from_name;
  end if;

  select p.id, lower(coalesce(p.role, '')) into v_to_id, v_to_role
    from public.profiles p
   where lower(btrim(coalesce(p.full_name, ''))) = lower(btrim(v_to_name))
      or lower(btrim(coalesce(p.email, '')))     = lower(btrim(v_to_name));
  get diagnostics v_n = row_count;
  if v_n <> 1 then
    raise exception 'Found % people matching "%" — name it exactly, or use the email.', v_n, v_to_name;
  end if;

  raise notice '--------------------------------------------------------------';
  raise notice 'FROM  % -> %', v_from_name, v_from_id;
  raise notice 'TO    % -> %', v_to_name, v_to_id;

  -- A desk is a hotline profile (or the configured default). If the destination
  -- is not one, this still works — but the APP will not offer her as a desk on
  -- the next call, so the register would carry a desk the form cannot set.
  if v_to_role <> 'hotline' and v_to_id is distinct from public.default_registrant() then
    raise notice 'WARNING: % has role "%", not hotline. The correction applies, but the '
                 'call form will not offer her as a desk until her role is hotline '
                 'or she is set as the default registrant on Admin Config.',
                 v_to_name, coalesce(nullif(v_to_role, ''), '(none)');
  end if;

  -- ---- what it would change ------------------------------------------------
  select count(*) into v_n
    from public.field_calls c
   where c.created_by = v_from_id
     and (v_from is null or c.reg_date >= v_from)
     and (v_to   is null or c.reg_date <= v_to);

  raise notice '--------------------------------------------------------------';
  raise notice '% field call(s) would move from % to %.', v_n, v_from_name, v_to_name;

  if v_n > 0 then
    for r in
      select min(c.reg_date) as first_day, max(c.reg_date) as last_day, count(*) as n
        from public.field_calls c
       where c.created_by = v_from_id
         and (v_from is null or c.reg_date >= v_from)
         and (v_to   is null or c.reg_date <= v_to)
    loop
      raise notice 'Registered between % and %.', r.first_day, r.last_day;
    end loop;

    raise notice 'First ten:';
    for r in
      select c.ucn, c.reg_date, c.party_name,
             (select n.name from public.app_user_names n where n.id = c.actual_created_by) as typed_in_by
        from public.field_calls c
       where c.created_by = v_from_id
         and (v_from is null or c.reg_date >= v_from)
         and (v_to   is null or c.reg_date <= v_to)
       order by c.reg_date, c.ucn
       limit 10
    loop
      raise notice '  %  %  %  (at the keyboard: %)',
        rpad(r.ucn, 12), r.reg_date, left(coalesce(r.party_name, ''), 40),
        coalesce(r.typed_in_by, '— not recorded —');
    end loop;
  end if;

  -- ---- apply ---------------------------------------------------------------
  if not v_apply then
    raise notice '--------------------------------------------------------------';
    raise notice 'DRY RUN — nothing was changed. Set v_apply := true and run again.';
    return;
  end if;

  update public.field_calls c
     set created_by = v_to_id
   where c.created_by = v_from_id
     and (v_from is null or c.reg_date >= v_from)
     and (v_to   is null or c.reg_date <= v_to);
  get diagnostics v_n = row_count;

  raise notice '--------------------------------------------------------------';
  raise notice 'APPLIED: % field call(s) now carry the % desk.', v_n, v_to_name;
  raise notice 'actual_created_by was NOT touched — it still says who was signed in.';
end $fix$;

-- ---------------------------------------------------------------------------
-- AFTERWARDS
--
-- Check it, from the register's own point of view:
--
--   select coalesce(n.name, '— none —') as hotline_desk, count(*)
--     from public.field_calls c
--     left join public.app_user_names n on n.id = c.created_by
--    group by 1 order by 2 desc;
--
-- THE SAME CORRECTION ON THE OTHER TWO CALL TABLES, if it is needed: the
-- register is split into `field_calls`, `pm_calls` and `installation_calls`
-- (0040), and this script deliberately touches only the first. Change the table
-- name in the three places above to do another.
--
-- THE TRAIL. `record_audit` no longer records (0112), so this correction leaves
-- no independent before/after image in the database. The dry-run output IS the
-- record of what changed — keep it with the change note. That limitation is
-- already carried as a raised residual risk (R-14) in the validation package,
-- and this is exactly the kind of edit it was raised about.
-- ---------------------------------------------------------------------------
