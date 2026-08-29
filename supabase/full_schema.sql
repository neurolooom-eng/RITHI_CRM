-- ===========================================================================
-- RITHI CRM — CONSOLIDATED schema (migrations 0001 → 0010), in order.
-- Run as the 'postgres' role in the Supabase SQL Editor. Idempotent where
-- possible. The reports TRUNCATE (0002) is commented out (non-destructive).
-- ===========================================================================

-- ####################  0001_init  ####################

-- ===========================================================================
-- RITHI CRM — Supabase (Postgres) schema, v1 (full cutover from Google Sheets)
-- ---------------------------------------------------------------------------
-- Run this once against a fresh Supabase project (SQL Editor → paste → Run,
-- or `supabase db push`). It creates the core tables, the role/profile model,
-- Row-Level Security policies that reproduce the app's access rules
-- (engineer sees own calls; RM/RGM sees the reporting sub-tree; admin sees
-- all), and the UCN generator.
--
-- Column names are snake_case; the app's data layer (src/lib/supabase.ts) maps
-- them to the existing app keys, so the UI keeps working unchanged.
-- ===========================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- profiles — one row per user, linked to Supabase Auth. Mirrors User Master.
-- reporting_manager_email / regional_manager_email drive the access hierarchy.
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id                      uuid primary key references auth.users (id) on delete cascade,
  email                   text unique not null,
  full_name               text not null default '',
  role                    text not null default 'engineer',      -- admin | rm | rgm | engineer | viewer
  designation             text default '',
  engineer_code           text default '',
  reporting_manager_email text default '',
  regional_manager_email  text default '',
  active                  boolean not null default true,
  created_at              timestamptz not null default now()
);

-- Is the current user an admin? (SECURITY DEFINER so policies can call it.)
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  );
$$;

-- The current user's own profile name (for matching "Call Allocated To").
create or replace function public.my_name()
returns text language sql stable security definer set search_path = public as $$
  select coalesce(full_name, '') from public.profiles where id = auth.uid();
$$;

-- Set of engineer NAMES the current user may see: their own, plus everyone who
-- reports (directly or transitively) to them via reporting/regional manager.
create or replace function public.visible_engineer_names()
returns setof text language sql stable security definer set search_path = public as $$
  with recursive me as (
    select id, email, full_name from public.profiles where id = auth.uid()
  ),
  tree as (
    select p.email, p.full_name
      from public.profiles p, me
     where p.email = me.email
    union
    select c.email, c.full_name
      from public.profiles c
      join tree t
        on lower(c.reporting_manager_email) = lower(t.email)
        or lower(c.regional_manager_email)  = lower(t.email)
  )
  select full_name from tree where coalesce(full_name,'') <> '';
$$;

