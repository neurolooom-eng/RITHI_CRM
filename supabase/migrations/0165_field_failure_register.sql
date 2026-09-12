-- ===========================================================================
-- 0165 — THE FIELD FAILURE REGISTER (FFR).
--
-- The format is the Field_Failure_Register workbook's 2026 tab, and the report
-- it produces is R-SER-03 Rev 02. Raised from the Daily Call Review, because
-- that is where somebody decides a failure is worth reporting.
--
-- WHAT IS KEPT AND WHAT IS NOT. The sheet has 45 columns; 17 of them are
-- Google Forms / AutoCrat plumbing (Add Attachments, EO, Raise CAPA,
-- Update(Link), Merged Doc ID, Document Merge Status …) that exist only to make
-- a spreadsheet behave like an application. The application does not need them:
-- the document is generated here, so its id and merge status are not data.
-- The columns that are RECORD are kept, under their own names.
--
-- ONE ROW PER FFR, keyed by its number. `ucn` is the call it came from and is
-- NOT unique: a machine can fail twice.
-- ===========================================================================

create table if not exists public.field_failure_reports (
  id                    bigserial primary key,
  ffr_no                text not null unique,          -- FFR - 001/26
  ffr_date              date not null default (now() at time zone 'Asia/Kolkata')::date,
  source                text not null default 'PC',
  -- The call. `ucn` is the sheet's "CRN NO"; the names differ because the sheet
  -- predates the UCN and the two are the same thing.
  ucn                   text not null default '',
  crn_date              date,
  -- The customer and machine, as they were WHEN THE FAILURE WAS REPORTED. Copied
  -- rather than joined: Product Master is corrected over time and a report is a
  -- record of what was believed at the time it was raised.
  customer_name         text not null default '',
  place                 text not null default '',
  product_name          text not null default '',
  cover                 text not null default '',      -- WGP / OGP / AMC
  item_code             text not null default '',
  product_serial        text not null default '',
  installation_date     date,
  -- The failure.
  problem_reported      text not null default '',
  additional_problem    text not null default '',
  service_observation   text not null default '',
  problem_status        text not null default '',
  -- CAPA.
  capa_responsibility   text not null default '',
  capa_no               text not null default 'NA',
  capa_status           text not null default 'Not required',
  -- Verification and the rest of the sheet's record columns.
  verified_by           text not null default '',
  remarks               text not null default '',
  current_call_status   text not null default '',
  call_solved_at        timestamptz,
  visit_remarks         text not null default '',
  spares_consumed       text not null default '',
  call_type             text not null default '',
  ffr_status            text not null default 'Open',  -- Open / Closed
  doc_url               text not null default '',
  extra                 jsonb not null default '{}'::jsonb,
  raised_by             uuid,
  raised_by_name        text not null default '',
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

comment on table public.field_failure_reports is
  'Field Failure Register (/failure-report). Format: Field_Failure_Register 2026 tab; report R-SER-03 Rev 02.';

create index if not exists ffr_ucn_idx     on public.field_failure_reports (ucn);
create index if not exists ffr_date_idx    on public.field_failure_reports (ffr_date desc);
create index if not exists ffr_product_idx on public.field_failure_reports (product_name);
create index if not exists ffr_status_idx  on public.field_failure_reports (ffr_status);

-- ---------------------------------------------------------------------------
-- THE NUMBER. `FFR - 001/26`, restarting each year, in Asia/Kolkata.
--
-- A counter table rather than a sequence, for the reason 0125 gives about the
-- UCN: a sequence cannot restart per year without being reset by hand, and a
-- number that silently continues across a year boundary is wrong in a way
-- nobody notices until the audit.
--
-- SEEDED FROM WHAT IS ALREADY THERE. The 2026 tab reaches FFR - 035/26, so a
-- counter starting at zero would re-issue numbers that exist on paper. The
-- counter is moved up to the highest number ON RECORD for that year before it
-- hands one out — the same guard 0097 puts on the REQID.
-- ---------------------------------------------------------------------------
create table if not exists public.ffr_counters (
  yr      smallint primary key,          -- two-digit year, e.g. 26
  last_no integer not null default 0
);
alter table public.ffr_counters enable row level security;

create or replace function public.next_ffr_no()
returns text language plpgsql security definer set search_path = public as $$
declare
  v_yr  smallint := (extract(year from (now() at time zone 'Asia/Kolkata')))::int % 100;
  v_max integer;
  v_no  integer;
begin
  -- The highest number already issued for this year, however it got there —
  -- typed in, imported from the sheet, or handed out by this function. The
  -- shape test matters: a number that is not `FFR - nnn/yy` has nothing to
  -- compare, and a substring cast on one would raise rather than skip it.
  select coalesce(max(substring(ffr_no from 'FFR\s*-\s*([0-9]+)/')::int), 0)
    into v_max
    from public.field_failure_reports
   where ffr_no ~ ('^FFR\s*-\s*[0-9]+/' || lpad(v_yr::text, 2, '0') || '$');

  insert into public.ffr_counters (yr, last_no) values (v_yr, 0)
    on conflict (yr) do nothing;

  update public.ffr_counters
     set last_no = greatest(last_no, coalesce(v_max, 0)) + 1
   where yr = v_yr
  returning last_no into v_no;

  return 'FFR - ' || lpad(v_no::text, 3, '0') || '/' || lpad(v_yr::text, 2, '0');
end $$;

revoke all on function public.next_ffr_no() from public;
grant execute on function public.next_ffr_no() to authenticated;

-- ---------------------------------------------------------------------------
-- WHO RAISED IT is the database's to say, as it is on a call (0113) and on a
-- call review. A report naming somebody who did not raise it is worse than one
-- naming nobody.
-- ---------------------------------------------------------------------------
create or replace function public.ffr_stamp()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.raised_by := coalesce(auth.uid(), new.raised_by);
    if coalesce(btrim(new.ffr_no), '') = '' then
      new.ffr_no := public.next_ffr_no();
    end if;
  else
    -- The number is the record's identity: it is issued once and never edited.
    new.ffr_no := old.ffr_no;
    new.raised_by := old.raised_by;
  end if;
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists zz_ffr_stamp on public.field_failure_reports;
create trigger zz_ffr_stamp before insert or update on public.field_failure_reports
  for each row execute function public.ffr_stamp();

-- A quality record is never deleted (0049's rule). An FFR raised in error is
-- closed with a remark, not removed.
--
-- THE TRIGGER IS NOT HERE, and that is module order rather than oversight:
-- block_hard_delete() belongs to `data_integrity`, which runs AFTER this module
-- in ALL_ORDER, so a fresh apply would fail on a function that does not exist
-- yet — check:replay caught exactly that. It is in 0166, filed there.
--
-- Deletion is already impossible for the application without it: there is no
-- DELETE policy below, so a delete as `authenticated` matches no rows. The
-- trigger is the second lock, for the day somebody adds one.

-- ---------------------------------------------------------------------------
-- RLS. Reading follows the CALL, so the reporting tree and the office roles
-- apply without being restated here. A report with no UCN (raised outside a
-- call) is visible to anyone who may see the register at all.
--
-- Every helper is wrapped as an InitPlan — once per query, not once per row.
-- That is CR-024's rule and it was worth 1,840 ms against 189 ms on
-- call_requests; a register that grows every week must not repeat it.
-- ---------------------------------------------------------------------------
alter table public.field_failure_reports enable row level security;

drop policy if exists ffr_read on public.field_failure_reports;
create policy ffr_read on public.field_failure_reports for select to authenticated
  using (
        (select public.can_view_all_calls())
     or raised_by = (select auth.uid())
     or coalesce(btrim(ucn), '') = ''
     or exists (select 1 from public.calls c where c.ucn = field_failure_reports.ucn)
  );

drop policy if exists ffr_write on public.field_failure_reports;
create policy ffr_write on public.field_failure_reports for insert to authenticated
  with check ((select public.has_perm('ffr.manage')));

drop policy if exists ffr_update on public.field_failure_reports;
create policy ffr_update on public.field_failure_reports for update to authenticated
  using ((select public.has_perm('ffr.manage')))
  with check ((select public.has_perm('ffr.manage')));

grant select, insert, update on public.field_failure_reports to authenticated;
grant usage, select on sequence public.field_failure_reports_id_seq to authenticated;

-- ---------------------------------------------------------------------------
-- THE RIGHTS. Merged, never overwritten — an administrator may have tuned the
-- role. The people who decide a failure is reportable are the ones who run the
-- Daily Call Review, so the right follows `review.edit`, plus the service
-- management roles.
-- ---------------------------------------------------------------------------
update public.app_roles
   set permissions = (
         select jsonb_agg(distinct p)
           from jsonb_array_elements(coalesce(permissions, '[]'::jsonb) || '["ffr.manage"]'::jsonb) as t(p))
 where role in ('admin', 'nsm', 'rm', 'rgm', 'hotline');

update public.app_roles
   set permissions = (
         select jsonb_agg(distinct p)
           from jsonb_array_elements(coalesce(permissions, '[]'::jsonb) || '["mod:/failure-report"]'::jsonb) as t(p))
 where role in ('admin', 'nsm', 'rm', 'rgm', 'hotline', 'technical_support', 'zoho_migration', 'engineer');
