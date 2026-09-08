-- ===========================================================================
-- THE RELIABILITY TEMPLATE, FILLED FROM THE REGISTER.
--
-- The user, 2026-09-08, with `VEGA__French_Template_Reliability.xlsx`: "this is
-- the current failure template.. I need to be able to fill Services and install
-- data into this from my export.. failure usual come from DCCR".
--
-- The workbook is a Weibull reliability study, and only TWO of its sixteen
-- sheets are typed into. The rest derive:
--
--   `Installed Base`  = FILTER(Inst_PrdMaster!B:B, Inst_PrdMaster!I:I = <model>)
--   `Services`        = FILTER('Merge WRR'!C5:K, ...)
--
-- So filling `Inst_PrdMaster` and `Merge WRR` fills the workbook. Everything
-- downstream -- the age bands, the Pareto, the Weibull fit -- recalculates.
-- `Inst_PrdMaster` is a plain Product Master listing and the page builds it from
-- `products` directly; this function is the other one.
--
-- ONE ROW PER VISIT, not per call. The sheet's key column is "Service date", and
-- a call attended three times is three services in a reliability study -- three
-- opportunities for the machine to have failed. Counting it once would flatter
-- the failure rate, which is the direction nobody questions.
--
-- WHERE EACH COLUMN COMES FROM. The DCCR turns out to line up with this template
-- almost name for name, which is not a coincidence -- `any_potential_effect`,
-- `spare_category` and `root_cause_keyword` are the template's own headings:
--
--   PRODUCT                     the model asked for
--   Add?                        'YES' -- the sheet's own include flag
--   Serial number MTXX-XXXXX    "<MODEL>|<SERIAL>", the sheet's own shape
--   Installation date           products.warranty_start. The template puts
--                               "Installation date" exactly where a warranty
--                               start sits (between Warranty Number and
--                               warranty stop), so they are the same date.
--   Service date                the VISIT date
--   Date of last preventive     the latest PM visit on that machine BEFORE this
--     maintenance               service -- blank when there has been none
--   Call REG NO.                the UCN
--   Comments                    composed, in the sheet's own layout (below)
--   Warranty period (yes/no)    whether the SERVICE DATE falls inside the
--                               machine's warranty -- computed from the dates
--                               rather than taken from the DCCR's
--                               `warranty_failure`, which answers a different
--                               question (was the FAILURE a warranty failure)
--   Symptoms                    DCCR complaint_grouping -- the normalised
--                               symptom, not the caller's words. In the user's
--                               own sample the reason reads "MACHINE NOT
--                               SWITCHING ON" and the symptom "DEVICE NOT
--                               GETTING ON": one is what was said, the other is
--                               what it is filed as, and a Pareto needs the
--                               second.
--   Root cause key word         DCCR root_cause_keyword
--   ANY POTENTIAL EFFECT        DCCR any_potential_effect
--   SPARE / CONSUMABLE / ...    DCCR spare_category
--   Warranty No.                products.warranty_number
--
-- THE COMMENTS BLOCK is reproduced character for character from the user's own
-- file, because the template is read by people who know its shape:
--
--   Comments :
--   - Reason of service: <complaint>
--   - Default confirmed (yes/no) : <Yes when a root cause was recorded>
--   - Curative action : <visit date> : <action taken>
--   - Spares Used : <CODE> : <Description> - <qty>|<CODE> : ...
--   - FQI/FRC/FSCA n°: NIL
--
-- `spare_consumption.part` is already "CODE|Description" -- the same string a
-- hand-stock line and the Part Master use -- so the spares line is that with the
-- bar swapped for " : " and the quantity appended, exactly as the sample has it.
--
-- TWO READINGS THAT ARE MINE, both one line to change:
--   * "Default confirmed" has no column anywhere. It is 'Yes' when the DCCR
--     recorded a root cause and blank otherwise -- a fault somebody named is a
--     fault somebody confirmed.
--   * "FQI/FRC/FSCA n°" is always NIL. Nothing in this system holds one.
--
-- CANCELLED CALLS ARE NEVER INCLUDED, as everywhere else.
-- ===========================================================================

