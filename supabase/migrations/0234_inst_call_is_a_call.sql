-- ===========================================================================
-- `INST Call` HOLDS A CALL NUMBER OR NOTHING.
--
-- The user, 2026-09-23: "Yes clear the placeholder and map the UCN there."
--
-- WHAT WAS IN THERE. The AppSheet cover export fills `INST Call` with the
-- literal words "To Check" — the sheet's way of saying NOBODY HAS LOOKED YET,
-- which is the opposite of "this machine has its installation call". The
-- importer (`coverImport.ts`) copies the cell straight through, so a large part
-- of `sale_items` carries it. It read as a call number to every screen that
-- asked "has this machine got one?", which is what hid the ＋ Installation call
-- button on almost the whole Warranty Register (v0.9.351 fixed the reading;
-- this fixes the data).
--
-- THREE THINGS, AND THE THIRD IS WHY THIS IS NOT A ONE-OFF SCRIPT:
--
--   1. MAP the UCN where an installation call for that machine already exists.
--   2. CLEAR what is left that is not a call number.
--   3. A TRIGGER, so the next import cannot put it back — and, more important,
--      cannot DESTROY a UCN this application wrote.
--
-- THE THIRD IS THE ONE THAT MATTERS MOST. `coverImport` upserts on `uid`, so
-- re-importing the AppSheet file overwrites `inst_call` with whatever the cell
-- says. Without the trigger, this repair is undone by the next import — and a
-- machine whose call was raised in the app since the file was exported would
-- have its UCN replaced by "To Check", which is worse than the state being
-- fixed here, because the UCN is then gone and the call is orphaned.
--
-- THE TRIGGER DISCARDS RATHER THAN REFUSES, which is the 0113/0114 rule: a
-- refusal makes an honest importer fail on a file it cannot help, while
-- discarding makes a careless one harmless. It never clears a call number, and
-- it never invents one.
--
-- NOTHING IS THROWN AWAY. `inst_call_repair_log` keeps every old value beside
-- the new one, so this is reversible and inspectable — the placeholder is being
-- destroyed on a register of 1,500+ machines and "we replaced it with nothing"
-- is not an answer anybody can check.
-- ===========================================================================

-- ---- the shape of a call number -------------------------------------------
-- `next_ucn` (0001) builds YY + month letter A-L + DD + a type letter + four
-- digits: 26I23I0080. The CLIENT's copy is `isCallNumber()` in coverspec.ts and
-- `check:ui` holds the two together.
create or replace function public.is_call_number(p_value text)
returns boolean language sql immutable as $$
  select coalesce(btrim(p_value), '') ~* '^[0-9]{2}[A-L][0-9]{2}[A-Z][0-9]{4}$';
$$;

comment on function public.is_call_number(text) is
  'Is this a UCN this system issued (YY + month letter + DD + type letter + 4 digits), rather than a note somebody left? "To Check" is not.';

-- ---- the log ---------------------------------------------------------------
create table if not exists public.inst_call_repair_log (
  id            bigint generated always as identity primary key,
  sale_item_id  bigint not null,
  sa_number     text not null default '',
  product_name  text not null default '',
  serial_number text not null default '',
  old_value     text not null default '',
  new_value     text not null default '',
  why           text not null default '',
  changed_at    timestamptz not null default now()
);
comment on table public.inst_call_repair_log is
  'Every INST Call value 0234 changed, with the value it replaced. Kept so the repair is reversible and checkable.';

alter table public.inst_call_repair_log enable row level security;
drop policy if exists inst_call_repair_log_read on public.inst_call_repair_log;
create policy inst_call_repair_log_read on public.inst_call_repair_log for select
  using (public.is_admin());
grant select on public.inst_call_repair_log to authenticated;

