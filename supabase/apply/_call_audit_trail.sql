-- ===========================================================================
-- THE COMPLETE AUDIT TRAIL OF ONE OR MORE CALLS.
--
-- READ-ONLY. Paste into the Supabase SQL editor, put the UCNs you want on the
-- one marked line, and run. It returns ONE grid: every recorded event against
-- those calls, from every table that records one, in time order.
--
-- WHY IT IS ASSEMBLED RATHER THAN SELECTED. There is no single trail table.
-- A call's history is spread across the records that make it — the call, each
-- visit, each vigilance edit, the two reviews, the spares, the feedback, the
-- failure report, the indoor job — plus the application's own action log. Each
-- holds its own who and when. This unions them into one chronology.
--
-- READ THIS BEFORE YOU RELY ON IT — WHAT IS AND IS NOT COVERED.
--
--   * `record_audit` (a before/after image of every row) was SWITCHED OFF on
--     2026-09-05 by decision: the ten triggers were dropped and `audit_log`
--     became the trail. So for any call AFTER that date there are no row
--     images, and the last section below will be empty. That is not a gap in
--     this query. It is the shape of the trail.
--   * `audit_log` is written by the APPLICATION, so it records what was done
--     THROUGH the app. A change made directly against the database does not
--     appear in it — though it does appear in the record's own stamped
--     columns, which is why those are read here too.
--   * `audit_log` is PURGED on a retention window (app_settings
--     `audit_retention_days`). Events older than it are gone.
--
-- So: the stamped columns are the spine, `audit_log` adds intent and outcome,
-- and `record_audit` fills in before/after only for the period it ran.
--
-- TWO THINGS THAT LOOK LIKE MISSING EVENTS AND ARE NOT.
--   * A REVIEW APPEARS ONLY ONCE IT IS COMPLETE. `review2_at` is stamped when
--     all three of its answers are filled, and is cleared again while they are
--     not; the same for review 3 and its three. So a half-finished review has
--     no timestamp and no line here — correctly, because nothing has been
--     decided yet. An untouched review looks identical to a started one.
--   * A STAGE NOBODY DECIDED HAS NO NAME AND NO TIME. A spare stage the rule
--     did not require is stamped `Auto-Approved` with no `_by` and no `_at`,
--     so it produces no line rather than a line naming somebody who never
--     looked at it. The absence is the record.
-- ===========================================================================
with wanted as (
  -- >>> CHANGE THIS LINE: the UCNs you want the trail for.
  select unnest(array['26I08F0006', '26I08F0004', '26I08F0003', '26I07F0055']) as ucn
),
who as (select id, coalesce(nullif(btrim(full_name), ''), email) as name from public.profiles)
select * from (

  -- ---- the call itself ---------------------------------------------------
  select c.ucn, c.created_at as at, '1 · Call registered' as event,
         coalesce(a.name, w.name, '(not recorded)') as who,
         'UCN ' || c.ucn || ' · ' || coalesce(c.call_type, '?') || ' · ' || coalesce(c.party_name, '?')
           || ' · ' || coalesce(c.product_name, '?') || ' ' || coalesce(c.serial, '')
           || ' · filed to desk: ' || coalesce(w.name, '(none)') as detail,
         'field_calls' as source
    from public.field_calls c
    join wanted t on t.ucn = c.ucn
    left join who a on a.id = c.actual_created_by
    left join who w on w.id = c.created_by
  union all
  select c.ucn, c.cancelled_at, '9 · Call CANCELLED',
         coalesce(x.name, c.cancelled_by::text, '(not recorded)'),
         coalesce(nullif(btrim(c.cancel_reason), ''), '(no reason recorded)'), 'field_calls'
    from public.field_calls c join wanted t on t.ucn = c.ucn
    left join who x on x.id = c.cancelled_by where c.cancelled_at is not null
  union all
  select c.ucn, c.reopened_at, '8 · Call RE-OPENED', '(see audit_log)',
         'reopened ' || coalesce(c.reopen_count, 0)::text || ' time(s)', 'field_calls'
    from public.field_calls c join wanted t on t.ucn = c.ucn where c.reopened_at is not null

  -- ---- every visit -------------------------------------------------------
  union all
  select r.ucn, coalesce(r.visit_at, r.updated_at), '3 · Visit reported',
         coalesce(r.engineer, r.engineer_email, '(not recorded)'),
         'status: ' || coalesce(r.call_status, '?')
           || coalesce(' · pending: ' || nullif(btrim(r.pending_reason), ''), '')
           || coalesce(' · entry ' || to_char(r.updated_at, 'DD-Mon-YYYY HH24:MI'), ''), 'reports'
    from public.reports r join wanted t on t.ucn = r.ucn

  -- ---- vigilance edits, field by field ------------------------------------
  union all
  select v.ucn, v.changed_at, '4 · Vigilance field changed',
         coalesce(u.name, v.changed_by::text, '(not recorded)'),
         v.field || ': ' || coalesce(v.was, '(blank)') || '  ->  ' || coalesce(v.now_is, '(blank)'),
         'call_vigilance_changes'
    from public.call_vigilance_changes v join wanted t on t.ucn = v.ucn
    left join who u on u.id = v.changed_by

  -- ---- the two reviews ----------------------------------------------------
  union all
  select k.ucn, k.review2_at, '5 · Daily Call Review (review 2)',
         coalesce(k.review2_by, '(not recorded)'),
         coalesce('root cause: ' || nullif(btrim(k.root_cause_keyword), ''), '(no root cause)')
           || coalesce(' · warranty failure: ' || k.warranty_failure, '')
           || coalesce(' · frequent failure: ' || k.frequent_failure, ''), 'call_reviews'
    from public.call_reviews k join wanted t on t.ucn = k.ucn where k.review2_at is not null
  union all
  select k.ucn, k.review3_at, '6 · Review 3',
         coalesce(k.review3_by, '(not recorded)'),
         coalesce(nullif(btrim(k.service_observation), ''), '(no observation)'), 'call_reviews'
    from public.call_reviews k join wanted t on t.ucn = k.ucn where k.review3_at is not null
  union all
  select p.ucn, p.reviewed_at, '7 · Report reviewed',
         coalesce(nullif(btrim(p.reviewed_by_name), ''), x.name, p.reviewed_by::text, '(not recorded)'),
         coalesce(p.status, '?') || coalesce(' · ' || nullif(btrim(p.remarks), ''), ''),
         'call_report_reviews'
    from public.call_report_reviews p join wanted t on t.ucn = p.ucn
    left join who x on x.id = p.reviewed_by where p.reviewed_at is not null

  -- ---- spares: the request, each approval, the dispatch --------------------
  union all
  select s.ucn, s.created_at, '2a · Spare requested',
         coalesce(s.engineer, '(not recorded)'),
         coalesce(s.or_no, '(no OR)') || ' · ' || coalesce(s.item_status, '?')
           || ' · stage now: ' || coalesce(s.stage, '?'), 'spare_requests'
    from public.spare_requests s join wanted t on t.ucn = s.ucn
  union all
  select s.ucn, l.rm_at, '2b · Spare approved — RM', coalesce(l.rm_by, '(not recorded)'),
         coalesce(l.part, '?') || ' x' || coalesce(l.qty, 0)::text || ' · ' || coalesce(l.rm_approval, '?'),
         'spare_request_lines'
    from public.spare_requests s join wanted t on t.ucn = s.ucn
    join public.spare_request_lines l on l.request_uid = s.uid where l.rm_at is not null
  union all
  select s.ucn, l.commercial_at, '2c · Spare approved — Commercial',
         coalesce(l.commercial_by, '(auto / not recorded)'),
         coalesce(l.part, '?') || ' · ' || coalesce(l.commercial_approval, '?'), 'spare_request_lines'
    from public.spare_requests s join wanted t on t.ucn = s.ucn
    join public.spare_request_lines l on l.request_uid = s.uid where l.commercial_at is not null
  union all
  select s.ucn, l.nsm_at, '2d · Spare approved — NSM',
         coalesce(l.nsm_by, '(auto / not recorded)'),
         coalesce(l.part, '?') || ' · ' || coalesce(l.nsm_approval, '?'), 'spare_request_lines'
    from public.spare_requests s join wanted t on t.ucn = s.ucn
    join public.spare_request_lines l on l.request_uid = s.uid where l.nsm_at is not null
  union all
  select s.ucn, l.dispatched_at, '2e · Spare dispatched',
         coalesce(l.dispatched_by, '(not recorded)'),
         coalesce(l.part, '?') || ' x' || coalesce(l.dispatched_qty, 0)::text
           || ' · DC ' || coalesce(l.stock_out_no, l.dc_number, '?'), 'spare_request_lines'
    from public.spare_requests s join wanted t on t.ucn = s.ucn
    join public.spare_request_lines l on l.request_uid = s.uid where l.dispatched_at is not null
  union all
  select s.ucn, l.received_at, '2f · Spare received by engineer',
         coalesce(l.received_by, '(not recorded)'),
         coalesce(l.part, '?') || ' x' || coalesce(l.received_qty, 0)::text, 'spare_request_lines'
    from public.spare_requests s join wanted t on t.ucn = s.ucn
    join public.spare_request_lines l on l.request_uid = s.uid where l.received_at is not null

  -- ---- spares actually fitted, and any correction to that ------------------
  union all
  select sc.ucn, sc.created_at, '3a · Spare consumed',
         coalesce(nullif(btrim(sc.recorded_by), ''), sc.engineer, '(not recorded)'),
         coalesce(sc.part, '?') || ' x' || coalesce(sc.qty, 0)::text
           || ' · booked as ' || coalesce(sc.source, 'Report')
           || case when coalesce(sc.qty, 0) = 0 then '  [VOIDED]' else '' end, 'spare_consumption'
    from public.spare_consumption sc join wanted t on t.ucn = sc.ucn
  union all
  select sc.ucn, sc.adjusted_at, '3b · Consumption corrected',
         coalesce(sc.adjusted_by, '(not recorded)'),
         coalesce(sc.part, '?') || ' · was ' || coalesce(sc.original_qty, 0)::text
           || ' -> now ' || coalesce(sc.qty, 0)::text
           || ' · reason: ' || coalesce(nullif(btrim(sc.adjustment_reason), ''), '(none given)'),
         'spare_consumption'
    from public.spare_consumption sc join wanted t on t.ucn = sc.ucn where sc.adjusted_at is not null

  -- ---- downstream records --------------------------------------------------
  union all
  select f.ucn, f.created_at, '10 · Customer feedback',
         coalesce(f.engineer, '(not recorded)'),
         'feedback recorded', 'feedback'
    from public.feedback f join wanted t on t.ucn = f.ucn
  union all
  select r.ucn, r.created_at, '11 · Field Failure Report raised',
         coalesce(r.raised_by_name, '(not recorded)'),
         coalesce(r.ffr_no, '(no FFR no)') || ' · ' || coalesce(r.problem_status, '?')
           || coalesce(' · CAPA ' || nullif(btrim(r.capa_no), ''), ''), 'field_failure_reports'
    from public.field_failure_reports r join wanted t on t.ucn = r.ucn
  union all
  select j.ucn, j.received_at, '12 · Indoor job received',
         coalesce(x.name, j.received_by::text, '(not recorded)'),
         coalesce(j.job_no, '?') || ' · ' || coalesce(j.status, '?'), 'indoor_jobs'
    from public.indoor_jobs j join wanted t on t.ucn = j.ucn
    left join who x on x.id = j.received_by

  -- ---- what the application recorded doing ---------------------------------
  union all
  select t.ucn, a.at, '0 · App action: ' || a.action,
         coalesce(a.actor, a.email, '(not recorded)'),
         coalesce(a.status, '?')
           || coalesce(' · ' || nullif(btrim(a.error), ''), '')
           || coalesce(' · role ' || a.role, ''), 'audit_log'
    from public.audit_log a join wanted t on a.target = t.ucn

  -- ---- before/after images, for the period they were kept -------------------
  union all
  select t.ucn, ra.changed_at, 'R · Row ' || ra.op || ' on ' || ra.table_name,
         coalesce(ra.actor_email, ra.actor::text, '(not recorded)'),
         'before/after image held — see record_audit id ' || ra.id::text, 'record_audit'
    from public.record_audit ra join wanted t on ra.record_key = t.ucn

) trail
order by ucn, at nulls last, event;
