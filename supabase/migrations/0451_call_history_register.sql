-- ===========================================================================
-- 0451 -- CALL HISTORY SAYS WHICH REGISTER A CALL BELONGS TO (the user,
-- 2026-10-22: "In Bulk Upload, Historical Data, Add one more Field For PM /
-- Field / Installation"; asked, "Record it beside the file's own").
--
-- A history row keeps the file's own Call Type exactly as written (0429's
-- rule) -- "INSTALLATION CALL", "P M VISIT", "INSTALLATION CALL & FIELD",
-- "DUPLICATE" -- so `register` is a SEPARATE column: 'Field', 'Installation'
-- or 'PM', chosen on the upload screen for the whole file. A file holding
-- several types is loaded as MIXED, and each row's register is then read off
-- its own Call Type by the rule call_table_for() uses for live calls:
-- INSTALL... is Installation, PM... (spaces ignored) is PM, anything else
-- Field.
--
-- THE ROWS ALREADY LOADED are given their register by that same rule -- the
-- file's own Call Type, read as a Mixed load would read it. Done with this
-- table's triggers paused, because call_history_stamp would otherwise rewrite
-- every row's load time to today; one record_audit row says what was done.
-- ===========================================================================

alter table public.call_history add column if not exists register text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'call_history_register_check'
                  and conrelid = 'public.call_history'::regclass) then
    alter table public.call_history add constraint call_history_register_check
      check (register is null or register in ('Field', 'Installation', 'PM'));
  end if;
end $$;

comment on column public.call_history.register is
  'Which register the call belongs to: Field, Installation or PM (0451) -- chosen for the file on the upload screen, or read off the row''s own Call Type for a Mixed file. The file''s Call Type itself is kept as written.';

-- The register a Call Type names, by call_table_for()'s three tests in order.
create or replace function public.call_register_of(p_call_type text)
returns text language sql immutable set search_path = public as $$
  select case
    when upper(coalesce(p_call_type, '')) like 'INSTALL%' then 'Installation'
    when replace(upper(coalesce(p_call_type, '')), ' ', '') like 'PM%' then 'PM'
    else 'Field'
  end;
$$;

-- MIXED, OR ANY SPELLING OF THE THREE, BECOMES ONE OF THE THREE.
create or replace function public.call_history_register()
returns trigger language plpgsql set search_path = public as $$
declare v text := lower(btrim(coalesce(new.register, '')));
begin
  if v = '' then
    -- Nothing chosen: an update keeps what the row had; a new row has none.
    if tg_op = 'UPDATE' then new.register := old.register; else new.register := null; end if;
  elsif v like 'mixed%' then
    new.register := public.call_register_of(new.call_type);
  elsif v like 'install%' then
    new.register := 'Installation';
  elsif replace(v, ' ', '') like 'pm%' then
    new.register := 'PM';
  elsif v like 'field%' then
    new.register := 'Field';
  else
    raise exception 'Call History register must be Field, Installation, PM or Mixed, not "%".', new.register using errcode = '23514';
  end if;
  return new;
end $$;
revoke execute on function public.call_history_register() from public, anon, authenticated;

drop trigger if exists call_history_register on public.call_history;
create trigger call_history_register before insert or update on public.call_history
  for each row execute function public.call_history_register();

-- THE ROWS ALREADY THERE, from their own Call Type.
do $$
declare n bigint;
begin
  alter table public.call_history disable trigger user;
  update public.call_history set register = public.call_register_of(call_type) where register is null;
  get diagnostics n = row_count;
  alter table public.call_history enable trigger user;
  if n > 0 and to_regclass('public.record_audit') is not null then
    insert into public.record_audit (table_name, op, record_key, actor, actor_email, old_data, new_data)
    values ('call_history', 'BULK UPDATE', null, null, null, jsonb_build_object('register', null),
            jsonb_build_object('rows', n, 'note', '0451: register read off each row''s own Call Type (INSTALL% Installation, PM% PM, else Field); the Call Type itself unchanged.'));
  end if;
  raise notice '0451: % Call History row(s) given their register', n;
end $$;
