-- ===========================================================================
-- 0321 — INDOOR_DC: THE DELIVERY CHALLAN THAT TAKES A UNIT OUT OF THE WORKSHOP
--
-- The user, 2026-10-02, with the paper template: a Delivery Challan for the
-- Indoor Service module ONLY -- "Name it Indoor_DC". It is separate from the
-- spare DC (spare_dispatches, 0027/0028), which this file does not touch.
--
-- THE USER'S DECISIONS, and where each one lives:
--   * Its own number, IDC-YYMM-NNNN, restarting each month by the DC DATE,
--     ISSUED BY THE DATABASE -- a number sent by the caller is discarded, the
--     rule the job number (0158) and the stock-out number (0027) keep.
--   * One DC may carry SEVERAL jobs going to the SAME consignee ("To"). The
--     consignee of a job is its party (customer property) or its "going to"
--     party (a DEMO unit, demo_for_party); jobs whose consignees differ are
--     refused together.
--   * Creating the DC stamps each job: dispatch_ref = the IDC number (R/SER/07
--     "DC No.") and dc_date = the DC date. IT DOES NOT CHANGE THE JOB'S STATUS
--     -- and the existing guard (0158) stamps dispatched_at / dispatched_by when
--     dispatch_ref is first set, exactly as it does when the reference is
--     typed on the job.
--   * The DC is NOT A WAY ROUND A DISPATCH RULE. Setting dispatch_ref alone
--     asks none of indoor_jobs_guard()'s leaving rules (a failed quality check,
--     a repair with no check, a failed PDI, a DEMO unit of an imported product
--     without its Pre-Delivery Testing -- 0158, 0297, 0320): they are asked on
--     the move into Dispatched / Closed. So each job is TRIED -- moved to
--     Dispatched inside a sub-transaction that is always rolled back -- and a
--     job the guard refuses is refused here with the guard's own words. The
--     rule is therefore not copied: whatever the guard says today, and
--     whatever it is changed to say, is what the DC says.
--   * Only a READY unit goes on a DC, and only one carrying no DC No. yet.
--   * Lines: per job, the equipment (PART No. = the product code the machine
--     carries in the Product Database, else the one code its name has on the
--     Product Master, else blank; DESCRIPTION = product + " Sl.No " + serial)
--     and then one line per accessory (name + " Sl.No " + serial). QTY 1.
--     PURPOSE typed once for the DC and editable per line.
--   * The "To" text, MIRN No. / Customer Ref No. and its date, and Mode of
--     Despatch are stored on the DC as typed.
--   * Permission: the existing indoor.dispatch. NO KEY IS ADDED AND NOTHING IS
--     GRANTED: the page is the Indoor Service Register's (mod:/indoor).
--
-- WRITTEN ONLY BY create_indoor_dc(). Both tables are readable with the page
-- and have NO write policy and no write grant: a DC row written straight
-- through the API would be a challan whose jobs were never stamped and never
-- tried against the leaving rules. The function asks indoor.dispatch itself.
-- A DC IS A RECORD OF A UNIT LEAVING: no delete policy, no delete grant, and
-- 0049's no_hard_delete trigger.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. THE NUMBER -- IDC-YYMM-NNNN, one counter row per month.
--    The 0027 pattern (an upsert that locks the row, so two issuers in the
--    same instant get 0007 and 0008), seeded PAST whatever the month already
--    carries as 0158 seeds the job number, so it is safe after an import.
--    RLS on with no policy: nothing but the definer function touches it.
-- ---------------------------------------------------------------------------
create table if not exists public.indoor_dc_counters (
  period  text    not null primary key,   -- YYMM
  last_no integer not null default 0
);
alter table public.indoor_dc_counters enable row level security;
revoke all on public.indoor_dc_counters from public;
do $$ begin
  execute 'revoke all on public.indoor_dc_counters from anon, authenticated';
exception when undefined_object then null; end $$;

create or replace function public.next_indoor_dc_no(p_on date)
returns text language plpgsql volatile security definer set search_path = public as $$
declare
  v_on  date := coalesce(p_on, (now() at time zone 'Asia/Kolkata')::date);
  v_yymm text := to_char(v_on, 'YYMM');
  v_hi  integer := 0;
  v_no  integer;
