-- ===========================================================================
-- 0170 — THE BACK-FILL'S GATE LOCKED OUT THE ONLY PLACE IT IS RUN.
--
-- 0169 guards backfill_ffrs() with is_admin(), which reads auth.uid(). In the
-- Supabase SQL editor there is no signed-in user — auth.uid() is NULL — so the
-- guard refuses every caller with "Only an administrator may back-fill the
-- Field Failure Register", including the administrator typing it.
--
-- And the SQL editor is precisely where this runs: it is a ONE-TIME catch-up
-- with a dry run to read first, not a button on a screen.
--
-- THE GATE IS NOT DROPPED, IT IS AIMED. What it exists to stop is an ordinary
-- signed-in user issuing 40 permanent FFR numbers through the API. So the test
-- becomes: a call that ARRIVED THROUGH THE API must be an administrator. A
-- direct database connection — the SQL editor, psql, a migration — already has
-- every table and every function; a role check inside one guards nothing it
-- could not step around by writing the INSERT itself.
--
-- request.jwt.claims is how the two are told apart: PostgREST sets it on every
-- request it serves, and nothing else sets it.
-- ===========================================================================
create or replace function public.backfill_ffrs(p_dry_run boolean default true)
returns table (ucn text, ffr_no text, ffr_date date, customer text, product text, note text)
language plpgsql security definer set search_path = public as $$
declare
  r        public.call_reviews;
  v_no     text;
  v_call   record;
  -- Did this come in through PostgREST? Set on every API request and on
  -- nothing else. The `true` makes the setting MISSING return NULL instead of
  -- raising, which is what it is on a direct connection.
  v_by_api boolean := coalesce(nullif(current_setting('request.jwt.claims', true), ''), '') <> '';
begin
  if v_by_api and not public.is_admin() then
    raise exception 'Only an administrator may back-fill the Field Failure Register.';
  end if;

  for r in
    select cr.* from public.call_reviews cr
     where upper(coalesce(btrim(cr.any_potential_effect), '')) = 'YES'
       and coalesce(btrim(cr.ucn), '') <> ''
       and not exists (select 1 from public.field_failure_reports f where f.ucn = cr.ucn)
     order by cr.review2_at nulls last, cr.ucn
  loop
    select c.party_name, c.product_name into v_call
      from public.calls c where c.ucn = r.ucn limit 1;

    if p_dry_run then
      ucn := r.ucn;
      -- The number is NOT issued on a dry run: reserving one and not using it
      -- would leave a gap in a numbered series that somebody has to explain.
      ffr_no := '(would be issued in ' || coalesce(to_char(r.review2_at, 'YYYY'), 'this year') || ')';
      ffr_date := r.review2_at;
      customer := coalesce(v_call.party_name, '');
      product := coalesce(v_call.product_name, '');
      note := 'would create';
      return next;
    else
      v_no := public.raise_ffr(r);
      if v_no is not null then
        ucn := r.ucn; ffr_no := v_no; ffr_date := r.review2_at;
        customer := coalesce(v_call.party_name, '');
        product := coalesce(v_call.product_name, '');
        note := 'created';
        return next;
      end if;
    end if;
  end loop;
end $$;

revoke all on function public.backfill_ffrs(boolean) from public;
grant execute on function public.backfill_ffrs(boolean) to authenticated;

-- NOTE the two halves of "who may run this" and why neither is redundant:
--   * the REVOKE above keeps `anon` out — an unauthenticated API caller never
--     reaches the body, so the v_by_api test never has to be its only defence;
--   * the v_by_api test keeps a signed-in NON-administrator out, which is the
--     case the original guard was written for and still handles.