-- Can the current user see a call allocated to `allottee`?
create or replace function public.can_see_call(allottee text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin()
      or coalesce(allottee,'') = ''
      or lower(trim(allottee)) in (
           select lower(trim(n)) from public.visible_engineer_names() as v(n)
         );
$$;

-- ---------------------------------------------------------------------------
-- Masters — Party / Product / Part, plus generic value-lists for dropdowns.
-- ---------------------------------------------------------------------------
create table if not exists public.parties (
  id          bigint generated always as identity primary key,
  party_name  text not null,
  city        text default '',
  state       text default '',
  party_type  text default '',
  address     text default '',
  extra       jsonb not null default '{}',
  created_at  timestamptz not null default now()
);
create index if not exists parties_name_idx on public.parties using gin (to_tsvector('simple', party_name));

create table if not exists public.products (
  id              bigint generated always as identity primary key,
  party_name      text default '',
  item_name       text default '',
  serial_number   text default '',
  item_status     text default '',
  warranty_number text default '',
  warranty_start  date,
  warranty_end    date,
  contract_number text default '',
  contract_start  date,
  contract_end    date,
  contract_type   text default '',
  active          boolean not null default true,
  extra           jsonb not null default '{}',
  created_at      timestamptz not null default now()
);
create index if not exists products_serial_idx on public.products (lower(serial_number));

create table if not exists public.parts (
  id          bigint generated always as identity primary key,
  code        text default '',
  description text default '',
  item_detail text default '',              -- "CODE|Description" as shown in pickers
  active      boolean not null default true, -- ITEM Master Col F = Active
  extra       jsonb not null default '{}',
  created_at  timestamptz not null default now()
);
create index if not exists parts_active_idx on public.parts (active);

-- Generic master value-lists (Standard Complaint, Call Type, Pending Reason,
-- Feedback Rating, …). name = list key, value = one option.
create table if not exists public.masters (
  id     bigint generated always as identity primary key,
  name   text not null,
  value  text not null,
  extra  jsonb not null default '{}'
);
create index if not exists masters_name_idx on public.masters (name);

-- ---------------------------------------------------------------------------
-- calls — unified Field / Installation / PM register (call_type distinguishes).
-- ---------------------------------------------------------------------------
create table if not exists public.calls (
  id                    bigint generated always as identity primary key,
  ucn                   text unique,                 -- assigned on register (see next_ucn)
  call_number           text default '',
  reg_date              date,
  complaint_date        date,
  party_name            text default '',
  city                  text default '',
  state                 text default '',
  product_name          text default '',
  serial                text default '',
  item_status           text default '',
  warranty_number       text default '',
  warranty_start        date,
  warranty_end          date,
  contract_number       text default '',
  contract_start        date,
  contract_end          date,
  contract_type         text default '',
  call_type             text default 'FIELD',        -- FIELD | INSTALLATION | PM
  standard_complaint    text default '',
  complaint_reported    text default '',
  allocated_to          text default '',             -- engineer NAME (matches profiles.full_name)
  allocated_to_email    text default '',
  breakdown_date        date,
  person_calling        text default '',
  public_health_threat  text default '',
  death                 text default '',
  serious_incident      text default '',
  mode_of_reporting     text default '',
  customer_name         text default '',
  customer_number       text default '',
  customer_designation  text default '',
  email_address         text default '',
  status                text default 'Registered',
  extra                 jsonb not null default '{}',
  created_by            uuid references auth.users (id),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index if not exists calls_allocated_idx on public.calls (lower(allocated_to));
create index if not exists calls_type_idx on public.calls (call_type);
create index if not exists calls_serial_idx on public.calls (lower(serial));

-- Pending registrations (engineer requests awaiting a UCN) — same shape, no UCN.
create table if not exists public.pending_registrations (
  id                 bigint generated always as identity primary key,
  requested_at       timestamptz not null default now(),
  engineer           text default '',
  call_type          text default 'FIELD',
  party_name         text default '',
  city               text default '',
  state              text default '',
  product            text default '',
  serial             text default '',
  reported_problem   text default '',
  plan_date          date,
  ucn                text default '',                 -- back-filled once registered
  extra              jsonb not null default '{}',
  created_by         uuid references auth.users (id)
);

-- reports — the Reporting-N equivalent, one report per call UCN.
create table if not exists public.reports (
  id            bigint generated always as identity primary key,
  ucn           text not null,
  call_number   text default '',
  call_status   text default '',                      -- Solved-Report Completed | Unsolved | Report Pending
  pending_reason text default '',
  manual_report text default '',                      -- uploaded file URL
  data          jsonb not null default '{}',          -- all other Reporting-N fields
  engineer      text default '',
  engineer_email text default '',
  visit_at      timestamptz,
  updated_by    uuid references auth.users (id),
  updated_at    timestamptz not null default now(),
  unique (ucn)
);

-- Spare requests (intake) + exploded lines (approval workflow → replaces v2_OR_Req).
create table if not exists public.spare_requests (
  id                bigint generated always as identity primary key,
  uid               text unique not null,             -- WA-yyyymmdd-xxxx
  req_type          text default 'Call Based',        -- Call Based | HandStock
  engineer          text default '',
  engineer_email    text default '',
  ucn               text default '',
  call_number       text default '',
  party_name        text default '',
  product_name      text default '',
  serial            text default '',
  complaint         text default '',
  item_status       text default '',
  handstock_reason  text default '',
  remarks           text default '',
  status            text default 'Pending',
  created_at        timestamptz not null default now(),
  created_by        uuid references auth.users (id)
);
create table if not exists public.spare_request_lines (
  id              bigint generated always as identity primary key,
  request_uid     text not null references public.spare_requests (uid) on delete cascade,
  part            text default '',
  qty             numeric default 1,
  rm_approval     text default 'Pending',
  admin_approval  text default 'Pending',
  stores_status   text default '',
  status          text default 'Pending',
  created_at      timestamptz not null default now()
);

-- Spare consumption (v2Consumption) — parts consumed against a report.
create table if not exists public.spare_consumption (
  id          bigint generated always as identity primary key,
  ucn         text default '',
  call_number text default '',
  part        text default '',
  qty         numeric default 1,
  engineer    text default '',
  data        jsonb not null default '{}',
  created_at  timestamptz not null default now(),
  created_by  uuid references auth.users (id)
);

-- Customer feedback (v2Feedback) — structured answers per call type.
create table if not exists public.feedback (
  id            bigint generated always as identity primary key,
  ucn           text default '',
  call_number   text default '',
  call_type     text default '',
  engineer      text default '',
  engineer_email text default '',
  party_name    text default '',
  state         text default '',
  product_name  text default '',
  serial        text default '',
  complaint     text default '',
  answers       jsonb not null default '{}',           -- {question: answer}
  visit_at      timestamptz,
  created_at    timestamptz not null default now(),
  created_by    uuid references auth.users (id)
);

-- ---------------------------------------------------------------------------
-- UCN generator. Format mirrors the sheet: <YY><MonthLetter><DD><TypeLetter><Seq4>.
-- Type letter: F=FIELD, I=INSTALLATION, P=PM. Seq is a global monotonic count.
-- NOTE: confirm this matches the legacy format before go-live; adjust here only.
-- ---------------------------------------------------------------------------
create sequence if not exists public.ucn_seq start 1;

create or replace function public.next_ucn(p_call_type text)
returns text language plpgsql volatile security definer set search_path = public as $$
declare
  yy      text := to_char(now(), 'YY');
  mon     text := substr('ABCDEFGHIJKL', extract(month from now())::int, 1); -- A=Jan…L=Dec
  dd      text := to_char(now(), 'DD');
  tletter text := case
                    when upper(coalesce(p_call_type,'')) like 'INSTALL%' then 'I'
                    when upper(coalesce(p_call_type,'')) like 'PM%'      then 'P'
                    else 'F'
                  end;
  seq     int  := nextval('public.ucn_seq');
begin
  return yy || mon || dd || tletter || lpad(seq::text, 4, '0');
end;
$$;

-- Assign a UCN + reg date on insert if none supplied.
create or replace function public.calls_before_insert()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.ucn is null or new.ucn = '' then
    new.ucn := public.next_ucn(new.call_type);
  end if;
  if new.reg_date is null then new.reg_date := current_date; end if;
  if new.created_by is null then new.created_by := auth.uid(); end if;
  return new;
end;
$$;
drop trigger if exists calls_biu on public.calls;
create trigger calls_biu before insert on public.calls
  for each row execute function public.calls_before_insert();

-- ===========================================================================
-- Row-Level Security
-- ===========================================================================
alter table public.profiles              enable row level security;
alter table public.parties               enable row level security;
alter table public.products              enable row level security;
alter table public.parts                 enable row level security;
alter table public.masters               enable row level security;
alter table public.calls                 enable row level security;
alter table public.pending_registrations enable row level security;
alter table public.reports               enable row level security;
alter table public.spare_requests        enable row level security;
alter table public.spare_request_lines   enable row level security;
alter table public.spare_consumption     enable row level security;
alter table public.feedback              enable row level security;

-- profiles: a user sees their own row; admins see/manage all.
drop policy if exists profiles_self_read on public.profiles;
create policy profiles_self_read on public.profiles for select using (id = auth.uid() or public.is_admin());
drop policy if exists profiles_admin_write on public.profiles;
create policy profiles_admin_write on public.profiles for all using (public.is_admin()) with check (public.is_admin());

-- Masters & catalog: any authenticated user reads; admins write.
do $$
declare t text;
begin
  foreach t in array array['parties','products','parts','masters'] loop
    execute format('drop policy if exists %1$s_read on public.%1$s;', t);
    execute format('create policy %1$s_read on public.%1$s for select using (auth.role() = ''authenticated'');', t);
    execute format('drop policy if exists %1$s_admin_write on public.%1$s;', t);
    execute format('create policy %1$s_admin_write on public.%1$s for all using (public.is_admin()) with check (public.is_admin());', t);
  end loop;
end $$;

-- calls: scoped read; engineers/admins can insert/update within their scope.
drop policy if exists calls_scoped_read on public.calls;
create policy calls_scoped_read on public.calls
  for select using (public.can_see_call(allocated_to));
drop policy if exists calls_insert on public.calls;
create policy calls_insert on public.calls
  for insert with check (auth.role() = 'authenticated');
drop policy if exists calls_update on public.calls;
create policy calls_update on public.calls
  for update using (public.can_see_call(allocated_to)) with check (public.can_see_call(allocated_to));

-- pending registrations: creator or scope by engineer; any auth can insert.
drop policy if exists pend_read on public.pending_registrations;
create policy pend_read on public.pending_registrations
  for select using (public.is_admin() or created_by = auth.uid()
    or lower(trim(engineer)) in (select lower(trim(n)) from public.visible_engineer_names() as v(n)));
drop policy if exists pend_insert on public.pending_registrations;
create policy pend_insert on public.pending_registrations for insert with check (auth.role() = 'authenticated');
drop policy if exists pend_update on public.pending_registrations;
create policy pend_update on public.pending_registrations for update using (auth.role() = 'authenticated');

-- reports / consumption / feedback: readable when the parent call is visible;
-- any authenticated engineer may add their own.
drop policy if exists reports_read on public.reports;
create policy reports_read on public.reports for select
  using (public.is_admin() or exists (select 1 from public.calls c where c.ucn = reports.ucn and public.can_see_call(c.allocated_to)));
drop policy if exists reports_write on public.reports;
create policy reports_write on public.reports for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists cons_read on public.spare_consumption;
create policy cons_read on public.spare_consumption for select using (auth.role() = 'authenticated');
drop policy if exists cons_write on public.spare_consumption;
create policy cons_write on public.spare_consumption for insert with check (auth.role() = 'authenticated');

drop policy if exists fb_read on public.feedback;
create policy fb_read on public.feedback for select using (auth.role() = 'authenticated');
drop policy if exists fb_write on public.feedback;
create policy fb_write on public.feedback for insert with check (auth.role() = 'authenticated');

-- spare requests: creator/engineer scope reads; any auth inserts; managers approve.
drop policy if exists sr_read on public.spare_requests;
create policy sr_read on public.spare_requests for select
  using (public.is_admin() or created_by = auth.uid() or lower(engineer_email) = lower(auth.email())
    or lower(trim(engineer)) in (select lower(trim(n)) from public.visible_engineer_names() as v(n)));
drop policy if exists sr_insert on public.spare_requests;
create policy sr_insert on public.spare_requests for insert with check (auth.role() = 'authenticated');
drop policy if exists srl_read on public.spare_request_lines;
create policy srl_read on public.spare_request_lines for select
  using (public.is_admin() or exists (select 1 from public.spare_requests r where r.uid = spare_request_lines.request_uid
    and (r.created_by = auth.uid() or lower(r.engineer_email) = lower(auth.email())
      or lower(trim(r.engineer)) in (select lower(trim(n)) from public.visible_engineer_names() as v(n)))));
drop policy if exists srl_write on public.spare_request_lines;
create policy srl_write on public.spare_request_lines for all
  using (public.is_admin()) with check (public.is_admin());

-- ####################  0002_reports_history  ####################

-- ===========================================================================
-- Reports = visit history: one row per VISIT, keyed by UID (not one per UCN).
-- Run in the Supabase SQL Editor as postgres. This drops the one-per-UCN
-- uniqueness, adds a unique `uid`, clears the deduped reports, and lets you
-- re-import all visit rows.
-- ===========================================================================

-- 1) Drop the one-report-per-UCN constraint (created by `unique (ucn)`).
alter table public.reports drop constraint if exists reports_ucn_key;

-- 2) Add the visit UID and make it the natural key.
alter table public.reports add column if not exists uid text;
create unique index if not exists reports_uid_key on public.reports (uid) where uid is not null;
create index if not exists reports_ucn_idx on public.reports (ucn);

