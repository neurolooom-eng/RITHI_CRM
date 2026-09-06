-- ===========================================================================
-- user_directory.sql must leave the directory's policies where the schema
-- leaves them.
--
-- 0004 creates `ud_admin_write` — FOR ALL, using is_admin() — and 0008 DROPS
-- it, because rbac replaced it with the narrower ud_read / ud_write pair plus
-- 0030's address rule for dispatch. Since rbac runs after user_directory, a
-- database built from all.sql has no ud_admin_write, which is the intended
-- state; but replaying user_directory.sql on its own put it back, and policies
-- are OR'd, so the narrowing went away with no error and no warning.
--
-- Dropping it again here is 0008's word, applied last. On a fresh apply the
-- policy has just been created a few statements above and is dropped again
-- immediately, which is exactly what all.sql does anyway.
-- ===========================================================================

drop policy if exists ud_admin_write on public.user_directory;
