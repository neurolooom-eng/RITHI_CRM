-- ===========================================================================
-- "NOT APPROVED" IS NOT AN APPROVAL (0256, finding 20).
--
-- WHAT THIS PROVES:
--   1. the rule, asked directly: only Approved / Auto-Approved (any case,
--      surrounding space, optional hyphen) let a stage pass; every other
--      phrasing the review measured going to Stores now waits;
--   2. end to end, the way the Spare Request Lines upload writes a line: a
--      line whose RM column says "Not Approved" is at RM Approval and is NOT
--      in spare_pending_dispatch, while "Auto Approved" / "APPROVED" still
--      reach it;
--   3. the migration moves a line the OLD rule had already cached as Stores
--      back to RM Approval, and leaves the stored approval word as written.
--
-- Run ONCE after _stub.sql + every migration.
-- Every error printed is labelled `expect ERROR` -- anything else is a failure.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off

\echo ''
\echo '--- 1. the rule, asked directly ---'
do $$
declare
  w text; got text;
  waits text[] := array['Not Approved', 'NOT APPROVED', 'Approval Pending', 'Awaiting Approval',
                        'Pending Approval', 'For Approval', 'Approval Awaited', 'Disapproved',
                        'Pending', '', 'Approved by phone', 'Approve'];
  passes text[] := array['Approved', 'APPROVED', ' approved ', 'Auto-Approved', 'Auto Approved',
                         'AutoApproved', 'auto-approved'];
begin
  foreach w in array waits loop
    got := public.spare_line_stage(w, 'Auto-Approved', 'Auto-Approved', 'Pending', null, 'CMC');
    if got <> 'RM Approval' then
      raise exception 'RM "%" should wait at RM Approval, got %', w, got;
    end if;
    got := public.spare_line_stage('Approved', w, 'Auto-Approved', 'Pending', null, 'AMC');
    if got <> 'Commercial' then
      raise exception 'Commercial "%" should wait at Commercial, got %', w, got;
    end if;
    got := public.spare_line_stage('Approved', 'Approved', w, 'Pending', null, 'AMC');
    if got <> 'NSM' then
      raise exception 'NSM "%" should wait at NSM, got %', w, got;
    end if;
  end loop;
  foreach w in array passes loop
    got := public.spare_line_stage(w, w, w, 'Pending', null, 'AMC');
    if got <> 'Stores' then
      raise exception '"%" in all three stages should reach Stores, got %', w, got;
    end if;
  end loop;
  -- The terminal branches are untouched.
  if public.spare_line_stage('Rejected', 'Pending', 'Pending', 'Pending', null, '') <> 'Rejected'
     or public.spare_line_stage('Approved', 'Approved', 'Approved', 'Dispatched', null, '') <> 'Dispatched'
     or public.spare_line_stage('Approved', 'Approved', 'Approved', 'Dropped', null, '') <> 'Dropped'
     or public.spare_line_stage('Not Approved', 'Pending', 'Pending', 'Pending', now(), '') <> 'Received' then
    raise exception 'a terminal stage changed';
  end if;
  raise notice 'ok: % phrasings wait, % pass', array_length(waits, 1), array_length(passes, 1);
end $$;

\echo ''
\echo '--- 2. end to end, as the upload writes it ---'
insert into public.spare_requests (uid, req_type, engineer, engineer_email, item_status, ucn) values
  ('SRQ-0256', 'Call Based', 'ENG 0256', 'eng0256@x.com', 'CMC', 'UCN-0256')
on conflict (uid) do nothing;
insert into public.spare_request_lines
  (request_uid, line_uid, part, qty, rm_approval, commercial_approval, nsm_approval) values
  ('SRQ-0256', 'SRQ-0256|1', 'P-1|Refused by the RM', 1, 'Not Approved',  'Auto-Approved', 'Auto-Approved'),
  ('SRQ-0256', 'SRQ-0256|2', 'P-2|Awaiting the RM',   1, 'Approval Pending', 'Auto-Approved', 'Auto-Approved'),
  ('SRQ-0256', 'SRQ-0256|3', 'P-3|Cleared',           1, 'Auto Approved', 'Auto-Approved', 'Auto-Approved'),
  ('SRQ-0256', 'SRQ-0256|4', 'P-4|Cleared',           1, 'APPROVED',      'Auto-Approved', 'Auto-Approved');

do $$
declare got text; offered text[];
begin
  select string_agg(line_uid || '=' || stage, ', ' order by line_uid) into got
    from public.spare_request_lines where request_uid = 'SRQ-0256';
  if got <> 'SRQ-0256|1=RM Approval, SRQ-0256|2=RM Approval, SRQ-0256|3=Stores, SRQ-0256|4=Stores' then
    raise exception 'stored stages wrong: %', got;
  end if;
  select array_agg(split_part(v.part, '|', 1) order by v.part) into offered
    from public.spare_pending_dispatch v
    join public.spare_request_lines l on l.id = v.line_id
   where l.request_uid = 'SRQ-0256';
  if offered is distinct from array['P-3', 'P-4'] then
    raise exception 'Stores should be offered P-3 and P-4 only, got %', offered;
  end if;
  raise notice 'ok: stages %; Stores offered %', got, offered;
end $$;

\echo ''
\echo '--- 3. the migration moves a line the old rule had cached as Stores ---'
-- Put the line back in the state the OLD rule left it in: cached as Stores.
alter table public.spare_request_lines disable trigger spare_request_lines_set_stage;
update public.spare_request_lines set stage = 'Stores', status = 'Stores' where line_uid = 'SRQ-0256|1';
alter table public.spare_request_lines enable trigger spare_request_lines_set_stage;

\ir ../migrations/0256_spare_approval_whole_word.sql

do $$
declare l record;
begin
  select stage, status, rm_approval into l from public.spare_request_lines where line_uid = 'SRQ-0256|1';
  if l.stage <> 'RM Approval' or l.status <> 'RM Approval' then
    raise exception 'the migration should move the line back to RM Approval, it is %/%', l.stage, l.status;
  end if;
  if l.rm_approval <> 'Not Approved' then
    raise exception 'the approval word must be left as written, it is now %', l.rm_approval;
  end if;
  raise notice 'ok: restaged to %, word kept as "%"', l.stage, l.rm_approval;
end $$;