-- 3) Clear the earlier de-duped load so the full visit history can be re-imported.
-- truncate table public.reports;   -- (uncomment only to clear + reload reports)

-- After running this, re-import reports.csv from Admin Config → Bulk Data Import
-- (now one row per visit, ~17,392 rows).

-- ####################  0003_call_requests  ####################

-- ===========================================================================
-- Call Requests (Request Registration) — engineers raise a request; it becomes
-- a Pending Registration until a UCN is assigned. REQID starts at 20000 (R…),
-- UniqueID = REQID-Product-SerialNo.
-- ===========================================================================

create sequence if not exists public.call_req_seq start 20000;

create table if not exists public.call_requests (
  id                       bigint generated always as identity primary key,
  reqid                    text unique,                 -- R20000, R20001, …
  unique_key               text,                        -- REQID-Product-SerialNo
  submitted_at             timestamptz not null default now(),
  email                    text default '',
  engineer                 text default '',
  call_type                text default '',
  party_name               text default '',
  state                    text default '',
  city                     text default '',
  address                  text default '',
  customer_contact_details text default '',
  customer_contact_number  text default '',
  product                  text default '',
  serial_no                text default '',
  standard_complaint       text default '',
  reported_problem         text default '',
  installation_report      text default '',
  kyc                      text default '',
  call_attended            text default '',             -- Yes / No
  attended_date            date,
  plan_date                date,
  additional_comments      text default '',
  ucn                      text default '',             -- back-filled on registration
  status                   text default 'Pending',
  created_by               uuid references auth.users (id),
  created_at               timestamptz not null default now()
);
create index if not exists call_requests_pending_idx on public.call_requests (ucn);

