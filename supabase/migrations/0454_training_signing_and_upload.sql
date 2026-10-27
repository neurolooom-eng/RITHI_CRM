-- ===========================================================================
-- 0454 -- TRAINING FORMS ADDED FROM THE HR DOCUMENT, SIGNED IN RITHI, AND A
-- TRACKER OF WHO HAS SAVED A SIGNATURE (the user, 2026-10-27: "No approval
-- Workflow required. I shall upload the Training Doc - Generated from HR
-- department which will carry the number and all other Plan details. This is
-- mainly at the moment used for Getting Signatures, updating the Topics,
-- Basically All Actuals updation will happen here"; "Maintain a Tracker of How
-- many users have completed this Activity of Updating their Signatures").
--
-- Settled with the user the same day:
--   * a training request is ADDED by uploading the HR document (it is the
--     R/HR/11 form): RITHI reads it and fills the plan for checking, and keeps
--     the document attached. No approval step in RITHI -- "Training Approved
--     by" is what the HR document says;
--   * EACH PERSON SIGNS THEIR OWN PART: a trainee their line, the trainer the
--     Trainer Signature box, the evaluator the Signature of Evaluator box. The
--     signature they saved (0172) is placed there, with the time, by THEIR OWN
--     act -- sign_training_request() checks that the line names the person
--     signing and refuses anybody else. Nobody can sign for somebody else, and
--     an edit cannot put a signature on a line: the guard strips any it did
--     not place itself;
--   * the tracker is for whoever may edit User Master details: per login,
--     WHETHER and WHEN a signature was saved -- never the image (0172's rule).
--
-- WHY COPYING THE SIGNATURE ONTO THE FORM IS NOT 0172's "SYSTEM THAT SIGNS ON
-- PEOPLE'S BEHALF": the copy is made only when the person presses Sign on a
-- line that names them, as them, under their own session. That is the act of
-- signing; the stored image is what they chose to sign with. Nobody else can
-- read the stored image, and nobody can place it.
-- ===========================================================================

alter table public.training_requests add column if not exists source_doc_url   text not null default '';
alter table public.training_requests add column if not exists source_doc_name  text not null default '';
alter table public.training_requests add column if not exists evaluator_name   text not null default '';
-- { signature, signed_by, signed_name, signed_at } -- placed only by sign_training_request().
alter table public.training_requests add column if not exists trainer_signed   jsonb;
alter table public.training_requests add column if not exists evaluator_signed jsonb;

-- ---- whose names the caller answers to -------------------------------------
-- The login's own name and every User Master name under the login's address:
-- a line on a form names a person by the name HR wrote, which is the User
-- Master's.
create or replace function public.my_person_names()
returns text[] language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(distinct n) filter (where n <> ''), '{}')
    from (
      select lower(btrim(coalesce(p.full_name, ''))) as n from public.profiles p where p.id = auth.uid()
      union all
      select lower(btrim(coalesce(d.name, '')))
        from public.user_directory d, public.profiles p
       where p.id = auth.uid() and coalesce(btrim(p.email), '') <> ''
         and (lower(btrim(d.email)) = lower(btrim(p.email)) or lower(btrim(d.gmail)) = lower(btrim(p.email)))
    ) x;
$$;
revoke execute on function public.my_person_names() from public, anon;
grant execute on function public.my_person_names() to authenticated;

/** Does this form name the caller -- as a trainee on a line, the trainer or the evaluator? */
create or replace function public.training_request_names_me(p_lines jsonb, p_trainer text, p_evaluator text)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare me text[] := public.my_person_names();
begin
  if cardinality(me) = 0 then return false; end if;
  return lower(btrim(coalesce(p_trainer, ''))) = any(me)
      or lower(btrim(coalesce(p_evaluator, ''))) = any(me)
      or exists (select 1 from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) e
                  where lower(btrim(coalesce(e->>'name', ''))) = any(me));
end $$;
revoke execute on function public.training_request_names_me(jsonb, text, text) from public, anon;
grant execute on function public.training_request_names_me(jsonb, text, text) to authenticated;

-- ---- an edit keeps the signatures it did not place --------------------------
-- A line keeps its signature while it still names the person who signed it;
-- a signature written by anything but sign_training_request() is removed.
create or replace function public.training_lines_keep_signatures(p_new jsonb, p_old jsonb)
returns jsonb language plpgsql immutable set search_path = public as $$
declare out jsonb := '[]'::jsonb; e jsonb; o jsonb; clean jsonb;
begin
  for e in select value from jsonb_array_elements(coalesce(p_new, '[]'::jsonb)) loop
    clean := e - 'signature' - 'signed_by' - 'signed_name' - 'signed_at';
    select value into o from jsonb_array_elements(coalesce(p_old, '[]'::jsonb))
     where lower(btrim(coalesce(value->>'name', ''))) = lower(btrim(coalesce(e->>'name', '')))
       and coalesce(value->>'signature', '') <> ''
     limit 1;
    if o is not null and lower(btrim(coalesce(e->>'name', ''))) <> '' then
      clean := clean || jsonb_build_object('signature', o->'signature', 'signed_by', o->'signed_by',
                                           'signed_name', o->'signed_name', 'signed_at', o->'signed_at');
    end if;
    out := out || jsonb_build_array(clean);
    o := null;
  end loop;
  return out;
end $$;

