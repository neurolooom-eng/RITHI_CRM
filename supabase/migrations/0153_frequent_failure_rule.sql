-- ===========================================================================
-- FREQUENT FAILURE — the PROCEDURE'S rule, not the first approximation of it.
--
-- Reported 2026-09-09: the Review 2 helper "still not fixed". It was not. The
-- rule has been settled in docs/BACKLOG.md since 2026-09-06 and 0117 only ever
-- implemented part of it. Three differences, all of which change the answer:
--
--   |         | Procedure                          | 0117                     |
--   | Window  | ONE MONTH                          | six months               |
--   | Count   | >= 2 INCLUDING the call in review  | listed priors only, so   |
--   |         | -- so ONE prior failure is enough  | a reviewer read 1 where  |
--   |         |                                    | the rule counts 2        |
--   | Match   | same equipment OR the SAME PART    | same equipment only, and |
--   |         | in the same machine                | complaints had to match  |
--
-- The window being 6x too wide flagged failures the procedure would not, which
-- inflates the frequent-failure figure feeding the objectives. The count was
-- off by one against the rule as written. And the "same part in the same
-- machine" path -- the user's own words, "Same Part in same Machine" -- did not
-- exist at all.
--
-- EDITABLE, because the user asked for that in the same breath ("Maybe make it
-- editable in Admin Pannel"): window, threshold and one judgement call below
-- live in `app_settings`, which is already admin-only to write (0047). The
-- defaults here ARE the procedure, so a project that never opens Admin Config
-- gets the procedure.
--
-- THE ONE JUDGEMENT CALL, stated rather than buried. The procedure says "same
-- equipment"; the user's rule of 2026-09-06 said the complaint had to match
-- too. Both readings are defensible and they give different answers, so it is a
-- SETTING (`ffr.equipment_needs_complaint`) and it DEFAULTS TO ON -- the
-- behaviour this system has had since 0117. A rule change that silently
-- re-bases past judgements is the one thing not to do here.
--
-- ANSWERS ALREADY RECORDED ARE LEFT ALONE. 0124 auto-answers Review 2 on a
-- schedule, so some of these are stamped "Auto (9:15 am)" -- and every one of
-- them is a quality record. This migration does not touch `daily_call_review`:
-- nothing is re-opened, re-answered or withdrawn. Re-reviewing calls decided
-- under the old window is a deliberate act for RA/QA, not a side effect of a
-- migration, and the screen now shows the rule it is applying so the two are
-- told apart. That decision remains open in docs/BACKLOG.md.
--
-- WHAT IS UNCHANGED FROM 0117, because it was right:
--   * The window is measured from THE CALL'S date, not today, or reopening an
--     old review would change its answer.
--   * A blank serial returns nothing rather than matching every other
--     blank-serial call. `known` says so, and the screen says "cannot tell"
--     rather than "no" -- this decides whether an FFR is raised.
--   * SECURITY DEFINER: an answer filtered by the reader's own call scope would
--     read LOWER than the truth, and low is the direction that talks somebody
--     out of raising an FFR. Gated on the review permission; it returns nothing
--     that is not about the machine already on screen.
-- ===========================================================================

-- ---- the rule, as settings -------------------------------------------------
insert into public.app_settings (key, value, updated_at) values
  ('ffr.window_months', '1', now()),
  ('ffr.threshold', '2', now()),
  ('ffr.equipment_needs_complaint', 'on', now())
on conflict (key) do nothing;      -- never overwrite what an admin has tuned

create or replace function public.frequent_failure_rule()
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'window_months', greatest(coalesce((select nullif(btrim(value), '')::integer
                                          from public.app_settings where key = 'ffr.window_months'), 1), 1),
    'threshold',     greatest(coalesce((select nullif(btrim(value), '')::integer
                                          from public.app_settings where key = 'ffr.threshold'), 2), 1),
    'equipment_needs_complaint',
                     coalesce((select lower(btrim(value)) = 'on'
                                 from public.app_settings where key = 'ffr.equipment_needs_complaint'), true));
$$;

revoke all on function public.frequent_failure_rule() from public;
grant execute on function public.frequent_failure_rule() to authenticated;

comment on function public.frequent_failure_rule() is
  'The frequent-failure rule in force: window_months, threshold (counted INCLUDING the call under review) and whether the same-equipment path also requires a matching complaint. Defaults are the procedure''s own (1 month, 2, on) and apply when app_settings carries nothing (0153).';

-- ---- the answer ------------------------------------------------------------
-- The old signature returned rows and no verdict, so the screen had to apply
-- the threshold itself -- which is how the count came to be read one short.
-- One function, one rule, one place to change it.
drop function if exists public.frequent_failure_history(text, integer);

create or replace function public.frequent_failure(p_ucn text)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_rule      jsonb := public.frequent_failure_rule();
  v_months    integer := (v_rule ->> 'window_months')::integer;
  v_threshold integer := (v_rule ->> 'threshold')::integer;
  v_needs_c   boolean := (v_rule ->> 'equipment_needs_complaint')::boolean;
  v_product   text;
  v_serial    text;
  v_std       text;
  v_reported  text;
  v_on        date;
  v_rows      jsonb;
  v_earlier   integer;
