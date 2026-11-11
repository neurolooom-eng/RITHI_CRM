-- ===========================================================================
-- 0468 -- HAND STOCK RECONCILIATION: A PHYSICAL COUNT RESETS THE LINE.
--
--   The user, 2026-11-11: "I need a Provision to Re-concile the Stock. When i
--   Reconcile, it should take the Date and Time of Reconcilliation and Igonre
--   all past transactions for Calculation but those should be retained as
--   Historical Data. As part of Reconcilliation, i will be setting the Opening
--   Stock which is physcially verified and get updated. ... it is planned to
--   be done live - say 2/3 users per day ... So it should record who did it,
--   when."
--   Asked, they chose:
--     * ONLY THE PARTS ENTERED are reset. A part not counted keeps its
--       calculated balance and its movements.
--     * THE DATE A MOVEMENT WAS ENTERED decides which side of the count it
--       falls: anything saved after the reconciliation counts against the new
--       opening, even if it physically happened before the count.
--     * A NEW KEY, handstock.reconcile, granted to NO role by this migration
--       (admin only; an administrator ticks it for whoever should hold it).
--     * Entered on the Hand Stock screen AND by Bulk Uploads.
--
-- WHAT IT IS: one row per engineer + part counted -- the PHYSICAL quantity,
-- the SYSTEM quantity it replaced (worked out by the database at that moment,
-- so the difference is on the record), who and when (stamped by the database,
-- whatever the client sends), and remarks.
--
-- HOW IT WORKS: one more arm of handstock_movements ('Reconciliation', IN the
-- physical quantity) and ONE filter on the whole view: a movement ENTERED
-- before the latest count of the same engineer + part is inside that count
-- and is not counted again. Every consumer -- the balance, the trail,
-- engineer_stock, the transfer and return guards, the consumption guard --
-- reads the view, so all of them see it without being touched (the 0074 /
-- 0266 argument). NOTHING IS DELETED: the older movements stay in their own
-- tables and every report that reads them; only hand stock stops counting
-- them, which is how the WinMax line (0412) already works for everybody.
--
-- "ENTERED" IS sys_created_on (0244): the database stamps it on every insert
-- from the app or an upload and discards what a client sends, where
-- created_at can carry a date from a file (the consumption upload writes the
-- visit date there). Falls back to created_at where it is empty. A stock out
-- through the old request-line path (no dispatch line) is entered when it was
-- dispatched.
--
-- LIVE, ONE ENGINEER AT A TIME: a count is an INSERT into its own table. It
-- takes no lock on any register, so calls, visits, spares and transfers go on
-- while the Spare Incharge counts.
--
-- A RECORD, NEVER EDITED OR DELETED: no update or delete privilege. A wrong count
-- is put right by counting that part again -- the latest count wins and the
-- earlier one stays on the record.
-- ===========================================================================

-- sys_created_on is attached by sys_columns (0244), which runs LAST on a fresh
-- apply -- after this module. The view below reads it, so on a fresh build it
-- is added here first, as the plain column 0244 would leave; 0244 then sees it
-- and stamps it. On a project that has it already, nothing is altered (and no
-- table is locked).
do $sys$
declare t text;
begin
  foreach t in array array['spare_dispatch_lines', 'spare_request_lines', 'spare_consumption',
                           'stock_transfer_lines', 'stock_transfers', 'material_returns',
                           'handstock_opening', 'spare_consumption_history', 'spare_issue_history',
                           'handstock_adjustments'] loop
    if not exists (select 1 from pg_attribute
                    where attrelid = format('public.%I', t)::regclass
                      and attname = 'sys_created_on' and not attisdropped) then
      execute format('alter table public.%I add column sys_created_on timestamptz', t);
    end if;
  end loop;
end $sys$;

