-- ===========================================================================
-- 0405 -- A SPARE REQUEST WITH NO ENGINEER TAKES THE ONE ITS STOCK OUT NAMES
-- (the user, 2026-10-08, on ABHISHEK BISWAS / ESA-009: "Stock out should be 6
-- from history, but its showing 5" -- and, asked how to fix it: "I write a
-- one-time fix").
--
-- WHAT WENT WRONG. A historical stock out (spare_issue_history, the Stock Out
-- export) is not counted from history when its line_uid is a live request line
-- marked dispatched -- the live line is counted instead, so nothing is counted
-- twice. The live line is booked to the REQUEST's engineer. Some requests were
-- loaded through Bulk Uploads -> Spare Request with Engineer Name empty, so the
-- unit was booked to NOBODY and left the engineer's hand stock. Measured on the
-- live project (_stock_outs_lost_to_a_blank_engineer.sql): 57 history rows, 68
-- units, all early-January 2026 requests; ABHISHEK BISWAS's SO17541 (OR42974)
-- is one. 8,054 rows reach the same engineer either way; none reach another.
--
-- THE FIX, once, and only where it is certain. A request whose engineer is
-- BLANK takes the engineer the Stock Out history names for its own lines --
-- matched by line_uid, the same match the hand stock uses -- and ONLY when
-- every history row of every one of its lines names the SAME engineer. A
-- request whose lines disagree is left exactly as it is and named in a NOTICE.
-- A request that already names an engineer is never touched.
--
-- ON RECORD, THE WAY "CHANGE ENGINEER" RECORDS IT. The database allows an
-- engineer change only through reassign_spare_request() (0100), which also
-- writes spare_request_engineer_log. That function cannot run here -- it needs
-- a signed-in holder of spare.reassign, and it refuses a dispatched request,
-- which all of these are. So this does what it does and nothing more: the same
-- per-request transaction flag (`rithi.reassigning` = the request's uid) that
-- both engineer guards honour, the same email lookup (the login whose full
-- name is the engineer's; blank if none), and one log row per request with the
-- reason saying where the name came from. No guard is switched off.
--
-- IDEMPOTENT: a second run finds no blank engineer it can fill.
-- ===========================================================================

do $fix$
declare
  r record;
  n_fixed integer := 0;
  n_left integer := 0;
  v_mail text;
begin
  if to_regclass('public.spare_issue_history') is null
     or to_regclass('public.spare_request_engineer_log') is null then
    return;
  end if;

  for r in
    with blank as (
      select q.uid, q.or_no, q.engineer_email
        from public.spare_requests q
       where btrim(coalesce(q.engineer, '')) = ''
    ), named as (
      select b.uid, b.or_no, b.engineer_email,
             array_agg(distinct btrim(h.engineer)) filter (where btrim(coalesce(h.engineer, '')) <> '') as engineers,
             string_agg(distinct coalesce(h.so_no, ''), ', ') as so_nos
        from blank b
        join public.spare_request_lines l on l.request_uid = b.uid
        join public.spare_issue_history h
          on h.line_uid <> '' and lower(btrim(h.line_uid)) = lower(btrim(l.line_uid))
       group by b.uid, b.or_no, b.engineer_email
    )
    select * from named where engineers is not null order by or_no
  loop
    -- "The same engineer" is the same NAME, case and spaces aside.
    if (select count(distinct lower(e)) from unnest(r.engineers) e) <> 1 then
      n_left := n_left + 1;
      raise notice '0405: % left as it is -- its Stock Out lines name % different engineers: %',
        coalesce(nullif(r.or_no, ''), r.uid), array_length(r.engineers, 1), array_to_string(r.engineers, ', ');
      continue;
    end if;

    v_mail := lower(btrim(coalesce(nullif(r.engineer_email, ''),
                (select p.email from public.profiles p
                  where lower(p.full_name) = lower(r.engineers[1]) order by p.id limit 1), '')));

    perform set_config('rithi.reassigning', r.uid, true);

    insert into public.spare_request_engineer_log
      (request_uid, or_no, from_engineer, from_email, to_engineer, to_email, reason, changed_by, changed_by_name)
    values (r.uid, coalesce(r.or_no, ''), '', coalesce(r.engineer_email, ''), r.engineers[1], v_mail,
            '0405 data fix: the request was loaded with no engineer; the Stock Out history of its lines ('
              || r.so_nos || ') names ' || r.engineers[1],
            null, 'Data fix 0405');

    update public.spare_requests
       set engineer = r.engineers[1],
           engineer_email = case when btrim(coalesce(engineer_email, '')) = '' then v_mail else engineer_email end
     where uid = r.uid and btrim(coalesce(engineer, '')) = '';

    perform set_config('rithi.reassigning', '', true);
    n_fixed := n_fixed + 1;
  end loop;

  raise notice '0405: % spare request(s) given the engineer their Stock Out history names; % left as they were (their lines disagree)',
    n_fixed, n_left;
end $fix$;
