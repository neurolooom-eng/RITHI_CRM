-- ===========================================================================
-- CHANGING WHO A SPARE REQUEST IS FOR — until it is dispatched, and logged.
--
-- A request is raised against an engineer and everything downstream follows
-- that name: the approvals, the DC, and — once the parts go out — the engineer's
-- HAND STOCK, which is derived from the request rather than stored. So the name
-- can be corrected while the request is still paper, and must not be touched
-- once it is stock.
--
-- THE LINE IS DISPATCH, and it is drawn wide on purpose: a request counts as
-- dispatched if IT says so, if ANY of its lines says so, or if a dispatch line
-- points at one of its lines. Any one of those means parts have moved, and
-- moving the name afterwards would move somebody else's stock — silently, since
-- hand stock is a derivation and would simply come out different next time it
-- was read.
--
-- THE LOG IS A TABLE, NOT AN AUDIT LINE. The audit log is a general record of
-- actions; this is the answer to "who was this raised for, and who changed it" —
-- a question about the REQUEST, asked from the request. It keeps both names and
-- both addresses, so a row still reads correctly after either person is renamed
-- or leaves.
--
-- The guard is a TRIGGER, not a rule in the client. The client can only ask
-- nicely; PostgREST will happily take an `update` on the table from anyone whose
-- policy allows it, and the import path writes to the same table.
-- ===========================================================================

create table if not exists public.spare_request_engineer_log (
  id              bigint generated always as identity primary key,
  request_uid     text not null references public.spare_requests (uid) on delete cascade,
  or_no           text default '',
  from_engineer   text default '',
  from_email      text default '',
  to_engineer     text default '',
  to_email        text default '',
  reason          text default '',
  changed_at      timestamptz not null default now(),
  changed_by      uuid,
  changed_by_name text default ''
);
create index if not exists spare_request_engineer_log_uid_idx
  on public.spare_request_engineer_log (request_uid, changed_at desc);

alter table public.spare_request_engineer_log enable row level security;
grant select on public.spare_request_engineer_log to authenticated;

-- Who may READ it: an administrator, whoever can approve or dispatch spares,
-- and the two engineers the row is about. A reassignment is not a secret from
-- the person it moved a request away from.
drop policy if exists srel_read on public.spare_request_engineer_log;
create policy srel_read on public.spare_request_engineer_log for select using (
  (select public.is_admin())
  or (select public.has_perm('spare.dispatch'))
  or (select public.has_perm('spare.approve'))
  or lower(from_email) = lower((select auth.email()))
  or lower(to_email)   = lower((select auth.email()))
);
-- Nobody WRITES it directly. The row is written by the function that makes the
-- change, so a log entry cannot exist without the change or the change without
-- the entry.

-- ---------------------------------------------------------------------------
-- Has anything actually gone out against this request?
-- ---------------------------------------------------------------------------
create or replace function public.spare_request_is_dispatched(p_uid text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.spare_requests r
                  where r.uid = p_uid
                    and (r.dispatched_at is not null
                         or coalesce(r.stores_status, '') ~* 'dispatch'))
      or exists (select 1 from public.spare_request_lines l
                  where l.request_uid = p_uid
                    and (l.dispatched_at is not null
                         or coalesce(l.dispatched_qty, 0) > 0
                         or coalesce(l.stores_status, '') ~* 'dispatch'))
      or exists (select 1 from public.spare_dispatch_lines dl
                   join public.spare_request_lines l on l.id = dl.line_id
                  where l.request_uid = p_uid);
$$;
grant execute on function public.spare_request_is_dispatched(text) to authenticated;

-- ---------------------------------------------------------------------------
-- The change itself. One function, so the check, the write and the log cannot
-- come apart.
-- ---------------------------------------------------------------------------
create or replace function public.reassign_spare_request(
  p_uid text, p_engineer text, p_email text default '', p_reason text default ''
) returns public.spare_requests language plpgsql security definer set search_path = public as $$
declare
  r      public.spare_requests;
  v_name text := coalesce((select full_name from public.profiles where id = auth.uid()), '');
  v_to   text := btrim(coalesce(p_engineer, ''));
  v_mail text := lower(btrim(coalesce(p_email, '')));
