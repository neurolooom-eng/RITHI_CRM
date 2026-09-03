-- ===========================================================================
-- CLOSING A PERIOD — hand stock stops re-deriving history it has already settled.
--
-- The balance is derived from every movement ever recorded. That was right, and
-- affordable, until the whole history was loaded: 103,000 rows through nine
-- arms, each access-checked. Measured on the full load: 98 ms with row-level
-- security OFF, ELEVEN TO FOURTEEN SECONDS with it on — which is what the
-- screen's "canceling statement due to statement timeout" was. 0095's InitPlan
-- fixes took it to 3-5 s. Still too slow, and it grows with every year.
--
-- The answer is the accountant's one, and it beats a cache: CLOSE THE PERIOD.
-- An opening figure per engineer and part carries everything up to a date, and
-- the register reads only what has happened since. Nothing is estimated and
-- nothing goes stale — the figure IS the sum of what it stands for — and the
-- detail stays in its tables, to be read for anything else.
--
-- 86,350 of the 103,000 rows pre-date 2026.
--
-- HOW THE LINE WORKS: every arm, INCLUDING the opening pools, counts only what
-- falls after the cut-off. So a pool struck at 01-Jan-2026 counts and the WinMax
-- pool struck in June 2022 does not, without deleting anything. Upload an
-- opening balance dated the day after the cut-off and the older pools retire
-- themselves.
--
-- `close_handstock_period(date)` will work the figure out and write it for you;
-- `set_handstock_cutoff(date)` only moves the line, for when the figure is one
-- you have prepared and uploaded yourself.
-- ===========================================================================

create table if not exists public.handstock_period (
  singleton      boolean primary key default true check (singleton),
  closed_through date,
  closed_at      timestamptz,
  closed_by      uuid,
  closed_by_name text not null default ''
);
insert into public.handstock_period (singleton) values (true) on conflict (singleton) do nothing;

alter table public.handstock_period enable row level security;
grant select on public.handstock_period to authenticated;
drop policy if exists hp_read on public.handstock_period;
create policy hp_read on public.handstock_period for select using (auth.role() = 'authenticated');

-- The line, as a timestamp: THE FIRST INSTANT STILL OPEN — the day AFTER the one
-- closed through. `-infinity` while nothing is closed, so every arm's test has
-- the same shape whether or not a close has ever been run.
--
-- It has to be that instant and not the closed day's own midnight, and the arms
-- have to test `>=` against it, because THE CLOSE AND THE ARMS MUST DIVIDE THE
-- SAME LINE. The first cut of this returned the closed date itself and the arms
-- tested `>`, which left the whole of the closing day on BOTH sides: summed into
-- the opening figure and still counted as an open movement. On the real data
-- that was six movements, and a close that was supposed to change nothing added
-- two pools and ten parts. `< cutoff` and `>= cutoff` are exact complements, so
-- there is no day either of them can read twice.
create or replace function public.handstock_cutoff()
returns timestamptz language sql stable security definer set search_path = public as $$
  select coalesce((select closed_through + 1 from public.handstock_period limit 1)::timestamptz,
                  '-infinity'::timestamptz);
$$;
grant execute on function public.handstock_cutoff() to authenticated;

-- A CLOSING FIGURE MAY BE NEGATIVE. 0074 wrote `check (qty >= 0)` for a pool
-- somebody types in, where a negative opening makes no sense. A pool that CLOSES
-- a period is a different thing: it must equal exactly what it replaces, and 282
-- engineer-and-part pairs are already negative because the record of what they
-- were issued is incomplete. Refusing those would quietly improve the numbers at
-- the close — the one thing a close must never do. The reconciliation exists to
-- show a shortfall, not to have it rounded away.
alter table public.handstock_opening drop constraint if exists handstock_opening_qty_check;

-- The dates the arms are filtered on, so the cut-off is an index lookup rather
-- than a scan of everything that has ever happened. (Not the MRN date: a cast
-- from date to timestamptz is not immutable, and 595 rows do not need one.)
create index if not exists spare_consumption_history_at_idx
  on public.spare_consumption_history ((coalesce(consumed_at, created_at)));
create index if not exists spare_issue_history_at_idx
  on public.spare_issue_history ((coalesce(issued_at, created_at)));
create index if not exists spare_consumption_created_idx
  on public.spare_consumption (created_at);
create index if not exists handstock_opening_as_of_idx
  on public.handstock_opening (as_of);