-- Assign REQID + UniqueID + submitter on insert.
create or replace function public.call_requests_biu()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.reqid is null or new.reqid = '' then
    new.reqid := 'R' || nextval('public.call_req_seq')::text;
  end if;
  new.unique_key := new.reqid || '-' || coalesce(nullif(new.product,''),'NA') || '-' || coalesce(nullif(new.serial_no,''),'NA');
  if new.created_by is null then new.created_by := auth.uid(); end if;
  if coalesce(new.email,'') = '' then new.email := auth.email(); end if;
  return new;
end $$;
drop trigger if exists call_requests_biu on public.call_requests;
create trigger call_requests_biu before insert on public.call_requests
  for each row execute function public.call_requests_biu();

alter table public.call_requests enable row level security;
drop policy if exists cr_read on public.call_requests;
create policy cr_read on public.call_requests for select using (
  public.is_admin() or created_by = auth.uid() or lower(email) = lower(auth.email())
  or lower(trim(engineer)) in (select lower(trim(n)) from public.visible_engineer_names() as v(n))
);
drop policy if exists cr_insert on public.call_requests;
create policy cr_insert on public.call_requests for insert with check (auth.role() = 'authenticated');
drop policy if exists cr_update on public.call_requests;
create policy cr_update on public.call_requests for update using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- ####################  0004_user_directory  ####################

-- ===========================================================================
-- User Master → user_directory: the engineer/manager directory (names +
-- reporting hierarchy) that drives who-sees-what. Separate from auth logins
-- (profiles): a person is scoped by matching their login email to a directory
-- row, then by the RM/RGM tree (by name). Admins (profiles.role='admin') see all.
-- ===========================================================================

create table if not exists public.user_directory (
  id                 bigint generated always as identity primary key,
  name               text not null,               -- User Name (matches "Call Allocated To")
  email              text default '',
  gmail              text default '',
  designation        text default '',
  reporting_manager  text default '',             -- RM name
  regional_manager   text default '',             -- RGM name
  region             text default '',
  validity           boolean not null default true,
  extra              jsonb not null default '{}'
);
create index if not exists user_directory_email_idx on public.user_directory (lower(email));
create index if not exists user_directory_gmail_idx on public.user_directory (lower(gmail));
create index if not exists user_directory_name_idx  on public.user_directory (lower(name));

alter table public.user_directory enable row level security;
drop policy if exists ud_read on public.user_directory;
create policy ud_read on public.user_directory for select using (auth.role() = 'authenticated');
drop policy if exists ud_admin_write on public.user_directory;
create policy ud_admin_write on public.user_directory for all using (public.is_admin()) with check (public.is_admin());

-- The signed-in user's directory name (by login email or gmail).
create or replace function public.my_dir_name()
returns text language sql stable security definer set search_path = public as $$
  select name from public.user_directory
   where lower(email) = lower(auth.email()) or lower(gmail) = lower(auth.email())
   limit 1;
$$;

-- Names the current user may see: their own + everyone in their reporting
-- sub-tree (recursive over reporting_manager / regional_manager, by name).
create or replace function public.visible_engineer_names()
returns setof text language sql stable security definer set search_path = public as $$
  with recursive me as (
    select name from public.user_directory
     where lower(email) = lower(auth.email()) or lower(gmail) = lower(auth.email())
  ),
  tree as (
    select d.name from public.user_directory d where d.name in (select name from me)
    union
    select c.name from public.user_directory c
      join tree t
        on lower(c.reporting_manager) = lower(t.name)
        or lower(c.regional_manager)  = lower(t.name)
  )
  select name from tree where coalesce(name,'') <> '';
$$;

-- can_see_call() already uses visible_engineer_names(), so call scoping now
-- follows the directory automatically (admins still bypass via is_admin()).

-- ####################  0005_rbac  ####################

-- ===========================================================================
-- RBAC — role → allowed actions, editable by admins. The app reads app_roles
-- and enforces can(action) against the signed-in user's profiles.role.
-- ===========================================================================

create table if not exists public.app_roles (
  role        text primary key,
  label       text default '',
  permissions jsonb not null default '[]',   -- array of action keys
  updated_at  timestamptz not null default now()
);

-- Seed the roles (permissions left empty here; the app fills sensible defaults
-- on first save). Admins edit these in Admin → Roles & Permissions.
insert into public.app_roles (role, label) values
  ('admin', 'Admin / Super Admin'),
  ('rgm', 'Regional Manager'),
  ('rm', 'Reporting Manager'),
  ('engineer', 'Engineer'),
  ('hotline', 'Hotline Engineer'),
  ('spare_coordinator', 'Spare Coordinator'),
  ('tally_coordinator', 'Tally Coordinator')
on conflict (role) do nothing;

alter table public.app_roles enable row level security;
drop policy if exists ar_read on public.app_roles;
create policy ar_read on public.app_roles for select using (auth.role() = 'authenticated');
drop policy if exists ar_admin_write on public.app_roles;
create policy ar_admin_write on public.app_roles for all using (public.is_admin()) with check (public.is_admin());