begin
  if not public.is_admin() then
    raise exception 'Changing the engineer on a spare request is an administrator''s to do';
  end if;
  if v_to = '' then
    raise exception 'Give the engineer the request is being moved to';
  end if;

  select * into r from public.spare_requests where uid = p_uid;
  if not found then
    raise exception 'No spare request %', p_uid;
  end if;
  if public.spare_request_is_dispatched(p_uid) then
    raise exception 'OR % has already been dispatched — the parts are in %''s hands, so the engineer cannot be changed. Use a stock transfer instead.',
      coalesce(nullif(r.or_no, ''), p_uid), coalesce(nullif(r.engineer, ''), 'the engineer');
  end if;
  if lower(btrim(coalesce(r.engineer, ''))) = lower(v_to)
     and (v_mail = '' or lower(coalesce(r.engineer_email, '')) = v_mail) then
    return r;                       -- already there; nothing to log
  end if;

  -- The address is looked up when it is not given, so the request keeps a
  -- working one: every engineer-scoped read matches on email, and a name with
  -- the wrong address beside it is a request its own engineer cannot see.
  if v_mail = '' then
    v_mail := lower(coalesce((select email from public.profiles
                               where lower(full_name) = lower(v_to)
                               order by id limit 1), ''));
  end if;

  -- Tell the guard trigger that this update is the one it is meant to allow.
  -- `true` scopes it to this transaction, so it cannot leak into the next.
  perform set_config('rithi.reassigning', p_uid, true);

  insert into public.spare_request_engineer_log
    (request_uid, or_no, from_engineer, from_email, to_engineer, to_email, reason, changed_by, changed_by_name)
  values (p_uid, coalesce(r.or_no, ''), coalesce(r.engineer, ''), coalesce(r.engineer_email, ''),
          v_to, v_mail, btrim(coalesce(p_reason, '')), auth.uid(), v_name);

  update public.spare_requests
     set engineer = v_to, engineer_email = v_mail
   where uid = p_uid
  returning * into r;

  perform set_config('rithi.reassigning', '', true);
  return r;
end $$;
revoke all on function public.reassign_spare_request(text, text, text, text) from public;
grant execute on function public.reassign_spare_request(text, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- And the invariant where it cannot be gone round: on the table.
--
-- THE TRIGGER ENFORCES ONE RULE ONLY — not after dispatch. That is the rule
-- that protects the numbers: hand stock is DERIVED from the request, so moving
-- the name after the parts have gone out does not just mis-label a record, it
-- moves stock from one engineer's balance to another's, silently, the next time
-- anybody reads it.
--
-- WHO may change it before dispatch is a permission question, and it is answered
-- by `reassign_spare_request` (administrators) and by the table's own policies.
-- Putting the admin test in the trigger as well would block the BULK UPLOAD,
-- which writes the engineer named in the file and is not run by an administrator
-- as a matter of course.
--
-- A load that tries to change the engineer on an ALREADY DISPATCHED request is
-- refused, and that is right: it means the file disagrees with the register
-- about who is holding parts that have already gone out. That should stop and
-- be looked at, not be applied quietly.
-- ---------------------------------------------------------------------------
create or replace function public.spare_request_engineer_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if lower(btrim(coalesce(new.engineer, ''))) is not distinct from lower(btrim(coalesce(old.engineer, '')))
     and lower(btrim(coalesce(new.engineer_email, ''))) is not distinct from lower(btrim(coalesce(old.engineer_email, ''))) then
    return new;                                    -- the engineer is not changing
  end if;
  if coalesce(current_setting('rithi.reassigning', true), '') = new.uid then
    return new;                                    -- this is the function's own write
  end if;
  if public.spare_request_is_dispatched(new.uid) then
    raise exception 'OR % has already been dispatched — the engineer cannot be changed once the parts have gone out.',
      coalesce(nullif(new.or_no, ''), new.uid);
  end if;
  return new;
end $$;

drop trigger if exists spare_request_engineer_guard on public.spare_requests;
create trigger spare_request_engineer_guard before update on public.spare_requests
  for each row execute function public.spare_request_engineer_guard();