-- ---- the guard, restated from 0453 ------------------------------------------
-- 0453's rules, plus: an UPLOADED form (no employee request) carries the
-- approval its HR document gives, and only the training team edits it; and
-- no edit places or moves a signature.
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

drop trigger if exists training_request_guard on public.training_requests;
create trigger training_request_guard before insert or update on public.training_requests
  for each row execute function public.training_request_guard();

-- ---- signing ---------------------------------------------------------------
-- p_part: 'line' (with p_index, 0-based), 'trainer' or 'evaluator'.
create or replace function public.sign_training_request(p_id bigint, p_part text, p_index integer default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  tr    public.training_requests;
  me    text[] := public.my_person_names();
  sig   text;
  who   text;
  stamp jsonb;
  line  jsonb;
begin
  if auth.uid() is null then raise exception 'Sign in to sign.' using errcode = '42501'; end if;
  select s.signature into sig from public.user_signatures s where s.user_id = auth.uid();
  if coalesce(btrim(sig), '') = '' then
    raise exception 'Save your signature first: My Profile -> Signature.' using errcode = '23514';
  end if;
  select coalesce(nullif(btrim(p.full_name), ''), p.email) into who from public.profiles p where p.id = auth.uid();
  select * into tr from public.training_requests where id = p_id for update;
  if not found then raise exception 'No such training request.'; end if;
  stamp := jsonb_build_object('signature', sig, 'signed_by', auth.uid(), 'signed_name', who, 'signed_at', now());

  if p_part = 'line' then
    if p_index is null or p_index < 0 or p_index >= jsonb_array_length(tr.record_lines) then
      raise exception 'No such line on this training request.';
    end if;
    line := tr.record_lines -> p_index;
    if not (lower(btrim(coalesce(line->>'name', ''))) = any(me)) then
      raise exception 'This line names %, not you -- only that person can sign it.', coalesce(nullif(line->>'name', ''), 'nobody')
        using errcode = '42501';
    end if;
    if coalesce(line->>'signature', '') <> '' then raise exception 'You have already signed this line.'; end if;
    tr.record_lines := jsonb_set(tr.record_lines, array[p_index::text], line || stamp);
  elsif p_part = 'trainer' then
    if not (lower(btrim(tr.trainer_name)) = any(me)) then
      raise exception 'The trainer on this form is %, not you.', coalesce(nullif(tr.trainer_name, ''), 'not named') using errcode = '42501';
    end if;
    if tr.trainer_signed is not null then raise exception 'The trainer has already signed this form.'; end if;
    tr.trainer_signed := stamp;
  elsif p_part = 'evaluator' then
    if not (lower(btrim(tr.evaluator_name)) = any(me)) then
      raise exception 'The evaluator on this form is %, not you.', coalesce(nullif(tr.evaluator_name, ''), 'not named') using errcode = '42501';
    end if;
    if tr.evaluator_signed is not null then raise exception 'The evaluator has already signed this form.'; end if;
    tr.evaluator_signed := stamp;
  else
    raise exception 'Sign a line, the trainer box or the evaluator box.';
  end if;

  perform set_config('rithi.training_sign', 'on', true);
  update public.training_requests
     set record_lines = tr.record_lines, trainer_signed = tr.trainer_signed, evaluator_signed = tr.evaluator_signed
   where id = p_id;
  perform set_config('rithi.training_sign', '', true);
end $$;
revoke execute on function public.sign_training_request(bigint, text, integer) from public, anon;
grant execute on function public.sign_training_request(bigint, text, integer) to authenticated;

-- ---- who reads and who adds ------------------------------------------------
-- 0453's readers, and now ANYBODY THE FORM NAMES -- a trainee, the trainer,
-- the evaluator -- so they can find it and sign it.
drop policy if exists trq_read on public.training_requests;
create policy trq_read on public.training_requests for select
  using ((select public.has_perm('training.manage'))
         or (select public.has_perm('users.request.approve'))
         or exists (select 1 from public.employee_requests er
                     where er.id = training_requests.employee_request_id and er.requested_by = auth.uid())
         or public.training_request_names_me(record_lines, trainer_name, evaluator_name));

-- Added from the HR document by the training team -- never for an employee
-- request, which raises its own.
drop policy if exists trq_insert on public.training_requests;
create policy trq_insert on public.training_requests for insert
  with check ((select public.has_perm('training.manage')) and employee_request_id is null);
grant insert on public.training_requests to authenticated;

-- ---- the signature tracker -------------------------------------------------
-- Per login: whether and when a signature was saved. Never the image. For
-- whoever may edit User Master details (its parent, users.manage, grants it).
create or replace function public.signature_tracker()
returns table (user_id uuid, full_name text, email text, designation text, active boolean, has_signature boolean, signed_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not coalesce(public.has_perm('users.manage.details'), false) then
    raise exception 'The signature tracker needs "Edit User Master details" on Roles & Permissions.' using errcode = '42501';
  end if;
  return query
    select p.id, p.full_name, p.email, coalesce(p.designation, ''), coalesce(p.active, true),
           (s.user_id is not null and coalesce(btrim(s.signature), '') <> ''), s.updated_at
      from public.profiles p
      left join public.user_signatures s on s.user_id = p.id
     order by lower(coalesce(nullif(btrim(p.full_name), ''), p.email));
end $$;
revoke execute on function public.signature_tracker() from public, anon;
grant execute on function public.signature_tracker() to authenticated;