-- Allow assigning any of the seven roles to a profile (text column, no enum).
-- (profiles.role already text; no change needed.)

-- ####################  0006_spare_workflow  ####################

-- ===========================================================================
-- Spare approval workflow on spare_requests:
--   RM → Commercial → NSM → Stores(dispatch/DC).
-- Commercial & NSM auto-approve unless the item is AMC or OGP (item_status).
-- ===========================================================================

alter table public.spare_requests
  add column if not exists rm_approval        text default 'Pending',
  add column if not exists rm_by              text,
  add column if not exists rm_at              timestamptz,
  add column if not exists commercial_approval text default 'Pending',
  add column if not exists commercial_by      text,
  add column if not exists commercial_at      timestamptz,
  add column if not exists nsm_approval        text default 'Pending',
  add column if not exists nsm_by             text,
  add column if not exists nsm_at             timestamptz,
  add column if not exists stores_status       text default 'Pending',
  add column if not exists dc_number          text,
  add column if not exists dispatched_by      text,
  add column if not exists dispatched_at      timestamptz,
  add column if not exists stage              text default 'RM Approval';

-- Approvers update spare_requests (buttons are RBAC-gated in the app).
drop policy if exists sr_update on public.spare_requests;
create policy sr_update on public.spare_requests for update
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- ####################  0007_user_access  ####################

-- ===========================================================================
-- Per-user access: a user gets their ROLE's permissions plus any extra actions
-- granted directly to them. (profiles.role already exists.)
-- ===========================================================================

alter table public.profiles
  add column if not exists extra_permissions jsonb not null default '[]';

-- profiles already has:
--   profiles_self_read  (self or admin can read)
--   profiles_admin_write (admins can insert/update/delete)
-- so admins can set role + extra_permissions from the User Access screen.

-- ####################  0008_calls_creator_read  ####################

-- ===========================================================================
-- Let a creator read back the call they just inserted (so insert...returning
-- works for everyone, not only admins). Fixes "new call saved locally / pending"
-- when the register is on Supabase.
-- ===========================================================================

drop policy if exists calls_scoped_read on public.calls;
create policy calls_scoped_read on public.calls for select
  using (public.can_see_call(allocated_to) or created_by = auth.uid());

drop policy if exists calls_update on public.calls;
create policy calls_update on public.calls for update
  using (public.can_see_call(allocated_to) or created_by = auth.uid())
  with check (public.can_see_call(allocated_to) or created_by = auth.uid());

-- ####################  0009_audit_log  ####################

-- ===========================================================================
-- Audit log — records actions, logins, errors, and the time each action took.
-- Clients insert their own events; the identity (user_id/email) is stamped by
-- the DB so it can't be forged. Only admins can read the log.
-- ===========================================================================

create table if not exists public.audit_log (
  id          bigint generated always as identity primary key,
  at          timestamptz not null default now(),
  user_id     uuid,
  email       text default '',
  actor       text default '',      -- display name (client-supplied)
  role        text default '',      -- role key (client-supplied)
  action      text not null,        -- e.g. login, call.create, call.report, spare.approve
  target      text default '',      -- UCN / uid / id the action acted on
  status      text default 'ok',    -- ok | error
  error       text default '',
  duration_ms integer,              -- how long the action took
  meta        jsonb not null default '{}'
);
create index if not exists audit_at_idx     on public.audit_log (at desc);
create index if not exists audit_action_idx on public.audit_log (action);
create index if not exists audit_email_idx  on public.audit_log (lower(email));
create index if not exists audit_status_idx on public.audit_log (status);

-- Stamp identity + time server-side (don't trust the client for who/when).
create or replace function public.audit_before_insert()
returns trigger language plpgsql set search_path = public as $$
begin
  new.user_id := auth.uid();
  new.email   := coalesce(nullif(auth.email(), ''), new.email);  -- keep attempted email for anon login failures
  new.at      := now();
  return new;
end $$;
drop trigger if exists audit_biu on public.audit_log;
create trigger audit_biu before insert on public.audit_log
  for each row execute function public.audit_before_insert();

alter table public.audit_log enable row level security;
-- Authenticated users log their own actions; anon may log only login attempts
-- (so failed logins, which have no session yet, are still recorded).
drop policy if exists audit_insert on public.audit_log;
create policy audit_insert on public.audit_log for insert
  with check (auth.role() = 'authenticated' or action in ('login', 'login_failed'));
-- Only admins read the audit log.
drop policy if exists audit_read on public.audit_log;
create policy audit_read on public.audit_log for select using (public.is_admin());

-- ####################  0010_rbac_enforcement  ####################

-- ===========================================================================
-- RBAC — server-side enforcement.
--
-- Until now the role → action matrix (app_roles, edited in Admin → Roles &
-- Permissions) was only honoured by the browser: can(action) hid buttons and
-- blocked routes, but Postgres itself let any authenticated user write any
-- row it could reach. Anyone with the anon key and a login could bypass the UI.
--
-- This migration moves the same matrix into the database:
--   * has_perm('<action>') resolves the signed-in user's role against
--     app_roles.permissions — the very rows the admin UI edits.
--   * app_roles is seeded with the app's DEFAULT_PERMS (src/lib/rbac.ts) so
--     the matrix is never empty (an empty matrix would lock everyone out).
--   * every RLS policy that previously said "authenticated" or "is_admin()"
--     now names the action it needs.
--   * spare_requests approval columns are guarded per stage by a trigger,
--     since RLS cannot express "may change these columns only".
--
-- Keep this file in sync with src/lib/rbac.ts when actions/roles change.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Super admins — the dev/support logins that always hold every right (mirrors
-- SUPER_ADMINS in src/lib/auth.tsx). A table, so it can be edited in SQL
-- without a code deploy.
-- ---------------------------------------------------------------------------
create table if not exists public.app_super_admins (
  email      text primary key,
  created_at timestamptz not null default now()
);
insert into public.app_super_admins (email) values
  ('service.almsind@gmail.com'),
  ('devika.m@airliquide.com'),
  ('devikamunusamy@gmail.com'),
  ('mmdev74@gmail.com')
on conflict (email) do nothing;

alter table public.app_super_admins enable row level security;
drop policy if exists asa_read on public.app_super_admins;
create policy asa_read on public.app_super_admins for select using (public.is_admin());
-- No write policy: the list is maintained in SQL only (service role / SQL editor).

create or replace function public.is_super_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.app_super_admins s where lower(s.email) = lower(coalesce(auth.email(), ''))
  );
