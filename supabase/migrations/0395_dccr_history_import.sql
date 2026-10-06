-- ===========================================================================
-- 0395  THE OLD DCCR REGISTER, WITH ITS CALLS (2026-10-06).
--
-- The user: "I need provision to Upload old DCCR and Calls - Historical data"
-- -- "I tried uploading 2025 DCCR Register, but it not showing up in DCCR
-- View". Measured on the live project (_how_much_dccr_history.sql): 6,051 DCCR
-- rows of 2025 were loaded and every one is on NO call -- the database holds no
-- Field call before 2026 -- and the DCCR View lists Field calls with their
-- review, so a review of a call the register does not hold cannot be shown.
--
-- The user's answers: the calls come FROM THE DCCR FILE ITSELF; each call's
-- status FROM THE FILE (one visit); NO NOTIFICATIONS.
--
-- SO: a staging register, `dccr_history_import`, one row per UC Number, loaded
-- by Bulk Uploads -> Quality -> "DCCR Register -- historical, with its calls".
-- A BEFORE trigger files, for each row:
--
--   1. THE CALL -- into field_calls (FIELD, and "INSTALLATION CALL & FIELD",
--      kept as the file says in extra) or pm_calls (P M VISIT), dated by the
--      file's CALL DATE, with the party, place, product, serial, cover (EQUIP.
--      STATUS), complaint, engineer, warranty number and Review 1 answers. A
--      call ALREADY IN THE REGISTER is never overwritten -- only a call this
--      load created (extra.imported_from) is corrected on a re-load. A
--      Canceled call is filed cancelled, on its solved date or else its call
--      date. CORRECTING a call this way is still an EDIT, and the call
--      guards ask the uploader for the edit rights as they would on screen.
--      The file's month-only Warranty Start ("Nov-2015") is kept as text
--      in extra rather than turned into a date nobody recorded.
--   2. THE REVIEW -- call_reviews, marked imported (0269: the file's reviewers
--      and dates are kept and no Field Failure Report is raised).
--   3. ONE VISIT -- the file's CURRENT CALL STATUS (else CALL STATUS) with its
--      (none for Unattended: a call is Unattended because it has no visit;
--      pending reason, engineer and Call Solved Date & Time, uid
--      IMP-<ucn>[-<yyyymmddhhmmss>] (REPORT_COLS' own convention). Its entry
--      time is the solved date, else the file's Updated Date, else the call
--      date -- never the moment of the load, which would let the load decide
--      the call's status (0032). No status in the file, no visit.
--
-- Notifications are switched off for the row (0394). What happened is written
-- back on the staging row (`result`), so the register says, per UC Number,
-- what was filed and what was left alone. Written as the definer: the review
-- guards that ask the caller for bulk.upload are met by the table's own
-- policy, which asks the same.
-- ===========================================================================

create table if not exists public.dccr_history_import (
  ucn                   text primary key,
  call_date             date,
  complaint_date        date,
  call_number           text not null default '',
  party_name            text not null default '',
  place                 text not null default '',
  product_name          text not null default '',
  serial                text not null default '',
  call_type             text not null default '',
  standard_complaint    text not null default '',
  complaint_reported    text not null default '',
  item_status           text not null default '',
  engineer              text not null default '',
  call_status           text not null default '',
  pending_reason        text not null default '',
  current_call_status   text not null default '',
  call_solved_at        timestamptz,
  warranty_number       text not null default '',
  warranty_start_text   text not null default '',
  public_health_threat  text not null default '',
  death                 text not null default '',
  serious_incident      text not null default '',
  risk_to_patient       text not null default '',
  warranty_failure      text not null default '',
  frequent_failure      text not null default '',
  review2_at            date,
  service_observation   text not null default '',
  complaint_grouping    text not null default '',
  root_cause_keyword    text not null default '',
  spare_category        text not null default '',
  review3_at            date,
  imported_updated_by   text not null default '',
  imported_updated_date date,
  extra                 jsonb not null default '{}'::jsonb,
  result                text not null default '',
  loaded_at             timestamptz not null default now(),
  loaded_by             uuid
);

comment on table public.dccr_history_import is
  'The old DCCR register as loaded (0395), one row per UC Number. Loading a row files its call, its review and one visit from the file; `result` says what was filed. Calls already in the register are never overwritten.';

create or replace function public.dccr_history_apply()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_table   text;
  v_type    text;
  v_status  text;
  v_exists  boolean;
  v_ours    boolean;
  v_uid     text;
  v_note    text[] := '{}';
  v_extra   jsonb;
  v_cancel  timestamptz;
begin
  new.ucn := btrim(new.ucn);
  -- A cell the file left empty can arrive as NULL; every text field reads it as blank.
  new.call_number := coalesce(new.call_number, '');
  new.party_name := coalesce(new.party_name, '');
  new.place := coalesce(new.place, '');
  new.product_name := coalesce(new.product_name, '');
  new.serial := coalesce(new.serial, '');
  new.call_type := coalesce(new.call_type, '');
  new.standard_complaint := coalesce(new.standard_complaint, '');
  new.complaint_reported := coalesce(new.complaint_reported, '');
  new.item_status := coalesce(new.item_status, '');
  new.engineer := coalesce(new.engineer, '');
  new.call_status := coalesce(new.call_status, '');
  new.pending_reason := coalesce(new.pending_reason, '');
  new.current_call_status := coalesce(new.current_call_status, '');
  new.warranty_number := coalesce(new.warranty_number, '');
  new.warranty_start_text := coalesce(new.warranty_start_text, '');
  new.public_health_threat := coalesce(new.public_health_threat, '');
  new.death := coalesce(new.death, '');
  new.serious_incident := coalesce(new.serious_incident, '');
  new.risk_to_patient := coalesce(new.risk_to_patient, '');
  new.warranty_failure := coalesce(new.warranty_failure, '');
  new.frequent_failure := coalesce(new.frequent_failure, '');
  new.service_observation := coalesce(new.service_observation, '');
  new.complaint_grouping := coalesce(new.complaint_grouping, '');
  new.root_cause_keyword := coalesce(new.root_cause_keyword, '');
  new.spare_category := coalesce(new.spare_category, '');
  new.imported_updated_by := coalesce(new.imported_updated_by, '');
  new.extra := coalesce(new.extra, '{}'::jsonb);

  if new.ucn = '' then raise exception 'UC Number is required.'; end if;
  new.loaded_at := now();
  new.loaded_by := auth.uid();
  perform set_config('rithi.silent_import', 'on', true);

  v_type  := upper(btrim(new.call_type));
  v_table := case when v_type like 'P%M%VISIT%' then 'pm_calls' else 'field_calls' end;
  v_extra := coalesce(new.extra, '{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object(
               'imported_from', 'DCCR register (historical)',
               'call_type_in_file', nullif(btrim(new.call_type), ''),
               'warranty_start_in_file', nullif(btrim(new.warranty_start_text), ''),
               'call_status_at_review', nullif(btrim(new.call_status), '')));

  -- 1. THE CALL
  v_exists := exists (select 1 from public.field_calls where ucn = new.ucn)
           or exists (select 1 from public.installation_calls where ucn = new.ucn)
           or exists (select 1 from public.pm_calls where ucn = new.ucn);
  v_ours := exists (select 1 from public.field_calls where ucn = new.ucn and extra->>'imported_from' = 'DCCR register (historical)')
         or exists (select 1 from public.pm_calls where ucn = new.ucn and extra->>'imported_from' = 'DCCR register (historical)');
  v_cancel := case when upper(btrim(new.current_call_status)) like 'CANCEL%'
                   then coalesce(new.call_solved_at, new.call_date::timestamptz) end;

  if v_exists and not v_ours then
    v_note := array_append(v_note, ('call already in the register -- left as it is')::text);
  else
    if v_ours then
      execute format($u$
        update public.%I set
          call_number = $2, reg_date = $3, reg_at = $3::timestamptz, complaint_date = $4,
          party_name = $5, city = $6, product_name = $7, serial = $8, item_status = $9,
          standard_complaint = $10, complaint_reported = $11, allocated_to = $12,
          warranty_number = $13, public_health_threat = $14, death = $15, serious_incident = $16,
          extra = $17, cancelled_at = $18
         where ucn = $1$u$, v_table)
      using new.ucn, nullif(new.call_number, ''), new.call_date, new.complaint_date,
            new.party_name, new.place, new.product_name, new.serial, new.item_status,
            new.standard_complaint, new.complaint_reported, new.engineer,
            new.warranty_number, new.public_health_threat, new.death, new.serious_incident,
            v_extra, v_cancel;
      v_note := array_append(v_note, ('call corrected')::text);
    else
      execute format($i$
        insert into public.%I (ucn, call_number, call_type, reg_date, reg_at, complaint_date,
          party_name, city, product_name, serial, item_status, standard_complaint,
          complaint_reported, allocated_to, warranty_number, public_health_threat, death,
          serious_incident, extra, cancelled_at)
        values ($1, $2, $3, $4, $4::timestamptz, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
                $15, $16, $17, $18, $19)$i$, v_table)
      using new.ucn, nullif(new.call_number, ''),
            case when v_table = 'pm_calls' then 'P M VISIT' else 'FIELD' end,
            new.call_date, new.complaint_date, new.party_name, new.place, new.product_name,
            new.serial, new.item_status, new.standard_complaint, new.complaint_reported,
            new.engineer, new.warranty_number, new.public_health_threat, new.death,
            new.serious_incident, v_extra, v_cancel;
      v_note := array_append(v_note, (case when v_table = 'pm_calls' then 'PM call filed' else 'Field call filed' end)::text);
    end if;
    if v_cancel is not null then v_note := array_append(v_note, 'cancelled'::text); end if;
  end if;

  -- 2. THE REVIEW (imported: reviewers and dates as the file has them, no FFR).
  -- A call already in the register keeps its own review if it has one: the
  -- live review is the newer word, so the file's is only added where none is.
  if v_exists and not v_ours then
    insert into public.call_reviews (ucn, call_number, imported, imported_updated_by, imported_updated_date,
           risk_to_patient, warranty_failure, frequent_failure, review2_at,
           complaint_grouping, root_cause_keyword, spare_category, service_observation, review3_at)
    values (new.ucn, new.call_number, true, new.imported_updated_by, new.imported_updated_date,
            new.risk_to_patient, new.warranty_failure, new.frequent_failure, new.review2_at,
            new.complaint_grouping, new.root_cause_keyword, new.spare_category, new.service_observation, new.review3_at)
    on conflict (ucn) do nothing;
  else
  insert into public.call_reviews (ucn, call_number, imported, imported_updated_by, imported_updated_date,
         risk_to_patient, warranty_failure, frequent_failure, review2_at,
         complaint_grouping, root_cause_keyword, spare_category, service_observation, review3_at)
  values (new.ucn, new.call_number, true, new.imported_updated_by, new.imported_updated_date,
          new.risk_to_patient, new.warranty_failure, new.frequent_failure, new.review2_at,
          new.complaint_grouping, new.root_cause_keyword, new.spare_category, new.service_observation, new.review3_at)
  on conflict (ucn) do update set
    call_number = excluded.call_number, imported = true,
    imported_updated_by = excluded.imported_updated_by, imported_updated_date = excluded.imported_updated_date,
    risk_to_patient = excluded.risk_to_patient, warranty_failure = excluded.warranty_failure,
    frequent_failure = excluded.frequent_failure, review2_at = excluded.review2_at,
    complaint_grouping = excluded.complaint_grouping, root_cause_keyword = excluded.root_cause_keyword,
    spare_category = excluded.spare_category, service_observation = excluded.service_observation,
    review3_at = excluded.review3_at;
  end if;
  v_note := array_append(v_note, ('review filed')::text);

  -- 3. ONE VISIT, from the file's status -- only for a call this load files.
  v_status := coalesce(nullif(btrim(new.current_call_status), ''), nullif(btrim(new.call_status), ''));
  -- UNATTENDED IS THE ABSENCE OF A VISIT, so it files none (a visit reading
  -- "Unattended" would make the call read Report pending).
  if v_status is not null and upper(v_status) like 'UNATTENDED%' then v_status := null; end if;
  if v_status is not null and v_cancel is null and (not v_exists or v_ours) then
    v_uid := 'IMP-' || new.ucn || coalesce('-' || to_char(new.call_solved_at at time zone 'UTC', 'YYYYMMDDHH24MISS'), '');
    insert into public.reports (uid, ucn, call_number, call_status, pending_reason, engineer, visit_at, updated_at, data)
    values (v_uid, new.ucn, new.call_number, v_status, new.pending_reason, new.engineer, new.call_solved_at,
            coalesce(new.call_solved_at, new.imported_updated_date::timestamptz, new.call_date::timestamptz, now()),
            jsonb_build_object('imported_from', 'DCCR register (historical)'))
    on conflict (uid) do update set
      call_status = excluded.call_status, pending_reason = excluded.pending_reason,
      engineer = excluded.engineer, visit_at = excluded.visit_at, updated_at = excluded.updated_at;
    v_note := array_append(v_note, (('visit: ' || v_status))::text);
  end if;

  new.result := array_to_string(v_note, '; ');
  perform set_config('rithi.silent_import', '', true);
  return new;
end $$;
revoke execute on function public.dccr_history_apply() from public, anon, authenticated;

drop trigger if exists dccr_history_apply on public.dccr_history_import;
create trigger dccr_history_apply before insert or update on public.dccr_history_import
  for each row execute function public.dccr_history_apply();

alter table public.dccr_history_import enable row level security;
drop policy if exists dhi_read on public.dccr_history_import;
create policy dhi_read on public.dccr_history_import for select using ((select public.has_perm('bulk.upload')));
drop policy if exists dhi_insert on public.dccr_history_import;
create policy dhi_insert on public.dccr_history_import for insert with check ((select public.has_perm('bulk.upload')));
drop policy if exists dhi_update on public.dccr_history_import;
create policy dhi_update on public.dccr_history_import for update
  using ((select public.has_perm('bulk.upload'))) with check ((select public.has_perm('bulk.upload')));
revoke all on public.dccr_history_import from anon;
revoke delete, truncate on public.dccr_history_import from authenticated;
grant select, insert, update on public.dccr_history_import to authenticated;

do $$
begin
  if to_regprocedure('public.sys_columns_attach(regclass)') is not null then
    perform public.sys_columns_attach('public.dccr_history_import'::regclass);
  end if;
end $$;
