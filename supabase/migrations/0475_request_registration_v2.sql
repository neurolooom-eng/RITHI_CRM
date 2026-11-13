-- ===========================================================================
-- 0475 -- REQUEST REGISTRATION v2 AND Req_VisitTable (the user, 2026-11-13).
--
--   "Add a Request Registration - v2 - Add this only for Admin. Mimic the
--   Request Registration then Make the Following Changes - When the Attended
--   is Marked as Yes - Ask the Engineer for Call Pending Reason. And Then Store
--   this Detail in a New Table - Name this Table as Req_VisitTable"; then:
--   "I need a Key which does not have REQID, and that remains the True for
--   this Request Registration v2. Use this True Key, then append the Product +
--   Serial No [-Product-Serial] ... And Make this as the Key in the new
--   Req_VisitTable table. Call Status = Default it to unsolved; Call Pending
--   Reason = Same Dropdown used in Visit Report - Mandatory; Visiting Service
--   Engineer = Default it to the user Requesting the Call; Engineer Email =
--   The Mail ID user is Logged in as; Visit Date & Time = Use the Attended
--   Date; Visit Entry Date = TimeStamp".
--   Asked, they chose:
--     * the TRUE KEY is RQ2-yymm-nnnn, India's month, numbered from 0001 each
--       month, issued by the database once per request;
--     * a v2 request goes the SAME WAY as a v1 request (call_requests, Pending
--       Registrations, registered as a call); REQID is still issued underneath
--       for that flow, but the True Key is the v2 key;
--     * Call Status (Unsolved) and the engineer (the requester) are FIXED, not
--       asked; only Call Pending Reason is asked, and only when attended;
--     * NOT attended -> no Req_VisitTable row;
--     * when the request BECOMES A CALL, its Req_VisitTable row is also filed
--       as that call's visit (public.reports), so the call reads Unsolved with
--       the pending reason and its first attended date;
--     * the table is `req_visit_table` in the database, "Req_VisitTable" on
--       screen.
--
-- FILED ON REGISTRATION ONLY, NOT ON MAPPING. A request MAPPED to an existing
-- call can be un-mapped back to Pending (the user, 2026-10-05) because it was
-- the wrong call -- and a visit is never deleted (0049), so a visit filed at
-- mapping would stay on the wrong call. Left for the user to decide.
--
-- ONE SAVE, ALL OR NOTHING: submit_call_request_v2() writes the request rows
-- and their Req_VisitTable rows in one transaction, as the signed-in user
-- (SECURITY INVOKER), so the request's own policies and guards apply exactly
-- as they do to a v1 request. It asks the v2 screen's own key first.
-- ===========================================================================

-- ---- the True Key on the request ----------------------------------------
alter table public.call_requests add column if not exists true_key text;
create index if not exists call_requests_true_key_idx on public.call_requests (true_key) where true_key is not null;
comment on column public.call_requests.true_key is
  'Request Registration v2''s own key, RQ2-yymm-nnnn (0475): one per request, issued by the database. Blank on a v1 request.';

-- The next RQ2 key for this month (India's). Worked out from the keys already
-- issued, under a transaction lock, so two requests saved at the same moment
-- cannot take one number -- no counter table, because a new counter table must
-- also be kept out of the system columns (0244) in three places.
create or replace function public.next_rq2_key()
returns text language plpgsql volatile security definer set search_path = public as $$
declare
  v_ym text := to_char(now() at time zone 'Asia/Kolkata', 'YYMM');
  v_n  integer;
begin
  -- Only for whoever may save a v2 request, so the number cannot be burnt
  -- from outside (the lesson of next_ffr_no, re-scan F-12).
  if not public.has_perm('mod:/request-registration-v2') then
    raise exception 'Request Registration v2 is open to administrators only.' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtext('rq2_true_key'));
  select coalesce(max(substring(true_key from '^RQ2-' || v_ym || '-([0-9]+)$')::integer), 0) + 1
    into v_n
    from public.call_requests
   where true_key like 'RQ2-' || v_ym || '-%';
  return 'RQ2-' || v_ym || '-' || lpad(v_n::text, 4, '0');
end $$;
revoke execute on function public.next_rq2_key() from public, anon;
grant execute on function public.next_rq2_key() to authenticated;

-- ---- Req_VisitTable -------------------------------------------------------
create table if not exists public.req_visit_table (
  visit_key          text primary key,                 -- <True Key>-<Product>-<Serial>
  true_key           text not null,
  request_unique_key text not null,                    -- the call_requests row (its unique_key)
  product            text not null default '',
  serial_no          text not null default '',
  call_status        text not null default 'Unsolved',
  pending_reason     text not null,
  engineer           text not null default '',         -- Visiting Service Engineer
  engineer_email     text not null default '',
  visit_date         date not null,                    -- the Attended Date
  visit_entry_at     timestamptz not null default now(),
  -- When the request becomes a call: the call, and the visit filed on it.
  ucn                text not null default '',
  report_uid         text not null default '',
  filed_at           timestamptz,
  created_by         uuid,
  created_at         timestamptz not null default now(),
  constraint req_visit_table_reason check (btrim(pending_reason) <> '')
);
comment on table public.req_visit_table is
  'Req_VisitTable (0475): the visit a Request Registration v2 request records when Call Attended? = Yes, keyed <True Key>-<Product>-<Serial>; filed as the call''s visit when the request is registered.';
create index if not exists req_visit_table_request_idx on public.req_visit_table (request_unique_key);

