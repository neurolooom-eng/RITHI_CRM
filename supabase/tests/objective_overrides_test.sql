-- ===========================================================================
-- A FIGURE TYPED OVER A CALCULATED MONTH IS A MANUAL OVERRIDE (0346).
--
--   The user, 2026-10-04: "And i Override it manually, then it should never
--   change.. Or prompt the user if Manually Overrides should be considered or
--   discarded during every re-run / re-calculate."
--
-- Proves: typing over a computed month marks it, with who and the calculated
-- figure; Re-Calculate that KEEPS leaves it as typed (and so does the old
-- one-argument call); Re-Calculate that DISCARDS writes the calculated figure
-- back and removes the mark; the mark cannot be written or removed through the
-- API; and a typed (not computed) objective is never marked.
--
-- Superuser bypasses RLS, so the edits run as `authenticated`.
-- Run ONCE after _stub.sql + every migration.
-- Every error printed is labelled `expect ERROR` — anything else is a failure.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off

insert into auth.users (id, email) values
 ('e1e1e345-0000-0000-0000-000000000001', 'ov_admin@x.com')
on conflict do nothing;
insert into public.profiles (id, email, full_name, role) values
 ('e1e1e345-0000-0000-0000-000000000001', 'ov_admin@x.com', 'OV Admin', 'admin')
on conflict (id) do update set role = excluded.role;
create or replace procedure public.be(p text) language plpgsql as $$
begin update public.harness set uid = (select id from auth.users where email = p), email = p; end $$;
grant select on public.harness to authenticated;

-- Ten machines, four January calls, one still open at the end of January:
-- January's open rate is 1/4 = 0.25.
insert into public.products (item_name, serial_number, party_name)
select 'OVVENT', 'OV-' || g, 'OV FLEET' from generate_series(1, 10) g;
insert into public.field_calls (ucn, call_number, call_type, product_name, serial, reg_date,
                                complaint_date, party_name, city, state, item_status,
                                complaint_reported, standard_complaint, allocated_to)
values
 ('OV-1','OVC1','FIELD','OVVENT','OV-1', date '2026-01-05', date '2026-01-05','H','C','S','CMC','x','y','E'),
 ('OV-2','OVC2','FIELD','OVVENT','OV-2', date '2026-01-10', date '2026-01-10','H','C','S','CMC','x','y','E'),
 ('OV-3','OVC3','FIELD','OVVENT','OV-3', date '2026-01-20', date '2026-01-20','H','C','S','CMC','x','y','E'),
 ('OV-4','OVC4','FIELD','OVVENT','OV-4', date '2026-01-25', date '2026-01-25','H','C','S','CMC','x','y','E');
insert into public.reports (uid, ucn, call_number, call_status, engineer, visit_at, updated_at) values
 ('OVV-1','OV-1','OVC1','Solved - Report Completed','E', timestamptz '2026-01-06 10:00+05:30', timestamptz '2026-01-06 10:00+05:30'),
 ('OVV-2','OV-2','OVC2','Solved - Report Completed','E', timestamptz '2026-01-12 10:00+05:30', timestamptz '2026-01-12 10:00+05:30'),
 ('OVV-3','OV-3','OVC3','Solved - Report Completed','E', timestamptz '2026-01-28 10:00+05:30', timestamptz '2026-01-28 10:00+05:30'),
 ('OVV-4','OV-4','OVC4','Solved - Report Completed','E', timestamptz '2026-03-15 10:00+05:30', timestamptz '2026-03-15 10:00+05:30');

delete from public.quality_objectives where year = 2026;
insert into public.quality_objectives
  (year, sort_order, process, parameter, yearly_target, frequency, responsible, calc_key, calc_params)
values
 (2026, 1, 'OV', 'OV open rate', '<35%', 'Monthly', 'NSM', 'open_rate_monthly', '{"call_type":"FIELD"}'),
 (2026, 2, 'OV', 'OV typed only', 'To Monitor', 'Monthly', 'NSM', '', '{}');

call public.be('ov_admin@x.com');
begin; set local role authenticated; select count(*) >= 1 as first_run from public.recalc_quality_objectives(2026, true); commit;

\echo '--- 1. TYPING OVER A CALCULATED MONTH MARKS IT ---'
begin; set local role authenticated;
  update public.quality_objectives set m01 = 0.10 where parameter = 'OV open rate';
  update public.quality_objectives set m01 = 0.50 where parameter = 'OV typed only';
commit;
select 'override marked with who and the calculated figure',
       (overrides -> 'm01' ->> 'by') = 'ov_admin@x.com'
   and (overrides -> 'm01' ->> 'calculated')::numeric = 0.25
   and m01 = 0.10 as ok
  from public.quality_objectives where parameter = 'OV open rate';
select 'a typed objective is never marked', overrides = '{}'::jsonb as ok
  from public.quality_objectives where parameter = 'OV typed only';

\echo '--- 2. TYPING AGAIN KEEPS THE ORIGINAL CALCULATED FIGURE ---'
begin; set local role authenticated;
  update public.quality_objectives set m01 = 0.12 where parameter = 'OV open rate';
commit;
select 'second edit keeps calculated = 0.25',
       (overrides -> 'm01' ->> 'calculated')::numeric = 0.25 and m01 = 0.12 as ok
  from public.quality_objectives where parameter = 'OV open rate';

\echo '--- 3. THE MARK CANNOT BE REMOVED OR FORGED THROUGH THE API ---'
begin; set local role authenticated;
  update public.quality_objectives set overrides = '{}'::jsonb where parameter = 'OV open rate';
  update public.quality_objectives set overrides = '{"m05":{"by":"x"}}'::jsonb where parameter = 'OV typed only';
commit;
select 'mark survives an attempt to clear it; none can be forged',
       (select overrides ? 'm01' from public.quality_objectives where parameter = 'OV open rate')
   and (select overrides = '{}'::jsonb from public.quality_objectives where parameter = 'OV typed only') as ok;

\echo '--- 4. RE-CALCULATE THAT KEEPS LEAVES IT AS TYPED (and so does the old call) ---'
begin; set local role authenticated;
  select objective, months_written, months_kept from public.recalc_quality_objectives(2026, true) order by objective;
  select count(*) from public.recalc_quality_objectives(2026);
commit;
select 'kept as typed, still marked', m01 = 0.12 and overrides ? 'm01' as ok
  from public.quality_objectives where parameter = 'OV open rate';

\echo '--- 5. RE-CALCULATE THAT DISCARDS WRITES THE CALCULATION BACK AND UNMARKS ---'
begin; set local role authenticated;
  select objective, months_written, months_kept from public.recalc_quality_objectives(2026, false) order by objective;
commit;
select 'calculated figure back, mark gone', m01 = 0.25 and not (overrides ? 'm01') as ok
  from public.quality_objectives where parameter = 'OV open rate';
select 'the typed objective is untouched by either', m01 = 0.50 and overrides = '{}'::jsonb as ok
  from public.quality_objectives where parameter = 'OV typed only';
