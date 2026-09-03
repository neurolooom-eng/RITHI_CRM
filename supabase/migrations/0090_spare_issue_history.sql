-- ===========================================================================
-- WHAT WAS ISSUED — the other half of the historical record.
--
-- Hand stock is, in the user's own words:
--
--     WinMax HS + SO + ST received - Consumption - ST sent - MRN
--
-- Every one of those has a home already except the SO — the stock outs. The
-- issue side has only ever been derived from a spare REQUEST: a dispatch line
-- joined to its request, or (0074/0084) a request line marked dispatched. That
-- covers 2026, where the requests were exported. It cannot cover 2022-2025:
-- the stock-out export has 48,196 rows and 40,085 of them name a request that
-- is not in this system at all.
--
-- So the issues get the same treatment 0075 gave the consumption they paid for:
-- their own table, no cap, and CONSOLIDATED as another arm of
-- handstock_movements — so the balance, the movement trail, engineer_stock, the
-- transfer guard and the 2026 cap all inherit it untouched.
--
-- The arm EXCLUDES any row whose spare is already counted through its request
-- line, so loading the whole stock-out export alongside the 2026 register
-- cannot count 2026 twice. The test is the line's own id (OR number|part), and
-- it is made by the view rather than by the import: it stays right when the
-- 2026 requests are loaded later, or re-loaded.
-- ===========================================================================

-- The opening pools keep what their sheet carried, as every other register
-- does: the WinMax export has the item code, name, type, category, prices and
-- the missing balance, none of which the table has a field for, and the part
-- itself is built from two of them.
alter table public.handstock_opening add column if not exists data jsonb not null default '{}'::jsonb;

create table if not exists public.spare_issue_history (
  id             bigint generated always as identity primary key,
  engineer       text not null,
  engineer_key   text generated always as (public.handstock_key(engineer)) stored,
  part           text not null,                       -- CODE|Description
  part_code      text generated always as (public.part_code(part)) stored,
  qty            numeric not null check (qty > 0),
  issued_at      timestamptz,
  so_no          text not null default '',            -- the stock out it went on
  line_uid       text not null default '',            -- OR number|part, where it has one
  source         text not null,                       -- which body of data this came from
  source_key     text generated always as (lower(btrim(source))) stored,
  ref            text not null default '',            -- its id in that source
  remarks        text not null default '',
  data           jsonb not null default '{}',
  recorded_by      uuid references auth.users (id),
  recorded_by_name text not null default '',
  created_at     timestamptz not null default now()
);

-- PLAIN, not partial. 0075 made this one partial (`where ref <> ''`) and 0077
-- had to undo it: `on conflict` cannot infer a partial index, so the upload was
-- refused outright. The register always sends a ref — the SO number and the
-- line — and a row without one could not be matched on a re-run anyway.
create unique index if not exists spare_issue_history_ref_uniq
  on public.spare_issue_history (source_key, ref);

create index if not exists spare_issue_history_eng_idx  on public.spare_issue_history (engineer_key);
create index if not exists spare_issue_history_part_idx on public.spare_issue_history (part_code);
create index if not exists spare_issue_history_line_idx on public.spare_issue_history (line_uid) where line_uid <> '';

create or replace function public.spare_issue_history_biu()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if btrim(coalesce(new.engineer, '')) = '' then raise exception 'An issued spare needs the engineer it went to.'; end if;
  if btrim(coalesce(new.part, ''))     = '' then raise exception 'An issued spare needs the part.'; end if;
  if btrim(coalesce(new.source, ''))   = '' then raise exception 'An issued spare needs its source (which body of data it came from).'; end if;
  -- PostgREST sends one object per row and fills a key some rows do not carry
  -- with NULL, which a `not null default ''` column then refuses. The default
  -- only applies to a key that is ABSENT — so a mixed batch (a few rows have an
  -- Address, most do not) fails on the ones that do not. Settle it here.
  new.so_no    := coalesce(new.so_no, '');
  new.line_uid := coalesce(new.line_uid, '');
  new.ref      := coalesce(new.ref, '');
  new.remarks  := coalesce(new.remarks, '');
  new.data     := coalesce(new.data, '{}'::jsonb);
  new.recorded_by_name := coalesce(new.recorded_by_name, '');
  if tg_op = 'INSERT' then new.recorded_by := coalesce(new.recorded_by, auth.uid());
  else new.recorded_by := old.recorded_by; new.created_at := old.created_at; end if;
  return new;
end $$;
drop trigger if exists spare_issue_history_biu on public.spare_issue_history;
create trigger spare_issue_history_biu before insert or update on public.spare_issue_history
  for each row execute function public.spare_issue_history_biu();

