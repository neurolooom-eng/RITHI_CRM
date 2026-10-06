-- ===========================================================================
-- 0399 — WHO REPORTED THE DAMAGE TO THE CUSTOMER IS THE SESSION
--        (second re-review D-039, FRS-143.9)
--
-- indoor_jobs.reported_to_customer_at / _by exist (FRS-057) and were on no
-- screen. The screen now records when damage was reported to the owner; the
-- person is the database's to write, the 0363 rule for the cleaning:
--   * setting or changing the time stamps reported_to_customer_by from the
--     session, discarding whatever was sent;
--   * a time in the future is refused (five minutes' grace for a clock);
--   * clearing the time clears the person.
-- A connection with no session (a repair, an import) is left alone.
-- In the indoor module, after 0394.
-- ===========================================================================

create or replace function public.indoor_reported_to_customer_stamp()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;
  if new.reported_to_customer_at is distinct from (case when tg_op = 'UPDATE' then old.reported_to_customer_at end)
     or new.reported_to_customer_by is distinct from (case when tg_op = 'UPDATE' then old.reported_to_customer_by end) then
    if new.reported_to_customer_at is null then
      new.reported_to_customer_by := null;
    else
      if new.reported_to_customer_at > now() + interval '5 minutes' then
        raise exception 'A damage report to the customer cannot be recorded in the future (%)',
          to_char(new.reported_to_customer_at at time zone 'Asia/Kolkata', 'DD-Mon-YYYY HH24:MI') using errcode = '23514';
      end if;
      new.reported_to_customer_by := auth.uid();
    end if;
  end if;
  return new;
end $$;
revoke execute on function public.indoor_reported_to_customer_stamp() from public, anon, authenticated;
drop trigger if exists zzy_indoor_reported_to_customer on public.indoor_jobs;
create trigger zzy_indoor_reported_to_customer
  before insert or update on public.indoor_jobs
  for each row execute function public.indoor_reported_to_customer_stamp();
