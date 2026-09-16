-- ===========================================================================
-- A HANDSTOCK REQUEST GOES TO NSM.
--
-- The user, 2026-09-16: "For Handstock request - NSM has to approve the
-- request."
--
-- BEFORE. One rule decided both middle stages —
-- `spare_needs_review(item_status)` = AMC or OGP. A HandStock request has no
-- machine, so no item status, so that rule was FALSE: the RM's approval stamped
-- BOTH Commercial and NSM 'Auto-Approved' in the same write and the line went
-- straight to Stores. Replenishment left the building on one signature.
--
-- AFTER. The two stages stop sharing a rule, because they no longer ask the
-- same question:
--
--   spare_needs_commercial(item_status)      AMC or OGP            (unchanged)
--   spare_needs_nsm(item_status, req_type)   AMC or OGP, OR HandStock
--
-- ---------------------------------------------------------------------------
-- WHY THE STAGE FUNCTION KEEPS ITS SIGNATURE, AND WHAT MOVED INSTEAD
-- ---------------------------------------------------------------------------
-- The obvious change is to give `spare_line_stage` a `req_type` argument. It is
-- the wrong one: SEVEN migrations call that function — 0016, 0025, 0031, 0055,
-- 0116, 0118, 0154 — and three of them define VIEWS whose current definitions
-- live in the later files. Re-pointing all seven is a lot of surface for one
-- rule, and leaving a six-argument version beside a seven-argument one is the
-- two-definitions trap: the short one cannot see `req_type`, so it answers the
-- OLD rule, correctly-looking, for anything still calling it.
--
-- So the RULE MOVES OUT OF THE STAGE and into what gets STAMPED. The stage now
-- follows the recorded columns alone:
--
--     ...when commercial is not approved  -> 'Commercial'
--     ...when nsm        is not approved  -> 'NSM'
--
-- which is the more honest reading anyway — a stage should report the decisions
-- on the record, not re-derive from the cover whether a decision was required.
-- Whether a stage is NEEDED is settled once, at RM approval, by whether
-- 'Auto-Approved' is written into it. `item_status` stays in the signature,
-- unused, so all seven callers keep working untouched.
--
-- ---------------------------------------------------------------------------
-- WHICH IS WHY STEP 2 EXISTS, AND IT IS THE IMPORTANT ONE
-- ---------------------------------------------------------------------------
-- Under the old rule a line could sit at 'Stores' with BLANK middle columns —
-- the rule said no review was needed, so nothing was ever written. Read by the
-- new rule those same rows say "Commercial has not approved" and would march
-- backwards from Stores to Commercial. On a live register that is a queue
-- filling with work that was already settled.
--
-- So before the rule changes, today's meaning is PINNED INTO THE DATA: every
-- line the OLD rule waved through has 'Auto-Approved' written into the columns
-- it waved through. `rm_by`/`rm_at` style stamps are deliberately NOT written —
-- nobody decided these, and inventing an approver on a quality record is worse
-- than an outcome with no name against it.
--
-- NOTHING ALREADY DECIDED IS REOPENED, and nothing already dispatched moves.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. The rules. `spare_needs_review` is KEPT and still means what it always
--    meant (AMC or OGP) because 0012, 0016, 0025 and 0036 create and call it;
--    `spare_needs_commercial` is its name for what it now decides on its own.
-- ---------------------------------------------------------------------------
create or replace function public.spare_needs_commercial(item_status text)
returns boolean language sql immutable as $$
  select coalesce(trim(item_status), '') ~* '^(amc|ogp)$';
$$;
grant execute on function public.spare_needs_commercial(text) to authenticated;

-- HandStock matched LOOSELY on purpose: the app writes 'HandStock', the sheet
-- era wrote 'Hand Stock' and 'HANDSTOCK', and an import is not going to be
-- retyped. Anything squashing to those letters is a HandStock request — the
-- same argument as `cover_code()`, and for the same reason.
create or replace function public.spare_is_handstock(req_type text)
returns boolean language sql immutable as $$
  select regexp_replace(lower(coalesce(req_type, '')), '[^a-z]', '', 'g') = 'handstock';