begin
  if to_regclass('public.indoor_dcs') is not null then
    select coalesce(max(right(dc_no, 4)::int), 0) into v_hi
      from public.indoor_dcs
     where dc_no ~ ('^IDC-' || v_yymm || '-[0-9]{4}$');
  end if;
  insert into public.indoor_dc_counters (period, last_no) values (v_yymm, v_hi + 1)
  on conflict (period) do update
     set last_no = greatest(public.indoor_dc_counters.last_no, v_hi) + 1
  returning last_no into v_no;
  return 'IDC-' || v_yymm || '-' || lpad(v_no::text, 4, '0');
end $$;
comment on function public.next_indoor_dc_no(date) is
  'Issues the next Indoor DC number, IDC-YYMM-NNNN, restarting each month by the DC date (0321). Called only by the indoor_dcs insert trigger.';
-- Only the trigger calls it (it runs as the owner), so the API may not.
revoke all on function public.next_indoor_dc_no(date) from public;
do $$ begin
  execute 'revoke all on function public.next_indoor_dc_no(date) from anon, authenticated';
exception when undefined_object then null; end $$;

-- ---------------------------------------------------------------------------
-- 2. THE DC AND ITS LINES
-- ---------------------------------------------------------------------------
create table if not exists public.indoor_dcs (
  id                bigint generated always as identity primary key,
  dc_no             text not null unique,
  dc_date           date not null default ((now() at time zone 'Asia/Kolkata')::date),
  consignee         text not null default '',   -- "To", as typed (prefilled from the Party Master)
  customer_ref      text not null default '',   -- "MIRN No. / CUSTOMER REF No."
  customer_ref_date date,                       -- its "DATE"
  mode_of_despatch  text not null default '',
  purpose           text not null default '',   -- typed once; each line carries its own copy
  issued_by_name    text not null default '',   -- "ISSUED BY (Stores)": the name RITHI knows for the creator
  created_by        uuid,
  created_at        timestamptz not null default now()
);
comment on table public.indoor_dcs is
  'Indoor_DC -- the Delivery Challan that takes Indoor Service units out of the workshop (0321). One DC, one consignee, one or more jobs. Number IDC-YYMM-NNNN issued by the database. Written only by create_indoor_dc(); never deleted.';
comment on column public.indoor_dcs.issued_by_name is
  'The creator''s name as the profile gave it when the DC was issued -- printed under ISSUED BY (Stores). Stamped from the session; a value sent is discarded.';

create table if not exists public.indoor_dc_lines (
  id           bigint generated always as identity primary key,
  dc_id        bigint not null references public.indoor_dcs (id),
  line_no      integer not null,
  job_id       bigint not null references public.indoor_jobs (id),
  -- NULL for the equipment line. An accessory removed from the job later
  -- leaves the line, and its description, as printed.
  accessory_id bigint references public.indoor_job_accessories (id) on delete set null,
  part_no      text not null default '',
  description  text not null default '',
  qty          numeric not null default 1 check (qty > 0),
  purpose      text not null default '',
  created_at   timestamptz not null default now(),
  unique (dc_id, line_no)
);
create index if not exists indoor_dc_lines_job_idx on public.indoor_dc_lines (job_id);
comment on table public.indoor_dc_lines is
  'The lines of an Indoor DC (0321): per job the equipment, then each accessory, QTY 1, each with its PURPOSE. A snapshot taken when the DC was issued, so a re-print is the same challan.';

-- The number and the issuer are the database's. An edit (only a trusted role
-- can make one: no write grant) cannot rewrite either.
create or replace function public.indoor_dcs_stamp()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if new.dc_date is null then new.dc_date := (now() at time zone 'Asia/Kolkata')::date; end if;
    new.dc_no      := public.next_indoor_dc_no(new.dc_date);
    new.created_at := now();
    new.created_by := auth.uid();
    select coalesce(nullif(btrim(p.full_name), ''), p.email, '') into new.issued_by_name
      from public.profiles p where p.id = auth.uid();
    new.issued_by_name := coalesce(new.issued_by_name, '');
  else
    new.dc_no          := old.dc_no;
    new.created_at     := old.created_at;
    new.created_by     := old.created_by;
    new.issued_by_name := old.issued_by_name;
  end if;
  return new;
end $$;
drop trigger if exists zz_indoor_dcs_stamp on public.indoor_dcs;
create trigger zz_indoor_dcs_stamp before insert or update on public.indoor_dcs
  for each row execute function public.indoor_dcs_stamp();

