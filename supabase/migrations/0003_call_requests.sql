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