create table if not exists public.handstock_reconciliations (
  id               bigint generated always as identity primary key,
  engineer         text not null,
  engineer_key     text generated always as (public.handstock_key(engineer)) stored,
  part             text not null,                        -- CODE|Description
  part_code        text generated always as (public.part_code(part)) stored,
  physical_qty     numeric not null,                     -- what was counted
  system_qty       numeric,                              -- what the system said, stamped
  reconciled_at    timestamptz not null default now(),   -- stamped
  recorded_by      uuid,                                 -- stamped
  recorded_by_name text not null default '',             -- stamped
  remarks          text not null default '',
  source           text not null default 'Screen',
  created_at       timestamptz not null default now(),
  constraint handstock_reconciliations_qty check (physical_qty >= 0),
  constraint handstock_reconciliations_source check (source in ('Screen', 'Upload'))
);
comment on table public.handstock_reconciliations is
  'Hand stock reconciliation (0468): a physically verified quantity per engineer + part. Movements entered before the latest count of that pair are not counted; they are kept.';

-- One count of a pair per instant. Every line saved together shares one
-- now(), so the same part twice in one save is refused rather than one
-- silently replacing the other.
create unique index if not exists handstock_reconciliations_uniq
  on public.handstock_reconciliations (engineer_key, part_code, reconciled_at);

create or replace function public.handstock_reconciliations_bi()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Who and when are the database's, whatever the client sent.
  new.recorded_by      := auth.uid();
  new.recorded_by_name := coalesce((select full_name from public.profiles where id = auth.uid()), '');
  new.reconciled_at    := now();
  new.created_at       := now();
  new.remarks          := btrim(coalesce(new.remarks, ''));
  if not exists (select 1 from public.user_directory u
                  where u.validity and lower(btrim(u.name)) = public.handstock_key(new.engineer)) then
    raise exception 'Hand stock is reconciled only for an ACTIVE person on the User Master -- "%" is not one.', new.engineer
      using errcode = '23514';
  end if;
  if not exists (select 1 from public.parts p where lower(btrim(p.item_detail)) = lower(btrim(new.part))) then
    raise exception 'Choose the part from the Part Master -- "%" is not on it.', new.part using errcode = '23514';
  end if;
  if public.part_code(new.part) = any (public.labour_part_codes()) then
    raise exception '% is a labour charge, which is not hand stock (0413) -- there is nothing to count.', public.part_code(new.part)
      using errcode = '23514';
  end if;
  if new.physical_qty is null or new.physical_qty < 0 or new.physical_qty <> trunc(new.physical_qty) then
    raise exception 'The physical quantity of % must be a whole number, 0 or more.', public.part_code(new.part)
      using errcode = '23514';
  end if;
  -- What the system said at this moment, before this count: read as the owner,
  -- so it is the whole balance, not the part of it the reader may see.
  select coalesce(sum(case when m.direction = 'IN' then m.qty else -m.qty end), 0)
    into new.system_qty
    from public.handstock_movements m
   where m.engineer_key = public.handstock_key(new.engineer) and m.part_code = public.part_code(new.part);
  return new;
end $$;
revoke execute on function public.handstock_reconciliations_bi() from public, anon, authenticated;
drop trigger if exists handstock_reconciliations_bi on public.handstock_reconciliations;
create trigger handstock_reconciliations_bi before insert on public.handstock_reconciliations
  for each row execute function public.handstock_reconciliations_bi();

alter table public.handstock_reconciliations enable row level security;
-- READ: exactly the audience of the adjustments (0266). The balance view runs
-- as its reader and filters on this table, so somebody who can see an
-- engineer's movements must be able to see that engineer's counts, or their
-- figure would ignore the count.
drop policy if exists hsr_read on public.handstock_reconciliations;
create policy hsr_read on public.handstock_reconciliations for select to authenticated
  using (
    (select public.can_view_all_calls())
    or (select public.has_perm('data.view_all'))
    or lower(btrim(engineer)) in (select lower(btrim(n)) from public.visible_engineer_names() as v(n))
  );
