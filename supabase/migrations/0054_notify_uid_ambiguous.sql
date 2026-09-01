-- ===========================================================================
-- Fix: "column reference \"uid\" is ambiguous" when Stores books out a spare.
--
-- notify_spare_dispatched() (0045) declared a plpgsql variable named `uid`, and
-- then looked the request up with `... from public.spare_requests where uid =
-- new.request_uid`. `uid` there is both the variable and spare_requests.uid, so
-- Postgres refuses the reference and the trigger aborts the UPDATE — which is
-- the update Pending Dispatch performs, so booking out failed outright.
--
-- Rename the variable to v_uid and qualify the column via an alias. Same for
-- notify_call_allotted(), which had the same variable name (harmless there, but
-- renamed so the pattern can't bite again).
-- ===========================================================================

create or replace function public.notify_call_allotted()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_uid uuid;
begin
  if coalesce(new.allocated_to, '') = '' then return new; end if;
  if tg_op = 'UPDATE' and new.allocated_to is not distinct from old.allocated_to then return new; end if;
  v_uid := public.notify_resolve_uid(new.allocated_to_email, new.allocated_to);
  if v_uid is null then return new; end if;
  insert into public.notifications (recipient_id, recipient_email, kind, title, body, link)
  values (v_uid, coalesce(new.allocated_to_email, ''), 'call_allotted',
          'Call allotted to you',
          concat_ws(' · ', nullif(coalesce(new.ucn, ''), ''), nullif(coalesce(new.party_name, ''), ''), nullif(coalesce(new.product_name, ''), '')),
          '/' || case public.call_table_for(new.call_type)
                   when 'installation' then 'installations' when 'pm' then 'pm-calls' else 'field-calls' end);
  return new;
end $$;

create or replace function public.notify_spare_dispatched()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_uid uuid; r record;
begin
  if coalesce(new.stores_status, '') !~* 'dispatch' then return new; end if;
  if tg_op = 'UPDATE' and coalesce(old.stores_status, '') ~* 'dispatch' then return new; end if;
  select sr.engineer, sr.engineer_email, sr.ucn, sr.party_name into r
    from public.spare_requests sr where sr.uid = new.request_uid;
  v_uid := public.notify_resolve_uid(r.engineer_email, r.engineer);
  if v_uid is null then return new; end if;
  insert into public.notifications (recipient_id, recipient_email, kind, title, body, link)
  values (v_uid, coalesce(r.engineer_email, ''), 'spare_dispatched',
          'Spare dispatched',
          concat_ws(' · ', nullif(coalesce(new.part, ''), ''), nullif(coalesce(r.ucn, ''), ''), nullif(coalesce(r.party_name, ''), '')),
          '/spare-requests');
  return new;
end $$;