$$;

-- Admin = profiles.role 'admin', or a super admin login.
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'
  ) or public.is_super_admin();
$$;

-- The signed-in user's RBAC role key (profiles.role), defaulting to engineer.
create or replace function public.my_role()
returns text language sql stable security definer set search_path = public as $$
  select coalesce(nullif(lower(trim(p.role)), ''), 'engineer')
    from public.profiles p where p.id = auth.uid();
$$;

-- The extra actions granted to this user directly, on top of their role
-- (profiles.extra_permissions — see 0007_user_access.sql).
create or replace function public.my_extra_perms()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(p.extra_permissions, '[]'::jsonb) from public.profiles p where p.id = auth.uid();
$$;

-- Does the signed-in user hold `action`? Admins and super admins hold every
-- action. Otherwise the action must appear in app_roles.permissions for their
-- role, or in their own extra_permissions; a role with no row (or an empty
-- array) falls back to 'engineer' so a half-configured matrix degrades to
-- least privilege rather than lock-out.
create or replace function public.has_perm(action text)
returns boolean language sql stable security definer set search_path = public as $$
  with role_row as (
    select r.permissions from public.app_roles r
     where r.role = public.my_role() and jsonb_array_length(coalesce(r.permissions, '[]'::jsonb)) > 0
  ),
  fallback as (
    select r.permissions from public.app_roles r where r.role = 'engineer'
  ),
  perms as (
    select permissions from role_row
    union all
    select permissions from fallback where not exists (select 1 from role_row)
  )
  select public.is_admin()
      or exists (select 1 from perms p where p.permissions ? action)
      or public.my_extra_perms() ? action;
$$;

grant execute on function public.is_super_admin()  to authenticated;
grant execute on function public.my_role()         to authenticated;
grant execute on function public.my_extra_perms()  to authenticated;
grant execute on function public.has_perm(text)    to authenticated;

-- ---------------------------------------------------------------------------
-- Seed app_roles with the app's starting matrix (src/lib/rbac.ts DEFAULT_PERMS)
-- so enforcement has something to enforce. Roles that already carry a
-- non-empty permission list are left untouched — admin edits win.
-- ---------------------------------------------------------------------------
do $$
declare
  admin_mods text[] := array['mod:/users','mod:/roles','mod:/admin-config'];
  open_mods  text[] := array[
    'mod:/','mod:/daily-review','mod:/parties','mod:/product-master','mod:/user-master',
    'mod:/parts','mod:/warranties','mod:/contracts','mod:/request-registration',
    'mod:/pending-registrations','mod:/field-calls','mod:/installations','mod:/pm-calls',
    'mod:/reports','mod:/spare-requests','mod:/spare-consumption','mod:/feedback',
    'mod:/failure-report','mod:/kpi','mod:/settings','mod:/version-history'];
  all_actions text[] := array[
    'calls.view','calls.create','calls.edit','calls.report','request.create','pending.register',
    'spare.request','spare.approve_rm','spare.approve_commercial','spare.approve_nsm','spare.dispatch',
    'consumption.view','masters.view','masters.edit','reports.view','dashboard.view','feedback.view',
    'users.manage','config.manage','rbac.manage'];
  defs jsonb := jsonb_build_object(
    'admin',             to_jsonb(all_actions || open_mods || admin_mods),
    'nsm',               to_jsonb(array['calls.view','masters.view','consumption.view','reports.view','dashboard.view','feedback.view','spare.approve_nsm'] || open_mods),
    'rgm',               to_jsonb(array['calls.view','calls.create','calls.edit','calls.report','request.create','spare.request','spare.approve_rm','consumption.view','masters.view','reports.view','dashboard.view','feedback.view'] || open_mods),
    'rm',                to_jsonb(array['calls.view','calls.create','calls.edit','calls.report','request.create','spare.request','spare.approve_rm','consumption.view','masters.view','reports.view','dashboard.view','feedback.view'] || open_mods),
    'engineer',          to_jsonb(array['calls.view','calls.report','request.create','spare.request','consumption.view','reports.view','dashboard.view'] || open_mods),
    'hotline',           to_jsonb(array['calls.view','calls.create','request.create','pending.register','spare.approve_rm','masters.view','dashboard.view'] || open_mods),
    'spare_coordinator', to_jsonb(array['calls.view','spare.request','spare.approve_rm','spare.dispatch','consumption.view','reports.view','dashboard.view'] || open_mods),
    'stores_incharge',   to_jsonb(array['calls.view','spare.dispatch','consumption.view','reports.view','dashboard.view'] || open_mods),
    'tally_coordinator', to_jsonb(array['calls.view','consumption.view','reports.view','feedback.view','dashboard.view'] || open_mods),
    'commercial',        to_jsonb(array['calls.view','consumption.view','reports.view','feedback.view','dashboard.view','masters.view','spare.approve_commercial'] || open_mods)
  );
  labels jsonb := jsonb_build_object(
    'admin','Admin / Super Admin', 'nsm','NSM (National Sales Manager)', 'rgm','Regional Manager',
    'rm','Reporting Manager', 'engineer','Engineer', 'hotline','Hotline Engineer',
    'spare_coordinator','Spare Coordinator', 'stores_incharge','Stores Incharge',
    'tally_coordinator','Tally Coordinator', 'commercial','Commercial');
  k text;