drop policy if exists hsr_insert on public.handstock_reconciliations;
create policy hsr_insert on public.handstock_reconciliations for insert to authenticated
  with check ((select public.has_perm('handstock.reconcile')));
revoke all on public.handstock_reconciliations from anon, authenticated;
grant select, insert on public.handstock_reconciliations to authenticated;

-- The five system columns every table carries (0244), attached now so the
-- live project need not wait for sys_columns.sql to be re-run.
do $$
begin
  if to_regprocedure('public.sys_columns_attach(regclass)') is not null then
    perform public.sys_columns_attach('public.handstock_reconciliations'::regclass);
  end if;
end $$;

-- 0413's view, read out of a database built from every migration. Three
-- changes: each arm APPENDS entered_at; an eleventh arm, Reconciliation; and
-- the filter at the end.
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
      COALESCE(NULLIF(l.dispatch_remarks, ''::text), ''::text) AS remarks,
      COALESCE(dl.sys_created_on, dl.created_at) AS entered_at
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
      COALESCE(NULLIF(l.dispatch_remarks, ''::text), ''::text) AS remarks,
      COALESCE(l.dispatched_at, r.dispatched_at, l.sys_created_on, l.created_at) AS entered_at
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
      ''::text AS remarks,
      COALESCE(c.sys_created_on, c.created_at) AS entered_at
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
      COALESCE(t.remarks, ''::text) AS remarks,
      COALESCE(l.sys_created_on, t.sys_created_on, t.created_at) AS entered_at
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
      COALESCE(t.remarks, ''::text) AS remarks,
      COALESCE(l.sys_created_on, t.sys_created_on, t.created_at) AS entered_at
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
          END || COALESCE(m.remarks, ''::text)) AS remarks,
      COALESCE(m.sys_created_on, m.created_at) AS entered_at
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
      COALESCE(o.remarks, ''::text) AS remarks,
      COALESCE(o.sys_created_on, o.created_at) AS entered_at
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
      COALESCE(h.remarks, ''::text) AS remarks,
      COALESCE(h.sys_created_on, h.created_at) AS entered_at
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
      COALESCE(h.remarks, ''::text) AS remarks,
      COALESCE(h.sys_created_on, h.created_at) AS entered_at
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
      COALESCE(a.reason, ''::text) AS remarks,
      COALESCE(a.sys_created_on, a.created_at) AS entered_at
     FROM handstock_adjustments a
    WHERE a.adjusted_at >= (( SELECT handstock_cutoff() AS handstock_cutoff))
  UNION ALL
   -- NEW (0468): the latest physical count of each engineer + part. An older
   -- count of the same pair is dropped by the filter below like any other
   -- movement entered before the latest count.
   SELECT 'IN'::text AS direction,
      'Reconciliation'::text AS movement,
      k.engineer_key,
      COALESCE(k.engineer, ''::text) AS engineer,
      ''::text AS engineer_email,
      k.part_code,
      COALESCE(k.part, ''::text) AS part,
      k.physical_qty AS qty,
      k.reconciled_at AS moved_at,
      'REC-'::text || k.id::text AS ref,
      'Reconciliation'::text AS ref_type,
      k.id::text AS ref_uid,
      ''::text AS ucn,
      ''::text AS call_number,
      COALESCE(k.recorded_by_name, ''::text) AS party_name,
      btrim(((('Physical count '::text || k.physical_qty::text) || ' (system said '::text) || COALESCE(k.system_qty::text, '?'::text)) || ')'::text
        || CASE WHEN btrim(COALESCE(k.remarks, ''::text)) <> ''::text THEN ' · '::text || btrim(k.remarks) ELSE ''::text END) AS remarks,
      k.reconciled_at AS entered_at
     FROM handstock_reconciliations k
    WHERE k.reconciled_at >= (( SELECT handstock_cutoff() AS handstock_cutoff))
) m
where not (m.part_code = any ((select public.labour_part_codes())::text[]))
  -- THE RECONCILIATION LINE (0468): a movement ENTERED before the latest
  -- physical count of the same engineer + part is inside that count, so it is
  -- not counted again. It stays in its own table and on every report.
  and not exists (select 1 from public.handstock_reconciliations k
                   where k.engineer_key = m.engineer_key and k.part_code = m.part_code
                     and k.reconciled_at > coalesce(m.entered_at, '-infinity'::timestamptz));
