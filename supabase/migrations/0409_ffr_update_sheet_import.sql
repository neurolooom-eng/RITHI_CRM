-- ===========================================================================
-- 0409 -- THE OLD FFR UPDATE LOG, LOADED (the user, 2026-10-10: "Add a
-- provision to update the old Logs for FFR - Attached the Sheet that needs to
-- be imported" -- the "Field Failure Register - Update" form's responses:
-- Timestamp, UCN Number, FFR NO, Problem Status, Service Dept Observation,
-- CAPA Responsibility, CAPA NO, CAPA Status, FFR Status, Attachment,
-- Additional Problem Description, Generate FFR Word Copy?).
--
-- Asked and answered:
--   * Effect: LOG + APPLY LATEST. Every sheet row becomes a dated entry in that
--     report's update log (ffr_history, 0174), at the sheet's Timestamp; the
--     report then carries its latest update's values.
--   * Matching: FFR NO + UCN. A row goes to the register row with that FFR
--     number AND that UCN, and to nothing else. Measured on the live project
--     before this was written: the register has ONE row per FFR number and
--     the sheet's UCN differs from it on 809 of 1,529 rows; the user kept this
--     rule with those numbers in front of them. A row that matches is loaded;
--     one that does not is RETURNED, with the register's UCN for that FFR
--     number beside it, and nothing is written for it.
--   * A BLANK CELL KEEPS THE EARLIER VALUE: it is no part of the log entry and
--     never empties the report.
--   * Signed "FFR Update sheet (import)" -- the sheet has no updated-by column.
--     Who loaded it is recorded on each loaded row (loaded_by).
--
-- "Generate FFR Word Copy?" is an instruction the form gave, not a value of
-- the report: it is kept on the loaded row and applied to nothing.
--
-- LATEST, PER FIELD, AND NEWER WINS. A field takes the value of the latest
-- sheet row that filled it -- unless the update log records a change to that
-- same field made AFTER that row (an edit on the form, a re-load of the
-- register), which is newer and is kept. So a report edited in RITHI after the
-- sheet's last update is not put back to what the sheet said.
--
-- RE-RUNNABLE. A loaded row is keyed by its report and Timestamp; loading the
-- same sheet again adds nothing and changes nothing.
--
-- The apply is NOT logged a second time: each sheet row is already its own
-- entry, so ffr_history_write() (0174) stays silent while this function writes
-- the report (the transaction-local flag rithi.ffr_sheet_import).
--
-- SECURITY DEFINER with its own check: the update log has no insert policy,
-- by design (0174). Needs ffr.manage (the register's edit right) AND
-- bulk.upload (loading historical data) -- both existing keys; no role gains
-- anything.
-- ===========================================================================

create table if not exists public.ffr_sheet_updates (
  id                  bigserial primary key,
  ffr_id              bigint      not null references public.field_failure_reports (id),
  ffr_no              text        not null default '',
  ucn                 text        not null default '',
  updated_at          timestamptz not null,
  problem_status      text        not null default '',
  service_observation text        not null default '',
  capa_responsibility text        not null default '',
  capa_no             text        not null default '',
  capa_status         text        not null default '',
  ffr_status          text        not null default '',
  attachment_url      text        not null default '',
  additional_problem  text        not null default '',
  word_copy           text        not null default '',
  source_row          integer,
  loaded_at           timestamptz not null default now(),
  loaded_by           uuid,
  loaded_by_name      text        not null default '',
  unique (ffr_id, updated_at)
);

comment on table public.ffr_sheet_updates is
  'The old "Field Failure Register - Update" sheet as loaded (0409), one row per update, keyed by report + Timestamp. Each is also an entry in ffr_history; the report carries the latest values, a newer logged change winning per field.';

alter table public.ffr_sheet_updates enable row level security;
-- Read as the update log is read (0177).
drop policy if exists ffrsu_read on public.ffr_sheet_updates;
create policy ffrsu_read on public.ffr_sheet_updates for select to authenticated
  using ((select public.has_perm('ffr.view')) or (select public.has_perm('ffr.manage')) or (select public.is_admin()));
-- No write policy: rows arrive through ffr_load_sheet_updates() only.
revoke all on public.ffr_sheet_updates from anon;
revoke insert, update, delete, truncate on public.ffr_sheet_updates from authenticated;
grant select on public.ffr_sheet_updates to authenticated;

do $$
begin
  if to_regprocedure('public.block_hard_delete()') is not null then
    execute 'drop trigger if exists zz_no_delete on public.ffr_sheet_updates';
    execute 'create trigger zz_no_delete before delete on public.ffr_sheet_updates
               for each row execute function public.block_hard_delete()';
  end if;
  if to_regprocedure('public.sys_columns_attach(regclass)') is not null then
    perform public.sys_columns_attach('public.ffr_sheet_updates'::regclass);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 0174's function, word for word, with ONE addition: silent while the sheet
-- load writes the report (its rows are logged already).
-- ---------------------------------------------------------------------------
create or replace function public.ffr_history_write()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_old  jsonb := to_jsonb(old);
  v_new  jsonb := to_jsonb(new);
  v_diff jsonb := '{}'::jsonb;
  k      text;
  v_name text;
  -- Not worth an entry: set by the database on every write, or never changed.
  skip   text[] := array['updated_at', 'id', 'ffr_no', 'raised_by', 'created_at'];
begin
  -- 0409: the old update sheet's apply. Each of its rows is its own entry.
  if coalesce(current_setting('rithi.ffr_sheet_import', true), '') = 'on' then return null; end if;

  for k in select jsonb_object_keys(v_new) loop
    if k = any (skip) then continue; end if;
    if v_new -> k is distinct from v_old -> k then
      v_diff := v_diff || jsonb_build_object(k, jsonb_build_object('from', v_old -> k, 'to', v_new -> k));
    end if;
  end loop;

  -- Nothing actually changed: re-saving a form untouched is not an event.
  if v_diff = '{}'::jsonb then return null; end if;

  select coalesce(nullif(btrim(d.name), ''), nullif(btrim(p.full_name), ''), p.email)
    into v_name
    from public.profiles p
    left join public.user_directory d
      on lower(btrim(d.email)) = lower(btrim(p.email))
      or lower(btrim(d.gmail)) = lower(btrim(p.email))
   where p.id = auth.uid();

  insert into public.ffr_history (ffr_id, ffr_no, changed_by, changed_by_name, action, changes)
  values (new.id, coalesce(new.ffr_no, ''), auth.uid(), coalesce(v_name, ''), 'update', v_diff);

  return null;
end $$;

-- ---------------------------------------------------------------------------
-- THE LOAD. p_rows is a JSON array, one object per sheet row:
--   {row, ffr_no, ucn, at (timestamp), problem_status, service_observation,
--    capa_responsibility, capa_no, capa_status, ffr_status, attachment_url,
--    additional_problem, word_copy}
-- Returns {loaded, unchanged, already, reports, fields_applied, kept_newer,
-- rejected: [{row, ffr_no, ucn, reason, register_ucn}]}.
-- ---------------------------------------------------------------------------
create or replace function public.ffr_load_sheet_updates(p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  c_fields  constant text[] := array['problem_status', 'service_observation', 'capa_responsibility',
                                     'capa_no', 'capa_status', 'ffr_status', 'attachment_url', 'additional_problem'];
  r         record;
  v_ids     bigint[];
  v_match   bigint[];
  v_regucn  text;
  v_new_id  bigint;
  v_row     jsonb;
  v_prev    text;
  v_changes jsonb;
  v_f       text;
  v_by      text := coalesce((select nullif(btrim(p.full_name), '') from public.profiles p where p.id = auth.uid()), '');
  v_touched bigint[] := '{}';
  v_loaded  integer := 0;
  v_same    integer := 0;
  v_already integer := 0;
  v_applied integer := 0;
  v_kept    integer := 0;
  v_reports integer := 0;
  v_rejects jsonb := '[]'::jsonb;
  v_id      bigint;
  v_latest  record;
  v_set     jsonb;
  v_cur     jsonb;
begin
  if not (coalesce(public.has_perm('ffr.manage'), false) and coalesce(public.has_perm('bulk.upload'), false)) then
    raise exception 'Loading the old FFR update log needs “Raise and complete Field Failure Reports” (ffr.manage) and “Bulk uploads” (bulk.upload) on Roles & Permissions.'
      using errcode = '42501';
  end if;
  if jsonb_typeof(p_rows) is distinct from 'array' then
    raise exception 'Send the sheet rows as a list.';
  end if;

  for r in
    select x.*
      from jsonb_to_recordset(p_rows) as x(
             "row" integer, ffr_no text, ucn text, at timestamptz,
             problem_status text, service_observation text, capa_responsibility text, capa_no text,
             capa_status text, ffr_status text, attachment_url text, additional_problem text, word_copy text)
     order by x.at nulls first, x."row"
  loop
    if btrim(coalesce(r.ffr_no, '')) = '' then
      v_rejects := v_rejects || jsonb_build_object('row', r."row", 'ffr_no', '', 'ucn', coalesce(r.ucn, ''),
                     'reason', 'No FFR number', 'register_ucn', '');
      continue;
    end if;
    if r.at is null then
      v_rejects := v_rejects || jsonb_build_object('row', r."row", 'ffr_no', r.ffr_no, 'ucn', coalesce(r.ucn, ''),
                     'reason', 'No Timestamp -- it is when the update was made, and what orders the log', 'register_ucn', '');
      continue;
    end if;

    -- The FFR number as the register writes it, spaces aside ("FFR - 001/21").
    select array_agg(f.id order by f.id), string_agg(distinct nullif(btrim(f.ucn), ''), ', ')
      into v_ids, v_regucn
      from public.field_failure_reports f
     where regexp_replace(upper(f.ffr_no), '\s', '', 'g') = regexp_replace(upper(r.ffr_no), '\s', '', 'g');
    if v_ids is null then
      v_rejects := v_rejects || jsonb_build_object('row', r."row", 'ffr_no', r.ffr_no, 'ucn', coalesce(r.ucn, ''),
                     'reason', 'This FFR number is not on the register', 'register_ucn', '');
      continue;
    end if;
    select array_agg(f.id order by f.id) into v_match
      from public.field_failure_reports f
     where f.id = any (v_ids) and upper(btrim(f.ucn)) = upper(btrim(coalesce(r.ucn, '')));
    if v_match is null then
      v_rejects := v_rejects || jsonb_build_object('row', r."row", 'ffr_no', r.ffr_no, 'ucn', coalesce(r.ucn, ''),
                     'reason', 'The register has this FFR number with a different UCN', 'register_ucn', coalesce(v_regucn, ''));
      continue;
    end if;
    if array_length(v_match, 1) > 1 then
      v_rejects := v_rejects || jsonb_build_object('row', r."row", 'ffr_no', r.ffr_no, 'ucn', coalesce(r.ucn, ''),
                     'reason', 'Several register rows carry this FFR number and UCN', 'register_ucn', coalesce(v_regucn, ''));
      continue;
    end if;

    insert into public.ffr_sheet_updates (ffr_id, ffr_no, ucn, updated_at, problem_status, service_observation,
             capa_responsibility, capa_no, capa_status, ffr_status, attachment_url, additional_problem, word_copy,
             source_row, loaded_by, loaded_by_name)
    values (v_match[1], btrim(r.ffr_no), btrim(coalesce(r.ucn, '')), r.at,
            btrim(coalesce(r.problem_status, '')), btrim(coalesce(r.service_observation, '')),
            btrim(coalesce(r.capa_responsibility, '')), btrim(coalesce(r.capa_no, '')),
            btrim(coalesce(r.capa_status, '')), btrim(coalesce(r.ffr_status, '')),
            btrim(coalesce(r.attachment_url, '')), btrim(coalesce(r.additional_problem, '')),
            btrim(coalesce(r.word_copy, '')), r."row", auth.uid(), v_by)
    on conflict (ffr_id, updated_at) do nothing
    returning id into v_new_id;

    if v_new_id is null then
      v_already := v_already + 1;
      continue;
    end if;
    v_loaded := v_loaded + 1;
    v_touched := v_touched || v_match[1];

    -- THE LOG ENTRY: each field this row filled that differs from the value
    -- the sheet held for it before this row (the latest earlier non-blank).
    select to_jsonb(s) into v_row from public.ffr_sheet_updates s where s.id = v_new_id;
    v_changes := '{}'::jsonb;
    foreach v_f in array c_fields loop
      if coalesce(v_row ->> v_f, '') = '' then continue; end if;
      execute format('select %1$I from public.ffr_sheet_updates where ffr_id = $1 and updated_at < $2 and %1$I <> '''' order by updated_at desc, id desc limit 1', v_f)
        into v_prev using v_match[1], r.at;
      if v_prev is distinct from (v_row ->> v_f) then
        v_changes := v_changes || jsonb_build_object(v_f, jsonb_build_object('from', v_prev, 'to', v_row ->> v_f));
      end if;
    end loop;

    if v_changes = '{}'::jsonb then
      v_same := v_same + 1;   -- the same as the update before it: not an event (0174's rule)
    else
      insert into public.ffr_history (ffr_id, ffr_no, changed_at, changed_by, changed_by_name, action, changes)
      select v_match[1], f.ffr_no, r.at, null, 'FFR Update sheet (import)', 'sheet', v_changes
        from public.field_failure_reports f where f.id = v_match[1];
    end if;
  end loop;

  -- APPLY THE LATEST, per field, unless the log holds a newer change to it.
  perform set_config('rithi.ffr_sheet_import', 'on', true);
  foreach v_id in array (select coalesce(array_agg(distinct t), '{}') from unnest(v_touched) t) loop
    v_set := '{}'::jsonb;
    select to_jsonb(f) into v_cur from public.field_failure_reports f where f.id = v_id;
    foreach v_f in array c_fields loop
      execute format('select %1$I as v, updated_at as at from public.ffr_sheet_updates where ffr_id = $1 and %1$I <> '''' order by updated_at desc, id desc limit 1', v_f)
        into v_latest using v_id;
      if v_latest.v is null then continue; end if;
      if exists (select 1 from public.ffr_history h
                  where h.ffr_id = v_id and h.action = 'update' and h.changed_at > v_latest.at and h.changes ? v_f) then
        v_kept := v_kept + 1;
        continue;
      end if;
      if (v_cur ->> v_f) is distinct from v_latest.v then
        v_set := v_set || jsonb_build_object(v_f, v_latest.v);
      end if;
    end loop;
    if v_set <> '{}'::jsonb then
      update public.field_failure_reports f
         set problem_status      = coalesce(v_set ->> 'problem_status', f.problem_status),
             service_observation = coalesce(v_set ->> 'service_observation', f.service_observation),
             capa_responsibility = coalesce(v_set ->> 'capa_responsibility', f.capa_responsibility),
             capa_no             = coalesce(v_set ->> 'capa_no', f.capa_no),
             capa_status         = coalesce(v_set ->> 'capa_status', f.capa_status),
             ffr_status          = coalesce(v_set ->> 'ffr_status', f.ffr_status),
             attachment_url      = coalesce(v_set ->> 'attachment_url', f.attachment_url),
             additional_problem  = coalesce(v_set ->> 'additional_problem', f.additional_problem),
             updated_at          = now()
       where f.id = v_id;
      v_applied := v_applied + (select count(*) from jsonb_object_keys(v_set));
      v_reports := v_reports + 1;
    end if;
  end loop;
  perform set_config('rithi.ffr_sheet_import', '', true);

  return jsonb_build_object('loaded', v_loaded, 'unchanged', v_same, 'already', v_already,
                            'reports', v_reports, 'fields_applied', v_applied, 'kept_newer', v_kept,
                            'rejected', v_rejects);
end $$;

comment on function public.ffr_load_sheet_updates(jsonb) is
  'Loads rows of the old "Field Failure Register - Update" sheet (0409): matched on FFR No + UCN, each a dated entry in ffr_history signed "FFR Update sheet (import)", the report taking the latest non-blank value per field unless the log holds a newer change to it. Needs ffr.manage and bulk.upload.';

revoke execute on function public.ffr_load_sheet_updates(jsonb) from public, anon;
grant execute on function public.ffr_load_sheet_updates(jsonb) to authenticated;
