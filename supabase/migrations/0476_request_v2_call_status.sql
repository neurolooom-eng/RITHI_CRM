-- ===========================================================================
-- 0476 -- REQUEST REGISTRATION v2 SHOWS CALL STATUS: UNSOLVED OR SOLVED - REPORT
-- PENDING (the user, 2026-11-13: "Show Call Status, But Limit the Options to
-- Unsolved and Solved Report Pending").
--
-- 0475 fixed the status at Unsolved and did not ask. Now the form asks it when
-- the call was attended, offering the Visit Report's own two spellings,
-- "Unsolved" and "Solved - Report Pending", Unsolved by default. The database
-- refuses anything else, in the one save and on the table itself; a blank is
-- Unsolved. The filed visit carries it, so a call registered from such a
-- request reads Report pending.
--
-- submit_call_request_v2() gains p_call_status. The three-argument version is
-- DROPPED first: left beside the new one, it would go on answering Unsolved for
-- whatever still called it, correctly-looking (the spare_line_stage lesson).
-- Both bodies are 0475's, read out of a database built from every migration,
-- with only the status lines added.
-- ===========================================================================

drop function if exists public.submit_call_request_v2(jsonb, jsonb, text);

create or replace function public.submit_call_request_v2(p_base jsonb, p_items jsonb, p_pending_reason text default '', p_call_status text default 'Unsolved')
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_reqid    text;
  v_key      text;
  v_attended boolean := lower(btrim(coalesce(p_base->>'call_attended', ''))) = 'yes';
  v_date     date := nullif(btrim(coalesce(p_base->>'attended_date', '')), '')::date;
  v_reason   text := btrim(coalesce(p_pending_reason, ''));
  v_status   text := coalesce(nullif(btrim(coalesce(p_call_status, '')), ''), 'Unsolved');
  it         jsonb;
  v_uk       text;
  n          integer := 0;
  v_keys     text[] := '{}';
begin
  if not public.has_perm('mod:/request-registration-v2') then
    raise exception 'Request Registration v2 is open to administrators only.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Add at least one call.' using errcode = '23514';
  end if;
  if v_attended and v_date is null then
    raise exception 'Attended Date is required when Call Attended? = Yes.' using errcode = '23514';
  end if;
  if v_attended and v_status not in ('Unsolved', 'Solved - Report Pending') then
    raise exception 'Call Status must be Unsolved or Solved - Report Pending -- "%" is not one.', v_status using errcode = '23514';
  end if;
  if v_attended and v_reason = '' then
    raise exception 'Call Pending Reason is required when Call Attended? = Yes.' using errcode = '23514';
  end if;

  v_reqid := public.next_call_reqid();
  v_key   := public.next_rq2_key();

  for it in select value from jsonb_array_elements(p_items) loop
    insert into public.call_requests (
      reqid, true_key, email, engineer, call_type, party_name, state, city, address,
      customer_contact_details, customer_contact_number, installation_report, kyc,
      call_attended, attended_date, plan_date, additional_comments,
      product, serial_no, standard_complaint, reported_problem)
    values (
      v_reqid, v_key,
      coalesce(p_base->>'email', ''), coalesce(p_base->>'engineer', ''), coalesce(p_base->>'call_type', ''),
      coalesce(nullif(it->>'party_name', ''), p_base->>'party_name', ''),
      coalesce(nullif(it->>'state', ''), p_base->>'state', ''),
      coalesce(nullif(it->>'city', ''), p_base->>'city', ''),
      coalesce(nullif(it->>'address', ''), p_base->>'address', ''),
      coalesce(nullif(it->>'customer_contact_details', ''), p_base->>'customer_contact_details', ''),
      coalesce(nullif(it->>'customer_contact_number', ''), p_base->>'customer_contact_number', ''),
      coalesce(p_base->>'installation_report', ''), coalesce(p_base->>'kyc', ''),
      coalesce(p_base->>'call_attended', ''), v_date,
      nullif(btrim(coalesce(p_base->>'plan_date', '')), '')::date,
      coalesce(p_base->>'additional_comments', ''),
      coalesce(it->>'product', ''), coalesce(it->>'serial_no', ''),
      coalesce(it->>'standard_complaint', ''), coalesce(it->>'reported_problem', ''))
    returning unique_key into v_uk;
    n := n + 1;

    if v_attended then
      insert into public.req_visit_table (visit_key, true_key, request_unique_key, product, serial_no, call_status, pending_reason, visit_date)
      values (v_key || '-' || coalesce(nullif(btrim(it->>'product'), ''), 'NA') || '-' || coalesce(nullif(btrim(it->>'serial_no'), ''), 'NA'),
              v_key, v_uk, coalesce(it->>'product', ''), coalesce(it->>'serial_no', ''), v_status, v_reason, v_date);
      v_keys := v_keys || (v_key || '-' || coalesce(nullif(btrim(it->>'product'), ''), 'NA') || '-' || coalesce(nullif(btrim(it->>'serial_no'), ''), 'NA'));
    end if;
  end loop;

  return jsonb_build_object('reqid', v_reqid, 'true_key', v_key, 'count', n, 'visit_keys', to_jsonb(v_keys));
end $function$;

revoke execute on function public.submit_call_request_v2(jsonb, jsonb, text, text) from public, anon;
grant execute on function public.submit_call_request_v2(jsonb, jsonb, text, text) to authenticated;

create or replace function public.req_visit_table_bi()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  -- SHOWN SINCE 0476, two choices only; blank is Unsolved, anything else refused.
  new.call_status    := coalesce(nullif(btrim(coalesce(new.call_status, '')), ''), 'Unsolved');
  if new.call_status not in ('Unsolved', 'Solved - Report Pending') then
    raise exception 'Call Status must be Unsolved or Solved - Report Pending -- "%" is not one.', new.call_status
      using errcode = '23514';
  end if;
  new.engineer       := coalesce((select nullif(btrim(full_name), '') from public.profiles where id = auth.uid()), auth.email(), '');
  new.engineer_email := coalesce(auth.email(), '');
  new.visit_entry_at := now();
  new.created_at     := now();
  new.created_by     := auth.uid();
  new.ucn := ''; new.report_uid := ''; new.filed_at := null;
  if not exists (select 1 from public.masters m
                  where m.name = 'pendingreason' and m.active and btrim(m.value) = btrim(new.pending_reason)) then
    raise exception 'Choose the Call Pending Reason from the list -- "%" is not on it.', new.pending_reason
      using errcode = '23514';
  end if;
  return new;
end $function$;
