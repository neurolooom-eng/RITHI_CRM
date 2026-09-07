-- ===========================================================================
-- ALMS-INDIA QUALITY & BUSINESS OBJECTIVES, on their own page.
--
-- The user's Service Quality Objective workbook, 2026: twelve objectives, each
-- with a yearly target, how often it is measured, who is responsible, and the
-- month-by-month actual. Kept by hand in Excel until now.
--
-- "I need all these there and let's figure out later what all we can automate."
-- So this is the REGISTER first: every objective present, every actual visible
-- and editable, and nothing pretending to be computed that is not. As each one
-- is automated it stops being typed and starts being read from the calls —
-- `source` is what will say which, and today every row says 'manual'.
--
-- ONE ROW PER OBJECTIVE PER YEAR, twelve month columns, exactly as the sheet is
-- shaped. A month is NULL when it was not measured, which is how the sheet's
-- "NA" reads on a quarterly objective — not zero, which would drag an average
-- down and is a different claim entirely.
--
-- THE TOTAL IS STORED, NOT COMPUTED. In the workbook column V is a SUM on the
-- count rows and something closer to an average on the rate rows, and which it
-- is cannot be told from the row itself. Computing one number for both would
-- put a wrong figure on a quality record, so the sheet's own total is carried
-- across and stays typed until each objective is automated and can say how its
-- total is arrived at.
--
-- The targets stay TEXT: "<5%", ">75%", "To Monitor" are the sheet's own words
-- and they are what an auditor reads. Parsing them into a number and an
-- operator would be inventing precision the register does not have.
-- ===========================================================================

create table if not exists public.quality_objectives (
  id             bigint generated always as identity primary key,
  year           integer not null,
  sort_order     integer not null default 0,
  process        text    not null default '',     -- SERVICE | BUSINESS
  parameter      text    not null,                -- what is monitored
  yearly_target  text    not null default '',     -- "<5%", ">75%", "To Monitor"
  current_target text    not null default '',
  frequency      text    not null default '',     -- Monthly | 3 Months
  responsible    text    not null default '',
  m01 numeric, m02 numeric, m03 numeric, m04 numeric, m05 numeric, m06 numeric,
  m07 numeric, m08 numeric, m09 numeric, m10 numeric, m11 numeric, m12 numeric,
  total          numeric,
  -- 'manual' while somebody types the figure; the name of what computes it once
  -- it is automated. Nothing reads this yet; it is here so that when the first
  -- objective is automated, the page can say which are and which are not.
  source         text not null default 'manual',
  notes          text not null default '',
  updated_by     uuid,
  updated_at     timestamptz not null default now()
);

create unique index if not exists quality_objectives_year_param_uniq
  on public.quality_objectives (year, lower(btrim(parameter)));

alter table public.quality_objectives enable row level security;

-- Readable by anyone signed in who can see the register: an objective is the
-- company's, not one team's. Written by the people who own the numbers —
-- config.manage is what the admin screens already ask for.
drop policy if exists qo_read on public.quality_objectives;
create policy qo_read on public.quality_objectives for select
  using (public.has_perm('calls.view') or public.has_perm('reports.view'));
drop policy if exists qo_write on public.quality_objectives;
create policy qo_write on public.quality_objectives for all
  using (public.has_perm('config.manage')) with check (public.has_perm('config.manage'));
grant select, insert, update, delete on public.quality_objectives to authenticated;

create or replace function public.quality_objectives_stamp()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := now();
  if auth.uid() is not null then new.updated_by := auth.uid(); end if;
  return new;
end $$;
drop trigger if exists zz_quality_objectives_stamp on public.quality_objectives;
create trigger zz_quality_objectives_stamp before insert or update on public.quality_objectives
  for each row execute function public.quality_objectives_stamp();

-- ---------------------------------------------------------------------------
-- The 2026 objectives, as the workbook has them. Jan-Jul carry actuals; August
-- onwards are blank because the sheet has not been filled in yet, and a blank
-- month is not a zero.
--
-- ON CONFLICT DO NOTHING: re-running this must not overwrite a figure somebody
-- has since typed on the screen. To reload a year deliberately, delete it first.
-- ---------------------------------------------------------------------------
insert into public.quality_objectives
  (year, sort_order, process, parameter, yearly_target, current_target, frequency, responsible,
   m01, m02, m03, m04, m05, m06, m07, m08, m09, m10, m11, m12, total)