-- ---------------------------------------------------------------------------
-- 3. THE PRODUCT CODE OF A JOB -- for PART No. on the equipment line.
--    The mapping 0320's indoor_job_is_imported() uses, in its order:
--      a. the machine's own code: products.machine_key (model|serial) ->
--         item_code (0194);
--      b. the NAME on the Product Master, only where it has exactly ONE code.
--    Otherwise NULL, and PART No. prints blank: a guessed code on a challan is
--    worse than none. PL/pgSQL with run-time column tests for 0320's reason:
--    the masters module runs after this one.
-- ---------------------------------------------------------------------------
create or replace function public.indoor_job_product_code(p_product_name text, p_serial text)
returns text
language plpgsql stable security definer
set search_path = public
as $$
declare
  v_code text;
  v_n    integer;
begin
  if coalesce(btrim(p_product_name), '') <> '' and coalesce(btrim(p_serial), '') <> ''
     and exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'products'
                    and column_name = 'item_code') then
    select nullif(btrim(p.item_code), '') into v_code
      from public.products p
     where p.machine_key = lower(btrim(p_product_name)) || '|' || lower(btrim(p_serial))
     limit 1;
    if v_code is not null then return v_code; end if;
  end if;

  if coalesce(btrim(p_product_name), '') = ''
     or to_regclass('public.product_master') is null then
    return null;
  end if;
  select count(distinct upper(btrim(pm.product_code))), min(btrim(pm.product_code))
    into v_n, v_code
    from public.product_master pm
   where upper(btrim(pm.product_name)) = upper(btrim(p_product_name))
     and btrim(coalesce(pm.product_code, '')) <> '';
  if v_n = 1 then return v_code; end if;
  return null;
end $$;
comment on function public.indoor_job_product_code(text, text) is
  'The product code of an indoor job''s equipment, for PART No. on an Indoor DC (0321): the machine''s own item_code (Product Database, model+serial), else the single code its name has on the Product Master; NULL otherwise.';
revoke all on function public.indoor_job_product_code(text, text) from public;
do $$ begin
  execute 'revoke all on function public.indoor_job_product_code(text, text) from anon';
  execute 'grant execute on function public.indoor_job_product_code(text, text) to authenticated';
exception when undefined_object then null; end $$;

-- ---------------------------------------------------------------------------
-- 4. ISSUING A DC -- the only writer.
--
--   p_job_ids        the jobs, in the order they are to be printed
--   p_consignee      "To", as typed
--   p_dc_date        DATE (NULL = today in India)
--   p_customer_ref   MIRN No. / CUSTOMER REF No. (optional)
--   p_customer_ref_date  its DATE (optional)
--   p_mode           Mode of Despatch
--   p_purpose        PURPOSE, typed once
--   p_line_purposes  per-line PURPOSE overrides, [{job_id, accessory_id, purpose}]
--                    (accessory_id null = the equipment line)
--
-- SECURITY DEFINER so the tables can stay closed to direct writes; every
-- question about the CALLER is still asked of the caller: has_perm() and
-- is_admin() read the session, and the job updates run indoor_jobs_guard(),
-- which asks the caller's rights too.
-- ---------------------------------------------------------------------------
create or replace function public.create_indoor_dc(
  p_job_ids           bigint[],
  p_consignee         text,
  p_dc_date           date  default null,
  p_customer_ref      text  default '',
  p_customer_ref_date date  default null,
  p_mode              text  default '',
  p_purpose           text  default '',
  p_line_purposes     jsonb default '[]'::jsonb
) returns text
language plpgsql volatile security definer
set search_path = public
as $$
declare
  v_ids   bigint[];
  v_date  date := coalesce(p_dc_date, (now() at time zone 'Asia/Kolkata')::date);
  v_dc    bigint;
  v_no    text;
  v_line  integer := 0;
  v_state text;
  v_msg   text;
  v_keys  text;
  j       record;
  a       record;
  v_ov    jsonb;
