-- ===========================================================================
-- HAND STOCK ADJUSTMENT -- the proper way to add or remove quantity.
--
--   The user, 2026-09-30: "eBizWiz Admin is listed just to reconcile the
--   Handstock qty. Like if I need to add stock qty then I was using this
--   account for MTN. If there is any other way to do it, we can do it
--   differently." Asked, they chose: a Stock Adjustment, recorded by whoever
--   holds the reconciliation permission (`consumption.reconcile`), effective
--   when saved, no second approval.
--
-- WHAT IT IS: one row per adjustment -- engineer, part, a SIGNED quantity
-- (+ adds to the engineer's hand stock, - takes away), a mandatory REASON and an
-- optional REFERENCE (the MTN number, say). It is an ARM of handstock_movements
-- ('Adjustment', ref_type 'Adjustment'), so the balance, the movement trail,
-- engineer_stock, the transfer guard and the consumption cap all see it without
-- being touched -- the 0074 argument, word for word.
--
-- A RECORD, NEVER EDITED OR DELETED. No update or delete policy: a wrong
-- adjustment is put right by ANOTHER adjustment the other way, and both stay
-- on the trail with their reasons. Who and when are stamped by the database.
--
-- TWO GUARDS, the rules the rest of hand stock already keeps:
--   * the engineer must be an ACTIVE User Master name (the opening-stock rule:
--     hand stock is for the people who carry parts, not for dealers or system
--     logins -- which is exactly what eBizWiz Admin was);
--   * a MINUS cannot take the engineer below zero on that part (the
--     consumption cap's rule: stock is derived, and a negative balance is a
--     question, not an answer).
-- The part must be a Part Master part (CODE|Description), because every other
-- movement matches on that string.
--
-- AND THE eBizWiz Admin OPENING ROWS GO: 1,163 rows / 233,000 parts held under
-- a system login, measured on the live project on 2026-09-30 with
-- _handstock_opening_engineers.sql. They were WinMax's adjustment account, not
-- anybody's stock, and this table replaces what they were for. They came from
-- the WinMax file and are re-loadable from it; the uploader now holds that name
-- back anyway. Scoped to that ONE name, nothing else.
-- ===========================================================================

create table if not exists public.handstock_adjustments (
  id               bigint generated always as identity primary key,
  engineer         text not null,
  engineer_key     text generated always as (public.handstock_key(engineer)) stored,
  part             text not null,                        -- CODE|Description
  part_code        text generated always as (public.part_code(part)) stored,
  qty              numeric not null,                     -- signed: + adds, - removes
  reason           text not null,
  reference        text not null default '',             -- e.g. the MTN number
  adjusted_at      timestamptz not null default now(),
  recorded_by      uuid default auth.uid(),
  recorded_by_name text not null default '',
  created_at       timestamptz not null default now(),
  constraint handstock_adjustments_qty_nonzero check (qty <> 0),
  constraint handstock_adjustments_reason check (btrim(reason) <> '')
);
create index if not exists handstock_adjustments_eng_part_idx on public.handstock_adjustments (engineer_key, part_code);

create or replace function public.handstock_adjustments_bi()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_on_hand numeric;
begin
  new.recorded_by := auth.uid();
  new.adjusted_at := now();
  new.created_at  := now();
  -- STAMPED, never taken from the caller (the 0113/0211 rule).
  new.recorded_by_name := coalesce((select full_name from public.profiles where id = auth.uid()), '');
  if not exists (select 1 from public.user_directory u
                  where u.validity and lower(btrim(u.name)) = public.handstock_key(new.engineer)) then
    raise exception 'Hand stock is adjusted only for an ACTIVE person on the User Master -- "%" is not one.', new.engineer
      using errcode = '23514';
  end if;
  if not exists (select 1 from public.parts p where lower(btrim(p.item_detail)) = lower(btrim(new.part))) then
    raise exception 'Choose the part from the Part Master -- "%" is not on it.', new.part using errcode = '23514';
  end if;
  if new.qty < 0 then
    select coalesce(sum(case when m.direction = 'IN' then m.qty else -m.qty end), 0) into v_on_hand
      from public.handstock_movements m
     where m.engineer_key = public.handstock_key(new.engineer) and m.part_code = public.part_code(new.part);
    if v_on_hand + new.qty < 0 then
      raise exception '% holds % of that part; removing % would take them below zero.', new.engineer, v_on_hand, -new.qty
        using errcode = '23514';
    end if;
  end if;
  return new;
end $$;
revoke execute on function public.handstock_adjustments_bi() from public, anon, authenticated;
drop trigger if exists handstock_adjustments_bi on public.handstock_adjustments;
create trigger handstock_adjustments_bi before insert on public.handstock_adjustments
  for each row execute function public.handstock_adjustments_bi();

alter table public.handstock_adjustments enable row level security;
-- Read: hand stock's own scope (hso_read, 0074).
drop policy if exists hsa_read on public.handstock_adjustments;
create policy hsa_read on public.handstock_adjustments for select to authenticated
  using (
    (select public.can_view_all_calls())
    or (select public.has_perm('data.view_all'))
    or lower(btrim(engineer)) in (select lower(btrim(n)) from public.visible_engineer_names() as v(n))
  );
-- Write: the reconciliation permission (the user's choice). Insert only.
drop policy if exists hsa_insert on public.handstock_adjustments;
create policy hsa_insert on public.handstock_adjustments for insert to authenticated
  with check ((select public.has_perm('consumption.reconcile')));
grant select, insert on public.handstock_adjustments to authenticated;
revoke all on public.handstock_adjustments from anon;

-- ---- the tenth arm ------------------------------------------------------------
-- 0096's nine arms VERBATIM, and the adjustment appended. Written out whole, as
-- 0096 says it must be: editing the view's own text is what dropped
-- security_invoker once before.
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
UNION ALL

 -- THE ADJUSTMENT (0266): + is IN, - is OUT, the quantity always positive on
 -- the trail like every other arm; the reason is the remark, the reference
 -- (MTN No) the ref, and who recorded it goes in party_name.
 SELECT CASE WHEN a.qty > 0::numeric THEN 'IN'::text ELSE 'OUT'::text END AS direction,
    'Adjustment'::text AS movement,
    a.engineer_key,
    COALESCE(a.engineer, ''::text) AS engineer,
    ''::text AS engineer_email,
    a.part_code,
    COALESCE(a.part, ''::text) AS part,
    abs(a.qty) AS qty,
    a.adjusted_at AS moved_at,
    COALESCE(NULLIF(btrim(a.reference), ''::text), 'ADJ-' || a.id::text) AS ref,
    'Adjustment'::text AS ref_type,
    a.id::text AS ref_uid,
    ''::text AS ucn,
    ''::text AS call_number,
    COALESCE(a.recorded_by_name, ''::text) AS party_name,
    COALESCE(a.reason, ''::text) AS remarks
   FROM handstock_adjustments a
  WHERE a.adjusted_at >= (SELECT public.handstock_cutoff())
;

alter view public.handstock_movements set (security_invoker = on);

-- ---- eBizWiz Admin's opening rows -------------------------------------------------
do $$
declare n int; q numeric;
begin
  select count(*), coalesce(sum(qty), 0) into n, q
    from public.handstock_opening where engineer_key = 'ebizwiz admin';
  if n > 0 then
    delete from public.handstock_opening where engineer_key = 'ebizwiz admin';
    raise notice '0266: removed % opening rows / % parts held under "eBizWiz Admin" (WinMax''s adjustment account).', n, q;
  end if;
end $$;

-- ---- the five system columns (0244), attached as 0249 does ---------------------
do $$
begin
  if to_regprocedure('public.sys_columns_attach(regclass)') is not null then
    perform public.sys_columns_attach('public.handstock_adjustments'::regclass);
  end if;
end $$;
