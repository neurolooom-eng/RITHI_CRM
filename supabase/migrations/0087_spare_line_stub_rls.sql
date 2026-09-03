-- ===========================================================================
-- "Your role does not have permission for this action." on the FIRST spare line.
--
-- 0084 lets a line whose request is in neither export create a stub parent from
-- a BEFORE INSERT trigger, so one gap in the source does not cost the file. The
-- foreign key is satisfied by that stub — referential checks run at the end of
-- the statement, with a fresh snapshot — but `srl_insert` is NOT:
--
--   with check (has_perm('spare.request') and exists (
--     select 1 from spare_requests r where r.uid = request_uid
--       and (r.created_by = auth.uid() or is_admin())))
--
-- A row-level security check is evaluated INSIDE the inserting command, and a
-- command cannot see rows written by SQL its own triggers ran: the stub's cmin
-- is higher than the command's. So the EXISTS finds nothing and the row is
-- refused — for an ADMIN too, because `is_admin()` sat inside the EXISTS and an
-- EXISTS with no row is false however permissive its predicate is.
--
-- And PostgREST sends the whole upload as ONE insert, so a single such line
-- fails all 8,571 — which is what happened on row 1 (OR26724, an OR number the
-- 2026 header export does not go back far enough to carry).
--
-- Hoisting `is_admin()` out of the EXISTS is the whole fix. It takes nothing
-- away from anyone else: a non-admin still has to own the request they are
-- attaching lines to, and an admin could already read and write every one of
-- these rows.
-- ===========================================================================

drop policy if exists srl_insert on public.spare_request_lines;
create policy srl_insert on public.spare_request_lines for insert
  with check (
    public.has_perm('spare.request')
    and (
      public.is_admin()
      or exists (
        select 1 from public.spare_requests r
         where r.uid = request_uid and r.created_by = auth.uid())
    ));
