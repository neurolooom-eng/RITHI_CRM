-- ===========================================================================
-- 0413 -- LABOUR CHARGES: BOOKED ON A CONSUMPTION, NEVER HELD AS STOCK (D-163;
-- the user, 2026-10-12: "These 3 are Labour charges, Stock need not be
-- maintained since it not something physically accounted for. And Users can
-- add these to Consumption -- It is meant more for tracking -- the Qty should
-- always be 1 when it is being selected.
--   SC001   SERVICE CHARGES (SAC NO:998719)
--   TC001   TRANSPORTATION CHARGES
--   INS-001 INSTALLATION CHARGES").
--
-- Measured on the live project first (_winmax_cut_and_labour.sql): all three
-- are on the Part Master (INS-001 and TC001 inactive); 1 consumption and 167
-- historical consumptions, every one of quantity 1; never issued, never in an
-- opening pool -- so each shows as hand stock BELOW ZERO: 39 engineer lines,
-- -168 units, and since 0401 every new one tells the Spare Coordinators to
-- correct a stock that cannot exist.
--
--   * parts.labour_charge -- the Part Master says which parts are labour, so
--     the list is the master's and not this file's. A COLUMN OF ITS OWN, not a
--     category: the Spare / Consumable column is the Item Master's word and a
--     Part Master upload rewrites it, where this column is in no upload. The
--     three are ticked ONCE, when the column is created; untick or tick on the
--     Part Master after that and a re-run leaves it alone.
--   * handstock_movements leaves a labour part out of EVERY arm, so it has no
--     hand stock line, no balance, no trail -- 0266's ten arms, read out of a
--     database built from every migration, wrapped in one filter rather than
--     edited arm by arm. The consumption rows are untouched: every report,
--     count and download that reads spare_consumption still has them, which
--     is the tracking they are for.
--   * notify_negative_handstock() says nothing for a labour part (0401's body,
--     one guard added): the hand stock it would report does not exist.
--   * QUANTITY 1. A new labour line must be 1; a saved one may be 1, or 0 when
--     it is voided (0049: a wrong line is voided, never deleted). Refused, not
--     rewritten: a silently changed quantity on a quality record is worse than
--     a message.
-- ===========================================================================

do $seed$
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'parts' and column_name = 'labour_charge') then
    alter table public.parts add column labour_charge boolean not null default false;
    update public.parts set labour_charge = true
     where upper(btrim(code)) in ('SC001', 'TC001', 'INS-001');
  end if;
end $seed$;
comment on column public.parts.labour_charge is
  'A labour charge (service, transport, installation): booked on a consumption for tracking, quantity 1, never held as hand stock (0413).';

-- The labour part codes, upper-case, as part_code() writes them. One array,
-- asked once per query (an InitPlan where it is wrapped in a sub-select).
create or replace function public.labour_part_codes()
returns text[] language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(distinct upper(btrim(code))), '{}'::text[])
    from public.parts where labour_charge and btrim(coalesce(code, '')) <> ''
$$;
revoke all on function public.labour_part_codes() from public, anon;
grant execute on function public.labour_part_codes() to authenticated;