-- ---------------------------------------------------------------------------
-- The movement trail, written out in full rather than appended to by string
-- surgery. Nine arms, the cut-off on every one.
--
-- Writing it out is deliberate: appending an arm by editing the view's own text
-- is what silently dropped `security_invoker` when 0090 did it, and a view
-- nobody can read in one piece is a view nobody can check.
-- ---------------------------------------------------------------------------
create or replace view public.handstock_movements as
 SELECT 'IN'::text AS direction,
    'Stock out'::text AS movement,
    handstock_key(r.engineer) AS engineer_key,
    COALESCE(r.engineer, ''::text) AS engineer,
    COALESCE(r.engineer_email, ''::text) AS engineer_email,
    part_code(dl.part) AS part_code,
    COALESCE(dl.part, ''::text) AS part,
    COALESCE(dl.qty, 0::numeric) AS qty,
    COALESCE(d.dispatched_at, dl.created_at) AS moved_at,
    COALESCE(NULLIF(d.dc_number, ''::text), r.or_no, ''::text) AS ref,
    'Stores DC'::text AS ref_type,
    COALESCE(r.uid, ''::text) AS ref_uid,
    COALESCE(r.ucn, ''::text) AS ucn,
    COALESCE(r.call_number, ''::text) AS call_number,
    COALESCE(r.party_name, ''::text) AS party_name,
    COALESCE(NULLIF(l.dispatch_remarks, ''::text), ''::text) AS remarks
   FROM spare_dispatch_lines dl
     JOIN spare_dispatches d ON d.uid = dl.dispatch_uid
     JOIN spare_request_lines l ON l.id = dl.line_id
     JOIN spare_requests r ON r.uid = l.request_uid
  WHERE COALESCE(d.dispatched_at, dl.created_at) >= (SELECT public.handstock_cutoff())
UNION ALL

 SELECT 'IN'::text AS direction,
    'Stock out'::text AS movement,
    handstock_key(r.engineer) AS engineer_key,
    COALESCE(r.engineer, ''::text) AS engineer,
    COALESCE(r.engineer_email, ''::text) AS engineer_email,
    part_code(l.part) AS part_code,
    COALESCE(l.part, ''::text) AS part,
        CASE
            WHEN COALESCE(l.dispatched_qty, 0::numeric) > 0::numeric THEN l.dispatched_qty
            ELSE COALESCE(l.qty, 0::numeric)
        END AS qty,
    COALESCE(l.dispatched_at, r.dispatched_at, l.created_at, r.created_at) AS moved_at,
    COALESCE(NULLIF(l.dc_number, ''::text), r.or_no, ''::text) AS ref,
    'Stores DC'::text AS ref_type,
    COALESCE(r.uid, ''::text) AS ref_uid,
    COALESCE(r.ucn, ''::text) AS ucn,
    COALESCE(r.call_number, ''::text) AS call_number,
    COALESCE(r.party_name, ''::text) AS party_name,
    COALESCE(NULLIF(l.dispatch_remarks, ''::text), ''::text) AS remarks
   FROM spare_request_lines l
     JOIN spare_requests r ON r.uid = l.request_uid
  WHERE COALESCE(l.dispatched_at, r.dispatched_at, l.created_at, r.created_at) >= (SELECT public.handstock_cutoff()) AND (COALESCE(l.dispatched_qty, 0::numeric) > 0::numeric OR COALESCE(l.stores_status, ''::text) ~* 'dispatch'::text) AND NOT (EXISTS ( SELECT 1
           FROM spare_dispatch_lines dl
          WHERE dl.line_id = l.id))
UNION ALL

 SELECT 'OUT'::text AS direction,
    'Consumption'::text AS movement,
    handstock_key(c.engineer) AS engineer_key,
    COALESCE(c.engineer, ''::text) AS engineer,
    COALESCE(c.engineer_email, ''::text) AS engineer_email,
    part_code(c.part) AS part_code,
    COALESCE(c.part, ''::text) AS part,
    COALESCE(c.qty, 0::numeric) AS qty,
    c.created_at AS moved_at,
    COALESCE(NULLIF(btrim(c.call_number), ''::text), COALESCE(c.ucn, ''::text)) AS ref,
    'Call'::text AS ref_type,
    ''::text AS ref_uid,
    COALESCE(c.ucn, ''::text) AS ucn,
    COALESCE(c.call_number, ''::text) AS call_number,
    ''::text AS party_name,
    ''::text AS remarks
   FROM spare_consumption c
  WHERE c.created_at >= (SELECT public.handstock_cutoff())
