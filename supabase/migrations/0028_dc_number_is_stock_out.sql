-- ===========================================================================
-- One number on a delivery: the STOCK OUT number.
--
-- 0027 minted two series, SO- and DC-, on the assumption that the challan
-- carried a document number of its own. The DC template says otherwise: the
-- printed challan identifies itself by **Stock Out No.** and **Stock Out
-- Date**, and has no DC-number field at all. The sheet-era history says the
-- same — its column is `SO NO`, and that is what the import loaded into
-- `dc_number`.
--
-- So there is one number. `spare_dispatches.uid` is it, `dc_number` mirrors it
-- (keeping every existing read — hand stock's movement ref, the approval
-- trail, the register column, the imported history — working unchanged), and
-- the separate DC series is retired.
--
-- If a distinct challan series is ever wanted, this is where it comes back:
-- give next_dc_number() its own counter again and stop mirroring below.
-- ===========================================================================

create or replace function public.spare_dispatches_assign_no()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.dc_date is null then new.dc_date := current_date; end if;
  if new.uid is null or btrim(new.uid) = '' then
    new.uid := public.next_stock_out_no(new.dc_date);
  end if;
  -- The challan is the stock out. Not a second series.
  if new.dc_number is null or btrim(new.dc_number) = '' then
    new.dc_number := new.uid;
  end if;
  return new;
end $$;

-- next_dc_number() is retired rather than left as a live second series that
-- nothing calls. Dropped only if 0027 created it, so this is re-runnable.
drop function if exists public.next_dc_number(date);
delete from public.spare_dispatch_counters where series = 'dc';

-- Re-point anything 0027 already minted. Only the auto-generated DC- series is
-- touched; a number typed or imported from the sheet era is left exactly as it
-- is. Guards are dropped first — this is a data migration, not somebody
-- dispatching, and auth.uid() is NULL in the SQL editor.
drop trigger if exists spare_request_lines_guard          on public.spare_request_lines;
drop trigger if exists spare_request_lines_dispatch_guard on public.spare_request_lines;

update public.spare_request_lines l
   set dc_number = d.uid
  from public.spare_dispatches d
 where l.dispatch_uid = d.uid
   and l.dc_number ~ '^DC-\d{4}-\d{4}$'
   and l.dc_number is distinct from d.uid;

update public.spare_dispatches
   set dc_number = uid
 where dc_number ~ '^DC-\d{4}-\d{4}$';

create trigger spare_request_lines_guard
  before update on public.spare_request_lines
  for each row execute function public.spare_request_lines_guard();
create trigger spare_request_lines_dispatch_guard
  before update on public.spare_request_lines
  for each row execute function public.spare_request_lines_dispatch_guard();
