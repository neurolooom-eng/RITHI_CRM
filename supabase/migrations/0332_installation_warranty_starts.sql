-- ===========================================================================
-- 0332 — THE INSTALLATION'S WARRANTY DECISION, IN A TABLE OF ITS OWN
--
-- The user, 2026-10-03: "Store these in a separate table, I have details for
-- calls from 2018, I will upload it in one go. So build a bulk upload for old
-- inst calls." -- and, asked what one row holds: the call and machine, the
-- engineer's choice, the resulting warranty, the engineer and remarks.
--
-- public.installation_warranty_starts is ONE ROW PER INSTALLATION CALL (keyed
-- on the UCN, so a re-loaded file corrects rather than duplicates):
--   call & machine   ucn, call_number, product_name, serial, party_name, reg_date
--   the choice       warranty_choice ("Installation Call Solved Date" /
--                    "Invoice Date", as the feedback has always said),
--                    call_solved_at and solved_date
--   the result       warranty_start, warranty_end, period_months -- WRITTEN BY
--                    THE SYSTEM from the Product Database after it applies the
--                    choice, never typed
--   the engineer     engineer, visit_at, remarks
--   where it came    source: RITHI (a report filed here), Feedback (the
--                    customer feedback already on file), Upload (Bulk Uploads)
--
-- IT IS NOW THE SOURCE OF THE RULE (0331): machine_install_warranty_start()
-- reads the machine's latest row here, so an installation from 2018 that was
-- never a RITHI call decides its machine's warranty exactly as a new one does.
-- A RITHI installation fills its row when its feedback is saved or its call's
-- solved state changes; any row saved here re-syncs its product + serial.
--
-- Filled once from every installation feedback already on file.
-- ===========================================================================

