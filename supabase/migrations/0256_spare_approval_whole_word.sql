-- ===========================================================================
-- "NOT APPROVED" IS NOT AN APPROVAL (finding 20).
--
-- `spare_line_stage` asked whether an approval column CONTAINED "approv" or
-- "auto". Every way of saying no or not-yet also contains the word approval,
-- so ten plausible spreadsheet phrasings resolved to STORES — measured on a
-- database built from every migration:
--
--   Not Approved, NOT APPROVED, Approval Pending, Awaiting Approval,
--   Pending Approval, For Approval, Approval Awaited, Disapproved -> Stores
--
-- and `spare_pending_dispatch`, the only thing `dispatch_spare_lines()` checks
-- before booking stock out, offered the refused part to Stores. The app never
-- writes such a word (it writes Approved, Auto-Approved, Rejected, Pending);
-- the Spare Request Lines bulk upload passes the sheet's cell straight through.
--
-- THE USER'S DECISION (2026-09-30): "Hold it for the approver". Only the two
-- words that mean yes let a line pass; anything else waits at that approver's
-- stage, showing the word as written, for a person to decide. NOTHING IS
-- REWRITTEN: the stored value stays exactly what the sheet said, because it is
-- the approver's record and guessing what "Approval Awaited" meant is not
-- this migration's call.
--
-- WHOLE WORD, NOT SUBSTRING. `Approved` and `Auto-Approved`, any case, with
-- surrounding space ignored and the hyphen optional ("Auto Approved",
-- "AutoApproved") — those are the same two words, and holding them back would
-- move lines that were legitimately cleared. The CLIENT copy is `isApproved`
-- in `src/lib/spareflow.ts`; `check:ui` holds the two patterns together.
--
-- REJECT IS UNCHANGED. `~* 'reject'` catches "Rejected" first and was never
-- the fault; loosening or tightening it is a different decision.
--
-- SAME SIX ARGUMENTS, for the reason 0210 gives: seven migrations call this
-- function and three views are built on it.
-- ===========================================================================

create or replace function public.spare_line_stage(
  rm text, commercial text, nsm text, stores text, received timestamptz, item_status text
) returns text language sql immutable as $$
  select case
    when rm ~* 'reject' or commercial ~* 'reject' or nsm ~* 'reject' then 'Rejected'
    when received is not null                                        then 'Received'
    when stores ~* 'drop'                                            then 'Dropped'
    when stores ~* 'dispatch'                                        then 'Dispatched'
    when rm         !~* '^\s*(auto[\s-]*)?approved\s*$'              then 'RM Approval'
    when commercial !~* '^\s*(auto[\s-]*)?approved\s*$'              then 'Commercial'
    when nsm        !~* '^\s*(auto[\s-]*)?approved\s*$'              then 'NSM'
    else 'Stores'
  end;
$$;

-- ---------------------------------------------------------------------------
-- The stored stage follows. `spare_request_lines.stage` / `.status` are a
-- cache the register reads; the views call the function live. Only OPEN lines
-- whose stage CHANGES are touched (a dispatched, received, rejected or dropped
-- line is settled, and its terminal branch wins either way). No approval
-- column is written, so none of the approval guards is asked anything.
--
-- THIS MOVES LINES BACKWARDS, deliberately: a line whose RM column says
-- "Not Approved" leaves Stores and returns to RM Approval. That is the fix.
-- `supabase/apply/_approval_words.sql` lists them before and after.
-- ---------------------------------------------------------------------------
do $$
declare n int;
begin
  with moved as (
    update public.spare_request_lines l
       set stage  = x.new_stage,
           status = x.new_stage
      from (select l2.id,
                   public.spare_line_stage(
                     coalesce(l2.rm_approval, 'Pending'),
                     coalesce(l2.commercial_approval, 'Pending'),
                     coalesce(l2.nsm_approval, 'Pending'),
                     coalesce(l2.stores_status, 'Pending'),
                     l2.received_at, r.item_status) as new_stage
              from public.spare_request_lines l2
              join public.spare_requests r on r.uid = l2.request_uid
             where l2.received_at is null
               and coalesce(l2.stores_status, '') !~* 'dispatch|drop') x
     where l.id = x.id
       and l.stage is distinct from x.new_stage
    returning l.request_uid
  )
  select count(*) into n from moved;
  -- Each moved line's request is rolled up by `spare_request_lines_rollup`,
  -- the per-row trigger, so no separate pass is needed.
  raise notice '0256: % open line(s) restaged', n;
end $$;
