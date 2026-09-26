-- ===========================================================================
-- GUARDED MIRROR (0245) -- the views that carry every column of their table,
-- rebuilt so they carry the sys_* columns 0244 has just added.
--
-- WHY THIS FILE EXISTS. Six views are written `select t.*` (or a union of
-- `select *`), and `*` is expanded when the view is CREATED. So after 0244 the
-- live views lack sys_*, while re-running the bundle that owns any of them
-- rebuilds it WITH sys_* -- a view whose shape depends on which bundle ran last.
-- `check:replay` refuses exactly that, and one of the six, export_schedule_state
-- (`s.*` FOLLOWED by a computed column), does not merely drift: re-running
-- data_export.sql would stop with "cannot change name of view column", because
-- `create or replace view` can only append.
--
-- So each is rebuilt here, once, after the columns exist -- and every definition
-- below is its OWNER'S, WORD FOR WORD, which `check:bundles` enforces (MIRRORS).
-- Edit one of the owners and this must be edited to match, or that check fails.
-- It must stay the LAST file in its module.
--
--   calls, pending_calls, calls_view_insert/update   <- 0114_call_registrant_split.sql
--   field_failure_register                           <- 0197_review_actual_product.sql
--   indoor_job_list                                  <- 0158_indoor_service.sql
--   tracker_list                                     <- 0143_tracker.sql
--   export_schedule_state                            <- 0228_export_schedules.sql
--
-- The INSTEAD OF functions are regenerated from field_calls' column list, so
-- they now pass sys_* through to the table -- where sys_stamp() discards them
-- for any signed-in caller, because both functions run as the CALLER (not
-- SECURITY DEFINER). A client cannot forge them through the view either.
-- ===========================================================================

-- ---- calls, pending_calls, and writes through the view (0114, verbatim) ----
do $views$
begin
  if to_regclass('public.field_calls') is null then return; end if;
  create or replace view public.calls as
    select * from public.field_calls
    union all select * from public.installation_calls
    union all select * from public.pm_calls;
end $views$;

-- `create or replace view` DROPS security_invoker, and a view without it reads
-- as its OWNER — every signed-in user seeing every call, with no error and no
-- warning. It has happened three times in this project (0040/0050/0057), so it
-- is re-asserted on EVERY rebuild, here included.
alter view public.calls set (security_invoker = on);

-- pending_calls is `select * from calls`, so it needs the same treatment to
-- gain the column — and marking it invoker is not optional either: a view
-- marked invoker that reads a view running as its owner inherits the owner's
-- reach.
create or replace view public.pending_calls as
  select * from public.calls
   where cancelled_at is null
     and (open_state <> 'Solved' or reopened_at is not null);
alter view public.pending_calls set (security_invoker = on);
alter view public.call_state    set (security_invoker = on);

-- ---- 5. writes through the view carry it too ------------------------------
-- The INSTEAD OF functions were generated from the column list as it was.
-- Regenerated here, and the RETURNING clause gains `actual_created_by` so the
-- client sees the stamp it did not send.
do $regen$
declare ins_cols text; ins_vals text; set_list text;
begin
  if to_regclass('public.field_calls') is null then return; end if;
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position),
         string_agg(
           case when column_default is not null
                then format('coalesce(new.%I, %s)', column_name, column_default)
                else 'new.' || quote_ident(column_name) end,
           ', ' order by ordinal_position),
         string_agg(quote_ident(column_name) || ' = new.' || quote_ident(column_name), ', ' order by ordinal_position)
    into ins_cols, ins_vals, set_list
    from information_schema.columns
   where table_schema = 'public' and table_name = 'field_calls'
     -- open_state EXCLUDED BY NAME, not only by being generated. 0226 turns
     -- it into an ordinary column kept by a trigger, so `is_generated`
     -- stops excluding it and this list would silently start writing a
     -- DERIVED value through the view. A no-op before 0226; the thing
     -- that holds after it. check:replay found exactly this.
     and is_generated = 'NEVER' and column_name not in ('id', 'open_state');

  execute format($f$
    create or replace function public.calls_view_insert() returns trigger language plpgsql as $b$
    begin
      case public.call_table_for(new.call_type)
        when 'installation' then
          insert into public.installation_calls (%1$s) values (%2$s)
            returning id, ucn, call_number, reg_date, created_by, actual_created_by, open_state, added_on, reg_at
            into new.id, new.ucn, new.call_number, new.reg_date, new.created_by, new.actual_created_by, new.open_state, new.added_on, new.reg_at;
        when 'pm' then
          insert into public.pm_calls (%1$s) values (%2$s)
            returning id, ucn, call_number, reg_date, created_by, actual_created_by, open_state, added_on, reg_at
            into new.id, new.ucn, new.call_number, new.reg_date, new.created_by, new.actual_created_by, new.open_state, new.added_on, new.reg_at;
        else
          insert into public.field_calls (%1$s) values (%2$s)
            returning id, ucn, call_number, reg_date, created_by, actual_created_by, open_state, added_on, reg_at
            into new.id, new.ucn, new.call_number, new.reg_date, new.created_by, new.actual_created_by, new.open_state, new.added_on, new.reg_at;
      end case;
      return new;
    end $b$;
  $f$, ins_cols, ins_vals);

  execute format($f$
    create or replace function public.calls_view_update() returns trigger language plpgsql as $b$
    begin
      case public.call_table_for(old.call_type)
        when 'installation' then update public.installation_calls set %1$s where ucn = old.ucn;
        when 'pm'           then update public.pm_calls           set %1$s where ucn = old.ucn;
        else                     update public.field_calls        set %1$s where ucn = old.ucn;
      end case;
      return new;
    end $b$;
  $f$, set_list);
