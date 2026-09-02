-- ===========================================================================
-- OPENING STOCK — the hand stock that pre-dates the movement history.
--
-- Hand stock is DERIVED: stock out - consumption - transfers + returns. That is
-- right for every spare the system issued. It is wrong for everything an
-- engineer was already carrying before the system had the movements: raw spare
-- data starts JUNE 2022, and the stock held before that (WinMax HS), plus the
-- per-period figures alongside it (22 H2, 23, 24, 25), exist only as balances.
--
-- Without them the derivation says those engineers hold ZERO — and because
-- consumption is CAPPED at hand stock (0061), an engineer cannot report fitting
-- a part they are genuinely holding. The cap turns a reporting gap into a
-- blocked job.
--
-- Each row here is an OPENING INJECTION, not a restatement: the pools sit
-- ALONGSIDE one another and alongside the movement history, which is how they
-- were kept. They are additive precisely because the raw movements do not cover
-- them — nothing is counted twice, because there is nothing before June 2022 to
-- count. `as_of` records when the pool was struck and `source` which pool it is.
--
-- Added as an ARM of `handstock_movements` rather than as a term of its own, so
-- every consumer inherits it without being touched: the balance, the movement
-- trail an engineer reads, `engineer_stock`, the transfer guard, and the
-- consumption cap. A separate term would have had to be added to each, and the
-- ones that were missed would silently disagree.
-- ===========================================================================

