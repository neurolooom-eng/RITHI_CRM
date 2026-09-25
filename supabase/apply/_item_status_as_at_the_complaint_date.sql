-- ===========================================================================
-- ITEM STATUS ON A CALL IS THE COVER THAT APPLIED ON THE DAY OF THE COMPLAINT,
-- AND A SPARE REQUEST INHERITS IT FROM ITS CALL.
--
--   The user, 2026-09-25: "update Item Status in Calls based on the Status on
--   the date of Complaint -- this is for both Field and Installation Call. In
--   Installation call, it has to be WGP always." ... "trace the item status
--   back to Spare request as well. Trace it based on Call's Item Status."
--
-- So one chain, each link taking its answer from the one before:
--
--     machine's warranty / contract dates
--       -> FIELD CALL     cover as at its complaint date
--       -> INSTALLATION   WGP, always
--          -> SPARE REQUEST   whatever its call says
--
-- READ-ONLY UNTIL ONE WORD CHANGES. `v_apply boolean := false` below. Run it as
-- it stands and nothing is written: you get counts of what would change and a
-- sample of the rows. Change it to true and run again.
--
-- ---------------------------------------------------------------------------
-- THE RULE IS NOT THE ONE ALREADY IN THE DATABASE, AND THE DIFFERENCE MATTERS.
--
-- Every existing cover rule here asks only `end >= current_date` -- it never
-- looks at the START, because for "is this machine covered TODAY" a start date
-- in the future is rare enough to ignore. Asked AS AT AN OLDER DATE that
-- shortcut is wrong in a way that always favours cover: a complaint raised
-- BEFORE a contract began would come back as covered by it. So this checks
-- BOTH ends, `start <= day <= end`, and a null start is treated as "no limit at
-- that end" rather than as a match.
--
-- CONTRACT OUTRANKS WARRANTY, the same order as machine_cover and AppSheet.
--
-- THE RULE IS WRITTEN OUT HERE RATHER THAN CALLED. A file you run to decide
-- whether to run something must not depend on that something -- this project
-- has already shipped a diagnostic that died on a function a pending migration
-- introduces. Nothing below calls a helper.
--
-- ---------------------------------------------------------------------------
-- TWO THINGS IT DELIBERATELY DOES NOT DO.
--
-- IT NEVER TOUCHES AN APPROVAL. A spare request's item status decides who has
-- to approve it -- `spare_needs_review()` is `^(amc|ogp)$`, so AMC and OGP go
-- to Commercial and NSM and everything else is waved through. Correcting the
-- VALUE on a request that has already been approved does NOT re-open it, and
-- nothing here writes to a stage, an approval or a `_by`/`_at` column. Row 6
-- counts the settled requests whose recorded approval no longer matches the
-- corrected status, so you can see them -- it does not act on them.
--
-- IT LEAVES PM CALLS ALONE. Only Field and Installation were asked for.
--
-- AND THE STAGE DOES NOT MOVE -- CHECKED, NOT ASSUMED. The obvious fear with
-- correcting item_status on settled requests is 0210's disaster in reverse:
-- every settled line marching backwards out of Stores. It cannot happen here.
-- `spare_line_stage` still TAKES item_status as its sixth argument, but its
-- BODY no longer reads it -- the stage comes from the recorded approvals alone.
-- Test the body (`prosrc`), not the definition: `pg_get_functiondef` contains
-- the argument NAME, so a grep over it answers YES and is wrong.
--
--   select case when p.prosrc ~ 'item_status'
--               then 'BODY USES IT -- DO NOT APPLY, settled lines would move'
--               else 'safe -- the stage is independent of item_status' end
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public' and p.proname = 'spare_line_stage';
--
-- Run that first if you want to confirm it on your own project.
--
-- WHAT IT DOES LEAVE BEHIND, and it is worth knowing before you decide: a
-- request corrected to AMC or OGP will show that status beside an approval
-- that was AUTO-GRANTED, because under the old status Commercial and NSM were
-- not required. That reads as a bypass and was not one -- it was correct under
-- the rule applied at the time.
-- ===========================================================================

do $chain$
declare
  -- ------------------------------------------------------------------ SWITCH
  v_apply boolean := false;
  -- -------------------------------------------------------------------------
  n_field int := 0; n_inst int := 0; n_spare int := 0;
