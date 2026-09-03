-- ===========================================================================
-- REQID PICKS UP WHERE THE HISTORY LEFT OFF.
--
-- The register showed R18576, R18575, R18574 … and then the two requests
-- raised today came out as R1 and R2. Nothing was corrupted; the counter had
-- simply been sent back to the start and never told about the history.
--
-- What happened, in order:
--   1. `_reset_for_production.sql` emptied the demo data and reset the counter
--      (`setval('call_req_seq', 1, false)`). Right at that moment — the table
--      was empty, so R1 was the honest next number.
--   2. The sheet-era requests were then bulk-loaded, EACH CARRYING ITS OWN
--      REQID. An explicit reqid never calls `nextval`, so the counter stayed at
--      1 while 18,576 numbered requests landed above it.
--   3. The next request raised in the app took the counter's word for it.
--
-- Two fixes, because the one-off alone would let it happen again the next time
-- a batch is loaded:
--
--   * `resync_call_req_seq()` lifts the counter to the highest REQID on record,
--     and is run once here for what is already loaded.
--   * The insert trigger now does it CONTINUOUSLY: a row that arrives with its
--     own REQID pushes the counter ahead of itself. Load a hundred thousand old
--     requests and the next one raised in the app still follows the last of
--     them. The counter can no longer fall behind the data it numbers.
--
-- The two that were already issued out of order are re-lettered RC1, RC2. They
-- are real requests people have seen, so the number they were given is kept —
-- but `R1` is a number the sheet era may well have used too, and two different
-- requests reading `R1` is worse than either. `RC` says plainly which series a
-- request belongs to, and the same rule re-letters any other that slipped
-- through: numbered BELOW the register's high-water mark, yet raised AFTER it.
-- ===========================================================================

-- The highest number any REQID carries. `R18576` → 18576; anything not shaped
-- like that is ignored rather than guessed at.
create or replace function public.resync_call_req_seq()
returns bigint language plpgsql security definer set search_path = public as $$
declare
  v_max bigint;
  v_now bigint;
begin
  -- The regex has to be applied BEFORE the cast, and only a CASE guarantees
  -- that: `where <shape> and <cast>` is two quals on one scan and the planner
  -- may order them as it likes, so the first `RC1` in the table would make this
  -- die with "invalid input syntax for type bigint: "C1"" — which it did, the
  -- second time the script was run.
  select max(case when reqid ~ '^R[0-9]{1,15}$' then substring(reqid from 2)::bigint end)
    into v_max from public.call_requests;
  v_now := coalesce(pg_sequence_last_value('public.call_req_seq'::regclass), 0);
  if coalesce(v_max, 0) > v_now then
    perform setval('public.call_req_seq', v_max);
    return v_max;
  end if;
  return v_now;
end $$;
revoke all on function public.resync_call_req_seq() from public;
grant execute on function public.resync_call_req_seq() to authenticated;

-- 0083's trigger, with the one branch it was missing: what to do when the row
-- brings its OWN number.
create or replace function public.call_requests_biu()
returns trigger language plpgsql set search_path = public as $$
declare v_n bigint;
begin
  if tg_op = 'INSERT' then
    if new.reqid is null or new.reqid = '' then
      new.reqid := 'R' || nextval('public.call_req_seq')::text;
    elsif new.reqid ~ '^R[0-9]{1,15}$' then
      -- An imported request carries a number the counter has never issued.
      -- Keep the counter ahead of it, or the next request raised in the app
      -- starts again at R1 alongside an R18576.
      v_n := substring(new.reqid from 2)::bigint;
      if v_n > coalesce(pg_sequence_last_value('public.call_req_seq'::regclass), 0) then
        perform setval('public.call_req_seq', v_n);
      end if;
    end if;
    if new.created_by is null then new.created_by := auth.uid(); end if;
    if coalesce(new.email,'') = '' then new.email := auth.email(); end if;
  end if;
  new.unique_key := new.reqid || '-' || coalesce(nullif(new.product,''),'NA') || '-' || coalesce(nullif(new.serial_no,''),'NA');

  -- A UCN means the request became a call. Only a blank / Pending status is
  -- corrected; every deliberate state is left exactly as it was set. (0083)
  if btrim(coalesce(new.ucn, '')) <> ''
     and coalesce(btrim(new.status), '') in ('', 'Pending') then
    new.status := 'Registered';
  end if;
  return new;
end $$;

drop trigger if exists call_requests_biu on public.call_requests;
create trigger call_requests_biu before insert or update on public.call_requests
  for each row execute function public.call_requests_biu();

-- What is already loaded: once, now.
select public.resync_call_req_seq();

-- ---------------------------------------------------------------------------
-- The ones already issued out of order: numbered below the highest REQID on
-- record, but raised after it. Nothing else can match that — a genuine old
-- request is numbered below the high-water mark AND older than it.
-- ---------------------------------------------------------------------------
do $$
declare
  v_max  bigint;
  v_when timestamptz;
  v_ids  text;
begin
  select max(case when reqid ~ '^R[0-9]{1,15}$' then substring(reqid from 2)::bigint end)
    into v_max from public.call_requests;
  if v_max is null then return; end if;

  -- When the top of the series was raised. Anything numbered below it but not
  -- OLDER than it was numbered by a counter that had lost its place.
  select max(submitted_at) into v_when
    from public.call_requests
   where case when reqid ~ '^R[0-9]{1,15}$' then substring(reqid from 2)::bigint end = v_max;

  select string_agg(distinct reqid, ', ' order by reqid) into v_ids
    from public.call_requests
   where case when reqid ~ '^R[0-9]{1,15}$' then substring(reqid from 2)::bigint end < v_max
     and submitted_at >= v_when;
  if v_ids is null then
    raise notice 'REQID: nothing to re-letter — the series is in order.';
    return;
  end if;

  update public.call_requests
     set reqid = 'RC' || substring(reqid from 2)
   where case when reqid ~ '^R[0-9]{1,15}$' then substring(reqid from 2)::bigint end < v_max
     and submitted_at >= v_when;

  raise notice 'REQID: re-lettered % to RC — numbered below R%, raised after it.', v_ids, v_max;
end $$;