UNION ALL

 SELECT 'OUT'::text AS direction,
    'Transfer out'::text AS movement,
    handstock_key(t.from_engineer) AS engineer_key,
    COALESCE(t.from_engineer, ''::text) AS engineer,
    ''::text AS engineer_email,
    part_code(l.part) AS part_code,
    COALESCE(l.part, ''::text) AS part,
    COALESCE(l.qty, 0::numeric) AS qty,
    COALESCE(t.transfer_date::timestamp with time zone, t.created_at) AS moved_at,
    COALESCE(t.uid, ''::text) AS ref,
    'Transfer'::text AS ref_type,
    ''::text AS ref_uid,
    ''::text AS ucn,
    ''::text AS call_number,
    COALESCE(t.to_engineer, ''::text) AS party_name,
    COALESCE(t.remarks, ''::text) AS remarks
   FROM stock_transfer_lines l
     JOIN stock_transfers t ON t.uid = l.transfer_uid
  WHERE COALESCE(t.transfer_date::timestamp with time zone, t.created_at) >= (SELECT public.handstock_cutoff())
UNION ALL

 SELECT 'IN'::text AS direction,
    'Transfer in'::text AS movement,
    handstock_key(t.to_engineer) AS engineer_key,
    COALESCE(t.to_engineer, ''::text) AS engineer,
    ''::text AS engineer_email,
    part_code(l.part) AS part_code,
    COALESCE(l.part, ''::text) AS part,
    COALESCE(l.qty, 0::numeric) AS qty,
    COALESCE(t.transfer_date::timestamp with time zone, t.created_at) AS moved_at,
    COALESCE(t.uid, ''::text) AS ref,
    'Transfer'::text AS ref_type,
    ''::text AS ref_uid,
    ''::text AS ucn,
    ''::text AS call_number,
    COALESCE(t.from_engineer, ''::text) AS party_name,
    COALESCE(t.remarks, ''::text) AS remarks
   FROM stock_transfer_lines l
     JOIN stock_transfers t ON t.uid = l.transfer_uid
  WHERE COALESCE(t.transfer_date::timestamp with time zone, t.created_at) >= (SELECT public.handstock_cutoff())
UNION ALL

 SELECT 'OUT'::text AS direction,
    'Return'::text AS movement,
    handstock_key(m.engineer) AS engineer_key,
    COALESCE(m.engineer, ''::text) AS engineer,
    COALESCE(m.engineer_email, ''::text) AS engineer_email,
    part_code(m.part) AS part_code,
    COALESCE(m.part, ''::text) AS part,
    COALESCE(m.good_qty, 0::numeric) + COALESCE(m.defective_qty, 0::numeric) AS qty,
    COALESCE(m.mrn_date::timestamp with time zone, m.returned_at, m.created_at) AS moved_at,
    COALESCE(NULLIF(btrim(m.mrn_no), ''::text), m.uid, ''::text) AS ref,
    'MRN'::text AS ref_type,
    COALESCE(m.uid, ''::text) AS ref_uid,
    ''::text AS ucn,
    COALESCE(m.report_no, ''::text) AS call_number,
    COALESCE(m.customer_name, ''::text) AS party_name,
    btrim(
        CASE
            WHEN COALESCE(m.defective_qty, 0::numeric) > 0::numeric THEN ((('good '::text || COALESCE(m.good_qty, 0::numeric)) || ', defective '::text) || m.defective_qty) || ' · '::text
            ELSE ''::text
        END || COALESCE(m.remarks, ''::text)) AS remarks
   FROM material_returns m
  WHERE COALESCE(m.mrn_date::timestamp with time zone, m.returned_at, m.created_at) >= (SELECT public.handstock_cutoff())
