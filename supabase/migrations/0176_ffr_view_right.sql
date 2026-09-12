-- ===========================================================================
-- 0176 — READING THE FIELD FAILURE REGISTER IS ITS OWN RIGHT.
--
-- Reported from use, 2026-09-12: a user moved onto a role that holds
-- `ffr.manage` and `mod:/failure-report` opened the register and it was EMPTY.
-- Reproduced exactly: the permission was held, the page opened, and the query
-- returned nothing.
--
-- WHY. `ffr_read` (0165) never tested a Field Failure permission at all. Its
-- only clause that reaches an ordinary user is
--
--     exists (select 1 from public.calls c where c.ucn = ...)
--
-- and `calls` is security_invoker — so it returns the calls THAT USER may see.
-- The register was therefore scoped to CALL visibility: office roles and
-- administrators saw everything, everyone else saw reports on their own calls,
-- and `ffr.manage` granted the right to WRITE a register you could not READ.
--
-- That is the "a role that sees NOTHING" fault in CLAUDE.md wearing a new coat,
-- and it is worse than a missing permission because everything LOOKS granted:
-- the menu entry is there, the page opens, the permission is ticked.
--
-- THE USER'S DECISION (2026-09-12), asked before changing it: reading the
-- register becomes an explicit right, granted to the people who need it —
-- "I am going to hide the view to everyone; only people who need to view is
-- being given access."
--
-- `ffr.view` IS GRANTED TO NOBODY HERE beyond the roles that already saw the
-- whole register through call visibility (administrators and the office roles
-- `can_view_all_calls()` covers). So THIS FILE WIDENS NOTHING: everybody sees
-- exactly what they saw yesterday, and from now on an administrator grants the
-- register report by report of the role matrix.
--
-- FILED IN `daily_review`, WHICH OWNS ffr_read (0165 creates it). Filing it
-- with the history policy instead put the two in different modules, and
-- `check:bundles` refused it: replaying daily_review.sql ALONE would have put
-- 0165's policy back — silently — and the register would have gone empty again
-- for exactly the people this file is meant to serve. The history half is
-- 0177, in the module that owns ITS policy.
--
-- AND THE OLD SCOPE IS KEPT. An engineer still sees a report on their own call
-- without being granted anything — removing that would take away something
-- people have today, which is not what was asked for and not a decision this
-- migration should make on its own.
-- ===========================================================================

drop policy if exists ffr_read on public.field_failure_reports;
create policy ffr_read on public.field_failure_reports for select to authenticated
  using (
        -- THE NEW RIGHT: granted it, you read the whole register.
        (select public.has_perm('ffr.view'))
        -- Unchanged from 0165 — administrators and the office roles.
     or (select public.can_view_all_calls())
        -- Your own report, whatever else you hold.
     or raised_by = (select auth.uid())
        -- A report not yet tied to a call cannot be scoped by one.
     or coalesce(btrim(ucn), '') = ''
        -- …and a report on a call you can see, as before.
     or exists (select 1 from public.calls c where c.ucn = field_failure_reports.ucn)
  );

-- ---------------------------------------------------------------------------
-- WHOEVER MAY EDIT A REPORT MAY READ ONE. `ffr.manage` without `ffr.view` is
-- exactly the state that produced this report: a write right over records the
-- holder cannot see. Merged rather than overwritten (CLAUDE.md) — an
-- administrator may have tuned the role.
--
-- A role with NO permissions at all is left alone, and deliberately: an empty
-- array means "not configured" and has_perm() falls back to the code defaults;
-- writing one key into it would turn that fallback off and leave the role
-- holding exactly one permission.
-- ---------------------------------------------------------------------------
update public.app_roles ar
   set permissions = (
         select coalesce(jsonb_agg(distinct v), '[]'::jsonb)
           from (
             select jsonb_array_elements_text(ar.permissions) as v
             union
             select 'ffr.view' as v
           ) u
       ),
       updated_at = now()
 where ar.permissions ? 'ffr.manage'
   and not (ar.permissions ? 'ffr.view');
