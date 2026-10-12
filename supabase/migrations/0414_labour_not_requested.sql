-- ===========================================================================
-- 0414 -- A LABOUR CHARGE IS NOT REQUESTED AS A SPARE (FRS-275.6; the user,
-- 2026-10-12, asked whether SC001 / TC001 / INS-001 should come off the Spare
-- Request list: "Yes, remove them from Spare Request").
--
-- A labour charge is booked on a consumption and never held (0413), so there
-- is nothing for Stores to send. The Spare Request form no longer lists them;
-- this refuses one written any other way -- a new line naming a labour part,
-- or a line re-pointed at one.
--
-- NOT REFUSED: an import (stock_import_allowed(), 0339 -- a migration, or a
-- holder of bulk.upload / import.panel), which records what happened rather
-- than asking for something. LEFT AS THEY ARE: the 2 SC001 lines already on
-- the live register (none dispatched); an UPDATE that does not change the
-- part does not fire this.
-- ===========================================================================
create or replace function public.labour_not_requested()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.part_code(new.part) = any (public.labour_part_codes())
     and (tg_op = 'INSERT' or public.part_code(new.part) is distinct from public.part_code(old.part))
     and not public.stock_import_allowed() then
    raise exception '% is a labour charge -- add it to the consumption on the visit, it is not requested as a spare',
      public.part_code(new.part) using errcode = '23514';
  end if;
  return new;
end $$;
revoke execute on function public.labour_not_requested() from public, anon, authenticated;
drop trigger if exists labour_not_requested on public.spare_request_lines;
create trigger labour_not_requested before insert or update of part on public.spare_request_lines
  for each row execute function public.labour_not_requested();
