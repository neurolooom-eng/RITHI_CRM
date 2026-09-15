-- ===========================================================================
-- THE TWO ANALYSIS ROLES COULD OPEN THE ANALYTICS PAGES AND SEE NOTHING ON
-- THEM.
--
-- Reported from use (the user, 2026-09-15): "Spare Insights is blank for
-- VPTechnical Role", and then "Product Failure Analysis is also Blank for
-- VpTechnical." Both pages were in the menu, both opened, both showed zeros.
--
-- THE MODULE KEY OPENS A SCREEN; IT DOES NOT SHOW THE ROWS. That is the whole
-- of this bug, and it is the failure mode the standing rule about Roles &
-- Permissions does not cover — the screen was granted correctly and the
-- database still answered with nothing:
--
--   * PRODUCT FAILURE ANALYSIS reads `field_call_review`, and although
--     `call_reviews_read` (0044) opens the review table to any signed-in user,
--     the VIEW is built `from public.field_calls` — so what a reader sees is
--     bounded by the CALL policies, which are
--     `has_perm('calls.view') AND <visibility>`. A role holding neither sees
--     no calls, therefore no reviews, therefore an empty chart.
--   * SPARE INSIGHTS reads `spare_consumption`, whose `cons_read` (0038) is
--     `can_view_all_calls() OR mine OR my team's`. An analysis role raises no
--     consumption and has no reporting team, so every branch is false.
--
-- `can_view_all_calls()` (0035) names the OFFICE roles literally — hotline,
-- nsm, commercial, spare_coordinator, stores_incharge, tally_coordinator — and
-- neither of these is one. The per-role grant built for exactly this case is
-- `data.view_all`, so that is what they are given, together with the
-- `has_perm` gates each read path tests first. A role that sees NOTHING is
-- usually the `has_perm` gate rather than the scope, and here it was BOTH.
--
-- ONLY THESE TWO ROLES ARE TOUCHED (the user, 2026-09-15: "Take the Current
-- [As Set in the App] Roles as the Standard for Regional Managers, Reporting
-- Managers, Engineers .. Never Touch those Roles & Permissions. Modify only
-- the VPTechnical and RnDEngg Role"). The match is on the role's key OR its
-- label with the separators squashed, so `vptechnical`, `vp_technical` and a
-- label of "VP Technical" all land and nothing else can: `rgm`, `rm` and
-- `engineer` cannot match either pattern.
--
-- READ ONLY. Every key below is a READ — the two roles gain no authority to
-- write a call, a review, a failure report or a stock line. Analysing the data
-- is what they were blank for; changing it was not asked for and is not
-- granted here.
--
-- MERGED, NEVER OVERWRITTEN, and a role with ZERO permissions is left alone:
-- an empty array means "not configured" and `permsForRole()` falls back to the
-- code defaults, which writing one key into would silently switch off.
-- ===========================================================================

do $$
declare
  n int;
  keys text[] := array[
    'data.view_all',      -- the scope: every call, report, request and consumption row
    'calls.view',         -- the gate the call policies test BEFORE the scope
    'consumption.view',   -- Spare Insights, and the consumption reports
    'reports.view',       -- the visit reports a failure is read from
    'ffr.view',           -- the Field Failure Register the analysis rolls up
    'masters.view',       -- product, party and part names, so a chart has labels
    'feedback.view',
    'dashboard.view'
  ];
  who text;
begin
  if to_regclass('public.app_roles') is null then return; end if;

  update public.app_roles ar
     set permissions = (
           select coalesce(jsonb_agg(distinct v), '[]'::jsonb)
             from (
               select jsonb_array_elements_text(ar.permissions) as v
               union
               select unnest(keys) as v
             ) u
         ),
         updated_at = now()
   -- The LABEL is matched as well as the key: a role created through the UI
   -- takes its key from the name it was given, and "VP Technical" keys as
   -- `vp_technical` while "VPTechnical" keys as `vptechnical`. Squashing the
   -- separators out of both means the migration does not depend on which was
   -- typed. Nothing else squashes to these strings.
   where jsonb_array_length(ar.permissions) > 0
     and ( regexp_replace(lower(coalesce(ar.role,  '')), '[^a-z0-9]', '', 'g')
             in ('vptechnical', 'rndengg', 'rndengineer')
        or regexp_replace(lower(coalesce(ar.label, '')), '[^a-z0-9]', '', 'g')
             in ('vptechnical', 'rndengg', 'rndengineer') );
  get diagnostics n = row_count;

  select string_agg(ar.role, ', ' order by ar.role) into who
    from public.app_roles ar
   where regexp_replace(lower(coalesce(ar.role, '')), '[^a-z0-9]', '', 'g')
           in ('vptechnical', 'rndengg', 'rndengineer')
      or regexp_replace(lower(coalesce(ar.label, '')), '[^a-z0-9]', '', 'g')
           in ('vptechnical', 'rndengg', 'rndengineer');

  raise notice '0207: % analysis role(s) updated; roles present: %', n, coalesce(who, 'none');
  if who is null then
    raise notice '0207: neither VP Technical nor R&D Engineer exists on this project — nothing to do.';
  end if;
end $$;
