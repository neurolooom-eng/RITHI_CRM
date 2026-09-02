-- ===========================================================================
-- HISTORICAL SPARE MOVEMENT — the record before the system held it.
--
-- ~44,000 consumption rows pre-date this system. Loading them into
-- `spare_consumption` would be wrong twice over:
--
--   * the CAP (0061) checks every inserted line against the engineer's hand
--     stock. Applied retrospectively it would REFUSE most of the history —
--     silently deleting real consumption to satisfy a rule that did not exist
--     when it happened.
--   * the cap runs a derivation per row. Over 44,000 rows that is an aggregate
--     over the whole movement history, forty-four thousand times.
--
-- So history lives in its OWN table, with no cap and no reconciliation, and is
-- CONSOLIDATED into hand stock as another arm — exactly as the opening pools
-- are (0074). Reconciliation stays where it belongs: on the 2026 entries in
-- `spare_consumption`, which is where the control point is meant to be.
--
-- `source` says which body of data a row came from, so a historical figure can
-- always be traced back to the sheet it was recovered from.
-- ===========================================================================

create table if not exists public.spare_consumption_history (
  id             bigint generated always as identity primary key,
  engineer       text not null,
  engineer_key   text generated always as (public.handstock_key(engineer)) stored,
  part           text not null,                       -- CODE|Description
  part_code      text generated always as (public.part_code(part)) stored,
  qty            numeric not null check (qty >= 0),
  consumed_at    timestamptz,
  ucn            text not null default '',
  call_number    text not null default '',
  party_name     text not null default '',
  source         text not null,                       -- which body of data this came from
  -- Stored, so the unique index below is on PLAIN COLUMNS: an expression index
  -- cannot be inferred by `on conflict`, and the upload upserts on it.
  source_key     text generated always as (lower(btrim(source))) stored,
  ref            text not null default '',            -- its id in that source
  remarks        text not null default '',
  data           jsonb not null default '{}',
  recorded_by      uuid references auth.users (id),
  recorded_by_name text not null default '',
  created_at     timestamptz not null default now()
);

-- The source's own reference is what makes a re-load correct rather than
-- duplicate. Where a row has none it is still loadable — it just cannot be
-- matched on a second run, which the upload screen says out loud.
-- Partial, because a row with no reference in its source cannot be matched on
-- a re-run and must not be forced to collide with the others. The upload says
-- so out loud rather than quietly duplicating.
create unique index if not exists spare_consumption_history_ref_uniq
  on public.spare_consumption_history (source_key, ref)
  where ref <> '';

create index if not exists spare_consumption_history_eng_idx  on public.spare_consumption_history (engineer_key);
create index if not exists spare_consumption_history_part_idx on public.spare_consumption_history (part_code);
create index if not exists spare_consumption_history_ucn_idx  on public.spare_consumption_history (ucn) where ucn <> '';

create or replace function public.spare_consumption_history_biu()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if btrim(coalesce(new.engineer, '')) = '' then raise exception 'A historical consumption row needs the engineer.'; end if;
  if btrim(coalesce(new.part, ''))     = '' then raise exception 'A historical consumption row needs the part.'; end if;
  if btrim(coalesce(new.source, ''))   = '' then raise exception 'A historical consumption row needs its source (which body of data it came from).'; end if;
  if tg_op = 'INSERT' then new.recorded_by := coalesce(new.recorded_by, auth.uid());
  else new.recorded_by := old.recorded_by; new.created_at := old.created_at; end if;
  return new;
end $$;
drop trigger if exists spare_consumption_history_biu on public.spare_consumption_history;
create trigger spare_consumption_history_biu before insert or update on public.spare_consumption_history
  for each row execute function public.spare_consumption_history_biu();

-- NOTE: deliberately NO cap trigger and NO reconciliation. This table is the
-- record of what happened, not a control point. 0049's retention guard does not
-- cover it either — it is loadable and correctable until the history is settled.

alter table public.spare_consumption_history enable row level security;
grant select, insert, update, delete on public.spare_consumption_history to authenticated;

drop policy if exists sch_read on public.spare_consumption_history;
create policy sch_read on public.spare_consumption_history for select
  using (
    (select public.can_view_all_calls())
    or (select public.has_perm('data.view_all'))
    or lower(btrim(engineer)) in (select lower(btrim(n)) from public.visible_engineer_names() as v(n))
  );

drop policy if exists sch_write on public.spare_consumption_history;
create policy sch_write on public.spare_consumption_history for all
  using (public.has_perm('consumption.reconcile') or public.has_perm('spare.dispatch'))
  with check (public.has_perm('consumption.reconcile') or public.has_perm('spare.dispatch'));

-- ---------------------------------------------------------------------------
-- Consolidate it into hand stock — another arm, so the balance, the movement
-- trail, engineer_stock, the transfer guard and the 2026 cap all see it without
-- being touched.
-- ---------------------------------------------------------------------------
do $hm$
declare v_def text;
begin
  if to_regclass('public.handstock_movements') is null then
    raise notice 'handstock_movements is not present — run the HandStock bundle first';
    return;
  end if;
  if exists (select 1 from pg_views where schemaname = 'public' and viewname = 'handstock_movements'
              and definition ilike '%spare_consumption_history%') then
    return;
  end if;
  v_def := regexp_replace(pg_get_viewdef('public.handstock_movements'::regclass, true), ';\s*$', '');
  execute 'create or replace view public.handstock_movements as ' || v_def || $arm$
UNION ALL
 SELECT 'OUT'::text AS direction,
    'Consumption'::text AS movement,
    h.engineer_key,
    COALESCE(h.engineer, ''::text) AS engineer,
    ''::text AS engineer_email,
    h.part_code,
    COALESCE(h.part, ''::text) AS part,
    COALESCE(h.qty, 0::numeric) AS qty,
    COALESCE(h.consumed_at, h.created_at) AS moved_at,
    COALESCE(NULLIF(h.ref, ''::text), h.source, ''::text) AS ref,
    'Historical'::text AS ref_type,
    ''::text AS ref_uid,
    COALESCE(h.ucn, ''::text) AS ucn,
    COALESCE(h.call_number, ''::text) AS call_number,
    COALESCE(h.party_name, ''::text) AS party_name,
    COALESCE(h.remarks, ''::text) AS remarks
   FROM public.spare_consumption_history h
$arm$;
end $hm$;

alter view public.handstock_movements set (security_invoker = on);
grant select on public.handstock_movements to authenticated;