begin
  for k in select jsonb_object_keys(defs) loop
    insert into public.app_roles (role, label, permissions)
    values (k, labels ->> k, defs -> k)
    on conflict (role) do update
      set label       = coalesce(nullif(public.app_roles.label, ''), excluded.label),
          permissions = case
                          when jsonb_array_length(coalesce(public.app_roles.permissions, '[]'::jsonb)) = 0
                          then excluded.permissions
                          else public.app_roles.permissions
                        end,
          updated_at  = now();
  end loop;
end $$;

-- ===========================================================================
-- Policies — each one now names the action it requires.
-- ===========================================================================

-- profiles: own row always readable; managing users needs users.manage.
drop policy if exists profiles_self_read on public.profiles;
create policy profiles_self_read on public.profiles for select
  using (id = auth.uid() or public.is_admin() or public.has_perm('users.manage'));
drop policy if exists profiles_admin_write on public.profiles;
create policy profiles_admin_write on public.profiles for all
  using (public.has_perm('users.manage')) with check (public.has_perm('users.manage'));

-- Masters & catalog: reference data every signed-in user needs to fill a call
-- in (parties, products, parts, value lists), so reads stay open to any
-- authenticated user; changing a master needs masters.edit.
do $$
declare t text;
begin
  foreach t in array array['parties','products','parts','masters'] loop
    execute format('drop policy if exists %1$s_read on public.%1$s;', t);
    execute format('create policy %1$s_read on public.%1$s for select using (auth.role() = ''authenticated'');', t);
    execute format('drop policy if exists %1$s_admin_write on public.%1$s;', t);
    execute format('drop policy if exists %1$s_write on public.%1$s;', t);
    execute format('create policy %1$s_write on public.%1$s for all using (public.has_perm(''masters.edit'')) with check (public.has_perm(''masters.edit''));', t);
  end loop;
end $$;

-- user_directory: readable by anyone who may see calls (it drives the
-- reporting tree); maintained by user managers.
drop policy if exists ud_read on public.user_directory;
create policy ud_read on public.user_directory for select using (auth.role() = 'authenticated');
drop policy if exists ud_admin_write on public.user_directory;
drop policy if exists ud_write on public.user_directory;
create policy ud_write on public.user_directory for all
  using (public.has_perm('users.manage')) with check (public.has_perm('users.manage'));

-- app_roles: everyone reads the matrix (the client needs it to gate the UI);
-- only rbac.manage may change it.
drop policy if exists ar_read on public.app_roles;
create policy ar_read on public.app_roles for select using (auth.role() = 'authenticated');
drop policy if exists ar_admin_write on public.app_roles;
drop policy if exists ar_write on public.app_roles;
create policy ar_write on public.app_roles for all
  using (public.has_perm('rbac.manage')) with check (public.has_perm('rbac.manage'));

-- calls: the reporting-tree scope still applies, on top of the action.
drop policy if exists calls_scoped_read on public.calls;
-- A creator always reads back the call they just inserted (0008), so
-- insert…returning works for everyone; everything else needs calls.view plus
-- the reporting-tree scope.
create policy calls_scoped_read on public.calls for select
  using ((public.has_perm('calls.view') and public.can_see_call(allocated_to)) or created_by = auth.uid());
drop policy if exists calls_insert on public.calls;
create policy calls_insert on public.calls for insert
  with check (public.has_perm('calls.create'));
drop policy if exists calls_update on public.calls;
create policy calls_update on public.calls for update
  using ((public.has_perm('calls.edit') or public.has_perm('calls.report'))
         and (public.can_see_call(allocated_to) or created_by = auth.uid()))
  with check ((public.has_perm('calls.edit') or public.has_perm('calls.report'))
         and (public.can_see_call(allocated_to) or created_by = auth.uid()));

-- pending registrations: Hotline registers them; scope still applies to reads.
drop policy if exists pend_read on public.pending_registrations;
create policy pend_read on public.pending_registrations for select
  using (public.is_admin() or created_by = auth.uid()
    or (public.has_perm('calls.view')
        and lower(trim(engineer)) in (select lower(trim(n)) from public.visible_engineer_names() as v(n))));
drop policy if exists pend_insert on public.pending_registrations;
create policy pend_insert on public.pending_registrations for insert
  with check (public.has_perm('pending.register') or public.has_perm('request.create'));
drop policy if exists pend_update on public.pending_registrations;
create policy pend_update on public.pending_registrations for update
  using (public.has_perm('pending.register') or public.has_perm('calls.create'))
  with check (public.has_perm('pending.register') or public.has_perm('calls.create'));

-- call requests: raising one needs request.create; acting on one needs
-- calls.create (the Hotline/admin who turns it into a call).
drop policy if exists cr_insert on public.call_requests;
create policy cr_insert on public.call_requests for insert
  with check (public.has_perm('request.create'));
drop policy if exists cr_update on public.call_requests;
create policy cr_update on public.call_requests for update
  using (public.has_perm('calls.create') or public.has_perm('pending.register') or created_by = auth.uid())
  with check (public.has_perm('calls.create') or public.has_perm('pending.register') or created_by = auth.uid());

-- reports: visible with the parent call; writing one is calls.report.
drop policy if exists reports_read on public.reports;
create policy reports_read on public.reports for select
  using (public.is_admin() or (public.has_perm('calls.view') and exists (
    select 1 from public.calls c where c.ucn = reports.ucn and public.can_see_call(c.allocated_to))));
drop policy if exists reports_write on public.reports;
create policy reports_write on public.reports for all
  using (public.has_perm('calls.report')) with check (public.has_perm('calls.report'));

