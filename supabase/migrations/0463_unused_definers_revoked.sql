-- ===========================================================================
-- D-185 and D-202 (re-review 5, 2026-10-12): two owner-rights functions the
-- application never calls were callable through the API.
--
--   next_ffr_no(smallint) (0169) advances the FFR series and checks nothing; 0248
--   revoked every other numbered-series generator and missed it. Measured: an
--   engineer without ffr.manage drew FFR - 001/26 and 002/26, and the next
--   report raised became 003/26 -- gaps in a controlled series.
--   spare_request_rollup(text) (0025) rewrites a spare request's stage past the
--   stage guard and checks nothing. Measured: the public key reset a request
--   with no lines from Received to RM Approval.
--
-- Neither is called from src/; ffr_stamp, ffr_from_review and the spare
-- triggers that use them run as the owner and are unaffected. The 0248 rule:
-- a SECURITY DEFINER function the app does not call loses EXECUTE for public,
-- anon and authenticated. Guarded, so a project without one skips it.
-- ===========================================================================
do $$
declare fn text;
begin
  foreach fn in array array['public.next_ffr_no(smallint)', 'public.spare_request_rollup(text)'] loop
    if to_regprocedure(fn) is null then continue; end if;
    execute format('revoke execute on function %s from public', fn);
    begin execute format('revoke execute on function %s from anon, authenticated', fn);
    exception when undefined_object then null; end;
  end loop;
end $$;