create or replace view public.handstock_movements as
select m.* from (
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
    WHERE COALESCE(d.dispatched_at, dl.created_at) >= (( SELECT handstock_cutoff() AS handstock_cutoff))
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
    WHERE COALESCE(l.dispatched_at, r.dispatched_at, l.created_at, r.created_at) >= (( SELECT handstock_cutoff() AS handstock_cutoff)) AND (COALESCE(l.dispatched_qty, 0::numeric) > 0::numeric OR COALESCE(l.stores_status, ''::text) ~* 'dispatch'::text) AND NOT (EXISTS ( SELECT 1
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
    WHERE c.created_at >= (( SELECT handstock_cutoff() AS handstock_cutoff))
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
    WHERE COALESCE(t.transfer_date::timestamp with time zone, t.created_at) >= (( SELECT handstock_cutoff() AS handstock_cutoff))
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
    WHERE COALESCE(t.transfer_date::timestamp with time zone, t.created_at) >= (( SELECT handstock_cutoff() AS handstock_cutoff))
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
    WHERE COALESCE(m.mrn_date::timestamp with time zone, m.returned_at, m.created_at) >= (( SELECT handstock_cutoff() AS handstock_cutoff))
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
    WHERE o.as_of::timestamp with time zone >= (( SELECT handstock_cutoff() AS handstock_cutoff))
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
    WHERE COALESCE(h.consumed_at, h.created_at) >= (( SELECT handstock_cutoff() AS handstock_cutoff))
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
    WHERE COALESCE(h.issued_at, h.created_at) >= (( SELECT handstock_cutoff() AS handstock_cutoff)) AND NOT (EXISTS ( SELECT 1
             FROM spare_request_lines l
            WHERE lower(btrim(l.line_uid)) = lower(btrim(h.line_uid)) AND h.line_uid <> ''::text AND (COALESCE(l.dispatched_qty, 0::numeric) > 0::numeric OR COALESCE(l.stores_status, ''::text) ~* 'dispatch'::text)))
  UNION ALL
   SELECT
          CASE
              WHEN a.qty > 0::numeric THEN 'IN'::text
              ELSE 'OUT'::text
          END AS direction,
      'Adjustment'::text AS movement,
      a.engineer_key,
      COALESCE(a.engineer, ''::text) AS engineer,
      ''::text AS engineer_email,
      a.part_code,
      COALESCE(a.part, ''::text) AS part,
      abs(a.qty) AS qty,
      a.adjusted_at AS moved_at,
      COALESCE(NULLIF(btrim(a.reference), ''::text), 'ADJ-'::text || a.id::text) AS ref,
      'Adjustment'::text AS ref_type,
      a.id::text AS ref_uid,
      ''::text AS ucn,
      ''::text AS call_number,
      COALESCE(a.recorded_by_name, ''::text) AS party_name,
      COALESCE(a.reason, ''::text) AS remarks
     FROM handstock_adjustments a
    WHERE a.adjusted_at >= (( SELECT handstock_cutoff() AS handstock_cutoff))
) m
where not (m.part_code = any ((select public.labour_part_codes())::text[]));
alter view public.handstock_movements set (security_invoker = on);
grant select on public.handstock_movements to authenticated;

create or replace function public.notify_negative_handstock(
  p_engineer text, p_part text, p_avail numeric, p_qty numeric, p_ucn text, p_how text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare after numeric := coalesce(p_avail, 0) - coalesce(p_qty, 0);
begin
  -- A labour charge is never held, so it has no stock to go below zero (0413).
  if public.part_code(p_part) = any (public.labour_part_codes()) then
    return;
  end if;
  insert into public.notifications (recipient_id, recipient_email, kind, title, body, link)
  select p.id, coalesce(p.email, ''), 'negative_handstock',
         'Hand stock gone negative: ' || public.part_code(p_part),
         concat_ws(' · ',
           btrim(coalesce(p_engineer, '')),
           nullif(btrim(coalesce(p_part, '')), ''),
           'had ' || trim(to_char(coalesce(p_avail, 0), 'FM999999990.##')) || ', '
             || trim(to_char(coalesce(p_qty, 0), 'FM999999990.##')) || ' consumed, now '
             || trim(to_char(after, 'FM999999990.##')),
           nullif('UCN ' || btrim(coalesce(p_ucn, '')), 'UCN '),
           nullif(btrim(coalesce(p_how, '')), '')),
         '/handstock'
    from public.profiles p
   where p.role = 'spare_coordinator' and coalesce(p.active, true);
end $$;
revoke execute on function public.notify_negative_handstock(text, text, numeric, numeric, text, text) from public, anon, authenticated;

create or replace function public.labour_charge_qty_one()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.part_code(new.part) = any (public.labour_part_codes()) then
    if tg_op = 'INSERT' and coalesce(new.qty, 0) <> 1 then
      raise exception '% is a labour charge: it is booked once, quantity 1', public.part_code(new.part)
        using errcode = '23514';
    end if;
    if tg_op = 'UPDATE' and coalesce(new.qty, 0) not in (0, 1) then
      raise exception '% is a labour charge: its quantity is 1, or 0 to void the line', public.part_code(new.part)
        using errcode = '23514';
    end if;
  end if;
  return new;
end $$;
revoke execute on function public.labour_charge_qty_one() from public, anon, authenticated;
drop trigger if exists labour_charge_qty_one on public.spare_consumption;
create trigger labour_charge_qty_one before insert or update of qty, part on public.spare_consumption
  for each row execute function public.labour_charge_qty_one();
