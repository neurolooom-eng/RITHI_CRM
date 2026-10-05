-- ===========================================================================
-- PUT A MAPPED CALL REQUEST BACK ON THE PENDING LIST
--
-- Ad-hoc, run by hand in the Supabase SQL editor. Nothing here is a migration.
-- The app has the same action as a button (Request Registration -> open the
-- request -> "Unmap"); this file is for doing it before that button is live,
-- or for several requests at once.
--
-- The user, 2026-10-05: R18884 was mapped to 26H01P0365 by mistake -- "I want
-- to unmap this and put it back on pending list".
--
-- WHAT IT CHANGES, on the request only: the UCN is cleared, the status goes
-- back to Pending, and "actioned by / at" are cleared, as on any request still
-- waiting. Nothing describing WHAT was asked for is touched (0232 freezes
-- those once a request is answered, and this does not need them). The CALL it
-- was mapped to is NOT changed at all: mapping never wrote to the call, so
-- there is nothing on it to undo. The record audit keeps the before and after.
--
-- ONLY A MAPPED REQUEST MOVES. A Registered one created its call, and a
-- Cancelled one was closed on purpose -- the status test below leaves both
-- exactly as they are, and the report says so.
--
-- ONE statement: it commits on its own, and the grid it returns is the report
-- -- one row per REQID listed, saying what happened to it.
-- ===========================================================================

with wanted(reqid) as (
  values ('R18884')                          -- <-- the REQID(s) to unmap
),
moved as (
  update public.call_requests cr
     set ucn = '', status = 'Pending', actioned_by = '', actioned_at = null
   where cr.reqid in (select reqid from wanted)
     and cr.status = 'Mapped'
  returning cr.reqid
)
select w.reqid,
       case when m.reqid is not null then 'Unmapped -- back on the Pending list'
            when cr.reqid is null     then 'No request with this REQID'
            else 'Left alone: it is ' || coalesce(nullif(cr.status, ''), 'blank') || ', not Mapped'
       end as result,
       cr.ucn as ucn_before
  from wanted w
  left join moved m on m.reqid = w.reqid
  left join public.call_requests cr on cr.reqid = w.reqid
 order by w.reqid;
