-- ===========================================================================
-- AN ANSWERED CALL REQUEST FOLLOWS A RENAME OF ITS ENGINEER (0259, finding 23).
--
-- `call_request_content_frozen` (0232) refuses any change to an answered
-- request, the engineer included, because the call now carries those details
-- and the two must not disagree. A User Master rename is the one change that
-- keeps them agreeing: 0259 renames the call's allottee in the same statement.
-- So the Engineer line alone admits exactly that rename, recognised by the
-- ticket 0259 files for its own transaction. Every other field stays frozen,
-- and so does the engineer for anybody else. Body taken from the database.
-- ===========================================================================

create or replace function public.call_request_content_frozen()
 RETURNS trigger
 LANGUAGE plpgsql
AS $$
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
  -- A USER MASTER RENAME (0259) moves the engineer's NAME and nothing else, so
  -- the request and the call it became still agree about who it is.
  if new.engineer                is distinct from old.engineer
     and not public.engineer_rename_in_progress(old.engineer, new.engineer)
                                                                               then changed := changed || 'Engineer'::text; end if;
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
