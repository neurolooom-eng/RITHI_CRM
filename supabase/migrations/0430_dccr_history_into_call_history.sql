-- ===========================================================================
-- 0430 -- THE 2025 DCCR-HISTORY CALLS MOVE TO CALL HISTORY (the user,
-- 2026-10-13: "Move the 2025 calls to Call History too", choosing "Move them,
-- but keep the failure rates"; the rule since 0429: "Anything till 2025 is
-- Historical Data. For Calls, Never load them into the Regular Workflow").
--
-- 0395 filed each row of an old DCCR register as a call in field_calls /
-- pm_calls (hidden from the registers), its review, and one visit. From here:
--
--   1. THE IMPORT FILES THE CALL INTO call_history, as the file has it -- the
--      status (CURRENT CALL STATUS, else CALL STATUS) and solved date are the
--      file's -- keyed by UC Number + Call Number. It files NO VISIT. The
--      REVIEW is still filed, imported (no FFR), because the Recent Failure
--      Rate counts a failure through its review (0431). A UC Number that is a
--      LIVE call is still left alone, its missing review added -- as before.
--
--   2. THE CALLS ALREADY FILED MOVE: every field / PM call 0395 created
--      (extra.imported_from = 'DCCR register (historical)') is copied to
--      call_history with the file's status and solved date from its import
--      row, then deleted from the live table, so it leaves the DCCR View,
--      Product Failure Analysis and every other live list. The deletion runs
--      as the migration's owner: block_hard_delete stops a signed-in user,
--      and the copy in call_history is the record.
--
-- LEFT ALONE, on purpose: the reviews (call_reviews, still keyed by UC Number
-- -- the failure rate reads them) and the visits 0395 filed (uid IMP-...),
-- which the user is to decide about later with the other orphan visits.
-- ===========================================================================

-- ---- 1. the import from now on -----------------------------------------------
create or replace function public.dccr_history_apply()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_live    boolean;
  v_note    text[] := '{}';
  v_status  text;
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

  -- 1. THE CALL -- into Call History, never a live register (0430).
  v_live := exists (select 1 from public.field_calls where ucn = new.ucn)
         or exists (select 1 from public.installation_calls where ucn = new.ucn)
         or exists (select 1 from public.pm_calls where ucn = new.ucn);
  if v_live then
    v_note := array_append(v_note, ('call already in the register -- left as it is')::text);
  else
    v_status := coalesce(nullif(btrim(new.current_call_status), ''), btrim(new.call_status));
    insert into public.call_history (ucn, call_no, call_at, call_type, party_name, city, engineer,
           item_name, serial, standard_complaint, complaint_reported, item_status, call_status, solved_at, extra)
    values (new.ucn, new.call_number,
            (new.call_date::timestamp at time zone 'Asia/Kolkata'),
            btrim(new.call_type), new.party_name, new.place, new.engineer, new.product_name, new.serial,
            new.standard_complaint, new.complaint_reported, new.item_status, v_status, new.call_solved_at,
            new.extra || jsonb_strip_nulls(jsonb_build_object(
              'imported_from', 'DCCR register (historical)',
              'complaint_date', new.complaint_date,
              'call_status_at_review', nullif(btrim(new.call_status), ''),
              'pending_reason', nullif(btrim(new.pending_reason), ''),
              'warranty_number', nullif(btrim(new.warranty_number), ''),
              'warranty_start_in_file', nullif(btrim(new.warranty_start_text), ''),
              'public_health_threat', nullif(btrim(new.public_health_threat), ''),
              'death', nullif(btrim(new.death), ''),
              'serious_incident', nullif(btrim(new.serious_incident), ''))))
    on conflict (ucn, call_no) do update set
      call_at = excluded.call_at, call_type = excluded.call_type, party_name = excluded.party_name,
      city = excluded.city, engineer = excluded.engineer, item_name = excluded.item_name,
      serial = excluded.serial, standard_complaint = excluded.standard_complaint,
      complaint_reported = excluded.complaint_reported, item_status = excluded.item_status,
      call_status = excluded.call_status, solved_at = excluded.solved_at, extra = excluded.extra;
    v_note := array_append(v_note, ('kept in Call History' || coalesce(': ' || nullif(v_status, ''), ''))::text);
  end if;

  -- 2. THE REVIEW (imported: reviewers and dates as the file has them, no FFR).
  -- A live call keeps its own review if it has one: only a missing one is added.
  if v_live then
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

  -- 3. NO VISIT (0430): the status is the file's, kept on the call history row.
  new.result := array_to_string(v_note, '; ');
  return new;
end $$;
revoke execute on function public.dccr_history_apply() from public, anon, authenticated;

comment on table public.dccr_history_import is
  'The old DCCR register as loaded (0395), one row per UC Number. Since 0430 a row keeps its call in Call History (call_history) with the file''s status, and its review; no visit, nothing in a live register. `result` says what was kept. A UC Number that is a live call is never overwritten.';

-- ---- 2. the calls 0395 already filed -----------------------------------------
do $$
declare v_f integer; v_p integer; v_h integer;
begin
  if to_regclass('public.call_history') is null then return; end if;

  insert into public.call_history (ucn, call_no, call_at, call_type, party_name, state, city, engineer,
         item_name, serial, standard_complaint, complaint_reported, item_status, call_status, solved_at, extra)
  select c.ucn, coalesce(c.call_number, ''),
         coalesce(c.reg_at, (c.reg_date::timestamp at time zone 'Asia/Kolkata')),
         coalesce(nullif(c.extra->>'call_type_in_file', ''), c.call_type, ''),
         coalesce(c.party_name, ''), coalesce(c.state, ''), coalesce(c.city, ''), coalesce(c.allocated_to, ''),
         coalesce(c.product_name, ''), coalesce(c.serial, ''), coalesce(c.standard_complaint, ''),
         coalesce(c.complaint_reported, ''), coalesce(c.item_status, ''),
         coalesce(nullif(btrim(d.current_call_status), ''), nullif(btrim(d.call_status), ''),
                  case when c.cancelled_at is not null then 'Canceled' end, c.last_status, ''),
         d.call_solved_at,
         coalesce(c.extra, '{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object(
           'complaint_date', c.complaint_date, 'warranty_number', nullif(btrim(coalesce(c.warranty_number, '')), ''),
           'public_health_threat', nullif(btrim(coalesce(c.public_health_threat, '')), ''),
           'death', nullif(btrim(coalesce(c.death, '')), ''),
           'serious_incident', nullif(btrim(coalesce(c.serious_incident, '')), ''),
           'moved_from', c.tbl, 'moved_by', '0430'))
    from (select 'field_calls' as tbl, f.ucn, f.call_number, f.reg_at, f.reg_date, f.call_type, f.party_name, f.state, f.city,
                 f.allocated_to, f.product_name, f.serial, f.standard_complaint, f.complaint_reported, f.item_status,
                 f.last_status, f.cancelled_at, f.complaint_date, f.warranty_number, f.public_health_threat, f.death,
                 f.serious_incident, f.extra
            from public.field_calls f where f.extra->>'imported_from' = 'DCCR register (historical)'
          union all
          select 'pm_calls', p.ucn, p.call_number, p.reg_at, p.reg_date, p.call_type, p.party_name, p.state, p.city,
                 p.allocated_to, p.product_name, p.serial, p.standard_complaint, p.complaint_reported, p.item_status,
                 p.last_status, p.cancelled_at, p.complaint_date, p.warranty_number, p.public_health_threat, p.death,
                 p.serious_incident, p.extra
            from public.pm_calls p where p.extra->>'imported_from' = 'DCCR register (historical)') c
    left join public.dccr_history_import d on d.ucn = c.ucn
  on conflict (ucn, call_no) do nothing;
  get diagnostics v_h = row_count;

  delete from public.field_calls where extra->>'imported_from' = 'DCCR register (historical)'
     and exists (select 1 from public.call_history h where h.ucn = field_calls.ucn
                  and h.call_no = coalesce(field_calls.call_number, ''));
  get diagnostics v_f = row_count;
  delete from public.pm_calls where extra->>'imported_from' = 'DCCR register (historical)'
     and exists (select 1 from public.call_history h where h.ucn = pm_calls.ucn
                  and h.call_no = coalesce(pm_calls.call_number, ''));
  get diagnostics v_p = row_count;

  -- The import rows say where their call now is. The trigger is held off for
  -- this one write: it would re-file every row and overwrite the move's note.
  alter table public.dccr_history_import disable trigger dccr_history_apply;
  update public.dccr_history_import d set result = 'kept in Call History (moved, 0430); review filed'
   where exists (select 1 from public.call_history h where h.ucn = d.ucn and h.extra->>'moved_by' = '0430');
  alter table public.dccr_history_import enable trigger dccr_history_apply;

  raise notice '0430: % calls copied to Call History; % field and % PM calls removed from the live tables', v_h, v_f, v_p;
end $$;