-- consumption / feedback.
drop policy if exists cons_read on public.spare_consumption;
create policy cons_read on public.spare_consumption for select using (public.has_perm('consumption.view'));
drop policy if exists cons_write on public.spare_consumption;
create policy cons_write on public.spare_consumption for insert
  with check (public.has_perm('calls.report') or public.has_perm('spare.dispatch'));

drop policy if exists fb_read on public.feedback;
create policy fb_read on public.feedback for select
  using (public.has_perm('feedback.view') or public.has_perm('calls.report'));
drop policy if exists fb_write on public.feedback;
create policy fb_write on public.feedback for insert
  with check (public.has_perm('calls.report') or public.has_perm('feedback.view'));

-- spare requests: raising needs spare.request; reading follows the reporting
-- tree, plus anyone in the approval chain (they must see what they approve).
create or replace function public.can_approve_spares()
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_perm('spare.approve_rm')
      or public.has_perm('spare.approve_commercial')
      or public.has_perm('spare.approve_nsm')
      or public.has_perm('spare.dispatch');
$$;
grant execute on function public.can_approve_spares() to authenticated;

drop policy if exists sr_read on public.spare_requests;
create policy sr_read on public.spare_requests for select
  using (public.is_admin() or created_by = auth.uid() or lower(engineer_email) = lower(auth.email())
    or public.can_approve_spares()
    or lower(trim(engineer)) in (select lower(trim(n)) from public.visible_engineer_names() as v(n)));
drop policy if exists sr_insert on public.spare_requests;
create policy sr_insert on public.spare_requests for insert
  with check (public.has_perm('spare.request'));
drop policy if exists sr_update on public.spare_requests;
create policy sr_update on public.spare_requests for update
  using (public.can_approve_spares() or created_by = auth.uid())
  with check (public.can_approve_spares() or created_by = auth.uid());

-- Request lines: readable with their request; the requester writes their own
-- lines (the app inserts them right after the request), approvers may update.
drop policy if exists srl_read on public.spare_request_lines;
create policy srl_read on public.spare_request_lines for select
  using (exists (select 1 from public.spare_requests r where r.uid = spare_request_lines.request_uid));
drop policy if exists srl_write on public.spare_request_lines;
drop policy if exists srl_insert on public.spare_request_lines;
create policy srl_insert on public.spare_request_lines for insert
  with check (public.has_perm('spare.request') and exists (
    select 1 from public.spare_requests r where r.uid = request_uid
      and (r.created_by = auth.uid() or public.is_admin())));
drop policy if exists srl_update on public.spare_request_lines;
create policy srl_update on public.spare_request_lines for update
  using (public.can_approve_spares()) with check (public.can_approve_spares());

-- ---------------------------------------------------------------------------
-- Approval-stage guard. RLS grants or denies a whole row, so it cannot say
-- "you may set rm_approval but not nsm_approval". This trigger does: each
-- stage's columns may only change if the user holds that stage's action.
-- ---------------------------------------------------------------------------
create or replace function public.spare_requests_stage_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  changed boolean;
begin
  if public.is_admin() then return new; end if;

  changed := new.rm_approval is distinct from old.rm_approval
          or new.rm_by       is distinct from old.rm_by
          or new.rm_at       is distinct from old.rm_at;
  if changed and not public.has_perm('spare.approve_rm') then
    raise exception 'RBAC: RM approval requires the spare.approve_rm permission';
  end if;

  changed := new.commercial_approval is distinct from old.commercial_approval
          or new.commercial_by       is distinct from old.commercial_by
          or new.commercial_at       is distinct from old.commercial_at;
  if changed and not public.has_perm('spare.approve_commercial') then
    raise exception 'RBAC: Commercial approval requires the spare.approve_commercial permission';
  end if;

  changed := new.nsm_approval is distinct from old.nsm_approval
          or new.nsm_by       is distinct from old.nsm_by
          or new.nsm_at       is distinct from old.nsm_at;
  if changed and not public.has_perm('spare.approve_nsm') then
    raise exception 'RBAC: NSM approval requires the spare.approve_nsm permission';
  end if;

  changed := new.stores_status  is distinct from old.stores_status
          or new.dc_number      is distinct from old.dc_number
          or new.dispatched_by  is distinct from old.dispatched_by
          or new.dispatched_at  is distinct from old.dispatched_at;
  if changed and not public.has_perm('spare.dispatch') then
    raise exception 'RBAC: dispatch / DC requires the spare.dispatch permission';
  end if;

  -- The workflow stage itself only moves as a side effect of an approval.
  if new.stage is distinct from old.stage and not public.can_approve_spares() then
    raise exception 'RBAC: advancing the approval stage requires an approval permission';
  end if;

  return new;
end $$;

drop trigger if exists spare_requests_stage_guard on public.spare_requests;
create trigger spare_requests_stage_guard
  before update on public.spare_requests
  for each row execute function public.spare_requests_stage_guard();

-- ---------------------------------------------------------------------------
-- Nobody edits their own role or extra permissions (privilege escalation) —
-- only users.manage may, and never to grant admin unless already an admin.
-- ---------------------------------------------------------------------------
create or replace function public.profiles_role_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.role is distinct from old.role or new.extra_permissions is distinct from old.extra_permissions then
    if new.id = auth.uid() and not public.is_super_admin() then
      raise exception 'RBAC: you cannot change your own role or permissions';
    end if;
  end if;
  if new.role is distinct from old.role
     and lower(new.role) = 'admin' and not public.is_admin() then
    raise exception 'RBAC: granting admin requires an administrator';
  end if;
  return new;
end $$;

drop trigger if exists profiles_role_guard on public.profiles;
create trigger profiles_role_guard
  before update on public.profiles
  for each row execute function public.profiles_role_guard();
