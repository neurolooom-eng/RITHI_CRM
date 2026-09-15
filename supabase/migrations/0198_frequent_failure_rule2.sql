-- ===========================================================================
-- 0198 — A SECOND FREQUENT-FAILURE RULE: THE SAME FAULT ACROSS THE FLEET.
--
-- The user, 2026-09-15: "For frequent failure - Add more rule. Rule 2, Same
-- Complaint across same product, but multiple serial nos in the last 30 days."
--
-- THE TWO RULES ANSWER DIFFERENT QUESTIONS, and that is the whole reason for a
-- second one rather than a wider first:
--
--   RULE 1  one MACHINE failing repeatedly — the same product AND serial, on
--           the same complaint or the same part refitted. A unit in trouble.
--   RULE 2  one MODEL failing the same way across DIFFERENT units. A batch, a
--           component, a design or a handling problem — and the thing rule 1
--           can never see, because every one of those calls is a first failure
--           on its own machine.
--
-- IT COUNTS DISTINCT SERIALS, NOT CALLS, and that is the load-bearing choice.
-- "Multiple serial nos" is the user's wording and it is the right measure: five
-- calls on one machine are rule 1's business and must not read as a fleet
-- problem. So the same complaint five times on ONE serial does NOT fire rule 2;
-- on two serials it does.
--
-- THIRTY DAYS, IN DAYS. Rule 1's window is in MONTHS because the procedure says
-- a month; the user said thirty days for this one, and those are different
-- lengths in February. Held as its own setting rather than borrowed, so
-- changing one cannot silently move the other.
--
-- `is_frequent` IS NOW EITHER RULE. A call the second rule catches IS a
-- frequent failure — that is what adding a rule means. The verdict says WHICH
-- fired, because a reviewer asked to justify an answer months later needs to
-- know whether they were looking at one machine or at twelve.
--
-- ANSWERS ALREADY RECORDED ARE NOT RE-BASED. This function is computed live for
-- the screen; `call_reviews.frequent_failure` holds what a person answered
-- under the rule in force at the time, and nothing here rewrites it. The same
-- decision URS-046 made when the window changed from six months to one.
-- ===========================================================================

insert into public.app_settings (key, value, updated_at) values
  -- THIRTY DAYS, not "a month" — see the header.
  ('ffr.rule2_window_days', '30', now()),
  -- TWO DISTINCT SERIALS INCLUDING THIS ONE. "Multiple" is two; an
  -- administrator may raise it where a model is common enough that two is noise.
  ('ffr.rule2_serials', '2', now()),
  ('ffr.rule2_enabled', 'true', now())
on conflict (key) do nothing;

create or replace function public.frequent_failure_rule()
returns jsonb language sql stable set search_path = public as $$
  select jsonb_build_object(
    'window_months', greatest(coalesce((select nullif(btrim(value), '')::integer
                                          from public.app_settings where key = 'ffr.window_months'), 1), 1),
    'threshold',     greatest(coalesce((select nullif(btrim(value), '')::integer
                                          from public.app_settings where key = 'ffr.threshold'), 2), 1),
    -- VERBATIM FROM 0153, and it has to be. The first draft of this file
    -- rewrote the test as `in ('true','t','yes','1')` while the stored value is
    -- `on` — so this key silently read FALSE, the equipment path stopped
    -- requiring a matching complaint, and rule 1 would have flagged more calls
    -- than it does today. A rule nobody asked to change, changed by a rewrite
    -- of a line that was only being carried past. Caught by comparing the
    -- function's output before and after rather than by reading it.
    'equipment_needs_complaint',
                     coalesce((select lower(btrim(value)) = 'on'
                                 from public.app_settings where key = 'ffr.equipment_needs_complaint'), true),
    -- RULE 2. Defaults are the user's own words: thirty days, more than one
    -- serial. `greatest(...,1)` on each so a blank or nonsense setting cannot
    -- produce a window of zero days that quietly never fires.
    -- `on` accepted as well, because that is what the sibling setting uses and
    -- an administrator editing app_settings by hand will reach for it.
    'rule2_enabled', coalesce((select lower(btrim(value)) in ('true','t','yes','1','on')
                                 from public.app_settings where key = 'ffr.rule2_enabled'), true),
    'rule2_window_days', greatest(coalesce((select nullif(btrim(value), '')::integer
                                              from public.app_settings where key = 'ffr.rule2_window_days'), 30), 1),
    'rule2_serials',     greatest(coalesce((select nullif(btrim(value), '')::integer
                                              from public.app_settings where key = 'ffr.rule2_serials'), 2), 2)
  );
