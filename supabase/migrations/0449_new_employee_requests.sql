-- ===========================================================================
-- 0449 -- A NEW EMPLOYEE, REQUESTED BY A MANAGER AND APPROVED INTO THE USER
-- MASTER (the user, 2026-10-21: "Add a Place Holder for Reporting Managers to
-- add New Employees, It should go for Approval to the Admins, NSM, Technical
-- Support. If any one of these approve then It should get added to the User
-- Master. This is an additional Route for User Creation and the Existing
-- route stays intact").
--
-- Settled with the user the same day:
--   * the request carries every User Master field; the Reporting Manager is
--     the person asking, stamped here and not typeable; the role and tags are
--     the approver's;
--   * an approver may correct any field, then approve -- or reject with a
--     reason the requester sees. The FIRST approval adds the person to the
--     User Master and closes the request for everyone else;
--   * approving also creates the sign-in login, with a temporary password
--     shown to the approver. That half runs in the approver's screen (a login
--     cannot be made from SQL without the service key, which is never
--     shipped); this records whether it was made. The profile is then built
--     on the person's first sign-in from their User Master row
--     (ensure_my_profile, 0033), as for everyone else;
--   * the screen's key and the two new action keys are granted on Roles &
--     Permissions by the user, not by this migration ("No, I will grant it
--     myself"). An administrator passes has_perm() anyway.
--
-- THE EXISTING ROUTE IS UNTOUCHED: the User Master's own Add user, and every
-- policy and guard on user_directory and profiles, are as they were. Approval
-- writes user_directory through a definer function, and ud_role_guard (0286)
-- still fires inside it -- so an approver without "Assign roles & grant
-- permissions" can approve a person only without a role, exactly as on the
-- User Master.
--
-- KEYS:  users.request          raise a request (Reporting / Regional Manager)
--        users.request.approve  approve or reject one (Admin, NSM, Technical
--                               Support)
-- Neither is a child of users.manage: who may request and who may approve
-- are decided on their own.
--
-- THE TRAINING REQUEST that a request is also to raise waits for its format
-- (the user: "I shall share the format for Training Request"). The requester's
-- role is recorded now so it can be read when that is built.
-- ===========================================================================

create table if not exists public.employee_requests (
  id                 bigint generated always as identity primary key,
  req_no             text unique,
  status             text not null default 'Pending' check (status in ('Pending', 'Approved', 'Rejected')),
  -- THE PERSON ASKED FOR -- the User Master's own fields.
  name               text not null default '',
  email              text not null default '',
  gmail              text not null default '',
  designation        text not null default '',
  department         text not null default '',
  region             text not null default '',
  reporting_manager  text not null default '',
  regional_manager   text not null default '',
  phone              text not null default '',
  address            text not null default '',
  city               text not null default '',
  state              text not null default '',
  remarks            text not null default '',
  -- WHO ASKED, stamped from the session.
  requested_by       uuid,
  requested_by_name  text not null default '',
  requested_by_email text not null default '',
  requested_by_role  text not null default '',
  -- THE DECISION.
  decided_by         uuid,
  decided_by_name    text not null default '',
  decided_at         timestamptz,
  reject_reason      text not null default '',
  user_directory_id  bigint,
  approved_data      jsonb,
  -- THE LOGIN, made in the approver's screen after the approval.
  login_email        text not null default '',
  login_created_at   timestamptz,
  login_error        text not null default '',
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

comment on table public.employee_requests is
  'A new employee asked for by a Reporting or Regional Manager, approved into the User Master by Admin / NSM / Technical Support (0449). The User Master''s own Add user is a separate route and is unchanged.';

create index if not exists employee_requests_status_idx on public.employee_requests (status, created_at desc);
create index if not exists employee_requests_requested_by_idx on public.employee_requests (requested_by);

-- ---- what a request may carry when it is raised -----------------------------
-- The request number, who asked and the Reporting Manager are the database's;
-- the decision fields start empty whatever is sent. A caller-supplied value is
-- DISCARDED, not refused (the 0113/0114 rule).
create or replace function public.employee_request_stamp()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_mail text := lower(coalesce(auth.email(), ''));
  v_name text;
  v_role text;
begin
  if tg_op = 'INSERT' then
    new.req_no := 'NE-' || lpad(new.id::text, 5, '0');
    new.status := 'Pending';
    new.requested_by := auth.uid();
    select p.full_name, p.role into v_name, v_role from public.profiles p where p.id = auth.uid();
    -- The requester AS THE USER MASTER NAMES THEM: the reporting tree is built
    -- from those names, so the new person's manager must be spelt exactly so.
    select d.name into new.reporting_manager
      from public.user_directory d
     where v_mail <> '' and (lower(btrim(d.email)) = v_mail or lower(btrim(d.gmail)) = v_mail)
       and btrim(coalesce(d.name, '')) <> ''
     order by d.id limit 1;
    new.reporting_manager := coalesce(nullif(btrim(new.reporting_manager), ''), btrim(coalesce(v_name, '')));
    new.requested_by_name := coalesce(nullif(btrim(new.reporting_manager), ''), btrim(coalesce(v_name, '')), '');
    new.requested_by_email := v_mail;
    new.requested_by_role := coalesce(v_role, '');
    new.decided_by := null; new.decided_by_name := ''; new.decided_at := null;
    new.reject_reason := ''; new.user_directory_id := null; new.approved_data := null;
    new.login_email := ''; new.login_created_at := null; new.login_error := '';
    new.name := btrim(coalesce(new.name, ''));
    new.email := lower(btrim(coalesce(new.email, '')));
    new.gmail := lower(btrim(coalesce(new.gmail, '')));
    if new.name = '' then
      raise exception 'Enter the new employee''s name.' using errcode = '23514';
    end if;
    if new.email = '' and new.gmail = '' then
      raise exception 'Enter the new employee''s Air Liquide ID or Gmail ID -- the login is made from it.' using errcode = '23514';
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;
revoke execute on function public.employee_request_stamp() from public, anon, authenticated;

drop trigger if exists employee_request_stamp on public.employee_requests;
create trigger employee_request_stamp before insert or update on public.employee_requests
  for each row execute function public.employee_request_stamp();

-- The request number needs the id, which a column default cannot read; the
-- identity is assigned before the BEFORE trigger runs, so it is set there.

-- ---- who is told ------------------------------------------------------------
-- Everybody active who may approve: an administrator, or a login whose role or
-- own grants carry users.request.approve. Read off the same tables has_perm()
-- reads, for somebody other than the caller.
create or replace function public.employee_request_approvers()
returns table (id uuid, email text)
language sql stable security definer set search_path = public as $$
  select p.id, coalesce(p.email, '')
    from public.profiles p
    left join public.app_roles r on r.role = p.role
   where coalesce(p.active, true)
     and (lower(coalesce(p.role, '')) = 'admin'
          or coalesce(r.permissions, '[]'::jsonb) ? 'users.request.approve'
          or coalesce(p.extra_permissions, '[]'::jsonb) ? 'users.request.approve');
$$;
revoke execute on function public.employee_request_approvers() from public, anon, authenticated;

create or replace function public.notify_employee_request()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into public.notifications (recipient_id, recipient_email, kind, title, body, link)
    select a.id, a.email, 'employee_request',
           'New employee for approval: ' || new.name,
           concat_ws(' · ', new.req_no, 'asked by ' || nullif(new.requested_by_name, ''),
                     nullif(new.designation, ''), nullif(new.region, '')),
           '/new-employee-requests'
      from public.employee_request_approvers() a
     where a.id is distinct from new.requested_by;
  elsif new.status is distinct from old.status and new.requested_by is not null then
    insert into public.notifications (recipient_id, recipient_email, kind, title, body, link)
    values (new.requested_by, new.requested_by_email, 'employee_request',
            case when new.status = 'Approved' then 'New employee approved: ' else 'New employee rejected: ' end || new.name,
            concat_ws(' · ', new.req_no, 'by ' || nullif(new.decided_by_name, ''),
                      case when new.status = 'Rejected' then nullif(new.reject_reason, '') end),
            '/new-employee-requests');
  end if;
  return null;
end $$;
revoke execute on function public.notify_employee_request() from public, anon, authenticated;

drop trigger if exists zz_notify_employee_request on public.employee_requests;
create trigger zz_notify_employee_request after insert or update of status on public.employee_requests
  for each row execute function public.notify_employee_request();

-- ---- row-level security -----------------------------------------------------
alter table public.employee_requests enable row level security;

drop policy if exists er_read on public.employee_requests;
create policy er_read on public.employee_requests for select
  using (requested_by = auth.uid() or (select public.has_perm('users.request.approve')));

drop policy if exists er_insert on public.employee_requests;
create policy er_insert on public.employee_requests for insert
  with check ((select public.has_perm('users.request')));

-- No UPDATE and no DELETE policy: a request changes only through the three
-- functions below, and is never deleted (block_hard_delete, 0049).
revoke all on public.employee_requests from anon, authenticated;
grant select, insert on public.employee_requests to authenticated;

do $$
begin
  if to_regprocedure('public.block_hard_delete()') is not null then
    execute 'drop trigger if exists no_hard_delete on public.employee_requests';
    execute 'create trigger no_hard_delete before delete on public.employee_requests
               for each row execute function public.block_hard_delete()';
  end if;
  if to_regprocedure('public.sys_columns_attach(regclass)') is not null then
    perform public.sys_columns_attach('public.employee_requests'::regclass);
  end if;
end $$;

-- ---- approve ----------------------------------------------------------------
-- p_row carries the fields as the approver left them (any of them corrected),
-- plus the role and tags, which are the approver's. The first approval wins:
-- the row is locked, and a request already decided is refused by name.
create or replace function public.approve_employee_request(p_id bigint, p_row jsonb)
returns bigint
language plpgsql security definer set search_path = public as $$
declare
  rq     public.employee_requests;
  v_id   bigint;
  v_name text := btrim(coalesce(p_row->>'name', ''));
  v_mail text := lower(btrim(coalesce(p_row->>'email', '')));
  v_gml  text := lower(btrim(coalesce(p_row->>'gmail', '')));
  v_me   text;
  v_tags text[];
begin
  if not coalesce(public.has_perm('users.request.approve'), false) then
    raise exception 'Approving a new employee needs "Approve new-employee requests" on Roles & Permissions.' using errcode = '42501';
  end if;
  select * into rq from public.employee_requests where id = p_id for update;
  if not found then raise exception 'No such request.'; end if;
  if rq.status <> 'Pending' then
    raise exception '% is already %, by % on %.', rq.req_no, lower(rq.status), coalesce(nullif(rq.decided_by_name, ''), 'somebody'),
      to_char(rq.decided_at at time zone 'Asia/Kolkata', 'DD-Mon-YYYY HH24:MI') using errcode = '23514';
  end if;
  if v_name = '' then raise exception 'The new employee needs a name.' using errcode = '23514'; end if;
  if v_mail = '' and v_gml = '' then
    raise exception 'The new employee needs an Air Liquide ID or a Gmail ID.' using errcode = '23514';
  end if;
  -- ONE PERSON, ONE ROW. Somebody already on the User Master under either
  -- address is not added a second time.
  if exists (select 1 from public.user_directory d
              where (v_mail <> '' and (lower(btrim(d.email)) = v_mail or lower(btrim(d.gmail)) = v_mail))
                 or (v_gml <> '' and (lower(btrim(d.email)) = v_gml or lower(btrim(d.gmail)) = v_gml))) then
    raise exception 'Somebody on the User Master already has % -- open them there instead.', coalesce(nullif(v_mail, ''), v_gml)
      using errcode = '23505';
  end if;
  select coalesce(array_agg(btrim(t)) filter (where btrim(t) <> ''), '{}')
    into v_tags from jsonb_array_elements_text(coalesce(p_row->'tags', '[]'::jsonb)) t;

  -- ud_role_guard (0286) fires here as for the User Master's own Add user.
  insert into public.user_directory (name, email, gmail, designation, department, region, reporting_manager,
                                     regional_manager, phone, address, city, state, role, validity, tags)
  values (v_name, v_mail, v_gml,
          btrim(coalesce(p_row->>'designation', '')), btrim(coalesce(p_row->>'department', '')),
          btrim(coalesce(p_row->>'region', '')), btrim(coalesce(p_row->>'reporting_manager', '')),
          btrim(coalesce(p_row->>'regional_manager', '')), btrim(coalesce(p_row->>'phone', '')),
          btrim(coalesce(p_row->>'address', '')), btrim(coalesce(p_row->>'city', '')),
          btrim(coalesce(p_row->>'state', '')), btrim(coalesce(p_row->>'role', '')), true, v_tags)
  returning id into v_id;

  select coalesce(nullif(btrim(p.full_name), ''), p.email) into v_me from public.profiles p where p.id = auth.uid();
  update public.employee_requests
     set status = 'Approved', decided_by = auth.uid(), decided_by_name = coalesce(v_me, ''), decided_at = now(),
         user_directory_id = v_id,
         approved_data = (select to_jsonb(d) - 'sys_id' - 'sys_created_by' - 'sys_updated_by' - 'sys_created_on' - 'sys_updated_on'
                            from public.user_directory d where d.id = v_id)
   where id = p_id;
  return v_id;
end $$;
revoke execute on function public.approve_employee_request(bigint, jsonb) from public, anon;
grant execute on function public.approve_employee_request(bigint, jsonb) to authenticated;

-- ---- reject -----------------------------------------------------------------
create or replace function public.reject_employee_request(p_id bigint, p_reason text)
returns void
language plpgsql security definer set search_path = public as $$
declare rq public.employee_requests; v_me text;
begin
  if not coalesce(public.has_perm('users.request.approve'), false) then
    raise exception 'Rejecting a new employee needs "Approve new-employee requests" on Roles & Permissions.' using errcode = '42501';
  end if;
  if btrim(coalesce(p_reason, '')) = '' then
    raise exception 'Say why the request is rejected -- the requester sees it.' using errcode = '23514';
  end if;
  select * into rq from public.employee_requests where id = p_id for update;
  if not found then raise exception 'No such request.'; end if;
  if rq.status <> 'Pending' then
    raise exception '% is already %, by % on %.', rq.req_no, lower(rq.status), coalesce(nullif(rq.decided_by_name, ''), 'somebody'),
      to_char(rq.decided_at at time zone 'Asia/Kolkata', 'DD-Mon-YYYY HH24:MI') using errcode = '23514';
  end if;
  select coalesce(nullif(btrim(p.full_name), ''), p.email) into v_me from public.profiles p where p.id = auth.uid();
  update public.employee_requests
     set status = 'Rejected', decided_by = auth.uid(), decided_by_name = coalesce(v_me, ''), decided_at = now(),
         reject_reason = btrim(p_reason)
   where id = p_id;
end $$;
revoke execute on function public.reject_employee_request(bigint, text) from public, anon;
grant execute on function public.reject_employee_request(bigint, text) to authenticated;

-- ---- the login, recorded ----------------------------------------------------
-- Made in the approver's screen right after the approval; this records which
-- address it was made for, or why it could not be. Never the password.
create or replace function public.employee_request_login(p_id bigint, p_email text, p_error text)
returns void
language plpgsql security definer set search_path = public as $$
declare rq public.employee_requests;
begin
  if not coalesce(public.has_perm('users.request.approve'), false) then
    raise exception 'Recording the login needs "Approve new-employee requests" on Roles & Permissions.' using errcode = '42501';
  end if;
  select * into rq from public.employee_requests where id = p_id for update;
  if not found or rq.status <> 'Approved' then raise exception 'Only an approved request gets a login.'; end if;
  if rq.login_created_at is not null then return; end if;
  if btrim(coalesce(p_error, '')) = '' then
    update public.employee_requests
       set login_email = lower(btrim(coalesce(p_email, ''))), login_created_at = now(), login_error = ''
     where id = p_id;
  else
    update public.employee_requests set login_error = btrim(p_error) where id = p_id;
  end if;
end $$;
revoke execute on function public.employee_request_login(bigint, text, text) from public, anon;
grant execute on function public.employee_request_login(bigint, text, text) to authenticated;
