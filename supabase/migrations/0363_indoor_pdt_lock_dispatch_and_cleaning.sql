-- ===========================================================================
-- 0363 — A SIGNED PDT IS LOCKED; THE DISPATCH DATE IS WHEN THE UNIT LEAVES;
--        A CLEANING TIME MAY BE EARLIER BUT NEVER LATER, AND NAMES WHO
--        (second re-review D-111, D-112, D-114; the user's decisions, 2026-10-04)
--
-- D-111 -- indoor_pdt_stamp() stamps the inspector on signing and nothing
-- refused a later change: measured, a second engineer changed the HV reading
-- and a check from OK to NOT OK after the first had signed, and the row still
-- named the first as the inspector -- after dispatch too.
-- THE USER'S DECISION: "Lock once signed" -- a signed PDT cannot be changed;
-- a correction needs it un-signed first, by "a new key, ticked per person":
-- indoor.pdt_unsign (an administrator holds every key; nobody else is given
-- it here). Un-signing is unsign_indoor_pdt(job, reason): the reason and who
-- go to the audit log (indoor.pdt_unsign), and only that function's ticket
-- lets a signature be withdrawn. Signing over somebody else's signature is
-- refused too: that is a change of who vouched for the test.
--
-- D-112 -- the 0323 guard stamps dispatched_at / dispatched_by when the DC
-- number is set, i.e. when the DC is ISSUED; moving the unit to Dispatched
-- later did not re-stamp, so a unit still Ready showed a dispatch date.
-- THE USER'S DECISION: the Dispatch Date is the date it is marked Dispatched.
-- They are stamped on the move into Dispatched (or straight into Closed with
-- none yet) from the session, and a unit not Dispatched or Closed carries
-- none. ONCE, the stamps the DC issue left on units still not dispatched are
-- cleared -- that one statement lifts zz_indoor_jobs_guard by name (the
-- migration has no session, and the guard would read the clearing as an
-- unauthorised dispatch) and puts it straight back.
--
-- D-114 -- the report may be uploaded only after cleaning, judged on
-- cleaned_at, which the browser sent; measured, cleaned_at = 2020-01-01 with
-- no cleaned_by was accepted. THE USER'S DECISION: "allow an earlier time"
-- (cleaning is sometimes recorded after it happened), never a future one, and
-- the database records WHO marked it -- cleaned_by is the session whatever was
-- sent. Clearing the cleaning time clears who.
--
-- ONE TRIGGER OF ITS OWN for D-112 / D-114, not another edit of
-- indoor_jobs_guard: that function is 269 lines and has been rebuilt before.
-- It is named to run AFTER zz_indoor_jobs_guard and zz_indoor_jobs_stamp
-- (zzy_ sorts between them and zzz_sys_stamp), so its stamps are the last word.
-- A connection with no session (a repair, an import) is not stopped.
-- In the indoor module, after 0391.
-- ===========================================================================

-- ---- D-111 ------------------------------------------------------------------
create or replace function public.indoor_pdt_locked_once_signed()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_stamps text[] := array['id', 'job_id', 'inspected_by', 'inspector_name', 'inspector_designation',
                           'inspected_at', 'created_by', 'created_at', 'updated_by', 'updated_at',
                           'sys_id', 'sys_created_by', 'sys_created_on', 'sys_updated_by', 'sys_updated_on'];
begin
  if auth.uid() is null then return new; end if;                -- a repair
  if old.inspected_by is null then return new; end if;           -- not signed: editable

  if new.inspected_by is null then                               -- withdrawing the signature
    if coalesce(current_setting('rithi.pdt_unsign', true), '') = 'on'
       and public.has_perm('indoor.pdt_unsign') then
      return new;
    end if;
    raise exception 'A signed Pre-Delivery Testing record is un-signed with "Un-sign", by somebody given indoor.pdt_unsign, with a reason'
      using errcode = '42501';
  end if;

  if new.inspected_by is distinct from old.inspected_by then
    raise exception 'This Pre-Delivery Testing record is already signed by % -- it is un-signed first, then signed again',
      coalesce(nullif(old.inspector_name, ''), 'the inspector') using errcode = '42501';
  end if;

  if (to_jsonb(new) - v_stamps) is distinct from (to_jsonb(old) - v_stamps) then
    raise exception 'This Pre-Delivery Testing record is signed by % and locked -- it is un-signed first (needs indoor.pdt_unsign and a reason) before anything on it changes',
      coalesce(nullif(old.inspector_name, ''), 'the inspector') using errcode = '42501';
  end if;
  return new;
end $$;
revoke execute on function public.indoor_pdt_locked_once_signed() from public, anon, authenticated;
drop trigger if exists indoor_pdt_locked_once_signed on public.indoor_pdt;
create trigger indoor_pdt_locked_once_signed
  before update on public.indoor_pdt
  for each row execute function public.indoor_pdt_locked_once_signed();

create or replace function public.unsign_indoor_pdt(p_job_id bigint, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare v_pdt public.indoor_pdt%rowtype; v_job text; v_actor text;
begin
  if not public.has_perm('indoor.pdt_unsign') then
    raise exception 'indoor.pdt_unsign is required to un-sign a Pre-Delivery Testing record' using errcode = '42501';
  end if;
  if btrim(coalesce(p_reason, '')) = '' then
    raise exception 'Say why the Pre-Delivery Testing record is un-signed' using errcode = '23514';
  end if;
  select * into v_pdt from public.indoor_pdt where job_id = p_job_id for update;
  if not found or v_pdt.inspected_by is null then
    raise exception 'That Pre-Delivery Testing record is not signed' using errcode = '23514';
  end if;
  select job_no into v_job from public.indoor_jobs where id = p_job_id;
  select coalesce(nullif(btrim(p.full_name), ''), p.email, '') into v_actor from public.profiles p where p.id = auth.uid();

  perform set_config('rithi.pdt_unsign', 'on', true);
  update public.indoor_pdt set inspected_by = null where job_id = p_job_id;
  perform set_config('rithi.pdt_unsign', 'off', true);

  insert into public.audit_log (actor, role, action, target, status, meta)
  values (coalesce(v_actor, ''), '', 'indoor.pdt_unsign', coalesce(v_job, p_job_id::text), 'ok',
          jsonb_build_object('job_id', p_job_id, 'reason', btrim(p_reason),
                             'was_signed_by', v_pdt.inspector_name, 'was_signed_at', v_pdt.inspected_at));
end $$;
revoke execute on function public.unsign_indoor_pdt(bigint, text) from public, anon;
grant execute on function public.unsign_indoor_pdt(bigint, text) to authenticated;

-- ---- D-112 / D-114 ----------------------------------------------------------
create or replace function public.indoor_dispatch_and_cleaning_stamps()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;                -- a repair, an import

  -- D-112: dispatched when it is marked Dispatched, not when its DC was issued.
  if new.status in ('Dispatched', 'Closed') then
    if new.status = 'Dispatched'
       and (tg_op = 'INSERT' or old.status is distinct from 'Dispatched')
       and (tg_op = 'INSERT' or old.status is distinct from 'Closed') then
      new.dispatched_at := now();
      new.dispatched_by := auth.uid();
    elsif new.status = 'Closed' and new.dispatched_at is null then
      new.dispatched_at := now();
      new.dispatched_by := auth.uid();
    end if;
  else
    new.dispatched_at := null;
    new.dispatched_by := null;
  end if;

  -- D-114: an earlier cleaning time is allowed, a later one is not; who is the session.
  if new.cleaned_at is distinct from (case when tg_op = 'UPDATE' then old.cleaned_at end)
     or new.cleaned_by is distinct from (case when tg_op = 'UPDATE' then old.cleaned_by end) then
    if new.cleaned_at is null then
      new.cleaned_by := null;
    else
      if new.cleaned_at > now() + interval '5 minutes' then
        raise exception 'A cleaning cannot be recorded in the future (%) -- give the time it was done',
          to_char(new.cleaned_at at time zone 'Asia/Kolkata', 'DD-Mon-YYYY HH24:MI') using errcode = '23514';
      end if;
      new.cleaned_by := auth.uid();
    end if;
  end if;
  return new;
end $$;
revoke execute on function public.indoor_dispatch_and_cleaning_stamps() from public, anon, authenticated;
drop trigger if exists zzy_indoor_dispatch_and_cleaning on public.indoor_jobs;
create trigger zzy_indoor_dispatch_and_cleaning
  before insert or update on public.indoor_jobs
  for each row execute function public.indoor_dispatch_and_cleaning_stamps();

-- ---- once: the dispatch stamps the DC issue left on units not yet dispatched --
create table if not exists public.one_time_fixes_done (
  name       text primary key,
  applied_at timestamptz not null default now(),
  detail     text
);
alter table public.one_time_fixes_done enable row level security;
revoke all on public.one_time_fixes_done from anon, authenticated;

do $$
declare n bigint;
begin
  if exists (select 1 from public.one_time_fixes_done where name = '0363_premature_dispatch_stamps_cleared') then return; end if;
  -- Lifted for this ONE statement and put straight back (the 0210 rule).
  alter table public.indoor_jobs disable trigger zz_indoor_jobs_guard;
  update public.indoor_jobs
     set dispatched_at = null, dispatched_by = null
   where status not in ('Dispatched', 'Closed')
     and (dispatched_at is not null or dispatched_by is not null);
  get diagnostics n = row_count;
  alter table public.indoor_jobs enable trigger zz_indoor_jobs_guard;
  insert into public.one_time_fixes_done (name, detail)
  values ('0363_premature_dispatch_stamps_cleared', n || ' unit(s) not yet dispatched had the DC issue''s dispatch stamp cleared');
  raise notice '0363: % unit(s) not yet dispatched had the DC issue''s dispatch stamp cleared', n;
end $$;