-- ---- 1. MAP the UCN where the call already exists ---------------------------
--
-- A MACHINE IS ITS MODEL AND ITS SERIAL, never the serial alone (eleven
-- machines on this register are numbered 219). So the match is on BOTH.
--
-- EXACTLY ONE, OR NOTHING. Where two installation calls name the same machine
-- -- a re-installation, or a duplicate -- there is no way to say which one this
-- field means, and writing either would be a guess recorded as a fact. Those
-- are LEFT as they are and counted in the notice, so somebody can look.
--
-- Compared with `upper(btrim(...))` on both sides and NOT space-squashed:
-- trimming is a normalisation, squashing would make 'MONNAL  T60' match
-- 'MONNAL T60', which is a WIDENING and a different decision.
do $$
declare
  n_mapped bigint := 0;
  n_ambig  bigint := 0;
begin
  if to_regclass('public.sale_items') is null or to_regclass('public.calls') is null then
    raise notice '0234: sale_items or calls is missing — nothing mapped.';
    return;
  end if;

  with one_call as (
    select upper(btrim(c.product_name)) as p,
           upper(btrim(c.serial))       as s,
           min(c.ucn)                   as ucn,
           count(*)                     as n
      from public.calls c
     where upper(coalesce(c.call_type, '')) like 'INSTALL%'
       and btrim(coalesce(c.product_name, '')) <> ''
       and btrim(coalesce(c.serial, ''))       <> ''
       and public.is_call_number(c.ucn)
     group by 1, 2
  ),
  target as (
    select si.id, si.sa_number, si.product_name, si.serial_number,
           coalesce(si.inst_call, '') as old_value, oc.ucn
      from public.sale_items si
      join one_call oc
        on oc.p = upper(btrim(coalesce(si.product_name, '')))
       and oc.s = upper(btrim(coalesce(si.serial_number, '')))
     where oc.n = 1
       -- A machine already carrying a real UCN is left alone: whatever is there
       -- was written by somebody or by this application, and is not this
       -- migration's to second-guess.
       and not public.is_call_number(si.inst_call)
  ),
  logged as (
    insert into public.inst_call_repair_log
      (sale_item_id, sa_number, product_name, serial_number, old_value, new_value, why)
    select t.id, coalesce(t.sa_number, ''), coalesce(t.product_name, ''),
           coalesce(t.serial_number, ''), t.old_value, t.ucn,
           'mapped to the existing installation call for this model + serial'
      from target t
    returning sale_item_id, new_value
  )
  update public.sale_items si
     set inst_call = l.new_value
    from logged l
   where si.id = l.sale_item_id;

  get diagnostics n_mapped = row_count;

  select count(*) into n_ambig from (
    select 1
      from public.calls c
     where upper(coalesce(c.call_type, '')) like 'INSTALL%'
       and btrim(coalesce(c.product_name, '')) <> ''
       and btrim(coalesce(c.serial, ''))       <> ''
     group by upper(btrim(c.product_name)), upper(btrim(c.serial))
    having count(*) > 1) x;

  raise notice '0234: % machine(s) mapped to their existing installation call.', n_mapped;
  if n_ambig > 0 then
    raise notice '0234: % machine(s) have MORE THAN ONE installation call and were left alone — pick one by hand.', n_ambig;
  end if;
end $$;

-- ---- 2. CLEAR what is left that is not a call number ------------------------
--
-- EVERYTHING that is not a UCN, not only the words "To Check". The field's
-- meaning is now "the installation call for this machine, or nothing", and a
-- note left in it reads as a call number to anything that looks. Every value
-- removed is in the log above, which is what makes clearing the honest option
-- rather than the destructive one.
do $$
declare
  n bigint := 0;
