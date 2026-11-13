-- ===========================================================================
-- 0482 -- REQUEST REGISTRATION v2: CALL ATTENDED? PER CALL, OR THE SAME FOR ALL
-- (the user, 2026-11-13: "Call Attended? and its associated fields should move
-- into the Call Specific Field. But the user should have the option to make it
-- as a Common Entry for all, or per Call. -- Maybe we can try a Different
-- Layout. A Table Maybe."; asked: v2 only, a table, one row per call).
--
-- Each machine in p_items may now carry its own call_attended, attended_date,
-- plan_date, call_status and pending_reason; a value it does not carry falls
-- back to the request's (p_base / p_call_status / p_pending_reason), which is
-- exactly the "same for all calls" case. Every rule of 0475-0478 is applied
-- PER CALL -- Attended Date when attended, Call Status Unsolved or Solved -
-- Report Pending, REPORT PENDING as that status's reason, a reason otherwise
-- -- and the messages name the call ("Call 2: ..."). The request row stores
-- each call's own answers; Req_VisitTable gets a row only for the calls that
-- were attended. All or nothing, as before.
-- ===========================================================================

create or replace function public.submit_call_request_v2(p_base jsonb, p_items jsonb, p_pending_reason text default '', p_call_status text default 'Unsolved')
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_reqid    text;
  v_key      text;
  it         jsonb;
  i          integer := 0;
  v_att_text text;
  v_attended boolean;
  v_date     date;
  v_plan     date;
  v_status   text;
  v_reason   text;
  v_uk       text;
  v_vkey     text;
  n          integer := 0;
  v_keys     text[] := '{}';
begin
  if not public.has_perm('mod:/request-registration-v2') then
    raise exception 'Request Registration v2 is open to administrators only.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Add at least one call.' using errcode = '23514';
  end if;

  v_reqid := public.next_call_reqid();
  v_key   := public.next_rq2_key();

  for it in select value from jsonb_array_elements(p_items) loop
    i := i + 1;
    -- THIS CALL'S ANSWERS, else the request's (the "same for all" case).
    v_att_text := coalesce(nullif(btrim(coalesce(it->>'call_attended', '')), ''), btrim(coalesce(p_base->>'call_attended', '')));
    v_attended := lower(v_att_text) = 'yes';
    v_date     := coalesce(nullif(btrim(coalesce(it->>'attended_date', '')), ''), nullif(btrim(coalesce(p_base->>'attended_date', '')), ''))::date;
    v_plan     := coalesce(nullif(btrim(coalesce(it->>'plan_date', '')), ''), nullif(btrim(coalesce(p_base->>'plan_date', '')), ''))::date;
    v_status   := coalesce(nullif(btrim(coalesce(it->>'call_status', '')), ''), nullif(btrim(coalesce(p_call_status, '')), ''), 'Unsolved');
    v_reason   := coalesce(nullif(btrim(coalesce(it->>'pending_reason', '')), ''), btrim(coalesce(p_pending_reason, '')));

    if v_attended and v_date is null then
      raise exception 'Call %: Attended Date is required when Call Attended? = Yes.', i using errcode = '23514';
    end if;
    if v_attended and v_status not in ('Unsolved', 'Solved - Report Pending') then
      raise exception 'Call %: Call Status must be Unsolved or Solved - Report Pending -- "%" is not one.', i, v_status using errcode = '23514';
    end if;
    -- SOLVED - REPORT PENDING CARRIES ITS OWN REASON (0478).
    if v_status = 'Solved - Report Pending' then v_reason := 'REPORT PENDING'; end if;
    if v_attended and v_reason = '' then
      raise exception 'Call %: Call Pending Reason is required when Call Attended? = Yes.', i using errcode = '23514';
    end if;

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
      v_att_text, case when v_attended then v_date end,
      case when v_attended then null else v_plan end,
      coalesce(p_base->>'additional_comments', ''),
      coalesce(it->>'product', ''), coalesce(it->>'serial_no', ''),
      coalesce(it->>'standard_complaint', ''), coalesce(it->>'reported_problem', ''))
    returning unique_key into v_uk;
    n := n + 1;

    if v_attended then
      v_vkey := v_key || '-' || coalesce(nullif(btrim(it->>'product'), ''), 'NA') || '-' || coalesce(nullif(btrim(it->>'serial_no'), ''), 'NA');
      insert into public.req_visit_table (visit_key, true_key, request_unique_key, product, serial_no, call_status, pending_reason, visit_date)
      values (v_vkey, v_key, v_uk, coalesce(it->>'product', ''), coalesce(it->>'serial_no', ''), v_status, v_reason, v_date);
      v_keys := v_keys || v_vkey;
    end if;
  end loop;

  return jsonb_build_object('reqid', v_reqid, 'true_key', v_key, 'count', n, 'visit_keys', to_jsonb(v_keys));
end $$;
revoke execute on function public.submit_call_request_v2(jsonb, jsonb, text, text) from public, anon;
grant execute on function public.submit_call_request_v2(jsonb, jsonb, text, text) to authenticated;