begin
  if not v_apply then
    raise notice 'DRY RUN -- nothing written. Read the grid below, then set v_apply := true.';
    return;
  end if;

  -- FIELD CALLS: the cover on the complaint day (falling back to the
  -- registration day when no complaint date was captured).
  update public.field_calls c set item_status = x.should_be
    from (
      select c2.ucn,
             case
               when p.contract_end >= coalesce(c2.complaint_date, c2.reg_date)
                and coalesce(p.contract_start, '-infinity'::date) <= coalesce(c2.complaint_date, c2.reg_date)
                 then coalesce(nullif(btrim(p.contract_type), ''), 'CMC')
               when p.warranty_end >= coalesce(c2.complaint_date, c2.reg_date)
                and coalesce(p.warranty_start, '-infinity'::date) <= coalesce(c2.complaint_date, c2.reg_date)
                 then 'WGP'
               else 'OGP'
             end as should_be
        from public.field_calls c2
        join public.products p
          on lower(btrim(p.serial_number)) = lower(btrim(c2.serial))
         and lower(btrim(p.item_name))     = lower(btrim(c2.product_name))
       where coalesce(c2.complaint_date, c2.reg_date) is not null
    ) x
   where x.ucn = c.ucn
     and upper(coalesce(btrim(c.item_status), '')) is distinct from upper(x.should_be);
  get diagnostics n_field = row_count;

  -- INSTALLATION CALLS: WGP, always.
  update public.installation_calls set item_status = 'WGP'
   where upper(coalesce(btrim(item_status), '')) is distinct from 'WGP';
  get diagnostics n_inst = row_count;

  -- SPARE REQUESTS: whatever the call says. A HandStock request has no call
  -- and no machine behind it, so it is left exactly as it is.
  -- AND IT SAYS WHY, ON THE ROW. Every one of these was approved under the old
  -- status, so afterwards the record shows (say) AMC beside an AUTO-GRANTED
  -- approval -- which reads as a bypass and was not one. The note is written
  -- into `extra` rather than `remarks`: remarks is an engineer's own text and
  -- appending to it would corrupt what a person wrote, while `extra` is
  -- structured, survives an export, and is where this register already keeps
  -- everything it was not asked to type. The audit trigger records the change
  -- itself; this records the REASON, which an audit row cannot.
  update public.spare_requests r set
      item_status = btrim(c.item_status),
      extra = coalesce(r.extra, '{}'::jsonb) || jsonb_build_object(
        'item_status_corrected', jsonb_build_object(
          'from', coalesce(btrim(r.item_status), ''),
          'to',   btrim(c.item_status),
          'on',   to_char(now() at time zone 'Asia/Kolkata', 'DD-Mon-YYYY HH24:MI:SS'),
          'why',  'Set from the call''s item status, which is the cover that applied on the complaint date. '
                  || 'Any approval recorded on this request was granted under the previous status and has NOT been re-opened.'))
    from public.calls c
   where c.ucn = btrim(r.ucn)
     and coalesce(btrim(r.ucn), '') <> ''
     and coalesce(btrim(c.item_status), '') <> ''
     and upper(coalesce(btrim(r.item_status), '')) is distinct from upper(btrim(c.item_status));
  get diagnostics n_spare = row_count;

  raise notice 'DONE. field_calls %, installation_calls %, spare_requests % row(s) corrected.',
    n_field, n_inst, n_spare;
end $chain$;

-- ---- what would change (or did) --------------------------------------------
with fld as (
  select c.ucn, c.item_status as now_reads,
         coalesce(c.complaint_date, c.reg_date) as as_at,
         c.complaint_date is null as used_reg_date,
         case
           when p.contract_end >= coalesce(c.complaint_date, c.reg_date)
            and coalesce(p.contract_start, '-infinity'::date) <= coalesce(c.complaint_date, c.reg_date)
             then coalesce(nullif(btrim(p.contract_type), ''), 'CMC')
           when p.warranty_end >= coalesce(c.complaint_date, c.reg_date)
            and coalesce(p.warranty_start, '-infinity'::date) <= coalesce(c.complaint_date, c.reg_date)
             then 'WGP'
           else 'OGP'
         end as should_be
    from public.field_calls c
    join public.products p
      on lower(btrim(p.serial_number)) = lower(btrim(c.serial))
     and lower(btrim(p.item_name))     = lower(btrim(c.product_name))
   where coalesce(c.complaint_date, c.reg_date) is not null
)
select 1 as row, 'FIELD calls whose Item Status changes' as measure,
       (select count(*)::text from fld where upper(coalesce(btrim(now_reads),'')) is distinct from upper(should_be)) as value,
       'Recomputed as the cover that applied on the complaint day -- checking the START of the warranty or contract as well as its end, which no existing rule here does.' as note