alter view public.handstock_movements set (security_invoker = on);
grant select on public.handstock_movements to authenticated;


-- 0102's balance, two columns APPENDED: the latest count on the line and when.
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
         sum(case when movement = 'Opening' then qty else 0 end) as opening,
         sum(case when ref_type = 'Historical' and movement = 'Stock out'
                  then qty else 0 end) as hist_stock_out,
         sum(case when ref_type = 'Historical' and movement = 'Consumption'
                  then qty else 0 end) as hist_consumed,
         sum(case when ref_type in ('Historical', 'Opening balance')
                  then (case when direction = 'IN' then qty else -qty end)
                  else 0 end) as hist_net,
         sum(case when ref_type in ('Historical', 'Opening balance') then 0
                  else (case when direction = 'IN' then qty else -qty end)
             end) as on_hand_live,
         -- ---- appended (0468) ------------------------------------------------
         -- The physical count the line now starts from (only the latest is a
         -- movement), and when it was made. NULL where the line was never counted.
         sum(qty) filter (where movement = 'Reconciliation') as reconciled_qty,
         max(moved_at) filter (where movement = 'Reconciliation') as reconciled_at
    from public.handstock_movements m
   where engineer_key <> '' and part_code <> ''
   group by engineer_key, part_code;
alter view public.handstock_balance set (security_invoker = on);
grant select on public.handstock_balance to authenticated;

