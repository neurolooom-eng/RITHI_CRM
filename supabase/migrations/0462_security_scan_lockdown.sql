-- ===========================================================================
-- 0462 -- WHAT THE PUBLIC KEY CAN CALL, AFTER THE SECURITY SCAN (2026-10-27;
-- docs/SECURITY_SCAN.md, F-03). 0248's rule applied to what the scan found
-- still callable by the not-signed-in role:
--   * spare_request_rollup(text) re-derives a request's stage from its lines
--     and writes it past the stage guard. Only definer triggers call it; the
--     app never does. Withdrawn from every API role.
--   * dispatch_spare_lines (three overloads) and receive_spare_shipments are
--     called by the app, signed in; each checks its own permission inside.
--     Withdrawn from the not-signed-in role only.
-- Guarded, like 0248, so a project behind on other modules is unharmed.
-- ===========================================================================
do $$
declare fn text;
begin
  foreach fn in array array['public.spare_request_rollup(text)'] loop
    if to_regprocedure(fn) is null then continue; end if;
    execute format('revoke execute on function %s from public', fn);
    begin execute format('revoke execute on function %s from anon, authenticated', fn);
    exception when undefined_object then null; end;
  end loop;
  foreach fn in array array[
    'public.dispatch_spare_lines(bigint[],text,text,date,text)',
    'public.dispatch_spare_lines(bigint[],numeric[],text,text,date,text)',
    'public.dispatch_spare_lines(bigint[],numeric[],boolean[],text,text,date,text)',
    'public.receive_spare_shipments(bigint[],text,text)'] loop
    if to_regprocedure(fn) is null then continue; end if;
    execute format('revoke execute on function %s from public', fn);
    begin
      execute format('revoke execute on function %s from anon', fn);
      execute format('grant execute on function %s to authenticated', fn);
    exception when undefined_object then null; end;
  end loop;
end $$;
