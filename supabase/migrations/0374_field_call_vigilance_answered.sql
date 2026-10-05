-- ===========================================================================
-- 0374 — A FIELD CALL IS REGISTERED WITH ITS THREE VIGILANCE QUESTIONS ANSWERED
--        (second re-review D-033; the user's decision, 2026-10-05)
--
-- Public Health Threat?, Death? and Serious Incident? carried defaultValue 'NO'
-- on the call form, so a call saved without anybody reading that section
-- recorded three answers nobody gave -- and Review 1 of the Daily Complaint
-- Review reads as done the moment the three are filled (review1Done, dccr.ts).
-- THE USER'S DECISION: "Blank, must be answered" -- the form has no default
-- and will not save until all three are YES or NO, and the database refuses a
-- signed-in registration of a FIELD call without them, however it is sent.
--
-- Scope, read from every writer: the Field Call register and Pending
-- Registrations both insert through the `calls` view, whose INSTEAD OF trigger
-- (calls_view_insert) runs as the caller and routes a field call into
-- field_calls -- so this trigger on field_calls sees them as `authenticated`.
-- Installation and PM calls are other tables and keep their default; calls
-- raised from a Sale Entry or a transfer are installation calls and record NO
-- by design (FRS-085.5). Not stopped: an import (bulk.upload / import.panel),
-- a connection with no session, a function running as its owner, and an
-- UPDATE (a call registered before this keeps what it has).
-- In the call_requests module, after 0341.
-- ===========================================================================

create or replace function public.field_call_vigilance_answered()
returns trigger language plpgsql security invoker set search_path = public as $$
declare v_missing text[] := '{}';
begin
  if auth.uid() is null then return new; end if;
  if current_user <> 'authenticated' then return new; end if;
  if public.has_perm('bulk.upload') or public.has_perm('import.panel') then return new; end if;
  if upper(btrim(coalesce(new.public_health_threat, ''))) not in ('YES', 'NO') then
    v_missing := v_missing || 'Public Health Threat?'::text;
  end if;
  if upper(btrim(coalesce(new.death, ''))) not in ('YES', 'NO') then
    v_missing := v_missing || 'Death?'::text;
  end if;
  if upper(btrim(coalesce(new.serious_incident, ''))) not in ('YES', 'NO') then
    v_missing := v_missing || 'Serious Incident?'::text;
  end if;
  if array_length(v_missing, 1) > 0 then
    raise exception 'Answer the vigilance questions before registering the call: %', array_to_string(v_missing, ', ')
      using errcode = '23514';
  end if;
  return new;
end $$;
revoke execute on function public.field_call_vigilance_answered() from public, anon, authenticated;
drop trigger if exists field_call_vigilance_answered on public.field_calls;
create trigger field_call_vigilance_answered
  before insert on public.field_calls
  for each row execute function public.field_call_vigilance_answered();