-- A part rename moves the counts (0309's rename_part_records, read out of the
-- database; one table added) and the preview counts them.
create or replace function public.rename_part_records(p_id bigint, p_code text, p_description text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  old_detail text; old_key text;
  new_code text := btrim(coalesce(p_code, ''));
  new_desc text := btrim(coalesce(p_description, ''));
  new_detail text; moved jsonb := '{}'::jsonb; n bigint;
begin
  if new_code = '' or new_desc = '' then
    raise exception 'A part needs both a code and a description';
  end if;
  if position('|' in new_code) > 0 or position('|' in new_desc) > 0 then
    -- The separator IS the key's structure, so a value containing one would
    -- produce a key nothing can parse back.
    raise exception 'Neither the code nor the description may contain "|"';
  end if;

  select item_detail into old_detail from parts where id = p_id;
  if old_detail is null then raise exception 'No such part'; end if;
  old_key := lower(btrim(old_detail));
  new_detail := new_code || '|' || new_desc;

  if lower(btrim(new_detail)) = old_key then
    return jsonb_build_object('renamed', false, 'reason', 'nothing changed',
                              'from', old_detail, 'to', new_detail);
  end if;
  -- A RENAME, NOT A MERGE (0196).
  if exists (select 1 from parts where item_detail_key = lower(btrim(new_detail)) and id <> p_id) then
    raise exception 'Another part is already called "%" — a rename cannot merge two parts', new_detail;
  end if;

  -- FILE THE TICKET, so the consumption guard can tell this rename from a line
  -- being re-pointed (0196/0261). Keyed on the transaction.
  insert into public.part_rename_ticket (txid, old_key, new_detail)
  values (txid_current(), old_key, new_detail)
  on conflict (txid) do update set old_key = excluded.old_key,
                                   new_detail = excluded.new_detail, at = now();

  -- THE TEN, then the part itself, each matched on the key the register uses;
  -- stock transfers last of the ten (0310).
  update spare_consumption         set part = new_detail where lower(btrim(part)) = old_key;
  get diagnostics n = row_count; moved := moved || jsonb_build_object('Spare consumption', n);
  update spare_consumption_history set part = new_detail where lower(btrim(part)) = old_key;
  get diagnostics n = row_count; moved := moved || jsonb_build_object('Consumption (history)', n);
  update spare_issue_history       set part = new_detail where lower(btrim(part)) = old_key;
  get diagnostics n = row_count; moved := moved || jsonb_build_object('Issued to engineers', n);
  update handstock_opening         set part = new_detail where lower(btrim(part)) = old_key;
  get diagnostics n = row_count; moved := moved || jsonb_build_object('Opening hand stock', n);
  update spare_request_lines       set part = new_detail where lower(btrim(part)) = old_key;
  get diagnostics n = row_count; moved := moved || jsonb_build_object('Spare request lines', n);
  update spare_dispatch_lines      set part = new_detail where lower(btrim(part)) = old_key;
  get diagnostics n = row_count; moved := moved || jsonb_build_object('Dispatch lines', n);
  update material_returns          set part = new_detail where lower(btrim(part)) = old_key;
  get diagnostics n = row_count; moved := moved || jsonb_build_object('Material returns', n);
  update indoor_job_parts          set part_code = new_detail where lower(btrim(part_code)) = old_key;
  get diagnostics n = row_count; moved := moved || jsonb_build_object('Indoor job parts', n);
  -- NEW (0309): stock adjustments (0266) move with the part too.
  update handstock_adjustments     set part = new_detail where lower(btrim(part)) = old_key;
  get diagnostics n = row_count; moved := moved || jsonb_build_object('Stock adjustments', n);
  -- NEW (0468): hand stock reconciliations move with the part too, or a
  -- renamed part's count stays under the old name and the balance splits.
  update handstock_reconciliations set part = new_detail where lower(btrim(part)) = old_key;
  get diagnostics n = row_count; moved := moved || jsonb_build_object('Stock reconciliations', n);
  -- TRANSFERS LAST (0310). Their guard re-checks the sender's stock under the
  -- NEW name, so it must run once everything else is already there -- or it
  -- sees a balance missing a positive adjustment and refuses a rename that
  -- changes nobody's stock.
  update stock_transfer_lines      set part = new_detail where lower(btrim(part)) = old_key;
  get diagnostics n = row_count; moved := moved || jsonb_build_object('Stock transfer lines', n);

  update parts set code = new_code, description = new_desc, item_detail = new_detail
   where id = p_id;

  delete from public.part_rename_ticket where txid = txid_current();

  return jsonb_build_object('renamed', true, 'from', old_detail, 'to', new_detail, 'moved', moved);
end $function$;

create or replace function public.part_rename_impact(p_item_detail text)
 RETURNS TABLE(relation text, rows bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare k text := lower(btrim(coalesce(p_item_detail, '')));
begin
  if k = '' then return; end if;
  return query
    select 'Spare consumption'::text,        count(*) from spare_consumption        where lower(btrim(part)) = k
    union all select 'Consumption (history)', count(*) from spare_consumption_history where lower(btrim(part)) = k
    union all select 'Issued to engineers',   count(*) from spare_issue_history       where lower(btrim(part)) = k
    union all select 'Opening hand stock',    count(*) from handstock_opening         where lower(btrim(part)) = k
    union all select 'Spare request lines',   count(*) from spare_request_lines       where lower(btrim(part)) = k
    union all select 'Dispatch lines',        count(*) from spare_dispatch_lines      where lower(btrim(part)) = k
    union all select 'Stock transfer lines',  count(*) from stock_transfer_lines      where lower(btrim(part)) = k
    union all select 'Material returns',      count(*) from material_returns          where lower(btrim(part)) = k
    union all select 'Indoor job parts',      count(*) from indoor_job_parts          where lower(btrim(part_code)) = k
    union all select 'Stock adjustments',     count(*) from handstock_adjustments     where lower(btrim(part)) = k
    -- NEW (0468)
    union all select 'Stock reconciliations', count(*) from handstock_reconciliations where lower(btrim(part)) = k;
end $function$;