create table if not exists public.handstock_opening (
  id             bigint generated always as identity primary key,
  engineer       text not null,
  engineer_key   text generated always as (public.handstock_key(engineer)) stored,
  part           text not null,                       -- CODE|Description
  part_code      text generated always as (public.part_code(part)) stored,
  qty            numeric not null check (qty >= 0),
  as_of          date not null,
  source         text not null,                       -- 'WinMax HS', '22 H2', '23', ...
  -- Stored so the unique index below is on PLAIN COLUMNS. An expression index
  -- (lower(btrim(source))) cannot be inferred by `on conflict`, so the upload's
  -- upsert would be refused outright — the same trap the partial reports_uid
  -- index sprang in 0071. `source` keeps what was typed, for display.
  source_key     text generated always as (lower(btrim(source))) stored,
  remarks        text not null default '',
  recorded_by      uuid references auth.users (id),
  recorded_by_name text not null default '',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- One figure per engineer + part + pool, so re-loading a corrected sheet
-- REPLACES that pool's figure instead of adding a second one. Getting this
-- wrong is how an opening balance silently doubles.
create unique index if not exists handstock_opening_uniq
  on public.handstock_opening (engineer_key, part_code, source_key);
create index if not exists handstock_opening_eng_idx on public.handstock_opening (engineer_key);

create or replace function public.handstock_opening_biu()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if btrim(coalesce(new.engineer, '')) = '' then raise exception 'An opening balance needs the engineer.'; end if;
  if btrim(coalesce(new.part, ''))     = '' then raise exception 'An opening balance needs the part.'; end if;
  if btrim(coalesce(new.source, ''))   = '' then raise exception 'An opening balance needs its source (which pool it is).'; end if;
  if tg_op = 'INSERT' then new.recorded_by := coalesce(new.recorded_by, auth.uid());
  else new.recorded_by := old.recorded_by; new.created_at := old.created_at; end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists handstock_opening_biu on public.handstock_opening;
create trigger handstock_opening_biu before insert or update on public.handstock_opening
  for each row execute function public.handstock_opening_biu();

alter table public.handstock_opening enable row level security;
grant select, insert, update, delete on public.handstock_opening to authenticated;

-- Read: the same scope the rest of hand stock uses — an engineer sees their own
-- and their tree's; the office roles see all.
drop policy if exists hso_read on public.handstock_opening;
-- A set-returning function cannot appear in a policy expression, so the
-- visible-engineer list is joined as a subquery — the same shape mr_read (0039)
-- uses, and the reason it is written that way there too.
create policy hso_read on public.handstock_opening for select
  using (
    (select public.can_view_all_calls())
    or (select public.has_perm('data.view_all'))
    or lower(btrim(engineer)) in (select lower(btrim(n)) from public.visible_engineer_names() as v(n))
  );

-- Write: the Spare Coordinator's job, as with every other hand-stock
-- correction — the control point stays with them, not the engineer.
drop policy if exists hso_write on public.handstock_opening;
create policy hso_write on public.handstock_opening for all
  using (public.has_perm('consumption.reconcile') or public.has_perm('spare.dispatch'))
  with check (public.has_perm('consumption.reconcile') or public.has_perm('spare.dispatch'));

-- ---------------------------------------------------------------------------
-- The new arm. Appended to the UNION, so the balance, the movement trail,
-- engineer_stock, the transfer guard and the consumption cap all pick it up.
-- ---------------------------------------------------------------------------
do $hm$
declare v_def text;
begin
  if to_regclass('public.handstock_movements') is null then
    raise notice 'handstock_movements is not present — run the HandStock bundle first';
    return;
  end if;
  -- Already added? (This file is idempotent and the bundles are re-run.)
  if exists (select 1 from pg_views where schemaname = 'public' and viewname = 'handstock_movements'
              and definition ilike '%handstock_opening%') then
    return;
  end if;
  v_def := pg_get_viewdef('public.handstock_movements'::regclass, true);
  -- Strip the trailing semicolon pg_get_viewdef adds.
  v_def := regexp_replace(v_def, ';\s*$', '');
  execute 'create or replace view public.handstock_movements as ' || v_def || $arm$
UNION ALL
 SELECT 'IN'::text AS direction,
    'Opening'::text AS movement,
    o.engineer_key,
    COALESCE(o.engineer, ''::text) AS engineer,
    ''::text AS engineer_email,
    o.part_code,
    COALESCE(o.part, ''::text) AS part,
    COALESCE(o.qty, 0::numeric) AS qty,
    o.as_of::timestamptz AS moved_at,
    COALESCE(o.source, ''::text) AS ref,
    'Opening balance'::text AS ref_type,
    ''::text AS ref_uid,
    ''::text AS ucn,
    ''::text AS call_number,
    ''::text AS party_name,
    COALESCE(o.remarks, ''::text) AS remarks
   FROM public.handstock_opening o
$arm$;
end $hm$;

alter view public.handstock_movements set (security_invoker = on);
grant select on public.handstock_movements to authenticated;

-- Show the opening separately on the balance, so a figure that comes from a
-- pool rather than from a dispatch is legible rather than merely correct.
-- APPENDED at the end: `create or replace view` cannot insert a column.
do $hb$
begin
  if to_regclass('public.handstock_balance') is null then return; end if;
  if exists (select 1 from information_schema.columns
              where table_schema='public' and table_name='handstock_balance' and column_name='opening') then
    return;
  end if;
  execute $v$
    create or replace view public.handstock_balance as
    select engineer_key,
           max(engineer) as engineer,
           max(engineer_email) as engineer_email,
           part_code,
           coalesce(max(part) filter (where movement = 'Stock out'), max(part)) as part,
           sum(case when movement = 'Stock out'    then qty else 0 end) as stock_out,
           sum(case when movement = 'Consumption'  then qty else 0 end) as consumed,
           sum(case when movement = 'Transfer in'  then qty else 0 end) as transferred_in,
           sum(case when movement = 'Transfer out' then qty else 0 end) as transferred_out,
           sum(case when movement = 'Return'       then qty else 0 end) as returned,
           sum(case when direction = 'IN' then qty else -qty end) as on_hand,
           max(moved_at) filter (where direction = 'IN')  as last_in,
           max(moved_at) filter (where direction = 'OUT') as last_out,
           max(moved_at) as last_movement,
           count(*) as movements,
           sum(case when movement = 'Opening' then qty else 0 end) as opening
      from public.handstock_movements m
     where engineer_key <> '' and part_code <> ''
     group by engineer_key, part_code
  $v$;
end $hb$;

alter view public.handstock_balance set (security_invoker = on);
grant select on public.handstock_balance to authenticated;