$$;

create or replace function public.frequent_failure(p_ucn text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_rule      jsonb := public.frequent_failure_rule();
  v_months    integer := (v_rule ->> 'window_months')::integer;
  v_threshold integer := (v_rule ->> 'threshold')::integer;
  v_needs_c   boolean := (v_rule ->> 'equipment_needs_complaint')::boolean;
  v_r2_on     boolean := (v_rule ->> 'rule2_enabled')::boolean;
  v_r2_days   integer := (v_rule ->> 'rule2_window_days')::integer;
  v_r2_min    integer := (v_rule ->> 'rule2_serials')::integer;
  v_product   text;
  v_serial    text;
  v_std       text;
  v_reported  text;
  v_on        date;
  v_rows      jsonb;
  v_earlier   integer;
  v_r2_rows   jsonb := '[]'::jsonb;
  v_r2_serials integer := 0;
  v_r2_calls   integer := 0;
  v_rule1     boolean;
  v_rule2     boolean := false;
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
  --
  -- RULE 2 IS HELD TO THE SAME BAR even though it needs only the product and
  -- the complaint: it counts DISTINCT SERIALS, and a call whose own serial is
  -- unknown cannot be counted as one of them. Answering on a fleet while
  -- reporting "cannot tell" about the machine would be two verdicts in one
  -- envelope.
  if v_product is null or v_product = '' or v_serial = '' then
    return v_rule || jsonb_build_object(
      'known', false, 'earlier', 0, 'total', 0, 'is_frequent', false, 'rows', '[]'::jsonb,
      'rule1_is_frequent', false, 'rule2_is_frequent', false,
      'rule2_serials_seen', 0, 'rule2_calls', 0, 'rule2_rows', '[]'::jsonb);
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

  v_rule1 := (v_earlier + 1) >= v_threshold;

  -- ---- RULE 2: the same complaint on OTHER units of the same model ---------
  -- A complaint is required. Without one there is nothing to be "the same"
  -- across the fleet, and matching on the product alone would flag every busy
  -- model in the register.
  if v_r2_on and (v_std <> '' or v_reported <> '') then
    with fleet as (
      select lower(btrim(coalesce(c.serial, ''))) as serial_key,
             c.ucn, coalesce(c.call_number, '') as call_number, c.reg_date,
             coalesce(nullif(btrim(c.standard_complaint), ''), c.complaint_reported, '') as complaint,
             coalesce(c.party_name, '') as party_name,
             coalesce(c.serial, '') as serial,
             (v_on - c.reg_date)::integer as days_before
        from public.calls c
       where lower(btrim(coalesce(c.product_name, ''))) = v_product
         and lower(btrim(coalesce(c.serial, ''))) <> ''
         and c.reg_date is not null
         and c.reg_date <= v_on
         -- DAYS, not months. `v_on - 30` is the thirty days the user asked for
         -- in every month of the year.
         and c.reg_date >  v_on - v_r2_days
         and c.cancelled_at is null
         and ((v_std <> '' and lower(btrim(coalesce(c.standard_complaint, ''))) = v_std)
           or (v_reported <> '' and lower(btrim(coalesce(c.complaint_reported, ''))) = v_reported))
    )
    select coalesce(jsonb_agg(to_jsonb(f) order by f.reg_date desc, f.ucn desc), '[]'::jsonb),
           count(distinct f.serial_key), count(*)
      into v_r2_rows, v_r2_serials, v_r2_calls
      from fleet f;

    -- DISTINCT SERIALS, INCLUDING THIS ONE — `fleet` is not filtered to
    -- `c.ucn <> p_ucn`, so the machine under review is counted as one of them.
    -- Five calls on one serial therefore give ONE, and rule 2 does not fire:
    -- that is rule 1's finding and must not be reported as a fleet problem.
    v_rule2 := v_r2_serials >= v_r2_min;
  end if;

  return v_rule || jsonb_build_object(
    'known', true,
    'earlier', v_earlier,
    -- INCLUDING THE CALL UNDER REVIEW. That is the rule as the user stated it
    -- ("2 or More including the call in question"), and the reason the old
    -- screen read one short.
    'total', v_earlier + 1,
    'rows', v_rows,
    'rule1_is_frequent', v_rule1,
    'rule2_is_frequent', v_rule2,
    'rule2_serials_seen', v_r2_serials,
    'rule2_calls', v_r2_calls,
    'rule2_rows', v_r2_rows,
    -- EITHER RULE. Adding a rule that did not change the verdict would be a
    -- report, not a rule.
    'is_frequent', v_rule1 or v_rule2);
end $$;
