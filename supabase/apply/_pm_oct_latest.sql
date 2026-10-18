-- Read-only: October 2026's latest PM call and when the next one would be registered.
select pc.ucn, pc.call_number, pc.party_name,
       to_char(pc.reg_at at time zone 'Asia/Kolkata', 'DD-Mon-YYYY HH24:MI:SS') as last_reg_ist,
       to_char((pc.reg_at + interval '10 seconds') at time zone 'Asia/Kolkata', 'DD-Mon-YYYY HH24:MI:SS') as next_first_ist,
       (select count(*) from public.pm_calls x where x.reg_date >= date '2026-10-01' and x.reg_date < date '2026-11-01') as oct_pm_calls
  from public.pm_calls pc
 where pc.reg_date >= date '2026-10-01' and pc.reg_date < date '2026-11-01' and pc.reg_at is not null
 order by pc.reg_at desc, pc.id desc
 limit 1;