create table if not exists public.installation_warranty_starts (
  id              bigserial primary key,
  ucn             text not null,
  ucn_key         text generated always as (lower(btrim(ucn))) stored,
  call_number     text not null default '',
  product_name    text not null default '',
  serial          text not null default '',
  machine_key     text generated always as
                    (lower(btrim(coalesce(product_name, ''))) || '|' || lower(btrim(coalesce(serial, '')))) stored,
  party_name      text not null default '',
  reg_date        date,
  warranty_choice text not null default '',
  call_solved_at  timestamptz,
  solved_date     date,
  warranty_start  date,
  warranty_end    date,
  period_months   numeric,
  engineer        text not null default '',
  visit_at        timestamptz,
  remarks         text not null default '',
  source          text not null default 'RITHI',
  extra           jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create unique index if not exists installation_warranty_starts_ucn_key on public.installation_warranty_starts (ucn_key);
create index if not exists installation_warranty_starts_machine on public.installation_warranty_starts (machine_key);

alter table public.installation_warranty_starts enable row level security;
-- READ like the Product Database it decides (signed in); WRITE by Bulk Uploads'
-- own key. A RITHI report fills its row through the trigger below, as the owner.
drop policy if exists iws_read on public.installation_warranty_starts;
create policy iws_read on public.installation_warranty_starts for select
  using (auth.role() = 'authenticated');
drop policy if exists iws_insert on public.installation_warranty_starts;
create policy iws_insert on public.installation_warranty_starts for insert
  with check ((select public.has_perm('bulk.upload')));
drop policy if exists iws_update on public.installation_warranty_starts;
create policy iws_update on public.installation_warranty_starts for update
  using ((select public.has_perm('bulk.upload'))) with check ((select public.has_perm('bulk.upload')));
grant select, insert, update on public.installation_warranty_starts to authenticated;
grant usage on sequence public.installation_warranty_starts_id_seq to authenticated;
do $$
begin
  if to_regprocedure('public.sys_columns_attach(regclass)') is not null then
    perform public.sys_columns_attach('public.installation_warranty_starts'::regclass);
  end if;
end $$;

-- ---- the stamps: a typed result is discarded, the day is derived ----------
create or replace function public.installation_warranty_starts_biu()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  new.warranty_choice := btrim(coalesce(new.warranty_choice, ''));
  -- The solved DAY is India time, from the moment, where the file gave one.
  if new.solved_date is null and new.call_solved_at is not null then
    new.solved_date := (new.call_solved_at at time zone 'Asia/Kolkata')::date;
  end if;
  -- THE RESULT IS THE SYSTEM'S. A caller through the API cannot write it. The
  -- test is current_user, not the `role` setting: the write-back below runs in
  -- a SECURITY DEFINER function, where current_user is the owner but the
  -- setting still says `authenticated` for an upload -- testing the setting
  -- would discard the system's own result too.
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      new.warranty_start := null; new.warranty_end := null; new.period_months := null;
    else
      new.warranty_start := old.warranty_start; new.warranty_end := old.warranty_end;
      new.period_months := old.period_months;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists installation_warranty_starts_biu on public.installation_warranty_starts;
create trigger installation_warranty_starts_biu before insert or update on public.installation_warranty_starts
  for each row execute function public.installation_warranty_starts_biu();

-- ---- the rule now reads the table ------------------------------------------
create or replace function public.machine_install_warranty_start(p_item text, p_serial text)
returns date language sql stable security definer set search_path = public as $$
  select case when lower(w.warranty_choice) = 'installation call solved date' then w.solved_date end
    from public.installation_warranty_starts w
   where w.machine_key = lower(btrim(coalesce(p_item, ''))) || '|' || lower(btrim(coalesce(p_serial, '')))
   order by w.solved_date desc nulls last, w.id desc
   limit 1;
$$;
revoke execute on function public.machine_install_warranty_start(text, text) from public, anon, authenticated;

-- ---- a saved row re-syncs its machine, and records what it decided --------
create or replace function public.installation_warranty_to_product()
returns trigger language plpgsql security definer set search_path = public as $$
declare p record;
begin
  if tg_op = 'UPDATE' and (old.product_name, old.serial) is distinct from (new.product_name, new.serial) then
    perform public.sync_product_machine(old.product_name, old.serial);
  end if;
  perform public.sync_product_machine(new.product_name, new.serial);
  select x.warranty_start, x.warranty_end into p from public.products x where x.machine_key = new.machine_key;
  update public.installation_warranty_starts w
     set warranty_start = p.warranty_start,
         warranty_end   = p.warranty_end,
         period_months  = (select coalesce(i.warranty_months, h.warranty_months, i.warranty_years * 12, h.warranty_years * 12)
                             from public.sale_items i left join public.sale_entries h on h.sa_number = i.sa_number
                            where lower(btrim(coalesce(i.product_name, ''))) || '|' || lower(btrim(coalesce(i.serial_number, ''))) = new.machine_key
                            order by coalesce(i.warranty_end, h.warranty_end) desc nulls last, i.id desc limit 1)
   where w.id = new.id
     and (w.warranty_start, w.warranty_end) is distinct from (p.warranty_start, p.warranty_end)
         or (w.id = new.id and w.period_months is null);
  return null;
end $$;
revoke execute on function public.installation_warranty_to_product() from public, anon, authenticated;
drop trigger if exists zz_installation_warranty_to_product on public.installation_warranty_starts;
create trigger zz_installation_warranty_to_product
  after insert or update of product_name, serial, warranty_choice, solved_date, call_solved_at
  on public.installation_warranty_starts
  for each row execute function public.installation_warranty_to_product();

-- ---- a RITHI installation fills its own row --------------------------------
create or replace function public.install_start_to_product()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_ucn text; c record; f record;
begin
  if tg_table_name = 'feedback' then
    if upper(coalesce(new.call_type, '')) not like 'INSTALL%' then return null; end if;
    v_ucn := new.ucn;
  else
    if tg_op = 'UPDATE' and (old.open_state, old.last_visit_at) is not distinct from (new.open_state, new.last_visit_at) then
      return null;
    end if;
    v_ucn := new.ucn;
  end if;

  select x.ucn, x.call_number, x.product_name, x.serial, x.party_name, x.reg_date, x.allocated_to,
         x.open_state, x.last_visit_at
    into c from public.installation_calls x where x.ucn = v_ucn limit 1;
  if c.ucn is null then return null; end if;
  select y.answers, y.engineer, y.visit_at into f from public.feedback y where y.ucn = v_ucn
   order by y.id desc limit 1;
  -- Nothing to record until the engineer has answered.
  if btrim(coalesce(f.answers ->> 'Warranty Start Date?', '')) = '' then return null; end if;

  insert into public.installation_warranty_starts as w
    (ucn, call_number, product_name, serial, party_name, reg_date, warranty_choice,
     call_solved_at, engineer, visit_at, remarks, source)
  values (c.ucn, coalesce(c.call_number, ''), coalesce(c.product_name, ''), coalesce(c.serial, ''),
          coalesce(c.party_name, ''), c.reg_date, btrim(f.answers ->> 'Warranty Start Date?'),
          case when c.open_state = 'Solved' then c.last_visit_at end,
          coalesce(nullif(btrim(coalesce(f.engineer, '')), ''), coalesce(c.allocated_to, '')), f.visit_at,
          coalesce(f.answers ->> 'INSTALLATION/PM/FIELD-Remarks if any', ''), 'RITHI')
  on conflict (ucn_key) do update set
    call_number = excluded.call_number, product_name = excluded.product_name, serial = excluded.serial,
    party_name = excluded.party_name, reg_date = excluded.reg_date,
    warranty_choice = excluded.warranty_choice, call_solved_at = excluded.call_solved_at,
    solved_date = (excluded.call_solved_at at time zone 'Asia/Kolkata')::date,
    engineer = excluded.engineer, visit_at = excluded.visit_at, remarks = excluded.remarks;
  return null;
end $$;
revoke execute on function public.install_start_to_product() from public, anon, authenticated;

-- ---- what the Visit Entry shows: now, and after this report ---------------
-- Dates only, for one product + serial; the caller must be signed in.
create or replace function public.machine_warranty_preview(p_item text, p_serial text, p_solved_on date)
returns table (now_start date, now_end date, period_months numeric, solved_start date, solved_end date)
language plpgsql stable security definer set search_path = public as $$
declare k text := lower(btrim(coalesce(p_item, ''))) || '|' || lower(btrim(coalesce(p_serial, '')));
        m numeric; e date;
begin
  if auth.uid() is null then return; end if;
  select coalesce(i.warranty_months, h.warranty_months, i.warranty_years * 12, h.warranty_years * 12) into m
    from public.sale_items i left join public.sale_entries h on h.sa_number = i.sa_number
   where lower(btrim(coalesce(i.product_name, ''))) || '|' || lower(btrim(coalesce(i.serial_number, ''))) = k
   order by coalesce(i.warranty_end, h.warranty_end) desc nulls last, i.id desc limit 1;
  if p_solved_on is not null and m is not null and m > 0
     and to_regprocedure('public.cover_period_end(date,numeric)') is not null then
    execute 'select public.cover_period_end($1, $2)' into e using p_solved_on, m;
  end if;
  return query
    select p.warranty_start, p.warranty_end, m, p_solved_on, e
      from (select 1) one left join public.products p on p.machine_key = k;
end $$;
revoke execute on function public.machine_warranty_preview(text, text, date) from public, anon;
grant execute on function public.machine_warranty_preview(text, text, date) to authenticated;

-- ---- once: every installation feedback already on file ---------------------
create table if not exists public.one_time_fixes_done (
  name       text primary key,
  applied_at timestamptz not null default now(),
  detail     text
);
alter table public.one_time_fixes_done enable row level security;
revoke all on public.one_time_fixes_done from anon, authenticated;

do $$
declare n integer;
begin
  if exists (select 1 from public.one_time_fixes_done where name = '0332_installation_warranty_filled') then
    raise notice '0332: the installation warranty table was filled before -- not touched again';
    return;
  end if;
  insert into public.installation_warranty_starts
    (ucn, call_number, product_name, serial, party_name, reg_date, warranty_choice,
     call_solved_at, engineer, visit_at, remarks, source)
  select distinct on (lower(btrim(c.ucn)))
         c.ucn, coalesce(c.call_number, ''), coalesce(c.product_name, ''), coalesce(c.serial, ''),
         coalesce(c.party_name, ''), c.reg_date, btrim(f.answers ->> 'Warranty Start Date?'),
         case when c.open_state = 'Solved' then c.last_visit_at end,
         coalesce(nullif(btrim(coalesce(f.engineer, '')), ''), coalesce(c.allocated_to, '')), f.visit_at,
         coalesce(f.answers ->> 'INSTALLATION/PM/FIELD-Remarks if any', ''),
         -- imported_from is added by a module that runs after this one on a fresh
         -- build, so it is read off the row rather than named.
         case when btrim(coalesce(to_jsonb(f) ->> 'imported_from', '')) <> '' then 'Feedback' else 'RITHI' end
    from public.feedback f
    join public.installation_calls c on c.ucn = f.ucn
   where btrim(coalesce(f.answers ->> 'Warranty Start Date?', '')) <> ''
   order by lower(btrim(c.ucn)), f.id desc
  on conflict (ucn_key) do nothing;
  get diagnostics n = row_count;
  insert into public.one_time_fixes_done (name, detail)
  values ('0332_installation_warranty_filled', format('%s installation call(s) recorded from their feedback', n));
  raise notice '0332: % installation call(s) recorded from their feedback', n;
end $$;
