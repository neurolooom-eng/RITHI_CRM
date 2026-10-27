-- ===========================================================================
-- 0458 -- ON A TRAINING FORM FROM HR ONLY THE RECORD IS FILLED IN, AND THE
-- CONTENT OF TRAINING COMES FROM THE PERSON'S DESIGNATION (the user,
-- 2026-10-27, with "101_2026 Service": "I want to be able to Fill the Record
-- Section - Names, Content of Training. None of the Other Parts should be
-- editable ... For Content of Training - it has to be Mapped per Role. Like
-- Reporting Manager gets few additional things, Engineer get few things,
-- Hotline engineer gets few things like that").
--
-- Asked and settled the same day:
--   * the RECORD SECTION stays editable -- training from / to, each employee's
--     name, content and status; the PLAN and the EVALUATION are locked, being
--     what HR's document says. That is enforced here, not only on the screen:
--     after a form added from the HR document is saved, an edit keeps every
--     plan and evaluation column as it was. Signing (0454) is unchanged.
--     A form raised by a New Employee Request keeps 0453's rules.
--   * "per role" is the User Master DESIGNATION, and the topics for each are
--     "a list I fill on screen": public.training_content_by_designation, kept
--     by whoever may manage training. RITHI fills a person's Content of
--     training from it when they are added to the Record; nothing is invented
--     -- a designation with no list gives an empty content to type.
-- ===========================================================================

-- ---- 1. the content of training, per designation ----------------------------
create table if not exists public.training_content_by_designation (
  id              bigint generated always as identity primary key,
  designation     text not null,
  designation_key text generated always as (lower(btrim(designation))) stored,
  content         text not null default '',
  updated_at      timestamptz not null default now(),
  constraint training_content_designation_key unique (designation_key)
);
comment on table public.training_content_by_designation is
  'The Content of training each User Master designation gets on a Training Form''s Record (0458), typed by whoever may manage training.';
alter table public.training_content_by_designation enable row level security;

drop policy if exists tcd_read on public.training_content_by_designation;
create policy tcd_read on public.training_content_by_designation for select to authenticated
  using ((select public.has_perm('training.manage')));
drop policy if exists tcd_insert on public.training_content_by_designation;
create policy tcd_insert on public.training_content_by_designation for insert to authenticated
  with check ((select public.has_perm('training.manage')));
drop policy if exists tcd_update on public.training_content_by_designation;
create policy tcd_update on public.training_content_by_designation for update to authenticated
  using ((select public.has_perm('training.manage'))) with check ((select public.has_perm('training.manage')));
drop policy if exists tcd_delete on public.training_content_by_designation;
create policy tcd_delete on public.training_content_by_designation for delete to authenticated
  using ((select public.has_perm('training.manage')));
grant select, insert, update, delete on public.training_content_by_designation to authenticated;

create or replace function public.training_content_stamp()
returns trigger language plpgsql set search_path = public as $$
begin
  new.designation := btrim(coalesce(new.designation, ''));
  new.updated_at := now();
  return new;
end $$;
revoke execute on function public.training_content_stamp() from public, anon, authenticated;
drop trigger if exists training_content_stamp on public.training_content_by_designation;
create trigger training_content_stamp before insert or update on public.training_content_by_designation
  for each row execute function public.training_content_stamp();

do $$ begin
  if to_regprocedure('public.sys_columns_attach(regclass)') is not null then
    perform public.sys_columns_attach('public.training_content_by_designation'::regclass);
  end if;
end $$;

-- ---- 2. the guard, restated from 0454: the plan and evaluation are locked ----
create or replace function public.training_request_guard()
returns trigger language plpgsql set search_path = public as $$
declare signing boolean := coalesce(current_setting('rithi.training_sign', true), '') = 'on';
begin
  if tg_op = 'UPDATE' then
    if old.employee_request_id is not null and coalesce(current_setting('rithi.training_decision', true), '') <> 'on' then
      new.approval := old.approval;
      new.approved_by_name := old.approved_by_name;
      new.approved_at := old.approved_at;
      new.not_approved_reason := old.not_approved_reason;
    end if;
    -- A FORM FROM THE HR DOCUMENT (0458): only the RECORD is filled in here --
    -- training from / to and the record lines. The plan and the evaluation are
    -- the document's, and stay as they were saved.
    if old.employee_request_id is null then
      new.req_no                   := old.req_no;
      new.req_date                 := old.req_date;
      new.trainee_name             := old.trainee_name;
      new.designation              := old.designation;
      new.manager_name             := old.manager_name;
      new.topic                    := old.topic;
      new.trainer_name             := old.trainer_name;
      new.trainer_designation      := old.trainer_designation;
      new.risk                     := old.risk;
      new.approval                 := old.approval;
      new.approved_by_name         := old.approved_by_name;
      new.approved_at              := old.approved_at;
      new.not_approved_reason      := old.not_approved_reason;
      new.evaluation_required      := old.evaluation_required;
      new.evaluation_justification := old.evaluation_justification;
      new.evaluation_method        := old.evaluation_method;
      new.evaluation_plan          := old.evaluation_plan;
      new.reassessment             := old.reassessment;
      new.remarks                  := old.remarks;
      new.evaluator_name           := old.evaluator_name;
      new.source_doc_url           := old.source_doc_url;
      new.source_doc_name          := old.source_doc_name;
    end if;
    new.employee_request_id := old.employee_request_id;
    new.created_by := old.created_by;
    new.created_at := old.created_at;
  end if;
  if not signing then
    new.trainer_signed := case when tg_op = 'UPDATE'
      and lower(btrim(coalesce(new.trainer_name, ''))) = lower(btrim(coalesce(old.trainer_name, ''))) then old.trainer_signed end;
    new.evaluator_signed := case when tg_op = 'UPDATE'
      and lower(btrim(coalesce(new.evaluator_name, ''))) = lower(btrim(coalesce(old.evaluator_name, ''))) then old.evaluator_signed end;
    new.record_lines := public.training_lines_keep_signatures(new.record_lines,
      case when tg_op = 'UPDATE' then old.record_lines else '[]'::jsonb end);
  end if;
  new.req_no := btrim(coalesce(new.req_no, ''));
  new.updated_at := now();
  return new;
end $$;
revoke execute on function public.training_request_guard() from public, anon, authenticated;
