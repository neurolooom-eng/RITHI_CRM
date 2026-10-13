-- ===========================================================================
-- 0429 -- CALL HISTORY: THE CALLS BEFORE RITHI, KEPT APART (the user,
-- 2026-10-13: "I want to upload calls from 2017 -- It should not trigger DCCR
-- or FFR or Anything -- it is just a Historical data. Only Calls" ... "Just
-- store these outside the Main Loop of Calls or Spares. So the Call Status,
-- Visit, Report can take from the file directly. Anything till 2025 is
-- Historical Data. For Calls, Never load them into the Regular Workflow. Store
-- it separately as historical data and dont add any workflow to these no
-- upstream or Down stream").
--
-- A TABLE OF ITS OWN, AND NOTHING ELSE. Not field_calls / installation_calls /
-- pm_calls, not `reports`, not `call_reviews`: so no UCN or call number is
-- minted, no visit is filed, no call status is derived, no DCCR row appears,
-- no FFR is raised, no notification is sent, no installation request is
-- matched and no Product Database figure moves. NO TRIGGER here does anything
-- but say who loaded the row. The call's status, its solved date and every
-- other detail are THE FILE'S, as written -- Item Status and Contract Type
-- included, not turned into WGP / CMC.
--
-- ONE ROW PER CALL, keyed by UC Number + Call No. The 2018-2022 file reuses 17
-- UC Numbers for two different calls each (e.g. 21E28014: a PM visit on
-- 28-May-2021 and a Field call on 08-Dec-2021), and every one of its 65,407
-- Call Nos is distinct -- so both calls of a pair are kept, under the UC Number
-- the file gives them, and re-loading a file corrects rather than duplicates.
-- A later file without a Call No is still keyed, by its UC Number.
--
-- Every heading the register does not name is kept on the row (`extra`), so a
-- year whose file carries visit or report columns keeps them, from the file.
--
-- READ like a call: whoever may read calls (calls.view) and sees every call,
-- or the engineer on it and their managers; a row with no engineer, like an
-- unallotted call, by every reader. WRITTEN only by Bulk Uploads (bulk.upload).
-- Nothing reads it but the screens that show it: it is history, not input.
-- ===========================================================================

create table if not exists public.call_history (
  id                 bigserial primary key,
  ucn                text not null check (btrim(ucn) <> ''),
  call_no            text not null default '',
  call_at            timestamptz,
  call_type          text not null default '',
  party_name         text not null default '',
  state              text not null default '',
  city               text not null default '',
  engineer           text not null default '',
  item_code          text not null default '',
  item_name          text not null default '',
  serial             text not null default '',
  standard_complaint text not null default '',
  complaint_reported text not null default '',
  item_status        text not null default '',
  warranty_start     date,
  contract_type      text not null default '',
  call_status        text not null default '',
  solved_at          timestamptz,
  extra              jsonb not null default '{}'::jsonb,
  loaded_at          timestamptz not null default now(),
  loaded_by          uuid
);
create unique index if not exists call_history_key on public.call_history (ucn, call_no);
create index if not exists call_history_serial_idx on public.call_history (serial);
create index if not exists call_history_call_at_idx on public.call_history (call_at);

comment on table public.call_history is
  'Calls before RITHI (up to 2025), kept apart from every workflow (0429): one row per UC Number + Call No, as the historical file has them. No visit, review, FFR, notification or Product Database change follows from a row; status and solved date are the file''s.';

-- WHO LOADED IT AND WHEN -- the only thing a trigger does here.
create or replace function public.call_history_stamp()
returns trigger language plpgsql set search_path = public as $$
begin
  new.ucn := btrim(new.ucn);
  new.call_no := btrim(coalesce(new.call_no, ''));
  new.loaded_at := now();
  new.loaded_by := auth.uid();
  return new;
end $$;
revoke execute on function public.call_history_stamp() from public, anon, authenticated;
drop trigger if exists call_history_stamp on public.call_history;
create trigger call_history_stamp before insert or update on public.call_history
  for each row execute function public.call_history_stamp();

alter table public.call_history enable row level security;
drop policy if exists ch_read on public.call_history;
create policy ch_read on public.call_history for select using (
  (select public.has_perm('calls.view'))
  and ((select public.can_view_all_calls())
       or btrim(engineer) = ''
       or lower(btrim(engineer)) in (select lower(btrim(v.n)) from public.visible_engineer_names() v(n)))
);
drop policy if exists ch_insert on public.call_history;
create policy ch_insert on public.call_history for insert with check ((select public.has_perm('bulk.upload')));
drop policy if exists ch_update on public.call_history;
create policy ch_update on public.call_history for update
  using ((select public.has_perm('bulk.upload'))) with check ((select public.has_perm('bulk.upload')));

-- Said, not left to defaults: no delete for a signed-in user, nothing at all
-- for the public key.
revoke all on public.call_history from anon, authenticated;
grant select, insert, update on public.call_history to authenticated;
revoke all on sequence public.call_history_id_seq from anon;
grant usage on sequence public.call_history_id_seq to authenticated;

do $$
begin
  if to_regprocedure('public.sys_columns_attach(regclass)') is not null then
    perform public.sys_columns_attach('public.call_history'::regclass);
  end if;
end $$;
