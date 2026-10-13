-- ===========================================================================
-- 0431 -- THE RECENT FAILURE RATE KEEPS THE 2025 FAILURES (the user,
-- 2026-10-13, moving the 2025 DCCR-history calls to Call History: "Move them,
-- but keep the failure rates").
--
-- _dccr_failure_calls() (0393, 0396) counts a failure from a FIELD CALL and its
-- DCCR REVIEW. 0430 moves the 2025 calls out of field_calls into call_history;
-- their reviews stay. So the function gains a second arm: a Call History row
-- WITH an imported DCCR review counts exactly as the field call did -- the
-- same product, serial and date (the call's India day), the same review
-- answers, a Canceled call left out as a cancelled one was. A history row with
-- no review (the 2018-2022 calls) is not a failure and adds nothing.
--
-- RESTATED FROM 0396 WORD FOR WORD, with the second arm added.
-- ===========================================================================

create or replace function public._dccr_failure_calls(p_product text, p_serial text, p_asof date)
returns table (ucn text, call_number text, reg_date date, product_name text, serial text,
               party_name text, installed_on date, commissioning_month date,
               days_to_failure integer, spare_category text, any_potential_effect text)
language sql stable security definer set search_path = public as $$
  with c as (
    select f.ucn, f.call_number, f.reg_date, f.product_name, f.serial, f.party_name
      from public.field_calls f
     where f.cancelled_at is null
    union all
    -- THE 2025 DCCR HISTORY, now in Call History (0430), through its review.
    select h.ucn, h.call_no, (h.call_at at time zone 'Asia/Kolkata')::date, h.item_name, h.serial, h.party_name
      from public.call_history h
     where h.call_status !~* '^cancel'
       and exists (select 1 from public.call_reviews x where x.ucn = h.ucn and x.imported)
  )
  select c.ucn, c.call_number, c.reg_date, c.product_name, c.serial, c.party_name,
         m.warranty_start, date_trunc('month', m.warranty_start)::date,
         (c.reg_date - m.warranty_start)::integer,
         coalesce(r.spare_category, ''), coalesce(r.any_potential_effect, '')
    from c
    join public.call_reviews r on r.ucn = c.ucn
    join lateral (
      select pr.warranty_start
        from public.products pr
       where lower(btrim(pr.serial_number)) = lower(btrim(c.serial))
         and pr.item_name ilike p_product
         and pr.warranty_start is not null
         and pr.warranty_start <= c.reg_date
       order by pr.warranty_start desc, pr.id desc
       limit 1) m on true
   where btrim(coalesce(c.serial, '')) <> ''
     and c.product_name ilike p_product
     and coalesce(c.serial, '') ilike p_serial
     and c.reg_date <= p_asof
     and (upper(coalesce(r.spare_category, '')) like '%SPARE%'
          or upper(btrim(coalesce(r.any_potential_effect, ''))) = 'YES')
$$;
revoke execute on function public._dccr_failure_calls(text, text, date) from public, anon, authenticated;