begin
  if not public.has_perm('indoor.dispatch') then
    raise exception 'indoor.dispatch is required to issue an Indoor DC'
      using errcode = '42501';
  end if;

  select array_agg(x order by o) into v_ids
    from (select x, min(o) as o from unnest(p_job_ids) with ordinality u(x, o)
           where x is not null group by x) d;
  if coalesce(cardinality(v_ids), 0) = 0 then
    raise exception 'choose at least one Ready unit for the Indoor DC'
      using errcode = '22023';
  end if;
  if coalesce(btrim(p_consignee), '') = '' then
    raise exception 'an Indoor DC needs its consignee (To)'
      using errcode = '23514';
  end if;

  -- Every job must exist, and is locked for the rest of the transaction so two
  -- people cannot put one unit on two challans at once.
  perform 1 from public.indoor_jobs where id = any (v_ids) order by id for update;
  if (select count(*) from public.indoor_jobs where id = any (v_ids)) <> cardinality(v_ids) then
    raise exception 'an Indoor Service job on this DC was not found'
      using errcode = '23503';
  end if;

  -- ONE DC, ONE CONSIGNEE: a customer unit goes to its party, a DEMO unit to
  -- its "going to" party.
  select string_agg(distinct coalesce(nullif(btrim(k), ''), '(none)'), ' / ') into v_keys
    from (select case when kind = 'DEMO unit' then demo_for_party else party_name end as k
            from public.indoor_jobs where id = any (v_ids)) s;
  if (select count(distinct upper(btrim(coalesce(case when kind = 'DEMO unit' then demo_for_party
                                                       else party_name end, ''))))
        from public.indoor_jobs where id = any (v_ids)) > 1 then
    raise exception 'one Indoor DC goes to one consignee -- these units go to %', v_keys
      using errcode = '23514';
  end if;

  for j in
    select ij.*, u.o from public.indoor_jobs ij
      join unnest(v_ids) with ordinality u(x, o) on u.x = ij.id
     order by u.o
  loop
    if j.status <> 'Ready' then
      raise exception '%: only a Ready unit goes on an Indoor DC -- this one is %', j.job_no, j.status
        using errcode = '23514';
    end if;
    if btrim(j.dispatch_ref) <> '' then
      raise exception '%: already carries DC No. % -- one unit, one DC', j.job_no, j.dispatch_ref
        using errcode = '23514';
    end if;

    -- THE TRIAL. Would the guard let this unit leave? Asked by moving it to
    -- Dispatched and always rolling the move back.
    begin
      update public.indoor_jobs set status = 'Dispatched' where id = j.id;
      raise exception using errcode = 'P0001', message = 'indoor_dc_trial_passed';
    exception when others then
      get stacked diagnostics v_state = returned_sqlstate, v_msg = message_text;
      if v_msg <> 'indoor_dc_trial_passed' then
        raise exception '%: %', j.job_no, v_msg using errcode = v_state;
      end if;
    end;
  end loop;

  -- Overrides must name a job on this DC (a purpose for a unit that is not
  -- here is a mistake, said rather than dropped).
  for v_ov in select * from jsonb_array_elements(coalesce(p_line_purposes, '[]'::jsonb)) loop
    if not coalesce((v_ov ->> 'job_id')::bigint = any (v_ids), false) then
      raise exception 'a line purpose names job %, which is not on this DC', v_ov ->> 'job_id'
        using errcode = '22023';
    end if;
  end loop;

  insert into public.indoor_dcs (dc_no, dc_date, consignee, customer_ref, customer_ref_date,
                                 mode_of_despatch, purpose)
  values ('auto', v_date, btrim(p_consignee), btrim(coalesce(p_customer_ref, '')), p_customer_ref_date,
          btrim(coalesce(p_mode, '')), btrim(coalesce(p_purpose, '')))
  returning id, dc_no into v_dc, v_no;

  for j in
    select ij.*, u.o from public.indoor_jobs ij
      join unnest(v_ids) with ordinality u(x, o) on u.x = ij.id
     order by u.o
  loop
    v_line := v_line + 1;
    insert into public.indoor_dc_lines (dc_id, line_no, job_id, accessory_id, part_no, description, qty, purpose)
    values (v_dc, v_line, j.id, null,
            coalesce(public.indoor_job_product_code(j.product_name, j.serial), ''),
            btrim(btrim(j.product_name) || case when btrim(j.serial) <> '' then ' Sl.No ' || btrim(j.serial) else '' end),
            1,
            coalesce((select e ->> 'purpose' from jsonb_array_elements(coalesce(p_line_purposes, '[]'::jsonb)) e
                       where (e ->> 'job_id')::bigint = j.id
                         and nullif(e ->> 'accessory_id', '') is null
                       limit 1), btrim(coalesce(p_purpose, ''))));
    for a in
      select * from public.indoor_job_accessories
       where job_id = j.id and (btrim(name) <> '' or btrim(serial) <> '')
       order by id
    loop
      v_line := v_line + 1;
      insert into public.indoor_dc_lines (dc_id, line_no, job_id, accessory_id, part_no, description, qty, purpose)
      values (v_dc, v_line, j.id, a.id, '',
              btrim(btrim(a.name) || case when btrim(a.serial) <> '' then ' Sl.No ' || btrim(a.serial) else '' end),
              1,
              coalesce((select e ->> 'purpose' from jsonb_array_elements(coalesce(p_line_purposes, '[]'::jsonb)) e
                         where (e ->> 'job_id')::bigint = j.id
                           and (e ->> 'accessory_id')::bigint = a.id
                         limit 1), btrim(coalesce(p_purpose, ''))));
    end loop;
  end loop;

  -- THE STAMP ON EACH JOB. Through the guard, as the caller: it asks
  -- indoor.dispatch for a change of dispatch_ref and stamps dispatched_at /
  -- dispatched_by, exactly as a reference typed on the job does.
  update public.indoor_jobs
     set dispatch_ref = v_no, dc_date = v_date
   where id = any (v_ids);

  return v_no;