end $regen$;

-- ---- field_failure_register (0197, verbatim) -------------------------------
drop view if exists public.field_failure_register;
create view public.field_failure_register as
select
  f.*,
  -- THESE THREE ARE NOT DECORATION AND WERE THE REASON THE FIRST VERSION OF
  -- THIS FILE FAILED. It was written from 0179, which is not the last word on
  -- this view — 0167 and a later change added `live_call_status`,
  -- `live_last_visit_at` and `live_engineer` BEFORE the customer name, and
  -- omitting them made the replacement narrower than the view it replaced:
  -- `cannot drop columns from view`. The definition here is the one taken from
  -- a database built by the migrations, not the one read out of a file.
  c.open_state                      as live_call_status,
  c.last_visit_at                   as live_last_visit_at,
  c.allocated_to                    as live_engineer,
  c.party_name                      as live_customer_name,
  c.item_status                     as live_cover,
  (select count(*) from public.reports rp where rp.ucn = f.ucn)            as live_visit_count,
  (select coalesce(string_agg(distinct btrim(s.part), ', '), '')
     from public.spare_consumption s
    where s.ucn = f.ucn and coalesce(s.qty, 0) > 0)                        as live_spares_consumed,
  r.any_potential_effect            as live_any_potential_effect,
  r.risk_to_patient                 as live_risk_to_patient,
  r.warranty_failure                as live_warranty_failure,
  r.frequent_failure                as live_frequent_failure,
  r.complaint_grouping              as live_complaint_grouping,
  r.root_cause_keyword              as live_root_cause_keyword,
  r.spare_category                  as live_spare_category,
  r.review2_at                      as live_review2_at,
  r.review3_done                    as live_review3_done,
  -- WHAT ACTUALLY FAILED. The review's answer where it gave one, the report's
  -- otherwise. Every count, rate and Pareto reads THIS, so a failure moved onto
  -- an accessory is counted there and nowhere else.
  coalesce(nullif(btrim(r.actual_product), ''), f.product_name)            as live_product_name,
  -- ...and whether it was moved, so a screen can say so rather than leaving two
  -- product names to be noticed. A reader seeing CPX CARE on a report that
  -- names EXTEND-XT deserves to be told which is which.
  (coalesce(nullif(btrim(r.actual_product), ''), f.product_name)
     is distinct from f.product_name)                                      as live_product_changed
from public.field_failure_reports f
left join public.calls c        on c.ucn = f.ucn
left join public.call_reviews r on r.ucn = f.ucn;

alter view public.field_failure_register set (security_invoker = on);
grant select on public.field_failure_register to authenticated;

-- ---- indoor_job_list (0158, verbatim) --------------------------------------
drop view if exists public.indoor_job_list;
create view public.indoor_job_list as
  select j.*,
         coalesce(rb.name, '') as received_by_name,
         coalesce(cb.name, '') as cleaned_by_name,
         coalesce(qb.name, '') as qc_by_name,
         coalesce(db.name, '') as dispatched_by_name,
         coalesce(xb.name, '') as condemned_by_name,
         coalesce(ub.name, '') as updated_by_name,
         (j.status in ('Closed', 'Dispatched', 'Condemned')) as is_closed,
         -- A DEMO unit out past its due date, which is the one figure nothing
         -- else in this system produces. NULL rather than false where there is
         -- no due date: "not overdue" and "nobody said when" are different facts.
         (case when j.activity = 'Demo' and j.actual_return is null
                    and j.expected_return is not null
               then (j.expected_return < (now() at time zone 'Asia/Kolkata')::date)
          end) as demo_overdue,
         (select count(*) from public.indoor_job_accessories a where a.job_id = j.id)
           as accessory_count,
         (select count(*) from public.indoor_job_accessories a
           where a.job_id = j.id and not a.returned) as accessories_outstanding
    from public.indoor_jobs j
    left join public.app_user_names rb on rb.id = j.received_by
    left join public.app_user_names cb on cb.id = j.cleaned_by
    left join public.app_user_names qb on qb.id = j.qc_by
    left join public.app_user_names db on db.id = j.dispatched_by
    left join public.app_user_names xb on xb.id = j.condemned_by
    left join public.app_user_names ub on ub.id = j.updated_by;
alter view public.indoor_job_list set (security_invoker = on);
grant select on public.indoor_job_list to authenticated;

-- ---- tracker_list (0143, verbatim) -----------------------------------------
drop view if exists public.tracker_list;
create view public.tracker_list as
  select t.*,
         coalesce(cu.name, '') as created_by_name,
         coalesce(uu.name, '') as updated_by_name,
         (t.status in ('Done', 'Dropped')) as is_closed
    from public.tracker_items t
    left join public.app_user_names cu on cu.id = t.created_by
    left join public.app_user_names uu on uu.id = t.updated_by;
alter view public.tracker_list set (security_invoker = on);
grant select on public.tracker_list to authenticated;

-- ---- export_schedule_state (0228, verbatim) --------------------------------
-- `s.*` is followed by a computed column, so the new columns land in the MIDDLE
-- and `create or replace` cannot put them there: the drop is this file's own,
-- the definition is the owner's. Nothing depends on this view.
drop view if exists public.export_schedule_state;
create or replace view public.export_schedule_state as
select s.*,
       public.export_run_due_at(s.frequency, s.day_of_week, s.hour_ist, s.minute_ist, now())
         + case when s.frequency = 'weekly' then interval '7 days' else interval '1 day' end
         as next_run_at
  from public.export_schedules s;

alter view public.export_schedule_state set (security_invoker = on);
grant select on public.export_schedule_state to authenticated;
