-- ===========================================================================
-- 0411 — A RE-OPEN RECORDS ITS REASON, ITS PERSON AND ITS TIME
--        (second re-review D-035, FRS-133.4, FRS-120.9)
--
-- reopen_call(p_ucn, p_reason) accepted a reason and wrote only reopened_at and
-- reopen_count: the reason was stored nowhere and no person was recorded,
-- while the Call Review tells the reviewer "the reason goes on the call"
-- (FRS-064). And it accepted an empty reason, which FRS-120.9 refuses.
--
-- public.call_reopens keeps one row per re-open -- the UCN, when, who (the
-- session, by id and name) and why -- so a call re-opened twice keeps both.
-- A history table rather than columns on the three call tables: a second
-- re-open would overwrite the first reason in a column, and the calls view is
-- a `t.*` view mirrored in 0245 that new columns would not reach.
-- It is written only by reopen_call() (no insert, update or delete policy),
-- and read by whoever may see the call.
--
-- reopen_call() is 0341's body unchanged, plus: an empty reason is refused,
-- and the row above is written. In the call_requests module, after 0341 and
-- before the cr_read tail.
-- ===========================================================================

create table if not exists public.call_reopens (
  id               bigint generated always as identity primary key,
  ucn              text not null,
  reopened_at      timestamptz not null default now(),
  reopened_by      uuid,
  reopened_by_name text not null default '',
  reason           text not null,
  created_at       timestamptz not null default now(),
  created_by       uuid
);
create index if not exists call_reopens_ucn_idx on public.call_reopens (ucn, reopened_at desc);
alter table public.call_reopens enable row level security;
revoke all on public.call_reopens from anon;
grant select on public.call_reopens to authenticated;
drop policy if exists call_reopens_read on public.call_reopens;
-- "May this person see the call" is asked of the calls view itself: it is
-- security_invoker, so the caller's own call policies decide, exactly as on
-- every register (call_visible_to_me() is not executable by a signed-in user).
create policy call_reopens_read on public.call_reopens for select
  using (exists (select 1 from public.calls c where c.ucn = call_reopens.ucn));

do $$
begin
  if to_regprocedure('public.sys_columns_attach(regclass)') is not null then
    perform public.sys_columns_attach('public.call_reopens'::regclass);
  end if;
end $$;

create or replace function public.reopen_call(p_ucn text, p_reason text default '')
returns text language plpgsql security definer set search_path = public as $$
declare v_solved boolean; v_reopened timestamptz;
begin
  if not public.call_perm(p_ucn, 'reopen') then
    raise exception 'RBAC: your role cannot re-open a call';
  end if;
  -- 0333 (D-128): and only on a call the caller can see -- the read rule, so
  -- every call a screen shows passes and a call outside it is refused.
  if public.call_visible_to_me(p_ucn) is false then
    raise exception 'Call % is not one of yours to change', p_ucn using errcode = '42501';
  end if;
  -- 0411 (D-035, FRS-120.9): a re-open says why.
  if btrim(coalesce(p_reason, '')) = '' then
    raise exception 'Give the reason for re-opening call %', p_ucn using errcode = '23514';
  end if;

  select open_state = 'Solved', reopened_at into v_solved, v_reopened
    from public.calls where ucn = p_ucn;
  if v_solved is null then raise exception 'No call with UCN %', p_ucn; end if;
  if v_reopened is not null then raise exception 'Call % is already re-opened', p_ucn; end if;
  if not v_solved then raise exception 'Call % is not closed, so there is nothing to re-open', p_ucn; end if;

  update public.calls
     set reopened_at = now(), reopen_count = coalesce(reopen_count, 0) + 1
   where ucn = p_ucn;

  -- 0411 (D-035, FRS-133.4): the reason, the person and the time, kept.
  insert into public.call_reopens (ucn, reopened_at, reopened_by, reopened_by_name, reason, created_by)
  values (p_ucn, now(), auth.uid(), coalesce(public.my_display_name(), auth.email(), ''), btrim(p_reason), auth.uid());

  return p_ucn;
end $$;
