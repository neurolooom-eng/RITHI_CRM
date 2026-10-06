-- ===========================================================================
-- THE PM CALLS WITH A SPARE, AND WHETHER THE DCCR HOLDS THEM (2026-10-06).
-- READ-ONLY. One row per PM call (by year) whose consumption includes a part
-- the Part Master marks Spare: has it a DCCR review, what does it say, and is
-- it in the DCCR View.
-- ===========================================================================
select lpad((extract(year from p.reg_date)::int % 100)::text, 2, '0') as yr, p.ucn,
       (r.ucn is not null) as has_review, coalesce(r.spare_category, '') as spare_category,
       coalesce(r.imported, false) as imported, r.created_at::date as review_created,
       exists (select 1 from public.field_call_review v where v.ucn = p.ucn) as in_dccr_view
  from public.pm_calls p
  left join public.call_reviews r on r.ucn = p.ucn
 where exists (select 1 from public.spare_consumption s
                where s.ucn = p.ucn and coalesce(s.qty, 0) > 0 and public.part_is_spare(s.part))
 order by 1 desc, 2;
