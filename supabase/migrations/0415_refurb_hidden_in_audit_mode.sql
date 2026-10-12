-- ===========================================================================
-- 0415 -- ISSUING A REFURBISHED SPARE IS NOT AUDITABLE: NOT WHILE AUDIT MODE IS
-- ON (D-165 / FRS-276; the user, 2026-10-12: "refurb - in Stockout is a Non
-- Auditable Requirement. And it should disappear when i turn on the Audit
-- mode.").
--
-- 0064's ♻ Refurb on Pending Dispatch issues the recycled equivalent of a part
-- under its R-prefixed code. While Audit Mode is on the button and the
-- Refurbished badge are not shown; this refuses a refurbished issue written any
-- other way, the rule Spare Recycling (0355) already follows. A dispatch line
-- is only ever written by dispatch_spare_lines(), so a trigger on the line
-- refuses the whole stock out (one statement, all or nothing) without
-- rewriting that function, which is four revisions past 0027.
--
-- Turning Audit Mode OFF brings it back; nothing already issued is changed.
-- ===========================================================================
create or replace function public.refurb_not_in_audit_mode()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if coalesce(new.refurbished, false) and coalesce(public.audit_mode(), false) then
    raise exception 'A refurbished part cannot be issued while Audit Mode is on -- issue the part itself, or turn Audit Mode off'
      using errcode = '23514';
  end if;
  return new;
end $$;
revoke execute on function public.refurb_not_in_audit_mode() from public, anon, authenticated;
drop trigger if exists refurb_not_in_audit_mode on public.spare_dispatch_lines;
create trigger refurb_not_in_audit_mode before insert or update of refurbished on public.spare_dispatch_lines
  for each row execute function public.refurb_not_in_audit_mode();
