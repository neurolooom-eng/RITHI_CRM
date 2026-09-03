-- ===========================================================================
-- A request that HAS a UCN is Registered.
--
-- The Hotline sets a request's status explicitly when it registers or maps one
-- (setCallRequestUcn). A bulk load does not — the export carries the UCN in
-- column A and no status at all — so 4,010 registered requests came in reading
-- "Pending" on the register while each pointed at its call. The UCN is the
-- fact; the status is a reading of it, and a reading that can lag the fact is
-- a wrong reading.
--
-- So the database keeps the two in step, on every write from anywhere: a row
-- that carries a UCN and whose status is blank or Pending becomes Registered.
-- Nothing else is touched — Mapped and Registered are already true, Cancelled
-- and Dropped after registration are legitimate states and stay as set.
--
-- The trigger now fires on UPDATE too. It only ever set reqid / unique_key /
-- created_by on insert, which is unchanged; the status rule is the part that
-- has to hold when a UCN is written onto an existing row.
-- ===========================================================================

create or replace function public.call_requests_biu()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if new.reqid is null or new.reqid = '' then
      new.reqid := 'R' || nextval('public.call_req_seq')::text;
    end if;
    if new.created_by is null then new.created_by := auth.uid(); end if;
    if coalesce(new.email,'') = '' then new.email := auth.email(); end if;
  end if;
  new.unique_key := new.reqid || '-' || coalesce(nullif(new.product,''),'NA') || '-' || coalesce(nullif(new.serial_no,''),'NA');

  -- A UCN means the request became a call. Only a blank / Pending status is
  -- corrected; every deliberate state is left exactly as it was set.
  if btrim(coalesce(new.ucn, '')) <> ''
     and coalesce(btrim(new.status), '') in ('', 'Pending') then
    new.status := 'Registered';
  end if;
  return new;
end $$;

drop trigger if exists call_requests_biu on public.call_requests;
create trigger call_requests_biu before insert or update on public.call_requests
  for each row execute function public.call_requests_biu();

-- What is already loaded: the same rule, once.
update public.call_requests
   set status = 'Registered'
 where btrim(coalesce(ucn, '')) <> ''
   and coalesce(btrim(status), '') in ('', 'Pending');