begin
  if to_regclass('public.sale_items') is null then return; end if;

  with calls_for as (
    select upper(btrim(c.product_name)) as p,
           upper(btrim(c.serial))       as s,
           count(*)                     as n,
           string_agg(c.ucn, ', ' order by c.ucn) as ucns
      from public.calls c
     where upper(coalesce(c.call_type, '')) like 'INSTALL%'
       and btrim(coalesce(c.product_name, '')) <> ''
       and btrim(coalesce(c.serial, ''))       <> ''
       and public.is_call_number(c.ucn)
     group by 1, 2
  ),
  target as (
    select si.id, si.sa_number, si.product_name, si.serial_number,
           coalesce(si.inst_call, '') as old_value,
           -- WHY IT IS BLANK, PER ROW. A machine with SEVERAL installation
           -- calls is cleared like any other -- "To Check" is not a call number
           -- whatever else is true -- but it is NOT the same situation as a
           -- machine with none, and the register cannot tell them apart once
           -- both read empty. The one that matters ends up offered a button
           -- that would raise a THIRD call, so the log has to name it: this
           -- table IS the list somebody works from.
           case when coalesce(cf.n, 0) > 1
                then 'not a call number — cleared, but ' || cf.n
                     || ' installation calls already name this machine (' || cf.ucns
                     || '): pick one by hand'
                else 'not a call number — cleared so the machine can be offered one' end as why
      from public.sale_items si
      left join calls_for cf
        on cf.p = upper(btrim(coalesce(si.product_name, '')))
       and cf.s = upper(btrim(coalesce(si.serial_number, '')))
     where btrim(coalesce(si.inst_call, '')) <> ''
       and not public.is_call_number(si.inst_call)
  ),
  logged as (
    insert into public.inst_call_repair_log
      (sale_item_id, sa_number, product_name, serial_number, old_value, new_value, why)
    select t.id, coalesce(t.sa_number, ''), coalesce(t.product_name, ''),
           coalesce(t.serial_number, ''), t.old_value, '', t.why
      from target t
    returning sale_item_id
  )
  update public.sale_items si
     set inst_call = ''
    from logged l
   where si.id = l.sale_item_id;

  get diagnostics n = row_count;
  raise notice '0234: % placeholder(s) cleared from INST Call.', n;
end $$;

-- ---- 3. KEEP IT THAT WAY ----------------------------------------------------
create or replace function public.sale_item_inst_call_guard()
returns trigger language plpgsql set search_path = public as $$
begin
  -- A value that is not a call number is not stored. "To Check" reads as a call
  -- number to every screen that asks whether this machine has one.
  if not public.is_call_number(new.inst_call) then
    new.inst_call := '';
  end if;

  -- AND A CALL NUMBER IS NEVER REPLACED BY NOTHING. `coverImport` upserts on
  -- `uid`, so re-importing the AppSheet file would otherwise wipe the UCN of
  -- every call raised in the app since that file was exported — leaving the
  -- call with no machine pointing at it and no trace of the loss. The import is
  -- not refused: it simply cannot take this one column backwards.
  --
  -- A DBA IN THE SQL EDITOR CAN, and the test is `current_user` -- the same one
  -- `block_hard_delete` (0049) uses, for the same reason. This guard exists to
  -- stop a careless CLIENT, not an approved correction: when a call is DELETED
  -- the mapping to it stops being true, and a guard that preserved it would
  -- leave the machine reading "this one has its installation call" for ever,
  -- pointing at a UCN that does not exist. Found by writing
  -- `_delete_these_calls.sql` and watching this branch put the value back while
  -- the report said it had been cleared.
  if tg_op = 'UPDATE'
     and current_user = 'authenticated'
     and public.is_call_number(old.inst_call)
     and coalesce(new.inst_call, '') = '' then
    new.inst_call := old.inst_call;
  end if;

  return new;
end $$;

drop trigger if exists zz_sale_item_inst_call_guard on public.sale_items;
create trigger zz_sale_item_inst_call_guard
  before insert or update of inst_call on public.sale_items
  for each row execute function public.sale_item_inst_call_guard();

comment on function public.sale_item_inst_call_guard() is
  'INST Call holds a UCN or nothing: a non-call value is discarded rather than refused (the 0113/0114 rule), and a re-import can never replace a real UCN with a blank.';