$$;
grant execute on function public.spare_is_handstock(text) to authenticated;

create or replace function public.spare_needs_nsm(item_status text, req_type text)
returns boolean language sql immutable as $$
  select public.spare_needs_commercial(item_status) or public.spare_is_handstock(req_type);
$$;
grant execute on function public.spare_needs_nsm(text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. PIN TODAY'S MEANING INTO THE DATA, before the rule changes underneath it.
--    Read the note above: without this, every line the old rule waved through
--    walks backwards out of Stores.
--
--    The guards are dropped around it exactly as 0031 does for its own repair:
--    this is a data migration, not somebody approving, and `auth.uid()` is NULL
--    in the SQL editor.
-- ---------------------------------------------------------------------------
drop trigger if exists spare_request_lines_guard          on public.spare_request_lines;
drop trigger if exists spare_request_lines_dispatch_guard on public.spare_request_lines;
drop trigger if exists spare_requests_stage_guard         on public.spare_requests;

do $$
declare n int;
begin
  -- Lines. Only where the OLD rule said no review was needed, which is exactly
  -- where the columns were left blank.
  update public.spare_request_lines l
     set commercial_approval = case
           when coalesce(l.commercial_approval, '') !~* 'approv|auto|reject'
             then 'Auto-Approved' else l.commercial_approval end,
         nsm_approval = case
           when coalesce(l.nsm_approval, '') !~* 'approv|auto|reject'
             then 'Auto-Approved' else l.nsm_approval end
    from public.spare_requests r
   where r.uid = l.request_uid
     and not public.spare_needs_commercial(r.item_status)
     and coalesce(l.rm_approval, '') ~* 'approv|auto'
     and (coalesce(l.commercial_approval, '') !~* 'approv|auto|reject'
       or coalesce(l.nsm_approval,        '') !~* 'approv|auto|reject');
  get diagnostics n = row_count;
  raise notice '0210: % line(s) had the old auto-approval written into them', n;

  update public.spare_requests r
     set commercial_approval = case
           when coalesce(r.commercial_approval, '') !~* 'approv|auto|reject'
             then 'Auto-Approved' else r.commercial_approval end,
         nsm_approval = case
           when coalesce(r.nsm_approval, '') !~* 'approv|auto|reject'
             then 'Auto-Approved' else r.nsm_approval end
   where not public.spare_needs_commercial(r.item_status)
     and coalesce(r.rm_approval, '') ~* 'approv|auto'
     and (coalesce(r.commercial_approval, '') !~* 'approv|auto|reject'
       or coalesce(r.nsm_approval,        '') !~* 'approv|auto|reject');
  get diagnostics n = row_count;
  raise notice '0210: % request(s) likewise', n;
end $$;

-- ---------------------------------------------------------------------------
-- 3. The stage follows the RECORD. Same six arguments, so all seven callers are
--    untouched; `item_status` is kept in the signature and no longer read,
--    because what it used to decide is now decided when the columns are
--    stamped. Step 2 is what makes that safe for rows already in flight.
-- ---------------------------------------------------------------------------
create or replace function public.spare_line_stage(
  rm text, commercial text, nsm text, stores text, received timestamptz, item_status text
) returns text language sql immutable as $$
  select case
    when rm ~* 'reject' or commercial ~* 'reject' or nsm ~* 'reject' then 'Rejected'
    when received is not null                                        then 'Received'
    when stores ~* 'drop'                                            then 'Dropped'
    when stores ~* 'dispatch'                                        then 'Dispatched'
    when rm         !~* 'approv|auto'                                then 'RM Approval'
    when commercial !~* 'approv|auto'                                then 'Commercial'
    when nsm        !~* 'approv|auto'                                then 'NSM'
    else 'Stores'
  end;
$$;

-- ---------------------------------------------------------------------------
-- 4. The guards. The RM may auto-approve a stage only where that stage is not
--    required — and those are now two different questions, so `auto_ok` becomes
--    two flags. A HandStock line's NSM column is NOT one an RM may write.
-- ---------------------------------------------------------------------------
-- THE REQUEST-LEVEL GUARD IS NOT TOUCHED, and that is a correction to this
-- migration rather than an omission. Its first draft redefined
-- `spare_requests_stage_guard()` with the old per-stage logic — and
-- `check:replay` caught it: 0016 superseded that function entirely, and its
-- current body REFUSES any approval written to `spare_requests` at all:
--
--     'Spare approvals are recorded per spare — update spare_request_lines,
--      not the request'
--
-- Approvals happen on the LINES. Redefining the request guard would have
-- quietly re-opened request-level approval writes — a wider hole than the one
-- this migration closes. Only the trigger is put back below, around the
-- backfill; the function keeps 0016's body.
create or replace function public.spare_request_lines_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  changed        boolean;
  auto_commercial boolean;
  auto_nsm        boolean;
  req            public.spare_requests;
begin
  if public.is_admin() then return new; end if;
  select * into req from public.spare_requests where uid = new.request_uid;

  auto_commercial := not public.spare_needs_commercial(req.item_status)
                     and public.has_perm('spare.approve_rm');
  auto_nsm        := not public.spare_needs_nsm(req.item_status, req.req_type)
                     and public.has_perm('spare.approve_rm');

  changed := new.rm_approval is distinct from old.rm_approval
          or new.rm_by       is distinct from old.rm_by
          or new.rm_at       is distinct from old.rm_at;
  if changed and not public.has_perm('spare.approve_rm') then
    raise exception 'RBAC: RM approval requires the spare.approve_rm permission';
  end if;

  changed := new.commercial_approval is distinct from old.commercial_approval
          or new.commercial_by       is distinct from old.commercial_by
          or new.commercial_at       is distinct from old.commercial_at;
  if changed
     and not public.has_perm('spare.approve_commercial')
     and not (auto_commercial and new.commercial_approval = 'Auto-Approved'
              and new.commercial_by is not distinct from old.commercial_by
              and new.commercial_at is not distinct from old.commercial_at) then
    raise exception 'RBAC: Commercial approval requires the spare.approve_commercial permission';
  end if;

  changed := new.nsm_approval is distinct from old.nsm_approval
          or new.nsm_by       is distinct from old.nsm_by
          or new.nsm_at       is distinct from old.nsm_at;
  if changed
     and not public.has_perm('spare.approve_nsm')
     and not (auto_nsm and new.nsm_approval = 'Auto-Approved'
              and new.nsm_by is not distinct from old.nsm_by
              and new.nsm_at is not distinct from old.nsm_at) then
    raise exception 'RBAC: NSM approval requires the spare.approve_nsm permission';
  end if;

  return new;
end $$;

drop trigger if exists spare_request_lines_guard on public.spare_request_lines;
create trigger spare_request_lines_guard before update on public.spare_request_lines
  for each row execute function public.spare_request_lines_guard();

-- THE DISPATCH GUARD, PUT BACK. It was dropped for the backfill in step 2
-- alongside the others, and unlike them it is not redefined above — so without
-- this the migration would leave Stores' own guard off the table and nothing
-- would say so. Its function is untouched; only the trigger is restored.
drop trigger if exists spare_request_lines_dispatch_guard on public.spare_request_lines;
create trigger spare_request_lines_dispatch_guard
  before update on public.spare_request_lines
  for each row execute function public.spare_request_lines_dispatch_guard();

-- ---------------------------------------------------------------------------
-- 5. Recompute the cached stage from the repaired columns, and roll the
--    requests up. Only lines that are still OPEN: a dispatched, received,
--    rejected or dropped line is settled, and its terminal branch would win
--    anyway — recomputing it would only risk touching a record for no reason.
-- ---------------------------------------------------------------------------
do $$
declare n int;
begin
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
     and l.received_at is null
     and coalesce(l.stores_status, '') !~* 'dispatch|drop'
     and coalesce(l.rm_approval, '')   !~* 'reject'
     and coalesce(l.commercial_approval, '') !~* 'reject'
     and coalesce(l.nsm_approval, '')  !~* 'reject';
  get diagnostics n = row_count;
  raise notice '0210: % open line(s) restaged', n;

  perform public.spare_request_rollup(uid) from public.spare_requests;
end $$;
