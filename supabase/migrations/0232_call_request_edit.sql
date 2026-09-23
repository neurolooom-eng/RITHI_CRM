-- ===========================================================================
-- A CALL REQUEST CAN BE CORRECTED — UNTIL IT HAS BECOME A CALL.
--
--   The user, 2026-09-22: "Add a Provision in Call Request for me to edit it."
--
-- A request is typed in the field, often from a phone, and the serial, the
-- model or the customer is the thing most often wrong. Until now the only way
-- to fix one was to cancel it and raise another, which loses the original
-- timestamp and leaves two rows for one request.
--
-- THE PERMISSION ALREADY EXISTED and is not widened here: `cr_update` (0003)
-- lets `calls.create`, `pending.register` or the person who RAISED it write the
-- row. What was missing was a form, and one control.
--
-- THE CONTROL: ONCE A REQUEST HAS BECOME A CALL, ITS CONTENT IS FROZEN. The
-- call carries the customer, the machine and the complaint from that moment on;
-- editing the request afterwards leaves two records disagreeing about one
-- machine, and the call is the one everything downstream reads. The correction
-- belongs on the CALL, where it is audited.
--
-- IT FREEZES THE CONTENT AND NOT THE DISPOSITION, which is why this is a
-- trigger rather than a policy. Registering a request writes `ucn`, `status`,
-- `actioned_by` and `actioned_at`; cancelling writes `status`, `cancel_reason`
-- and `cancelled_at`. A rule that froze the whole row would stop the very
-- flows that move a request out of Pending. Those four (plus the cancel three)
-- stay writable in every state; the sixteen columns that describe WHAT was
-- asked for stop moving once the answer exists.
--
-- A trigger rather than a client rule because `cr_update` lets the raiser write
-- their own row: a control that lives only in the form is one that a direct API
-- call walks past.
--
-- THE `::text` CASTS ON THE APPENDS ARE NOT NOISE. `text[] || 'Serial No'`
-- leaves Postgres to choose between array||element and array||array, and it
-- picks the second: the guard fired with `malformed array literal: "Serial No"`
-- instead of the sentence below. It refused the write either way, which is
-- exactly why it would have shipped -- the test that caught it asserted the
-- MESSAGE, not the refusal.
-- ===========================================================================

create or replace function public.call_request_content_frozen()
returns trigger language plpgsql as $$
declare
  was text := lower(btrim(coalesce(old.status, '')));
  changed text[] := '{}';
begin
  -- Pending is the editable state. Anything else means the request has been
  -- answered -- registered as a call, mapped to one, or cancelled.
  if was in ('', 'pending') then return new; end if;

  if new.party_name              is distinct from old.party_name              then changed := changed || 'Party'::text; end if;
  if new.state                   is distinct from old.state                   then changed := changed || 'State'::text; end if;
  if new.city                    is distinct from old.city                    then changed := changed || 'City'::text; end if;
  if new.address                 is distinct from old.address                 then changed := changed || 'Address'::text; end if;
  if new.product                 is distinct from old.product                 then changed := changed || 'Product'::text; end if;
  if new.serial_no               is distinct from old.serial_no               then changed := changed || 'Serial No'::text; end if;
  if new.standard_complaint      is distinct from old.standard_complaint      then changed := changed || 'Standard Complaint'::text; end if;
  if new.reported_problem        is distinct from old.reported_problem        then changed := changed || 'Reported Problem'::text; end if;
  if new.call_type               is distinct from old.call_type               then changed := changed || 'Call Type'::text; end if;
  if new.engineer                is distinct from old.engineer                then changed := changed || 'Engineer'::text; end if;
  if new.email                   is distinct from old.email                   then changed := changed || 'Email'::text; end if;
  if new.customer_contact_details is distinct from old.customer_contact_details then changed := changed || 'Customer Contact'::text; end if;
  if new.customer_contact_number is distinct from old.customer_contact_number then changed := changed || 'Customer Number'::text; end if;
  if new.plan_date               is distinct from old.plan_date               then changed := changed || 'Plan Date'::text; end if;
  if new.additional_comments     is distinct from old.additional_comments     then changed := changed || 'Additional Comments'::text; end if;
  if new.call_attended           is distinct from old.call_attended           then changed := changed || 'Call Attended'::text; end if;

  if array_length(changed, 1) is not null then
    raise exception
      'This request is already % — % cannot be changed here. The call carries these details now, so correct them on the call itself; changing the request would leave the two disagreeing about one machine.',
      coalesce(old.status, 'answered'), array_to_string(changed, ', ');
  end if;
  return new;
end $$;

drop trigger if exists zz_call_request_content_frozen on public.call_requests;
create trigger zz_call_request_content_frozen
  before update on public.call_requests
  for each row execute function public.call_request_content_frozen();

comment on function public.call_request_content_frozen() is
  'A call request may be corrected while it is Pending. Once it has become a call — Registered, Mapped or Cancelled — the sixteen columns describing WHAT was asked for stop moving, because the call carries them from that moment and the call is what everything downstream reads. The disposition columns (ucn, status, actioned_by/at, cancel_reason, cancelled_at) stay writable in every state, or registering and cancelling would themselves be refused.';
