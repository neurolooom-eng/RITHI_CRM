-- ===========================================================================
-- 0180 — ZOHO MIGRATION GIVES BACK `review.edit`.
--
-- Found by _status.sql on the live project and confirmed with the user
-- (2026-09-13): the Zoho Migration row reported NO, and the clause that fired
-- was not drift -- it was A WRITE ACTION on a role whose whole definition is
-- that it holds none.
--
-- WHAT IT COULD DO, established on a database rather than read off the policy:
-- `review.edit` grants ALL commands on `call_reviews`. A user on the role
-- answered Review 2 with Risk to Patient = Yes, the 0167 trigger fired, and
-- FFR - 001/26 was raised in their name. By 0166 that record can never be
-- deleted. So the role could create permanent quality records -- which is a
-- long way from "read-only", and further still from what a data migration
-- needs.
--
-- HOW IT GOT THERE, and it was nobody's mistake at the tick: an administrator
-- granted `review.edit` to TECHNICAL SUPPORT, deliberately. 0155 then merged
-- Technical Support's whole row into Zoho Migration on every run of rbac.sql,
-- so the tick crossed to a role it was never aimed at, silently. 0155 no
-- longer does that -- a clone seeds a role ONCE and is not a standing mirror
-- (the user's rule, and it applies to all cloning here) -- but the key is
-- already on the live row, and a file that only stops the leak leaves it
-- standing. This removes it.
--
-- TECHNICAL SUPPORT KEEPS IT. That was the user's decision, asked before
-- changing anything: the grant there was intended, and revoking a permission
-- an administrator chose is not a tidy-up. This file names ONE role and ONE
-- key for that reason.
--
-- NOTHING IS UNDONE. Any Field Failure Report or review already recorded under
-- this role stays exactly as it is -- 0049's rule, and the reason the register
-- is worth anything. Withdrawing access is not a way of editing the record.
-- ===========================================================================

do $zr$
begin
  if to_regclass('public.app_roles') is null then
    raise notice 'app_roles is missing -- run rbac.sql first';
    return;
  end if;

  if not exists (select 1 from public.app_roles where role = 'zoho_migration') then
    raise notice 'zoho_migration is not there -- nothing to revoke';
    return;
  end if;

  if not exists (select 1 from public.app_roles
                  where role = 'zoho_migration' and permissions ? 'review.edit') then
    raise notice 'zoho_migration does not hold review.edit -- nothing to do';
    return;
  end if;

  -- `-` on a jsonb ARRAY removes every matching element by value. Only this
  -- key and only this role: an administrator may have tuned the rest, and a
  -- rebuild of the row from a literal list would quietly discard that.
  update public.app_roles
     set permissions = permissions - 'review.edit',
         updated_at  = now()
   where role = 'zoho_migration';

  raise notice 'Zoho Migration: review.edit revoked. It can no longer write a Daily Call Review, so it can no longer raise a Field Failure Report.';
end $zr$;
