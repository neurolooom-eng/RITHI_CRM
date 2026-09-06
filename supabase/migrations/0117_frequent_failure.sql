-- ===========================================================================
-- IS THIS A FREQUENT FAILURE?  Let the register answer, not somebody's memory.
--
-- Review 2 asks three questions and one of them is "Frequent Failure". Until
-- now the reviewer answered it from what they happened to remember about the
-- machine. The register already knows: the user's rule (2026-09-06) is
--
--     failures on the SAME PRODUCT + SERIAL NUMBER, with the SAME COMPLAINT,
--     in the last 6 MONTHS.
--
-- So this returns those calls — not just a count. A number on its own invites
-- "which ones?", and the reviewer is about to record a judgement they may have
-- to defend; the UCNs and dates are what makes it defensible. The screen shows
-- the count and lists them underneath.
--
-- WHAT "SAME COMPLAINT" MEANS, and why it is two tests. `standard_complaint` is
-- the controlled value and the right one to match on — but the sheet era left
-- calls with none, and an imported call with only a reported problem would
-- silently match nothing and read as "no history". So: the standard complaints
-- match, OR the reported problems match, each compared on lower(btrim()).
--
-- THE WINDOW IS MEASURED FROM THE CALL, not from today. A review done in March
-- on a call raised in January must see January's six months, or reopening an
-- old review changes its answer.
--
-- THE CALL ITSELF IS EXCLUDED. "Two earlier failures" is what a reviewer needs
-- to hear; a count that silently includes the call being reviewed reads as one
-- more than it is, and this is the number the Yes/No is decided on.
--
-- SECURITY DEFINER, deliberately. The question is about a MACHINE the reader is
-- already reviewing, and an answer filtered by their own call scope would show
-- a smaller number than the truth — which is the one direction that matters
-- here, because it would talk somebody out of raising an FFR. Gated on the
-- review permission, and it returns nothing that is not about this machine.
-- ===========================================================================

create or replace function public.frequent_failure_history(p_ucn text, p_months integer default 6)
returns table (
  ucn            text,
  call_number    text,
  reg_date       date,
  complaint      text,
  engineer       text,
  party_name     text,
  days_before    integer
)
language plpgsql stable security definer set search_path = public as $$
declare
  v_product   text;
  v_serial    text;
  v_std       text;
  v_reported  text;
  v_on        date;
  v_months    integer := greatest(coalesce(p_months, 6), 1);
begin
  if not (public.has_perm('review.edit') or public.has_perm('calls.view')) then
    raise exception 'RBAC: your role cannot read the review history';
  end if;

  select lower(btrim(coalesce(c.product_name, ''))),
         lower(btrim(coalesce(c.serial, ''))),
         lower(btrim(coalesce(c.standard_complaint, ''))),
         lower(btrim(coalesce(c.complaint_reported, ''))),
         c.reg_date
    into v_product, v_serial, v_std, v_reported, v_on
    from public.calls c where c.ucn = p_ucn;

  -- No machine to compare, no answer. A blank serial would otherwise match
  -- every other call that is also missing one, which is the worst kind of
  -- wrong: a confident number built out of absent data.
  if v_product is null or v_product = '' or v_serial = '' then return; end if;
  v_on := coalesce(v_on, current_date);

  return query
  select c.ucn,
         coalesce(c.call_number, '')          as call_number,
         c.reg_date,
         coalesce(nullif(btrim(c.standard_complaint), ''), c.complaint_reported, '') as complaint,
         coalesce(c.allocated_to, '')         as engineer,
         coalesce(c.party_name, '')           as party_name,
         (v_on - c.reg_date)::integer         as days_before
    from public.calls c
   where c.ucn <> p_ucn
     and lower(btrim(coalesce(c.product_name, ''))) = v_product
     and lower(btrim(coalesce(c.serial, '')))       = v_serial
     and c.reg_date is not null
     and c.reg_date <= v_on
     and c.reg_date >  v_on - make_interval(months => v_months)
     and c.cancelled_at is null
     and (
       (v_std <> '' and lower(btrim(coalesce(c.standard_complaint, ''))) = v_std)
       or
       (v_reported <> '' and lower(btrim(coalesce(c.complaint_reported, ''))) = v_reported)
     )
   order by c.reg_date desc, c.ucn desc;
end $$;
revoke all on function public.frequent_failure_history(text, integer) from public;
grant execute on function public.frequent_failure_history(text, integer) to authenticated;

comment on function public.frequent_failure_history(text, integer) is
  'Earlier failures on the same product+serial with the same complaint, within p_months BEFORE the call''s own date. Excludes the call itself. Feeds the Frequent Failure answer at DCCR Review 2.';
