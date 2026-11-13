-- ===========================================================================
-- 0478 -- REQUEST REGISTRATION v2: SOLVED - REPORT PENDING SETS THE CALL
-- PENDING REASON TO "REPORT PENDING", LOCKED (the user, 2026-11-13: "Solved -
-- Report Pending should set the Call Pending Reason to REPORT PENDING and Lock
-- it.").
--
-- When the Call Status is Solved - Report Pending the reason is REPORT PENDING
-- -- written by the database, whatever the client sends, in the one save and
-- on req_visit_table itself, and NOT checked against the Call Pending Reason
-- master: it is the status's own reason, so it stands whether or not the
-- master lists it. Unsolved still takes a reason from the master, mandatory.
-- The filed visit carries it. The form shows it filled in and not editable.
--
-- Both bodies are 0476's, read out of a database built from every migration,
-- with only those lines added.
-- ===========================================================================

create or replace function public.submit_call_request_v2(p_base jsonb, p_items jsonb, p_pending_reason text DEFAULT ''::text, p_call_status text DEFAULT 'Unsolved'::text)
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
  -- SOLVED - REPORT PENDING CARRIES ITS OWN REASON (0478): REPORT PENDING,
  -- whatever was sent.
  if v_status = 'Solved - Report Pending' then v_reason := 'REPORT PENDING'; end if;
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
  -- SOLVED - REPORT PENDING (0478): the reason is REPORT PENDING and nothing
  -- else, set here whatever was sent, and not looked up on the master -- it is
  -- the status's own reason, not a choice from the list.
  if new.call_status = 'Solved - Report Pending' then
    new.pending_reason := 'REPORT PENDING';
  else
    if not exists (select 1 from public.masters m
                    where m.name = 'pendingreason' and m.active and btrim(m.value) = btrim(new.pending_reason)) then
      raise exception 'Choose the Call Pending Reason from the list -- "%" is not on it.', new.pending_reason
        using errcode = '23514';
    end if;
  end if;
  return new;
end $function$;
