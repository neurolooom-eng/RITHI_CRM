-- ===========================================================================
-- MOVE THE STATUS-LESS VISITS OUT OF THE REGISTER, INTO A BACKUP TABLE.
--
-- The user, 2026-09-21: "Move these to a Backup Table for now. That will fix
-- the Status."
--
-- IT FIXES ONE KIND AND BREAKS THE OTHER, AND THE DIFFERENCE IS THE WHOLE FILE.
-- `sync_call_last_visit` (0032) recomputes a call from the visits it has LEFT:
--
--   A call with a blank visit AND a real one  -> the real one decides. Moving
--                                                the blank out FIXES it.
--
-- AND THAT IS MOST OF THIS, which the numbers only showed once they were put
-- side by side. 3,600 blanks, one per call. 3,430 of them have a statused
-- visit on the SAME CALL, SAME DAY -- so at most 170 calls lack one. Yet 2,525
-- calls are currently DECIDED by their blank visit. For roughly 2,355 calls
-- the real status IS ON THE RECORD and the blank is simply outranking it,
-- having been entered later. This is not missing data; it is a duplicate
-- winning, and moving the duplicate out is the whole repair.
--   A call whose ONLY visit is the blank one  -> NO VISITS LEFT, and the
--                                                trigger sets last_status = ''
--                                                and last_visit_at = null.
--                                                THE CALL GOES BACK TO
--                                                UNATTENDED.
--
-- That second case is the 20-September incident again: 4,222 calls reading
-- Unattended because their visit record was gone. So PART 1 moves only the
-- first kind, which cannot produce it, and PART 2 -- the one that can -- is
-- left for you to run deliberately after reading what it costs.
--
-- Nothing is deleted. The rows go to `public.reports_no_status_backup`, whole,
-- with the reason and the time, and PART 3 puts any of them back.
--
-- Take _backup_before_repair.sql first if you have not. With 0225 armed, every
-- row leaving `reports` is photographed by the audit trail as well.
-- ===========================================================================

-- ---- the backup table ------------------------------------------------------
create table if not exists public.reports_no_status_backup (
  like public.reports including defaults,
  moved_at timestamptz not null default now(),
  moved_reason text not null default ''
);
comment on table public.reports_no_status_backup is
  'Visits that carried no call status, moved out of public.reports so the call''s status comes from a visit that does. Nothing here is deleted; see _move_blank_status_visits.sql PART 3 to put a row back.';
-- No RLS and no grant: this is an archive read in the SQL editor, not a screen.

-- ---- PART 1: the safe set --------------------------------------------------
with movable as (
  select r.*
    from public.reports r
   where coalesce(btrim(r.call_status), '') = ''
     -- SAME CALL **AND SAME DAY**. Two conditions, and the second is the
     -- evidence. Measured on the live register: 3,430 of the 3,600 blanks have
     -- a statused visit on the same call on the same day -- they are the SAME
     -- VISIT loaded twice, once bare and once with its status, because the two
     -- files keyed it differently (`IMP-` derived from call+date, against the
     -- export's own UID). Dropping the day test would also move a blank visit
     -- that is a genuine LATER visit on a call whose earlier one had a status,
     -- and the call would then report the older status as its current one.
     -- Same-day is what makes this a de-duplication rather than a deletion.
     and exists (select 1 from public.reports k
                  where k.ucn = r.ucn and k.id <> r.id
                    and coalesce(btrim(k.call_status), '') <> ''
                    and k.visit_at::date = r.visit_at::date)
),
saved as (
  insert into public.reports_no_status_backup
  select m.*, now(), 'no call status; the call keeps a visit that has one'
    from movable m
  returning ucn, uid
),
removed as (
  delete from public.reports r
   using saved s where s.uid = r.uid
  returning r.ucn
)
select 'PART 1 -- moved' as step,
       (select count(*) from saved)::text   as visits_moved,
       (select count(distinct ucn) from removed)::text as calls_recomputed,
       'reports_touch_call recomputes each one from the visits it has left' as note;

-- What those calls read now.
select 'PART 1 -- the calls afterwards' as step, c.open_state, count(*)::text as calls
  from public.calls c
 where c.ucn in (select ucn from public.reports_no_status_backup)
 group by c.open_state order by c.open_state;

-- ---- WHAT IS LEFT, and what moving it would cost ---------------------------
select 'STILL THERE -- blank visits with no same-day statused twin' as step,
       count(*)::text as visits,
       count(distinct ucn)::text as calls,
       'Expect ~170. These are NOT duplicates: the call has no statused visit on that day, so moving one makes the call Unattended -- it would say nobody went, and somebody did. That is PART 2, and this file does not run it.' as note
  from public.reports r
 where coalesce(btrim(r.call_status), '') = ''
   and not exists (select 1 from public.reports k
                    where k.ucn = r.ucn and k.id <> r.id
                      and coalesce(btrim(k.call_status), '') <> ''
                      and k.visit_at::date = r.visit_at::date);

-- ===========================================================================
-- PART 2 -- THE REST. Read the row above first.
--
-- These calls have exactly one visit and it says nothing about how the call
-- ended. Today they read "Report pending", which is not wrong: somebody went,
-- and no report was ever filed. Move them and they read UNATTENDED, which
-- says nobody went -- and that IS wrong, because somebody did.
--
-- Uncomment only if you have decided that is what you want.
-- ===========================================================================
-- with movable as (
--   select r.* from public.reports r
--    where coalesce(btrim(r.call_status), '') = ''
--      and not exists (select 1 from public.reports k
--                       where k.ucn = r.ucn and k.id <> r.id
--                         and coalesce(btrim(k.call_status), '') <> ''
--                         and k.visit_at::date = r.visit_at::date)
-- ), saved as (
--   insert into public.reports_no_status_backup
--   select m.*, now(), 'no call status; this was the call''s only visit -- the call is now Unattended'
--     from movable m returning uid
-- )
-- delete from public.reports r using saved s where s.uid = r.uid;

-- ===========================================================================
-- PART 3 -- PUT THEM BACK. Whole rows, exactly as they were.
--
-- The column list is read from `reports` rather than written out, so this keeps
-- working if the table gains a column -- and `id` is `generated ALWAYS as
-- identity`, which is why OVERRIDING SYSTEM VALUE is here: without it Postgres
-- refuses the id, and letting it issue a new one would put the restored visit
-- at the END of the id order. That matters, because `sync_call_last_visit`
-- breaks a tie on `updated_at` with `id desc` -- a restored blank visit with a
-- fresh high id could then outrank the real visit it was moved out of the way
-- of, which is the fault this whole file exists to remove.
--
-- Uncomment to run. It restores EVERYTHING in the backup table; add a
-- `where` to the two statements if you want only some of it.
-- ===========================================================================
-- do $restore$
-- declare cols text; n int;
-- begin
--   select string_agg(quote_ident(column_name), ', ' order by ordinal_position)
--     into cols from information_schema.columns
--    where table_schema = 'public' and table_name = 'reports' and is_generated = 'NEVER';
--   execute format('insert into public.reports (%1$s) overriding system value '
--                  'select %1$s from public.reports_no_status_backup on conflict (uid) do nothing', cols);
--   get diagnostics n = row_count;
--   delete from public.reports_no_status_backup;
--   raise notice 'restored % visit(s); the calls recompute themselves.', n;
-- end $restore$;