begin
  if not (public.has_perm('review.edit') or public.has_perm('calls.view')) then
    raise exception 'RBAC: your role cannot read the review history';
  end if;

  select lower(btrim(coalesce(c.product_name, ''))),
         lower(btrim(coalesce(c.serial, ''))),
         lower(btrim(coalesce(c.standard_complaint, ''))),
         lower(btrim(coalesce(c.complaint_reported, ''))),
         c.reg_date
    into v_product, v_serial, v_std, v_reported, v_on
    from public.calls c where c.ucn = p_ucn;

  -- No machine, no answer -- and say which, because "no history" and "cannot
  -- tell" are different things to record a judgement on.
  if v_product is null or v_product = '' or v_serial = '' then
    return v_rule || jsonb_build_object(
      'known', false, 'earlier', 0, 'total', 0, 'is_frequent', false, 'rows', '[]'::jsonb);
  end if;
  v_on := coalesce(v_on, current_date);

  with mine as (
    -- The parts fitted on the call under review, by CODE. The code is the half
    -- that is stable: descriptions drift, and both sides store CODE|Description.
    select distinct btrim(split_part(sc.part, '|', 1)) as code
      from public.spare_consumption sc
     where (sc.ucn = p_ucn or (nullif(btrim(sc.call_number), '') is not null
            and sc.call_number = (select c.call_number from public.calls c where c.ucn = p_ucn)))
       and coalesce(sc.qty, 0) > 0            -- a VOIDED line is not consumption
       and btrim(split_part(sc.part, '|', 1)) <> ''
  ),
  -- Every earlier call on the SAME MACHINE inside the window. The two match
  -- paths are then tested against this one set, so a call that satisfies both
  -- is one row, not two.
  machine as (
    select c.*
      from public.calls c
     where c.ucn <> p_ucn
       and lower(btrim(coalesce(c.product_name, ''))) = v_product
       and lower(btrim(coalesce(c.serial, '')))       = v_serial
       and c.reg_date is not null
       and c.reg_date <= v_on
       and c.reg_date >  v_on - make_interval(months => v_months)
       and c.cancelled_at is null
  ),
  matched as (
    select m.ucn,
           coalesce(m.call_number, '')  as call_number,
           m.reg_date,
           coalesce(nullif(btrim(m.standard_complaint), ''), m.complaint_reported, '') as complaint,
           coalesce(m.allocated_to, '') as engineer,
           coalesce(m.party_name, '')   as party_name,
           (v_on - m.reg_date)::integer as days_before,
           -- SAME COMPLAINT, on the standard value or the reported wording:
           -- the sheet era left calls with no standard complaint, and one of
           -- those would otherwise read as "no history".
           ((v_std <> '' and lower(btrim(coalesce(m.standard_complaint, ''))) = v_std)
             or (v_reported <> '' and lower(btrim(coalesce(m.complaint_reported, ''))) = v_reported)
           ) as same_complaint,
           exists (
             select 1 from public.spare_consumption sc
              where (sc.ucn = m.ucn or (nullif(btrim(sc.call_number), '') is not null
                     and sc.call_number = m.call_number))
                and coalesce(sc.qty, 0) > 0
                and btrim(split_part(sc.part, '|', 1)) in (select code from mine)
           ) as same_part
      from machine m
  ),
  kept as (
    select *,
           case when same_part then 'Same part in this machine'
                when same_complaint then 'Same machine, same complaint'
                else 'Same machine' end as match_on
      from matched
     -- The same part in the same machine ALWAYS counts -- that is the path the
     -- procedure adds and it does not mention the complaint. The equipment path
     -- is where the judgement call lives.
     where same_part or (not v_needs_c) or same_complaint
  )
  select coalesce(jsonb_agg(to_jsonb(k) order by k.reg_date desc, k.ucn desc), '[]'::jsonb), count(*)
    into v_rows, v_earlier
    from kept k;

  return v_rule || jsonb_build_object(
    'known', true,
    'earlier', v_earlier,
    -- INCLUDING THE CALL UNDER REVIEW. That is the rule as the user stated it
    -- ("2 or More including the call in question"), and the reason the old
    -- screen read one short.
    'total', v_earlier + 1,
    'is_frequent', (v_earlier + 1) >= v_threshold,
    'rows', v_rows);
end $$;

revoke all on function public.frequent_failure(text) from public;
grant execute on function public.frequent_failure(text) to authenticated;

comment on function public.frequent_failure(text) is
  'Is this a frequent failure? Earlier calls on the same machine within the window, matched on the same complaint OR the same part fitted, counted INCLUDING the call under review against the threshold (0153). Replaces frequent_failure_history(), which listed priors and left the screen to apply the rule. SECURITY DEFINER on purpose: an answer narrowed to the reader''s own call scope would read lower than the truth, and low is the direction that talks somebody out of raising an FFR.';
