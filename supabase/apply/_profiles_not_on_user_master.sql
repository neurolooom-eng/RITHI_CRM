-- ===========================================================================
-- THE LOGINS ON NO USER MASTER ROW -- BY NAME.   Read-only.
--
-- Security scan, 2026-10-27 (docs/SECURITY_SCAN.md, F-02):
-- _who_can_sign_in.sql counted two profiles whose address is on no User
-- Master row, one admin and one engineer, both Gmail. This names them, so you
-- can decide whether each is somebody who should have access.
--
-- RUN THIS IN THE SUPABASE SQL EDITOR ONLY -- never through the migration
-- workflow's probe mode, whose log is public with this repository. Nothing to
-- edit. One grid.
--
-- What to do with one you do not recognise: User Access -> that login ->
-- Disable login; or add the person to the User Master if they belong.
-- ===========================================================================
select p.email, p.full_name, p.role, coalesce(p.active, true) as active,
       to_char(p.created_at at time zone 'Asia/Kolkata', 'DD-Mon-YYYY HH24:MI:SS') as profile_made,
       to_char(u.last_sign_in_at at time zone 'Asia/Kolkata', 'DD-Mon-YYYY HH24:MI:SS') as last_sign_in
  from public.profiles p
  left join auth.users u on u.id = p.id
 where not exists (select 1 from public.user_directory d
                    where lower(btrim(p.email)) in (lower(btrim(coalesce(d.email, ''))), lower(btrim(coalesce(d.gmail, '')))))
 order by p.created_at;
