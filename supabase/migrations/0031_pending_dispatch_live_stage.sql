-- ===========================================================================
-- The dispatch queue computes the stage; it no longer trusts the column.
--
-- Two screens disagreed: Spare Requests showed three spares at **Stores**
-- while Pending Dispatch showed an empty queue. They were asking different
-- questions.
--
--   • The register derives the stage in the app, from the approval columns
--     (src/lib/spareflow.ts, deriveStage).
--   • The queue filtered on `spare_request_lines.stage` — a column maintained
--     by trigger, i.e. a CACHE of that same derivation.
--
-- A cache can go stale. Anything that writes a line without the trigger
-- recomputing — a load with triggers disabled, a row last written before a
-- stage rule changed (0025 added Dropped; 0016 introduced the rule itself) —
-- leaves `stage` saying one thing while the approvals say another. The
-- register reads the approvals and shows Stores; the queue reads the stale
-- column and shows nothing. Exactly the reported symptom.
--
-- So the queue now applies spare_line_stage() to the columns, the same way the
-- app does. A spare that has cleared its approvals appears in the queue even
-- if its cached stage was never refreshed.
--
-- The column is repaired too, since the register's stage chips and KPI tiles
-- and the request-header roll-up all still read it.
-- ===========================================================================

create or replace view public.spare_pending_dispatch as
select
  l.id                                        as line_id,
  l.line_uid,
  l.request_uid,
  r.or_no,
  r.or_req_date,
  l.row_no,
  l.part,
  upper(btrim(split_part(coalesce(l.part, ''), '|', 1)))
                                              as part_code,
  l.qty,
  r.req_type,
  r.item_status,
  coalesce(r.engineer, '')                    as engineer,
  lower(btrim(coalesce(r.engineer, '')))      as engineer_key,
  coalesce(r.engineer_email, '')              as engineer_email,
  coalesce(r.ucn, '')                         as ucn,
  coalesce(r.call_number, '')                 as call_number,
  coalesce(r.party_name, '')                  as party_name,
  coalesce(r.product_name, '')                as product_name,
  coalesce(r.serial, '')                      as serial,
  coalesce(r.handstock_reason, '')            as handstock_reason,
  coalesce(r.remarks, '')                     as remarks,
  l.rm_by, l.rm_at, l.commercial_by, l.commercial_at, l.nsm_by, l.nsm_at,
  coalesce(l.created_at, r.created_at)        as raised_at,
  greatest(coalesce(l.nsm_at, l.commercial_at, l.rm_at, l.created_at, r.created_at),
           coalesce(l.created_at, r.created_at))                       as waiting_since
from public.spare_request_lines l
join public.spare_requests r on r.uid = l.request_uid
-- Computed, not read: the stage column is a cache and may be stale.
where public.spare_line_stage(
        coalesce(l.rm_approval, 'Pending'),
        coalesce(l.commercial_approval, 'Pending'),
        coalesce(l.nsm_approval, 'Pending'),
        coalesce(l.stores_status, 'Pending'),
        l.received_at,
        r.item_status) = 'Stores'
  and coalesce(l.dispatch_uid, '') = '';

alter view public.spare_pending_dispatch set (security_invoker = on);
grant select on public.spare_pending_dispatch to authenticated;

-- ---------------------------------------------------------------------------
-- Repair every cached stage, and roll the requests up from the repaired lines.
-- Guards are dropped around it: this is a data migration, not somebody
-- approving or dispatching, and auth.uid() is NULL in the SQL editor.
-- ---------------------------------------------------------------------------
drop trigger if exists spare_request_lines_guard          on public.spare_request_lines;
drop trigger if exists spare_request_lines_dispatch_guard on public.spare_request_lines;

update public.spare_request_lines l
   set stage  = public.spare_line_stage(
                  coalesce(l.rm_approval, 'Pending'),
                  coalesce(l.commercial_approval, 'Pending'),
                  coalesce(l.nsm_approval, 'Pending'),
                  coalesce(l.stores_status, 'Pending'),
                  l.received_at, r.item_status),
       status = public.spare_line_stage(
                  coalesce(l.rm_approval, 'Pending'),
                  coalesce(l.commercial_approval, 'Pending'),
                  coalesce(l.nsm_approval, 'Pending'),
                  coalesce(l.stores_status, 'Pending'),
                  l.received_at, r.item_status)
  from public.spare_requests r
 where r.uid = l.request_uid
   and l.stage is distinct from public.spare_line_stage(
                  coalesce(l.rm_approval, 'Pending'),
                  coalesce(l.commercial_approval, 'Pending'),
                  coalesce(l.nsm_approval, 'Pending'),
                  coalesce(l.stores_status, 'Pending'),
                  l.received_at, r.item_status);

create trigger spare_request_lines_guard
  before update on public.spare_request_lines
  for each row execute function public.spare_request_lines_guard();
create trigger spare_request_lines_dispatch_guard
  before update on public.spare_request_lines
  for each row execute function public.spare_request_lines_dispatch_guard();

do $$
declare u text;
begin
  for u in select uid from public.spare_requests loop
    perform public.spare_request_rollup(u);
  end loop;
end $$;