create or replace function public.reliability_wrr(p_product text)
returns table (
  product text, add_flag text, serial_number text, installation_date date,
  service_date date, last_pm_date date, call_reg_no text, comments text,
  warranty_period text, symptoms text, root_cause_keyword text,
  any_potential_effect text, spare_category text, warranty_no text
)
language sql stable security definer set search_path = public as $$
  -- FIELD AND INSTALLATION CALLS, NOT PM. A scheduled maintenance visit is not
  -- a failure, and the sheet says so itself: it carries a separate "Date of last
  -- preventive maintenance" column, which would be meaningless if a PM were a
  -- service row of its own. Installation calls DO belong -- the user's own
  -- sample has one ("INSTALLATION CALL 28Apr21: FiO2 % variations"), because a
  -- fault found at installation is still a fault.
  with c as (
    select cc.ucn, cc.call_number, cc.product_name, cc.serial,
           cc.complaint_reported, cc.standard_complaint, cc.reg_date
      from public.calls cc
     where cc.cancelled_at is null
       and cc.product_name ilike p_product
       and public.call_table_for(cc.call_type) <> 'pm'
  ),
  -- The machine, by model AND serial. A serial alone is not a machine here:
  -- 3,794 of them repeat in the real export (there are eleven called "219"),
  -- which is why `products` is keyed on the pair.
  m as (
    select lower(btrim(item_name)) as k_item, lower(btrim(serial_number)) as k_ser,
           warranty_start, warranty_end, warranty_number
      from public.products
  ),
  -- Every PM visit on a machine, to find the last one before a given service.
  pm as (
    select p.serial, r.visit_at::date as on_date
      from public.pm_calls p
      join public.reports r on r.ucn = p.ucn
     where r.visit_at is not null and p.cancelled_at is null
  ),
  sp as (
    select sc.ucn,
           string_agg(replace(sc.part, '|', ' : ') || ' - ' || sc.qty::text, '|'
                      order by sc.id) as used
      from public.spare_consumption sc
     where coalesce(btrim(sc.ucn), '') <> '' and coalesce(sc.qty, 0) <> 0
     group by sc.ucn
  )
  select
    upper(btrim(p_product))                                       as product,
    'YES'::text                                                   as add_flag,
    c.product_name || '|' || coalesce(c.serial, '')               as serial_number,
    m.warranty_start                                              as installation_date,
    r.visit_at::date                                              as service_date,
    (select max(pm.on_date) from pm
      where pm.serial = c.serial and pm.on_date < r.visit_at::date) as last_pm_date,
    c.ucn                                                         as call_reg_no,
    concat(
      E'Comments : \n- Reason of service: ',
      coalesce(nullif(btrim(c.complaint_reported), ''), btrim(coalesce(c.standard_complaint, ''))),
      E'\n- Default confirmed (yes/no) : ',
      case when coalesce(btrim(v.root_cause_keyword), '') <> '' then 'Yes' else '' end,
      E'\n- Curative action : ',
      case when coalesce(btrim(v.action_taken), '') = '' then ''
           else to_char(r.visit_at, 'DD-Mon-YYYY') || ' : ' || btrim(v.action_taken) end,
      E'\n- Spares Used : ', coalesce(sp.used, ''),
      E'\n- FQI/FRC/FSCA n°: NIL')                                as comments,
    -- Inside warranty AT THE TIME OF SERVICE, from the machine's own dates.
    case when m.warranty_start is null or m.warranty_end is null then ''
         when r.visit_at::date between m.warranty_start and m.warranty_end then 'yes'
         else 'no' end                                            as warranty_period,
    coalesce(v.complaint_grouping, '')                            as symptoms,
    coalesce(v.root_cause_keyword, '')                            as root_cause_keyword,
    coalesce(v.any_potential_effect, '')                          as any_potential_effect,
    coalesce(v.spare_category, '')                                as spare_category,
    coalesce(m.warranty_number, '')                               as warranty_no
  from c
  join public.reports r on r.ucn = c.ucn and r.visit_at is not null
  left join m on m.k_item = lower(btrim(c.product_name))
             and m.k_ser  = lower(btrim(coalesce(c.serial, '')))
  left join public.call_reviews v on v.ucn = c.ucn
  left join sp on sp.ucn = c.ucn
  order by c.serial, r.visit_at;
$$;
revoke all on function public.reliability_wrr(text) from public;
grant execute on function public.reliability_wrr(text) to authenticated;

comment on function public.reliability_wrr(text) is
  'The "Merge WRR" sheet of the reliability template, one row per VISIT (a call attended three times is three services in a reliability study). Failure fields come from the DCCR, whose columns are the template''s own headings; the Comments block is composed in the sheet''s exact layout, with spares as CODE : Description - qty joined by a bar. Cancelled calls are never included.';
