-- ---------------------------------------------------------------------------
-- THE RM APPROVAL QUEUE CARRIES THE REQUEST, NOT JUST ITS PART.
--
-- The user, 2026-09-09: "in RM Approval - I need all Columns relevant to the
-- request -- Only request and not Status of the request.. Like I need product
-- serial no."
--
-- Nearly all of it was already here and only the SCREEN was missing it -- the
-- serial, the call number, the request date and the request type were selected
-- by 0116 and never mapped to a column. That part needs no SQL.
--
-- ONE FIELD GENUINELY WAS NOT: the COMPLAINT. It is the reason the spare is
-- being asked for, which is most of what an approver is deciding on -- "is this
-- part plausible for this fault?" is a question the queue could not answer.
--
-- THE VIEW IS DROPPED AND REBUILT, not replaced. `create or replace view` can
-- only APPEND columns, and it cuts both ways: replacing works here, but then
-- replaying 0116's own narrower definition afterwards fails with "cannot drop
-- columns from view" -- and the bundles are replayed ONE AT A TIME, so that is
-- a real path, not a hypothetical. `npm run check:replay` found exactly that.
-- Both statements drop first now, so neither depends on which shape is already
-- there. Nothing is built on this view, so the drop costs nothing; if that ever
-- changes, the drop will fail loudly rather than cascade.
--
-- AND `security_invoker` IS RE-ASSERTED BELOW, which is the whole risk of
-- touching this file. `create or replace view` silently drops that setting, and
-- a view without it reads as its OWNER -- every signed-in user would see every
-- engineer's spare requests, with no error and no warning. It has happened
-- three times in this project on `calls` (0040 -> 0050 -> 0057).
-- `npm run check:views` fails on any view over an RLS-protected table that
-- lacks it, and it passes on this one.
-- ---------------------------------------------------------------------------

-- DROPPED FIRST for the same reason 0116 now does: a replay must not depend on
-- which shape of the view happens to be there. Nothing depends on it.
drop view if exists public.spare_pending_rm;
create view public.spare_pending_rm as
  select
    l.id                                        as line_id,
    l.line_uid,
    l.request_uid,
    r.or_no,
    r.or_req_date,
    l.row_no,
    l.part,
    upper(btrim(split_part(coalesce(l.part, ''), '|', 1)))   as part_code,
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
    coalesce(l.created_at, r.created_at)        as raised_at,
    public.spare_rm_may_approve(r.engineer)     as may_approve,
    -- APPENDED (0154). Last, because create or replace can only add columns.
    coalesce(r.complaint, '')                   as complaint
  from public.spare_request_lines l
  join public.spare_requests r on r.uid = l.request_uid
  where public.spare_line_stage(
          coalesce(l.rm_approval, 'Pending'),
          coalesce(l.commercial_approval, 'Pending'),
          coalesce(l.nsm_approval, 'Pending'),
          coalesce(l.stores_status, 'Pending'),
          l.received_at,
          r.item_status) = 'RM Approval';

-- NOT OPTIONAL, and not a formality: see the note above.
alter view public.spare_pending_rm set (security_invoker = on);
grant select on public.spare_pending_rm to authenticated;

comment on view public.spare_pending_rm is
  'Every spare line waiting for a Reporting Manager, with the REQUEST around it: the call, the customer, the product, the SERIAL, the cover, the complaint, the request type and when it was raised. Stage is computed rather than read, because `stage` is a cache and may be stale. security_invoker, so an RM sees only their own team''s lines (0116, complaint added 0154).';