UNION ALL

 SELECT 'IN'::text AS direction,
    'Opening'::text AS movement,
    o.engineer_key,
    COALESCE(o.engineer, ''::text) AS engineer,
    ''::text AS engineer_email,
    o.part_code,
    COALESCE(o.part, ''::text) AS part,
    COALESCE(o.qty, 0::numeric) AS qty,
    o.as_of::timestamp with time zone AS moved_at,
    COALESCE(o.source, ''::text) AS ref,
    'Opening balance'::text AS ref_type,
    ''::text AS ref_uid,
    ''::text AS ucn,
    ''::text AS call_number,
    ''::text AS party_name,
    COALESCE(o.remarks, ''::text) AS remarks
   FROM handstock_opening o
  WHERE o.as_of::timestamp with time zone >= (SELECT public.handstock_cutoff())
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
   FROM spare_consumption_history h
  WHERE COALESCE(h.consumed_at, h.created_at) >= (SELECT public.handstock_cutoff())
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
   FROM spare_issue_history h
  WHERE COALESCE(h.issued_at, h.created_at) >= (SELECT public.handstock_cutoff()) AND NOT (EXISTS ( SELECT 1
           FROM spare_request_lines l
          WHERE lower(btrim(l.line_uid)) = lower(btrim(h.line_uid)) AND h.line_uid <> ''::text AND (COALESCE(l.dispatched_qty, 0::numeric) > 0::numeric OR COALESCE(l.stores_status, ''::text) ~* 'dispatch'::text)))
;

alter view public.handstock_movements set (security_invoker = on);

-- ---------------------------------------------------------------------------
-- Move the line, when the opening figure is one you have prepared and uploaded.
-- ---------------------------------------------------------------------------
create or replace function public.set_handstock_cutoff(p_through date)
returns date language plpgsql security definer set search_path = public as $$
declare v_name text := coalesce((select full_name from public.profiles where id = auth.uid()), '');
begin
  if not (public.is_admin() or public.has_perm('consumption.reconcile')) then
    raise exception 'Closing a hand-stock period is the Spare Coordinator''s or an administrator''s to do';
  end if;
  if p_through is not null and p_through >= current_date then
    raise exception 'Close a period that has ENDED — % is not in the past', p_through;
  end if;
  update public.handstock_period
     set closed_through = p_through, closed_at = now(), closed_by = auth.uid(), closed_by_name = v_name
   where singleton;
  return p_through;
end $$;
revoke all on function public.set_handstock_cutoff(date) from public;
grant execute on function public.set_handstock_cutoff(date) to authenticated;

-- ---------------------------------------------------------------------------
-- Or work the figure out and write it, in one statement.
--
-- Order matters: the sum is taken BEFORE the line moves, or it would be summing
-- what it is about to hide.
-- ---------------------------------------------------------------------------
create or replace function public.close_handstock_period(p_through date)
returns table (pools int, parts numeric) language plpgsql security definer set search_path = public as $$
declare
  v_source text := 'Opening ' || to_char(p_through + 1, 'YYYY');
  v_name   text := coalesce((select full_name from public.profiles where id = auth.uid()), '');
begin
  if not (public.is_admin() or public.has_perm('consumption.reconcile')) then
    raise exception 'Closing a hand-stock period is the Spare Coordinator''s or an administrator''s to do';
  end if;
  if p_through is null or p_through >= current_date then
    raise exception 'Close a period that has ENDED — % is not in the past', p_through;
  end if;

  -- `< the first open instant` — the exact complement of what the arms keep, so
  -- the closing day belongs to the figure and to nothing else.
  create temp table _close on commit drop as
  select engineer_key,
         min(engineer) filter (where engineer <> '') as engineer,
         part_code,
         min(part)     filter (where part <> '')     as part,
         sum(case when direction = 'IN' then qty else -qty end) as on_hand
    from public.handstock_movements
   where moved_at is null
      or moved_at < (p_through + 1)::timestamptz
   group by engineer_key, part_code
  having sum(case when direction = 'IN' then qty else -qty end) <> 0;

  insert into public.handstock_opening (engineer, part, qty, as_of, source, remarks, recorded_by, recorded_by_name)
  select coalesce(engineer, engineer_key), coalesce(part, part_code), on_hand,
         p_through + 1, v_source,
         'Closed through ' || to_char(p_through, 'DD-Mon-YYYY') || ' — the net of every movement up to that date.',
         auth.uid(), v_name
    from _close
   where coalesce(engineer, engineer_key) <> '' and coalesce(part, part_code) <> ''
  on conflict (engineer_key, part_code, source_key) do update
     set qty = excluded.qty, as_of = excluded.as_of, remarks = excluded.remarks, updated_at = now();

  update public.handstock_period
     set closed_through = p_through, closed_at = now(), closed_by = auth.uid(), closed_by_name = v_name
   where singleton;

  return query select count(*)::int, coalesce(sum(on_hand), 0) from _close;
end $$;
revoke all on function public.close_handstock_period(date) from public;
grant execute on function public.close_handstock_period(date) to authenticated;