end $$;
comment on function public.create_indoor_dc(bigint[], text, date, text, date, text, text, jsonb) is
  'Issues an Indoor DC (0321): asks indoor.dispatch; one consignee; only Ready units with no DC No.; each unit TRIED against indoor_jobs_guard()''s leaving rules and refused with the guard''s words; lines built from the jobs and their accessories; each job stamped dispatch_ref = IDC number, dc_date = DC date. Returns the IDC number.';
revoke all on function public.create_indoor_dc(bigint[], text, date, text, date, text, text, jsonb) from public;
do $$ begin
  execute 'revoke all on function public.create_indoor_dc(bigint[], text, date, text, date, text, text, jsonb) from anon';
  execute 'grant execute on function public.create_indoor_dc(bigint[], text, date, text, date, text, text, jsonb) to authenticated';
exception when undefined_object then null; end $$;

-- ---------------------------------------------------------------------------
-- 5. WHO MAY READ, AND NOBODY MAY WRITE DIRECTLY
-- ---------------------------------------------------------------------------
alter table public.indoor_dcs      enable row level security;
alter table public.indoor_dc_lines enable row level security;

drop policy if exists indoor_dcs_read on public.indoor_dcs;
create policy indoor_dcs_read on public.indoor_dcs for select
  using ((select public.has_perm('mod:/indoor')));
drop policy if exists indoor_dc_lines_read on public.indoor_dc_lines;
create policy indoor_dc_lines_read on public.indoor_dc_lines for select
  using ((select public.has_perm('mod:/indoor')));

revoke all on public.indoor_dcs, public.indoor_dc_lines from public;
do $$ begin
  execute 'revoke all on public.indoor_dcs, public.indoor_dc_lines from anon, authenticated';
  execute 'grant select on public.indoor_dcs, public.indoor_dc_lines to authenticated';
exception when undefined_object then null; end $$;

-- RECORD RETENTION (0049): not deleted by the application, whatever grant a
-- project's defaults hand out. block_hard_delete() belongs to the audit
-- module, which runs before this one; guarded for a bundle replayed alone.
do $$
declare t text;
begin
  if to_regprocedure('public.block_hard_delete()') is not null then
    foreach t in array array['indoor_dcs', 'indoor_dc_lines'] loop
      execute format('drop trigger if exists no_hard_delete on public.%I', t);
      execute format('create trigger no_hard_delete before delete on public.%I for each row execute function public.block_hard_delete()', t);
    end loop;
  end if;
end $$;

-- The five system columns, now where the module that adds them already ran
-- (on a fresh build sys_columns runs later and attaches them itself). The
-- counter is a counter and gets none (0244's list).
do $$
begin
  if to_regprocedure('public.sys_columns_attach(regclass)') is not null then
    perform public.sys_columns_attach('public.indoor_dcs'::regclass);
    perform public.sys_columns_attach('public.indoor_dc_lines'::regclass);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 6. THE LIST -- one row per DC with its jobs and line count. Columns NAMED,
--    not d.* (a `*` view is expanded at creation and would need 0245's mirror).
-- ---------------------------------------------------------------------------
drop view if exists public.indoor_dc_list;
create view public.indoor_dc_list as
  select d.id, d.dc_no, d.dc_date, d.consignee, d.customer_ref, d.customer_ref_date,
         d.mode_of_despatch, d.purpose, d.issued_by_name, d.created_by, d.created_at,
         (select count(*) from public.indoor_dc_lines l where l.dc_id = d.id) as line_count,
         (select string_agg(j.job_no, ', ' order by l.line_no)
            from public.indoor_dc_lines l join public.indoor_jobs j on j.id = l.job_id
           where l.dc_id = d.id and l.accessory_id is null) as job_nos
    from public.indoor_dcs d;
alter view public.indoor_dc_list set (security_invoker = on);
grant select on public.indoor_dc_list to authenticated;
