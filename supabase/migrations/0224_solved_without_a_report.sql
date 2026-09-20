-- ===========================================================================
-- SOLVED, BUT NOBODY FILED THE REPORT.
--
--   The user, 2026-09-20: "Create a Report - Call is Solved, but Report or
--   Visit Entry is missing - View only for Admins and Super Admins."
--
-- This is the list that says WHICH visits to re-upload, and it exists because
-- the answer was previously "load them all again and hope".
--
-- THE FOUR GAPS ARE NOT THE SAME GAP, and a report that lumps them together
-- cannot be acted on — each needs a different fix:
--
--   no visit at all ....... the call has NO `reports` row. Nothing recorded
--                           that anybody attended. The visit must be loaded.
--   no visit date ......... a visit row with no `visit_at`. It cannot be
--                           placed in time, so it cannot date the call.
--   entry date is an ....... `reports.updated_at` is NOT NULL and DEFAULTS TO
--   import stamp            `now()`, so a file with no Visit Entry Date does
--                           not leave a blank — it silently takes the MOMENT
--                           OF THE IMPORT. A missing entry date therefore
--                           cannot be found by looking for a null, which is
--                           why this report looks for the signature instead:
--                           the number of visits sharing that timestamp TO THE
--                           MICROSECOND. Twenty-five visits genuinely entered
--                           at the same instant is not a thing that happens;
--                           a batch load is. The COUNT is published either way
--                           (`visits_sharing_entry_stamp`), so the reader sees
--                           the evidence and not only the verdict.
--                           It matters because that column decides a call's
--                           status — 0032 takes the LATEST ENTRY — so a whole
--                           batch sharing one stamp lets an arbitrary row
--                           decide every call in it.
--   no service report ..... no `manual_report`. The visit is recorded, the
--                           document behind it is not.
--
-- A call can be missing more than one, so `missing` lists every one of them
-- rather than the first — being told about a gap, fixing it, and being told
-- about the next one is three round trips for one row.
--
-- "SOLVED" INCLUDES "SOLVED - REPORT PENDING", AND THE ROW SAYS WHICH. They
-- are different findings: Report Pending is the system stating a known
-- absence, and a plain Solved with no report is the system contradicting
-- itself. Filtering to one of them would hide half the problem; merging them
-- without saying which would misrepresent it. `open_state` is carried through.
--
-- IT IS A `security_invoker` VIEW over `calls` and `reports`, so the call
-- policies decide the rows exactly as they do everywhere else. The SCREEN is
-- what is restricted to administrators (`mod:/missing-visit-reports`, below);
-- the view does not invent a second, different rule, which is how a screen and
-- its data come to disagree.
-- ===========================================================================
-- Dropped first: `create or replace view` can only APPEND a column, and this
-- definition inserts one in the middle. The view is new here, so nothing
-- depends on it and the drop is idempotent.
drop view if exists public.solved_without_report;
create view public.solved_without_report as
with latest as (
  -- THE LATEST ENTRY, not the latest visit date — the same ordering
  -- `sync_call_last_visit()` uses (0032), because this report is about what
  -- that function had to work with.
  select distinct on (r.ucn)
         r.ucn, r.visit_at, r.updated_at, r.manual_report, r.uid, r.engineer,
         count(*) over (partition by r.updated_at) as sharing
    from public.reports r
   order by r.ucn, r.updated_at desc nulls last, r.id desc
)
select
  c.ucn,
  c.call_number,
  c.reg_date,
  c.open_state,
  c.party_name,
  c.product_name,
  c.serial,
  c.state,
  c.last_visit_at,
  l.uid            as visit_uid,
  l.visit_at       as visit_date,
  l.updated_at     as visit_entry_date,
  l.sharing        as visits_sharing_entry_stamp,
  nullif(btrim(coalesce(l.manual_report, '')), '') as service_report,
  coalesce(nullif(btrim(coalesce(l.engineer, '')), ''), '') as visit_engineer,
  -- EVERY gap on the row, in the order they have to be fixed in.
  array_to_string(
    array_remove(array[
      case when l.ucn is null                                        then 'no visit at all' end,
      case when l.ucn is not null and l.visit_at is null             then 'no visit date' end,
      case when l.ucn is not null and l.sharing >= 25
             then 'entry date looks like an import stamp (' || l.sharing || ' visits share it)' end,
      case when l.ucn is not null
            and coalesce(btrim(l.manual_report), '') = ''            then 'no service report' end
    ], null), ' · ')                                                 as missing
from public.calls c
left join latest l on l.ucn = c.ucn
where coalesce(c.open_state, '') like 'Solved%'
  and (l.ucn is null
       or l.visit_at is null
       or l.sharing >= 25
       or coalesce(btrim(l.manual_report), '') = '');
alter view public.solved_without_report set (security_invoker = on);
grant select on public.solved_without_report to authenticated;
comment on view public.solved_without_report is
  'Calls reading Solved whose visit record is incomplete — no visit at all, no visit date, no visit entry date, or no service report. `missing` names every gap on the row. Administrators only, by the module key rather than by a rule of its own (0224).';

-- ---------------------------------------------------------------------------
-- THE KEY REACHES NOBODY WITHOUT THIS. `permsForRole()` is
-- `if (stored && stored.length) return stored;` — the code defaults apply ONLY
-- to a role whose stored set is EMPTY, and on a project in use every role has
-- a tuned row. So a new screen's key must be MERGED into `app_roles` or the
-- page is invisible to everybody with no error anywhere. 0195 and 0209 are the
-- pattern; this is the same shape.
--
-- ADMINISTRATORS ONLY: the three roles that see every module. MERGED, never
-- overwritten, and a role with ZERO permissions is left alone — an empty array
-- means "not configured" and writing one key into it turns the fallback off.
-- ---------------------------------------------------------------------------
do $$
declare n integer;
begin
  if to_regclass('public.app_roles') is null then return; end if;

  update public.app_roles ar
     set permissions = (
           select coalesce(jsonb_agg(distinct v), '[]'::jsonb)
             from (
               select jsonb_array_elements_text(ar.permissions) as v
               union
               select unnest(array['mod:/missing-visit-reports']) as v
             ) u
         ),
         updated_at = now()
   where jsonb_array_length(ar.permissions) > 0
     and ar.role in ('admin', 'technical_support', 'zoho_migration')
     and not (ar.permissions ? 'mod:/missing-visit-reports');
  get diagnostics n = row_count;
  raise notice '0224: % of 3 role(s) given mod:/missing-visit-reports', n;
end $$;