values
  (2026, 1, 'SERVICE', 'No.of Field failures registered in FFR', 'To Monitor', '-', 'Monthly', 'National Service Manager', 0.0, 9.0, 7.0, 6.0, 2.0, 4.0, 6.0, null, null, null, null, null, 34.0),
  (2026, 2, 'SERVICE', 'Recent Failure Rate of CPXcare', '<5%', '-', 'Monthly', 'National Service Manager', 0.01, 0.01, 0.0, 0.0, 0.0, 0.0, 0.0, null, null, null, null, null, 0.002857),
  (2026, 3, 'SERVICE', 'Recent Failure Rate of  Extend (Indian)', '<8%', '-', 'Monthly', 'National Service Manager', 0.18, 0.06, 0.03, 0.02, 0.02, 0.02, 0.02, null, null, null, null, null, 0.05),
  (2026, 4, 'SERVICE', 'Recent Failure Rate of Orion-G', '<5%', '-', 'Monthly', 'National Service Manager', 0.01, 0.01, 0.0, 0.0, 0.0, 0.0, 0.0, null, null, null, null, null, 0.002857),
  (2026, 5, 'SERVICE', 'Recent Failure Rate of VEGA', '<6%', '-', 'Monthly', 'National Service Manager', 0.1, 0.11, 0.11, 0.05, 0.05, 0.01, 0.01, null, null, null, null, null, 0.062857),
  (2026, 6, 'SERVICE', 'Recent Failure Rate of MT75', '<6%', '-', 'Monthly', 'National Service Manager', 0.12, 0.12, 0.12, 0.12, 0.1, 0.09, 0.03, null, null, null, null, null, 0.1),
  (2026, 7, 'SERVICE', 'Failure Rate of MT60', '<6%', '-', 'Monthly', 'National Service Manager', 0.08, 0.08, 0.03, 0.01, 0.01, 0.01, 0.01, null, null, null, null, null, 0.032857),
  (2026, 8, 'SERVICE', 'Breakdown Calls', '<35%', '-', 'Monthly', 'National Service Manager', 0.06, 0.1, 0.16, 0.09, 0.08, 0.08, 0.08, null, null, null, null, null, 0.092857),
  (2026, 9, 'SERVICE', 'Preventive Maintenance Calls', '<12%', '-', '3 Months', 'National Service Manager', null, null, 0.1, null, null, 0.1, null, null, null, null, null, null, 0.1),
  (2026, 10, 'BUSINESS', 'Installation call', '<10%', '-', '3 Months', 'National Service Manager', null, null, 0.02, null, null, 0.02, null, null, null, null, null, null, 0.02),
  (2026, 11, 'BUSINESS', 'Problem Call attending within 3 days', '>75%', '-', 'Monthly', 'National Service Manager', 0.92, 0.93, 0.94, 0.95, 0.96, 0.94, 0.96, null, null, null, null, null, 0.942857),
  (2026, 12, 'BUSINESS', 'b.Customer feedback', '>75%', '-', '3 Months', 'National Service Manager', null, null, 0.95, null, null, 0.95, null, null, null, null, null, null, 0.95)
on conflict (year, lower(btrim(parameter))) do nothing;

-- ---------------------------------------------------------------------------
-- The page. Every role that can already see KPI & Failure Analysis gets it:
-- the Objective register is the same audience, and Phase 1 of it (the KPI
-- workbook's Field_INST export) moved off that screen onto this one.
--
-- MERGED, never overwritten — an administrator may have tuned a role.
-- ---------------------------------------------------------------------------
update public.app_roles ar
   set permissions = (
         select coalesce(jsonb_agg(distinct v), '[]'::jsonb)
           from (
             select jsonb_array_elements_text(ar.permissions) as v
             union
             select 'mod:/objective' as v
           ) u
       ),
       updated_at = now()
 where ar.permissions ? 'mod:/kpi'
   and not (ar.permissions ? 'mod:/objective');
