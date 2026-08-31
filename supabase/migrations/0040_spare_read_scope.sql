-- ===========================================================================
-- A spare request is visible to its raiser, their management chain, and the
-- desks that process it — not to every approver.
--
-- sr_read granted a blanket `can_approve_spares()`: holding ANY spare approval
-- permission let you read EVERY spare request. So a Reporting Manager saw
-- requests raised by people outside their team — administrators included —
-- and 0039 only stopped them approving those, which still left the data on
-- screen. Reported: "the Data itself should not be visible."
--
-- `can_view_all_calls()` (0034_office_roles_see_all / 0035_data_view_all) is
-- already the app's answer to "who legitimately sees everyone's work": admin,
-- an explicit data.view_all grant, and the office roles — Hotline, NSM,
-- Commercial, Spare Coordinator, Stores Incharge, Tally. Those desks act on
-- spares from every team, so they must keep seeing them; a manager must not.
--
-- What a Reporting Manager is left with is exactly what was asked for:
--   • their own requests — visible, and NOT approvable (0039 sends those to
--     their own manager);
--   • their reporting engineers' requests — visible and approvable;
--   • nothing else.
--
-- spare_request_lines needs no change: srl_read is an EXISTS against
-- spare_requests, so the lines follow the header. spare_pending_dispatch and
-- the hand-stock views are security_invoker, so they follow too.
-- ===========================================================================

drop policy if exists sr_read on public.spare_requests;
create policy sr_read on public.spare_requests for select
  using (
    (select public.can_view_all_calls())          -- admin + office desks + data.view_all
    or created_by = (select auth.uid())           -- I raised it
    or lower(engineer_email) = lower((select auth.email()))
    or lower(btrim(engineer)) in (                -- me and my reporting sub-tree
         select lower(btrim(n)) from public.visible_engineer_names() as v(n)
       )
  );