-- What the database decides, whatever the client sends: status Unsolved, the
-- engineer and email of the signed-in user, the entry time, and a pending
-- reason that is on the Call Pending Reason master.
create or replace function public.req_visit_table_bi()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.call_status    := 'Unsolved';
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
end $$;
revoke execute on function public.req_visit_table_bi() from public, anon, authenticated;
drop trigger if exists req_visit_table_bi on public.req_visit_table;
create trigger req_visit_table_bi before insert on public.req_visit_table
  for each row execute function public.req_visit_table_bi();

alter table public.req_visit_table enable row level security;
-- READ: whoever may see the request it belongs to (cr_read decides, through
-- the sub-select, which runs as the reader).
drop policy if exists rvt_read on public.req_visit_table;
create policy rvt_read on public.req_visit_table for select to authenticated
  using (exists (select 1 from public.call_requests r where r.unique_key = req_visit_table.request_unique_key));
-- WRITE: the v2 screen's key. No update or delete privilege: the row is a
-- record; the database itself fills the call in when the request is registered.
drop policy if exists rvt_insert on public.req_visit_table;
create policy rvt_insert on public.req_visit_table for insert to authenticated
  with check ((select public.has_perm('mod:/request-registration-v2')));
revoke all on public.req_visit_table from anon, authenticated;
grant select, insert on public.req_visit_table to authenticated;

do $$
begin
  if to_regprocedure('public.sys_columns_attach(regclass)') is not null then
    perform public.sys_columns_attach('public.req_visit_table'::regclass);
  end if;
end $$;

-- ---- the one save -----------------------------------------------------------
-- p_base: the request's shared fields (as the v1 form sends them); p_items: one
-- object per machine (product, serial_no, standard_complaint, reported_problem
-- and, where the machine names them, party_name / city / state / address /
-- customer_contact_details / customer_contact_number).
create or replace function public.submit_call_request_v2(p_base jsonb, p_items jsonb, p_pending_reason text default '')
returns jsonb language plpgsql security invoker set search_path = public as $$
declare
  v_reqid    text;
  v_key      text;
  v_attended boolean := lower(btrim(coalesce(p_base->>'call_attended', ''))) = 'yes';
  v_date     date := nullif(btrim(coalesce(p_base->>'attended_date', '')), '')::date;
  v_reason   text := btrim(coalesce(p_pending_reason, ''));
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
      insert into public.req_visit_table (visit_key, true_key, request_unique_key, product, serial_no, pending_reason, visit_date)
      values (v_key || '-' || coalesce(nullif(btrim(it->>'product'), ''), 'NA') || '-' || coalesce(nullif(btrim(it->>'serial_no'), ''), 'NA'),
              v_key, v_uk, coalesce(it->>'product', ''), coalesce(it->>'serial_no', ''), v_reason, v_date);
      v_keys := v_keys || (v_key || '-' || coalesce(nullif(btrim(it->>'product'), ''), 'NA') || '-' || coalesce(nullif(btrim(it->>'serial_no'), ''), 'NA'));
    end if;
  end loop;

  return jsonb_build_object('reqid', v_reqid, 'true_key', v_key, 'count', n, 'visit_keys', to_jsonb(v_keys));
end $$;
revoke execute on function public.submit_call_request_v2(jsonb, jsonb, text) from public, anon;
grant execute on function public.submit_call_request_v2(jsonb, jsonb, text) to authenticated;

-- ---- filed as the call's visit when the request is registered ---------------
create or replace function public.req_visit_file_on_register()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v record;
  v_call_no text;
begin
  if coalesce(new.true_key, '') = '' then return null; end if;
  if lower(btrim(coalesce(new.status, ''))) <> 'registered' or btrim(coalesce(new.ucn, '')) = '' then return null; end if;
  if tg_op = 'UPDATE' then
    if lower(btrim(coalesce(old.status, ''))) = 'registered' and btrim(coalesce(old.ucn, '')) = btrim(new.ucn) then return null; end if;
  end if;

  select coalesce(c.call_number, '') into v_call_no from public.calls c where c.ucn = new.ucn;
  for v in select * from public.req_visit_table t
            where t.request_unique_key = new.unique_key and t.report_uid = '' loop
    insert into public.reports (uid, ucn, call_number, call_status, pending_reason, engineer, engineer_email,
                                visit_at, updated_at, data)
    values (v.visit_key, new.ucn, coalesce(v_call_no, ''), v.call_status, v.pending_reason, v.engineer, v.engineer_email,
            (v.visit_date::timestamp at time zone 'UTC'), v.visit_entry_at,
            jsonb_build_object(
              'Email-ID', v.engineer_email,
              'Call Type', coalesce(new.call_type, ''),
              'Visit Entry Date', to_char(v.visit_entry_at at time zone 'Asia/Kolkata', 'DD-Mon-YYYY HH24:MI:SS'),
              'Visit Date & Time', to_char(v.visit_date, 'YYYY-MM-DD'),
              'Source', 'Request Registration v2',
              'Request Key', v.visit_key))
    on conflict (uid) do nothing;
    update public.req_visit_table
       set ucn = new.ucn, report_uid = v.visit_key, filed_at = now()
     where visit_key = v.visit_key;
  end loop;
  return null;
end $$;
revoke execute on function public.req_visit_file_on_register() from public, anon, authenticated;
drop trigger if exists req_visit_file_on_register on public.call_requests;
create trigger req_visit_file_on_register after insert or update of ucn, status on public.call_requests
  for each row execute function public.req_visit_file_on_register();
