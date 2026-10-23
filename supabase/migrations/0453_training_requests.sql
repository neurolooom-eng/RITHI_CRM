-- ===========================================================================
-- 0453 -- A NEW EMPLOYEE REQUEST RAISES A TRAINING REQUEST (TRAINING FORM
-- R/HR/11) (the user, 2026-10-21: "When the Reporting Manager or Regional
-- Manager requests for User then it should also trigger a training request. I
-- shall share the format"; the format shared 2026-10-23, "102_2026 Service").
--
-- Settled with the user the same day:
--   * the REQUESTER fills the plan -- Training Topic, Trainer name and
--     designation, the Risk (Low / Medium / High) -- on the New Employee
--     Request; Trainee Name, Designation and Manager Name come from the
--     request itself;
--   * "Training Approved by" is the request's own approver, and "If No Reason"
--     the reason a request is rejected with;
--   * all three parts of the form are kept: PLAN, RECORD (training from / to,
--     the employees with the content and status) and EVALUATION (required or
--     not, the justification, the method, the evaluation plan with evaluator,
--     planned date, status / actual date and rating, re-assessment, remarks);
--   * the Training Request No. is RAISED ELSEWHERE and typed in by hand
--     ("It is Raised Elsewhere, So i will give the Number myself") -- RITHI
--     numbers nothing;
--   * the form prints as R/HR/11, "TRAINING FORM", Rev NOV 2021.
--
-- WHAT THE FORM'S RISK MEANS FOR METHOD is the template's own table, kept
-- here once: LOW RISK Classroom; MEDIUM RISK Classroom + Practical; HIGH RISK
-- Classroom + On Job (1month).
--
-- Who reads a training request: whoever may manage training, whoever may
-- approve new-employee requests, and the manager who asked for the person.
-- Who edits it: whoever may manage training -- except the approval, which
-- only the decision on the employee request writes. Nothing is deleted.
-- ===========================================================================

-- ---- what the requester gives for the plan ---------------------------------
alter table public.employee_requests add column if not exists training_topic      text not null default '';
alter table public.employee_requests add column if not exists trainer_name        text not null default '';
alter table public.employee_requests add column if not exists trainer_designation text not null default '';
alter table public.employee_requests add column if not exists training_risk       text not null default '';

-- A request raised from now on carries its training plan. Requests already
-- raised before this migration have none and raise no training request.
create or replace function public.employee_request_training_check()
returns trigger language plpgsql set search_path = public as $$
begin
  new.training_topic := btrim(coalesce(new.training_topic, ''));
  new.trainer_name := btrim(coalesce(new.trainer_name, ''));
  new.trainer_designation := btrim(coalesce(new.trainer_designation, ''));
  new.training_risk := initcap(btrim(coalesce(new.training_risk, '')));
  if new.training_topic = '' then
    raise exception 'Enter the Training Topic -- the new employee''s training request is raised with this one.' using errcode = '23514';
  end if;
  if new.trainer_name = '' then
    raise exception 'Enter the Trainer name for the training request.' using errcode = '23514';
  end if;
  if new.training_risk not in ('Low', 'Medium', 'High') then
    raise exception 'Choose the training''s Risk: Low, Medium or High.' using errcode = '23514';
  end if;
  return new;
end $$;
revoke execute on function public.employee_request_training_check() from public, anon, authenticated;

drop trigger if exists employee_request_training_check on public.employee_requests;
create trigger employee_request_training_check before insert on public.employee_requests
  for each row execute function public.employee_request_training_check();

-- ---- the training request ---------------------------------------------------
create table if not exists public.training_requests (
  id                       bigint generated always as identity primary key,
  employee_request_id      bigint unique references public.employee_requests (id),
  -- PLAN
  req_no                   text not null default '',     -- raised elsewhere; typed in by hand
  req_date                 date not null default ((now() at time zone 'Asia/Kolkata')::date),
  trainee_name             text not null default '',
  designation              text not null default '',
  manager_name             text not null default '',
  topic                    text not null default '',
  trainer_name             text not null default '',
  trainer_designation      text not null default '',
  risk                     text not null default 'Low' check (risk in ('Low', 'Medium', 'High')),
  approval                 text not null default 'Pending' check (approval in ('Pending', 'Approved', 'Not approved')),
  approved_by_name         text not null default '',
  approved_at              timestamptz,
  not_approved_reason      text not null default '',
  -- RECORD
  from_date                date,
  to_date                  date,
  -- [{ name, content, status }] -- one line per employee trained.
  record_lines             jsonb not null default '[]'::jsonb,
  -- EVALUATION
  evaluation_required      boolean,
  evaluation_justification text not null default '',
  evaluation_method        text not null default '',
  -- [{ plan, evaluator, planned_date, actual, rating }]
  evaluation_plan          jsonb not null default '[]'::jsonb,
  reassessment             text not null default '' check (reassessment in ('', 'Yes', 'No')),
  remarks                  text not null default '',
  created_by               uuid default auth.uid(),
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  constraint training_requests_record_array check (jsonb_typeof(record_lines) = 'array'),
  constraint training_requests_plan_array check (jsonb_typeof(evaluation_plan) = 'array'),
  constraint training_requests_dates check (to_date is null or from_date is null or to_date >= from_date)
);

comment on table public.training_requests is
  'Training Form R/HR/11 (0453): PLAN, RECORD and EVALUATION of the training a new employee is to get, raised with the New Employee Request that asks for them. The Request No. is raised elsewhere and typed in.';

create index if not exists training_requests_created_idx on public.training_requests (created_at desc, id desc);

-- The template's own table: what each risk is trained by.
create or replace function public.training_methodology(p_risk text)
returns text language sql immutable set search_path = public as $$
  select case lower(btrim(coalesce(p_risk, '')))
    when 'low' then 'Classroom'
    when 'medium' then 'Classroom + Practical'
    when 'high' then 'Classroom + On Job (1month)'
    else '' end;
$$;

-- ---- raised with the employee request ---------------------------------------
create or replace function public.employee_request_raise_training()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.training_requests
    (employee_request_id, req_date, trainee_name, designation, manager_name, topic, trainer_name,
     trainer_designation, risk, record_lines, created_by)
  values
    (new.id, (new.created_at at time zone 'Asia/Kolkata')::date, new.name, new.designation, new.reporting_manager,
     new.training_topic, new.trainer_name, new.trainer_designation, new.training_risk,
     jsonb_build_array(jsonb_build_object('name', new.name, 'content', new.training_topic, 'status', '')),
     new.requested_by)
  on conflict (employee_request_id) do nothing;
  return null;
end $$;
revoke execute on function public.employee_request_raise_training() from public, anon, authenticated;

drop trigger if exists zz_employee_request_raise_training on public.employee_requests;
create trigger zz_employee_request_raise_training after insert on public.employee_requests
  for each row execute function public.employee_request_raise_training();

-- ---- the decision on the employee request is the training's approval -------
create or replace function public.employee_request_training_decision()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status is not distinct from old.status or new.status = 'Pending' then return null; end if;
  perform set_config('rithi.training_decision', 'on', true);
  update public.training_requests
     set approval = case when new.status = 'Approved' then 'Approved' else 'Not approved' end,
         approved_by_name = new.decided_by_name,
         approved_at = new.decided_at,
         not_approved_reason = case when new.status = 'Rejected' then new.reject_reason else '' end,
         -- The trainee as approved: the approver may have corrected the name
         -- or the designation.
         trainee_name = coalesce(nullif(btrim(new.approved_data->>'name'), ''), trainee_name),
         designation = coalesce(nullif(btrim(new.approved_data->>'designation'), ''), designation)
   where employee_request_id = new.id;
  perform set_config('rithi.training_decision', '', true);
  return null;
end $$;
revoke execute on function public.employee_request_training_decision() from public, anon, authenticated;

drop trigger if exists zz_employee_request_training_decision on public.employee_requests;
create trigger zz_employee_request_training_decision after update of status on public.employee_requests
  for each row execute function public.employee_request_training_decision();

-- ---- what an edit may not change -------------------------------------------
-- The approval and the link to the request are the decision's alone; any
-- value an edit sends for them is DISCARDED (the 0113/0114 rule).
create or replace function public.training_request_guard()
returns trigger language plpgsql set search_path = public as $$
begin
  if coalesce(current_setting('rithi.training_decision', true), '') <> 'on' then
    new.approval := old.approval;
    new.approved_by_name := old.approved_by_name;
    new.approved_at := old.approved_at;
    new.not_approved_reason := old.not_approved_reason;
  end if;
  new.employee_request_id := old.employee_request_id;
  new.created_by := old.created_by;
  new.created_at := old.created_at;
  new.req_no := btrim(coalesce(new.req_no, ''));
  new.updated_at := now();
  return new;
end $$;
revoke execute on function public.training_request_guard() from public, anon, authenticated;

drop trigger if exists training_request_guard on public.training_requests;
create trigger training_request_guard before update on public.training_requests
  for each row execute function public.training_request_guard();

-- ---- row-level security -----------------------------------------------------
alter table public.training_requests enable row level security;

drop policy if exists trq_read on public.training_requests;
create policy trq_read on public.training_requests for select
  using ((select public.has_perm('training.manage'))
         or (select public.has_perm('users.request.approve'))
         or exists (select 1 from public.employee_requests er
                     where er.id = training_requests.employee_request_id and er.requested_by = auth.uid()));

drop policy if exists trq_update on public.training_requests;
create policy trq_update on public.training_requests for update
  using ((select public.has_perm('training.manage')))
  with check ((select public.has_perm('training.manage')));

-- No INSERT policy: a training request is raised only with its employee
-- request. No DELETE: a quality record is never deleted (block_hard_delete).
revoke all on public.training_requests from anon, authenticated;
grant select, update on public.training_requests to authenticated;

do $$
begin
  if to_regprocedure('public.block_hard_delete()') is not null then
    execute 'drop trigger if exists no_hard_delete on public.training_requests';
    execute 'create trigger no_hard_delete before delete on public.training_requests
               for each row execute function public.block_hard_delete()';
  end if;
  if to_regprocedure('public.sys_columns_attach(regclass)') is not null then
    perform public.sys_columns_attach('public.training_requests'::regclass);
  end if;
end $$;
