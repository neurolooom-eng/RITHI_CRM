-- ===========================================================================
-- 0174 — EVERY CHANGE TO A FIELD FAILURE REPORT IS RECORDED.
--
-- The user, 2026-09-12: "And where is the FFR update? I need to be able to
-- capture everytime it is updated - For log keeping."
--
-- The FFR is reviewed WEEKLY and edited each time — the observation grows, the
-- problem status is written, a CAPA is opened and later closed, the report is
-- closed or cancelled. Today the register holds only the CURRENT state, so the
-- question a weekly cycle actually asks — what changed since last week, and who
-- changed it — has no answer anywhere.
--
-- IN THE DATABASE, NOT THE CLIENT, and that is the whole point of doing it here
-- rather than adding another logAudit() call. The application's audit trail is
-- client-written, so it records what the screen chose to tell it and nothing
-- about an edit made straight through the API (this is stated plainly in the
-- validation package, FRS-021). A change history for a quality record that a
-- caller can decline to write is not a change history. This trigger sees every
-- UPDATE by every path.
--
-- ONE ROW PER UPDATE, not per field. An edit is one act by one person at one
-- moment; splitting it across six rows makes "what did she change on Tuesday"
-- a reassembly job. The fields are held in `changes` as
-- {"column": {"from": …, "to": …}} — only the columns that actually differ.
--
-- AND AN UPDATE THAT CHANGES NOTHING WRITES NOTHING. Re-saving a form without
-- touching it is not an event, and a log full of them is a log nobody reads.
--
-- APPEND-ONLY. No update policy and no delete policy exist, so the history
-- cannot be edited or tidied by anyone through the API — the record of what a
-- record used to say is itself a quality record (0049's rule).
-- ===========================================================================

create table if not exists public.ffr_history (
  id            bigserial primary key,
  ffr_id        bigint      not null references public.field_failure_reports (id) on delete cascade,
  -- The NUMBER as well as the id: the id is an implementation detail, and the
  -- number is what a person reading the log recognises.
  ffr_no        text        not null default '',
  changed_at    timestamptz not null default now(),
  changed_by    uuid        references auth.users (id),
  changed_by_name text      not null default '',
  -- 'update' today; 'create' marks the row the report was raised with, so the
  -- history starts at the beginning rather than at the first edit.
  action        text        not null default 'update',
  changes       jsonb       not null default '{}'::jsonb
);

create index if not exists ffr_history_ffr_idx  on public.ffr_history (ffr_id, changed_at desc);
create index if not exists ffr_history_when_idx on public.ffr_history (changed_at desc);

alter table public.ffr_history enable row level security;

-- WHOEVER MAY READ THE REGISTER MAY READ ITS HISTORY. Anything narrower would
-- mean a report somebody can see whose changes they cannot — which is the
-- question the log exists to answer.
drop policy if exists ffrh_read on public.ffr_history;
create policy ffrh_read on public.ffr_history for select to authenticated
  using ((select public.has_perm('ffr.manage')) or (select public.is_admin()));

-- NO insert policy: the trigger is SECURITY DEFINER and writes as the owner, so
-- a client cannot forge an entry even with the grant below.
-- NO update or delete policy: append-only, by omission rather than by promise.
grant select on public.ffr_history to authenticated;

-- ---------------------------------------------------------------------------
-- WHAT CHANGED. Columns compared as text, which is what the log displays and
-- what makes '2026-09-12' and a date the same thing to a reader.
--
-- The bookkeeping columns are SKIPPED: updated_at moves on every write, and a
-- log whose every entry says "updated_at changed" buries the one that says the
-- CAPA was closed.
-- ---------------------------------------------------------------------------
create or replace function public.ffr_history_write()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_old  jsonb := to_jsonb(old);
  v_new  jsonb := to_jsonb(new);
  v_diff jsonb := '{}'::jsonb;
  k      text;
  v_name text;
  -- Not worth an entry: set by the database on every write, or never changed.
  skip   text[] := array['updated_at', 'id', 'ffr_no', 'raised_by', 'created_at'];
begin
  for k in select jsonb_object_keys(v_new) loop
    if k = any (skip) then continue; end if;
    if v_new -> k is distinct from v_old -> k then
      v_diff := v_diff || jsonb_build_object(k, jsonb_build_object('from', v_old -> k, 'to', v_new -> k));
    end if;
  end loop;

  -- Nothing actually changed: re-saving a form untouched is not an event.
  if v_diff = '{}'::jsonb then return null; end if;

  select coalesce(nullif(btrim(d.name), ''), nullif(btrim(p.full_name), ''), p.email)
    into v_name
    from public.profiles p
    left join public.user_directory d
      on lower(btrim(d.email)) = lower(btrim(p.email))
      or lower(btrim(d.gmail)) = lower(btrim(p.email))
   where p.id = auth.uid();

  insert into public.ffr_history (ffr_id, ffr_no, changed_by, changed_by_name, action, changes)
  values (new.id, coalesce(new.ffr_no, ''), auth.uid(), coalesce(v_name, ''), 'update', v_diff);

  return null;
end $$;

drop trigger if exists zz_ffr_history on public.field_failure_reports;
create trigger zz_ffr_history after update on public.field_failure_reports
  for each row execute function public.ffr_history_write();

-- ---------------------------------------------------------------------------
-- THE FIRST ENTRY. A history that begins at the first EDIT cannot say when the
-- report came into being or who raised it, which is the one entry every other
-- one is read against.
-- ---------------------------------------------------------------------------
create or replace function public.ffr_history_created()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.ffr_history (ffr_id, ffr_no, changed_by, changed_by_name, action, changes)
  values (new.id, coalesce(new.ffr_no, ''), new.raised_by, coalesce(new.raised_by_name, ''), 'create',
          jsonb_build_object('ffr_date', jsonb_build_object('from', null, 'to', new.ffr_date),
                             'ucn',      jsonb_build_object('from', null, 'to', new.ucn)));
  return null;
end $$;

drop trigger if exists zz_ffr_history_created on public.field_failure_reports;
create trigger zz_ffr_history_created after insert on public.field_failure_reports
  for each row execute function public.ffr_history_created();

-- ---------------------------------------------------------------------------
-- THE REPORTS THAT ALREADY EXIST get their 'create' entry, so every report on
-- the register has a history that starts somewhere. Idempotent: a report that
-- already has one is skipped, so this file can be re-run.
-- ---------------------------------------------------------------------------
insert into public.ffr_history (ffr_id, ffr_no, changed_at, changed_by, changed_by_name, action, changes)
select f.id, coalesce(f.ffr_no, ''),
       coalesce(f.ffr_date::timestamptz, f.updated_at, now()),
       f.raised_by, coalesce(f.raised_by_name, ''), 'create',
       jsonb_build_object('ffr_date', jsonb_build_object('from', null, 'to', f.ffr_date),
                          'ucn',      jsonb_build_object('from', null, 'to', f.ucn))
  from public.field_failure_reports f
 where not exists (select 1 from public.ffr_history h where h.ffr_id = f.id and h.action = 'create');

-- ---------------------------------------------------------------------------
-- THE RETENTION PURGE MUST NOT REACH IT. 0166 blocks deletion of a field
-- failure report; its history is the same record seen over time, and a log that
-- can be purged while the record it describes cannot is a gap with no reason
-- for being there.
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regprocedure('public.block_hard_delete()') is not null then
    execute 'drop trigger if exists zz_no_delete on public.ffr_history';
    execute 'create trigger zz_no_delete before delete on public.ffr_history
               for each row execute function public.block_hard_delete()';
  else
    raise notice 'block_hard_delete() is not present yet — ffr_history is unprotected until data_integrity.sql runs.';
  end if;
end $$;
