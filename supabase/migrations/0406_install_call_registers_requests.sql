-- ===========================================================================
-- 0406 -- AN INSTALLATION CALL REGISTERS THE PENDING INSTALLATION REQUESTS FOR
-- ITS MACHINE (the user, 2026-10-08: "When I generate an Installation Call, if
-- there are any requests for the same (Product + Serial No) in pending
-- Registrations, then it should be marked as registered and the UCN should be
-- updated").
--
-- Asked and answered:
--   * Which requests: INSTALLATION requests only. A pending Field or PM request
--     on the same machine asks for a different visit and stays pending.
--   * Requests already pending for a machine that already has an installation
--     call: yes, once, now -- with the machine's LATEST installation call.
--
-- THE RULE, in the database so every way an installation call is created --
-- the Installation register, Create new call on Pending Registrations, a bulk
-- upload -- does it alike. On INSERT of an installation call that is not
-- cancelled and names a product AND a serial, every call request that
--   * is still PENDING (no UCN, status blank or Pending -- Cancelled, Mapped
--     and Registered are deliberate answers and are never touched),
--   * is an INSTALLATION request (its call type begins INSTALL, the rule
--     callFamily() and call_table_for() use), and
--   * names the same product and serial (case and spaces aside),
-- takes the call's UCN and becomes Registered, actioned by whoever created the
-- call, now. call_requests_biu (0083) would set Registered from the UCN on its
-- own; it is written here so the record does not depend on that. A Pending
-- request is editable, so call_request_content_frozen does not object, and
-- none of the request's own content is changed.
--
-- SECURITY DEFINER: the person registering the call may not hold the right to
-- update call requests, and the request must still close. The function is a
-- trigger and nothing else, so nobody may call it.
-- ===========================================================================

create or replace function public.install_call_registers_requests()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_by text := coalesce((select p.full_name from public.profiles p where p.id = auth.uid()), '');
begin
  if new.cancelled_at is not null
     or btrim(coalesce(new.ucn, '')) = ''
     or btrim(coalesce(new.product_name, '')) = ''
     or btrim(coalesce(new.serial, '')) = '' then
    return new;
  end if;

  update public.call_requests q
     set ucn = new.ucn,
         status = 'Registered',
         actioned_by = v_by,
         actioned_at = now()
   where btrim(coalesce(q.ucn, '')) = ''
     and btrim(coalesce(q.status, '')) in ('', 'Pending')
     and upper(btrim(coalesce(q.call_type, ''))) like 'INSTALL%'
     and lower(btrim(coalesce(q.product, ''))) = lower(btrim(new.product_name))
     and lower(btrim(coalesce(q.serial_no, ''))) = lower(btrim(new.serial));
  return new;
end $$;

revoke execute on function public.install_call_registers_requests() from public, anon, authenticated;

drop trigger if exists zz_install_call_registers_requests on public.installation_calls;
create trigger zz_install_call_registers_requests
  after insert on public.installation_calls
  for each row execute function public.install_call_registers_requests();

-- ---- ONCE: the requests already pending for a machine already installed ----
do $once$
declare n integer;
begin
  with latest as (
    select distinct on (lower(btrim(ic.product_name)), lower(btrim(ic.serial)))
           lower(btrim(ic.product_name)) as p, lower(btrim(ic.serial)) as s, ic.ucn
      from public.installation_calls ic
     where ic.cancelled_at is null
       and btrim(coalesce(ic.ucn, '')) <> ''
       and btrim(coalesce(ic.product_name, '')) <> ''
       and btrim(coalesce(ic.serial, '')) <> ''
     order by lower(btrim(ic.product_name)), lower(btrim(ic.serial)),
              ic.reg_at desc nulls last, ic.reg_date desc nulls last, ic.ucn desc
  )
  update public.call_requests q
     set ucn = l.ucn,
         status = 'Registered',
         actioned_by = 'Data fix 0406 (its machine already had an installation call)',
         actioned_at = now()
    from latest l
   where btrim(coalesce(q.ucn, '')) = ''
     and btrim(coalesce(q.status, '')) in ('', 'Pending')
     and upper(btrim(coalesce(q.call_type, ''))) like 'INSTALL%'
     and lower(btrim(coalesce(q.product, ''))) = l.p
     and lower(btrim(coalesce(q.serial_no, ''))) = l.s;
  get diagnostics n = row_count;
  raise notice '0406: % pending installation request(s) registered against their machine''s existing installation call', n;
end $once$;
