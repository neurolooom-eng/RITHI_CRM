-- ===========================================================================
-- 0467 — THE FIELD FAILURE REPORT NUMBER IS ISSUED ONLY BY RAISING A REPORT
--        (security re-scan, 2026-11-07, F-12)
--
-- next_ffr_no(smallint) (0169) ADVANCES the year's FFR counter each time it is
-- called. It was callable by any signed-in login through the API, so anybody --
-- a login with no profile included -- could burn numbers and leave gaps in a
-- controlled register numbered FFR - 001/26 onwards. Only raise_ffr() and the
-- ffr_stamp() trigger call it, and both run as the owner, so withdrawing it
-- from the API roles changes nothing they do. 0248 withdrew the old
-- zero-argument version; this is the one-argument version that replaced it.
-- ===========================================================================
do $$
begin
  if to_regprocedure('public.next_ffr_no(smallint)') is null then return; end if;
  execute 'revoke execute on function public.next_ffr_no(smallint) from public, anon, authenticated';
end $$;
