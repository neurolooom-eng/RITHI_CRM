-- ===========================================================================
-- "INSTALLATION CALL" — ONE SPELLING, ON THE MASTER AND ON THE CALLS ALREADY
-- RAISED.
--
-- The user, 2026-09-23: "STANDARD COMPLAINT= INSTALLATION CALL , Reported
-- Complaint= INSTALLATION CALL". The Warranty Register wrote "Installation
-- Calls" until now.
--
-- WHY THIS IS A MIGRATION AND NOT JUST A CONSTANT IN THE CLIENT. Standard
-- Complaint is the dimension every count, filter and frequent-failure match
-- groups by, so a second spelling does not read as a typo: it SPLITS the total
-- silently and the reader believes both halves. Changing the client alone
-- would leave the installation calls raised before today under the old words
-- and every new one under the new ones, with nothing anywhere saying so.
--
-- TWO THINGS, AND THE FIRST IS THE ONE THAT IS EASY TO FORGET:
--
--   1. THE MASTER. `masters` is what the Standard Complaint picker offers, and
--      that field takes NO free text (the user's standing rule) -- so a value
--      the master has not got is a value nobody can choose and, on a call
--      opened in the form, a field that cannot show what the record holds.
--      The old value is LEFT ON THE MASTER rather than removed: a master row
--      is not a record, but deleting it would stop the picker offering a value
--      that historical calls still carry, and a filter built on it would
--      silently return nothing.
--
--   2. THE CALLS. Only INSTALLATION calls, and only those whose complaint is
--      that exact old phrase -- matched case-insensitively and space-squashed,
--      since an import may have written "Installation  Calls". A FIELD CALL
--      that happens to say "Installation Calls" is somebody's own words on
--      their own call and is NOT touched: this migration knows about the
--      calls THIS APPLICATION generated, and rewriting a value on a quality
--      record it did not write is a different act needing a different reason.
--
-- The call's own `complaint_date` / `breakdown_date` / `call_number` are NOT
-- back-filled. Those exist on the calls already raised and carry whatever was
-- right at the time; inventing a WI- number for a call raised before the rule
-- existed would be writing a fact that was never true.
-- ===========================================================================

-- ---- 1. the master -------------------------------------------------------
do $$
declare
  v_name text;
begin
  if to_regclass('public.masters') is null then
    raise notice '0233: masters is missing — the Standard Complaint value is not seeded.';
    return;
  end if;

  -- WHICHEVER NAME THIS PROJECT USES. `listMaster` reads BOTH 'complaint' and
  -- 'standardComplaint' for this picker, and which one a given project was
  -- seeded with is a fact about the data, not about this repository. The value
  -- goes beside the rows that are already there, so it appears in the same list.
  select m.name into v_name
    from public.masters m
   where m.name in ('complaint', 'standardComplaint')
   group by m.name
   order by count(*) desc
   limit 1;

  if v_name is null then v_name := 'standardComplaint'; end if;

  if not exists (
    select 1 from public.masters
     where name in ('complaint', 'standardComplaint')
       and upper(btrim(regexp_replace(value, '\s+', ' ', 'g'))) = 'INSTALLATION CALL'
  ) then
    insert into public.masters (name, value) values (v_name, 'INSTALLATION CALL');
    raise notice '0233: added "INSTALLATION CALL" to the % master.', v_name;
  end if;
end $$;

-- ---- 2. the installation calls already raised ----------------------------
do $$
declare
  n bigint;
begin
  if to_regclass('public.calls') is null then
    raise notice '0233: calls is missing — nothing to move.';
    return;
  end if;

  update public.calls c
     set standard_complaint = case
           when upper(btrim(regexp_replace(coalesce(c.standard_complaint, ''), '\s+', ' ', 'g'))) = 'INSTALLATION CALLS'
             then 'INSTALLATION CALL' else c.standard_complaint end,
         complaint_reported = case
           when upper(btrim(regexp_replace(coalesce(c.complaint_reported, ''), '\s+', ' ', 'g'))) = 'INSTALLATION CALLS'
             then 'INSTALLATION CALL' else c.complaint_reported end
   where upper(coalesce(c.call_type, '')) like 'INSTALL%'
     and (upper(btrim(regexp_replace(coalesce(c.standard_complaint, ''), '\s+', ' ', 'g'))) = 'INSTALLATION CALLS'
       or upper(btrim(regexp_replace(coalesce(c.complaint_reported, ''), '\s+', ' ', 'g'))) = 'INSTALLATION CALLS');

  get diagnostics n = row_count;
  raise notice '0233: % installation call(s) moved to "INSTALLATION CALL".', n;
end $$;