alter table public.spare_issue_history enable row level security;
grant select, insert, update, delete on public.spare_issue_history to authenticated;

drop policy if exists sih_read on public.spare_issue_history;
create policy sih_read on public.spare_issue_history for select
  using (
    (select public.can_view_all_calls())
    or (select public.has_perm('data.view_all'))
    or lower(btrim(engineer)) in (select lower(btrim(n)) from public.visible_engineer_names() as v(n))
  );

drop policy if exists sih_write on public.spare_issue_history;
create policy sih_write on public.spare_issue_history for all
  using (public.has_perm('consumption.reconcile') or public.has_perm('spare.dispatch'))
  with check (public.has_perm('consumption.reconcile') or public.has_perm('spare.dispatch'));

-- ---------------------------------------------------------------------------
-- The arm.
-- ---------------------------------------------------------------------------
do $hm$
declare v_def text;
begin
  if to_regclass('public.handstock_movements') is null then
    raise notice 'handstock_movements is not present — run the HandStock bundle first';
    return;
  end if;
  if exists (select 1 from pg_views where schemaname = 'public' and viewname = 'handstock_movements'
              and definition ilike '%spare_issue_history%') then
    -- Already carries the arm; still make sure of the line below.
    execute 'alter view public.handstock_movements set (security_invoker = on)';
    return;
  end if;
  v_def := regexp_replace(pg_get_viewdef('public.handstock_movements'::regclass, true), ';\s*$', '');
  execute 'create or replace view public.handstock_movements as ' || v_def || $arm$
UNION ALL
 SELECT 'IN'::text AS direction,
    'Stock out'::text AS movement,
    h.engineer_key,
    COALESCE(h.engineer, ''::text) AS engineer,
    ''::text AS engineer_email,
    h.part_code,
    COALESCE(h.part, ''::text) AS part,
    COALESCE(h.qty, 0::numeric) AS qty,
    COALESCE(h.issued_at, h.created_at) AS moved_at,
    COALESCE(NULLIF(h.so_no, ''::text), NULLIF(h.ref, ''::text), h.source, ''::text) AS ref,
    'Historical'::text AS ref_type,
    ''::text AS ref_uid,
    ''::text AS ucn,
    ''::text AS call_number,
    ''::text AS party_name,
    COALESCE(h.remarks, ''::text) AS remarks
   FROM public.spare_issue_history h
  WHERE NOT EXISTS (
          SELECT 1 FROM public.spare_request_lines l
           WHERE lower(btrim(l.line_uid)) = lower(btrim(h.line_uid))
             AND h.line_uid <> ''::text
             AND (COALESCE(l.dispatched_qty, 0::numeric) > 0::numeric
                  OR COALESCE(l.stores_status, ''::text) ~* 'dispatch'::text))
$arm$;
  -- CREATE OR REPLACE VIEW does NOT carry `security_invoker` over, and without
  -- it the view runs as its OWNER: every arm's row-level security stops
  -- applying and an RM can see another team's hand stock. The scope suite
  -- caught exactly that. Re-assert it, every time this view is rebuilt.
  execute 'alter view public.handstock_movements set (security_invoker = on)';
end $hm$;

-- ---------------------------------------------------------------------------
-- The same NULL-versus-absent trap on the consumption history (0075). Its `ucn`,
-- `call_number` and `party_name` are `not null default ''`, and the yearly
-- exports have rows with no UC Number: PostgREST fills the key it saw on other
-- rows of the batch with NULL, and the default never applies to a key that IS
-- present. One such row failed all 12,292.
-- ---------------------------------------------------------------------------
create or replace function public.spare_consumption_history_biu()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if btrim(coalesce(new.engineer, '')) = '' then raise exception 'A historical consumption row needs the engineer.'; end if;
  if btrim(coalesce(new.part, ''))     = '' then raise exception 'A historical consumption row needs the part.'; end if;
  if btrim(coalesce(new.source, ''))   = '' then raise exception 'A historical consumption row needs its source (which body of data it came from).'; end if;
  new.ucn         := coalesce(new.ucn, '');
  new.call_number := coalesce(new.call_number, '');
  new.party_name  := coalesce(new.party_name, '');
  new.ref         := coalesce(new.ref, '');
  new.remarks     := coalesce(new.remarks, '');
  new.data        := coalesce(new.data, '{}'::jsonb);
  new.recorded_by_name := coalesce(new.recorded_by_name, '');
  if tg_op = 'INSERT' then new.recorded_by := coalesce(new.recorded_by, auth.uid());
  else new.recorded_by := old.recorded_by; new.created_at := old.created_at; end if;
  return new;
end $$;
