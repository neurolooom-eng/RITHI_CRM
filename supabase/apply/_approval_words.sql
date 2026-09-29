-- ===========================================================================
-- WHICH SPARE LINES WILL "NOT APPROVED" MOVE? (finding 20, migration 0256)
--
-- READ-ONLY. Run it in the Supabase SQL editor BEFORE and AFTER 0256 is
-- applied. One grid.
--
-- 0256 lets a stage pass only on the WORDS Approved or Auto-Approved (any
-- case, surrounding space, optional hyphen). Before it, any value CONTAINING
-- "approv" passed — so "Not Approved", "Approval Pending" and the like sent a
-- line on towards Stores. This file does not depend on 0256: both rules are
-- written out below, so it answers the same way before and after.
--
-- ROWS 1-99   every approval word on the register that is NOT one of
--             Approved / Auto-Approved / Rejected / Pending / blank, per
--             column, with how many lines carry it. Empty = nothing to move.
-- ROWS 101-   each OPEN line (not received, dispatched or dropped) that the
--             new rule puts at a different stage: where the old rule had it,
--             where it will wait now, and the three words. Up to 500.
-- LAST ROW    the totals.
--
-- Nothing here changes a line. What each word MEANT is the approver's to say;
-- once 0256 is live such a line waits at that approver's stage showing the
-- word as written.
-- ===========================================================================
with l as (
  select l.line_uid, l.request_uid,
         coalesce(l.rm_approval, 'Pending')         as rm,
         coalesce(l.commercial_approval, 'Pending') as com,
         coalesce(l.nsm_approval, 'Pending')        as nsm,
         coalesce(l.stores_status, 'Pending')       as stores,
         l.received_at
    from public.spare_request_lines l
),
staged as (
  select l.*,
         case
           when rm ~* 'reject' or com ~* 'reject' or nsm ~* 'reject' then 'Rejected'
           when received_at is not null then 'Received'
           when stores ~* 'drop' then 'Dropped'
           when stores ~* 'dispatch' then 'Dispatched'
           when rm  !~* 'approv|auto' then 'RM Approval'
           when com !~* 'approv|auto' then 'Commercial'
           when nsm !~* 'approv|auto' then 'NSM'
           else 'Stores' end as old_stage,
         case
           when rm ~* 'reject' or com ~* 'reject' or nsm ~* 'reject' then 'Rejected'
           when received_at is not null then 'Received'
           when stores ~* 'drop' then 'Dropped'
           when stores ~* 'dispatch' then 'Dispatched'
           when rm  !~* '^\s*(auto[\s-]*)?approved\s*$' then 'RM Approval'
           when com !~* '^\s*(auto[\s-]*)?approved\s*$' then 'Commercial'
           when nsm !~* '^\s*(auto[\s-]*)?approved\s*$' then 'NSM'
           else 'Stores' end as new_stage
    from l
),
words as (
  select 'RM' as col, rm as word from l
  union all select 'Commercial', com from l
  union all select 'NSM', nsm from l
),
odd as (
  select col, word, count(*) as n
    from words
   where btrim(word) <> ''
     and word !~* '^\s*(auto[\s-]*)?approved\s*$'
     and word !~* '^\s*(rejected|pending)\s*$'
   group by col, word
),
moved as (
  select * from staged where old_stage <> new_stage
)
select row_no, what, detail
  from (
    select (row_number() over (order by col, n desc, word))::int as row_no,
           col || ' column: "' || word || '"' as what,
           n || ' line(s) carry this word' as detail
      from odd
    union all
    select (100 + row_number() over (order by request_uid, line_uid))::int,
           'line ' || line_uid,
           old_stage || ' -> ' || new_stage || '   (RM "' || rm || '", Commercial "' || com
             || '", NSM "' || nsm || '", Stores "' || stores || '")'
      from (select * from moved order by request_uid, line_uid limit 500) m
    union all
    select 100000,
           'TOTALS',
           (select count(*) from odd) || ' unusual approval word(s); '
             || (select count(*) from moved) || ' open line(s) change stage under the new rule, '
             || (select count(*) from moved where old_stage = 'Stores') || ' of them sent to Stores by the old rule'
  ) r
 order by row_no;