union all
select 2, '...of those, dated by REGISTRATION because no complaint date was captured',
       (select count(*)::text from fld where used_reg_date
          and upper(coalesce(btrim(now_reads),'')) is distinct from upper(should_be)),
       'THE ONE ASSUMPTION IN THIS FILE, made visible rather than hidden: a call with no complaint date is dated by its registration date. If that is wrong for you, say so before applying.'
union all
select 3, 'FIELD calls skipped -- machine not in the Product Database',
       (select count(*)::text from public.field_calls c
         where coalesce(btrim(c.serial), '') <> ''
           and not exists (select 1 from public.products p
                            where lower(btrim(p.serial_number)) = lower(btrim(c.serial))
                              and lower(btrim(p.item_name)) = lower(btrim(c.product_name)))),
       'Matched on MODEL + SERIAL, because a machine is both. These keep whatever they already say -- there is nothing to compute a cover from.'
union all
select 4, 'INSTALLATION calls set to WGP',
       (select count(*)::text from public.installation_calls
         where upper(coalesce(btrim(item_status), '')) is distinct from 'WGP'),
       'Always WGP, by the rule you gave. No machine lookup involved.'
union all
select 5, 'SPARE REQUESTS that would take a new status from their call',
       (select count(*)::text from public.spare_requests r join public.calls c on c.ucn = btrim(r.ucn)
         where coalesce(btrim(r.ucn), '') <> '' and coalesce(btrim(c.item_status), '') <> ''
           and upper(coalesce(btrim(r.item_status), '')) is distinct from upper(btrim(c.item_status))),
       'HandStock requests carry no UCN and no machine, so they are not touched at all.'
union all
select 6, '...of those, ALREADY APPROVED under the old status',
       (select count(*)::text from public.spare_requests r join public.calls c on c.ucn = btrim(r.ucn)
         where coalesce(btrim(r.ucn), '') <> '' and coalesce(btrim(c.item_status), '') <> ''
           and upper(coalesce(btrim(r.item_status), '')) is distinct from upper(btrim(c.item_status))
           and coalesce(btrim(r.stage), '') not in ('', 'Pending', 'RM')),
       'READ THIS ONE BEFORE APPLYING. The value is corrected; the approval is NOT re-opened and no stage is touched. These are requests where somebody decided under a status that is about to change, and they are worth a look.'
union all
select 7, 'machines with an END date but NO START date',
       (select count(*)::text from public.products
         where (contract_end is not null and contract_start is null)
            or (warranty_end  is not null and warranty_start  is null)),
       'THE ONE SUB-CASE DECIDED WITHOUT ASKING. `start <= day <= end` needs a start; where the register has none this file treats it as NO LOWER BOUND, so the period covers everything up to its end date. The strict alternative is to treat a missing start as not covered at all.'
union all
select 8, '...FIELD calls whose answer depends on that choice',
       (select count(*)::text
          from public.field_calls c
          join public.products p
            on lower(btrim(p.serial_number)) = lower(btrim(c.serial))
           and lower(btrim(p.item_name))     = lower(btrim(c.product_name))
         where coalesce(c.complaint_date, c.reg_date) is not null
           and (
             (p.contract_start is null and p.contract_end >= coalesce(c.complaint_date, c.reg_date))
             or (p.contract_start is not null
                 and not (p.contract_end >= coalesce(c.complaint_date, c.reg_date)
                          and p.contract_start <= coalesce(c.complaint_date, c.reg_date))
                 and p.warranty_start is null
                 and p.warranty_end >= coalesce(c.complaint_date, c.reg_date))
           )),
       'These calls are read as COVERED only because the missing start was treated as no lower bound. If that number is small, the choice does not matter; if it is large, say which way you want it before applying.';
