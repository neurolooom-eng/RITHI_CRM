-- ===========================================================================
-- 0373 — A STOCK TRANSFER OR RETURN IS NOT DATED INTO A CLOSED PERIOD OR THE
--        FUTURE (second re-review D-050)
--
-- handstock_movements (0096) dates a transfer by transfer_date and a return by
-- mrn_date, both typed on the form, and drops every movement dated before
-- handstock_cutoff() -- right for a movement recorded BEFORE the period was
-- closed, which the closing figure holds; but a movement recorded AFTER the
-- close and dated before it is held by neither, so it moves stock that is then
-- counted nowhere. Nothing refused such a date, nor one in the future.
-- Now, for a signed-in caller who is not an importer (stock_import_allowed()'s
-- rule, 0339): a transfer_date or mrn_date on or before the last closed day
-- (handstock_period.closed_through, which handstock_cutoff() reads) or after
-- today (India) is refused, on insert and on a change of the date. Imports
-- load history as it was; with no period closed only the future is refused.
-- In the handstock module, after 0369.
-- ===========================================================================

create or replace function public.stock_movement_date_open()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_date  date;
  v_old   date;
  v_closed date;
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
  v_what  text;
begin
  if public.stock_import_allowed() then return new; end if;
  -- The last closed day, as handstock_cutoff() reads it (its day after is the
  -- first open one). No row, no period closed.
  select hp.closed_through into v_closed from public.handstock_period hp limit 1;
  if tg_table_name = 'stock_transfers' then
    v_date := new.transfer_date; v_what := 'A stock transfer';
    if tg_op = 'UPDATE' then v_old := old.transfer_date; end if;
  else
    v_date := new.mrn_date; v_what := 'A material return';
    if tg_op = 'UPDATE' then v_old := old.mrn_date; end if;
  end if;
  if v_date is null or (tg_op = 'UPDATE' and v_date is not distinct from v_old) then return new; end if;
  if v_date > v_today then
    raise exception '% cannot be dated in the future (%)', v_what, to_char(v_date, 'DD-Mon-YYYY')
      using errcode = '23514';
  end if;
  if v_closed is not null and v_date <= v_closed then
    raise exception '% cannot be dated % -- hand stock is closed through %, so it would be counted nowhere',
      v_what, to_char(v_date, 'DD-Mon-YYYY'), to_char(v_closed, 'DD-Mon-YYYY')
      using errcode = '23514';
  end if;
  return new;
end $$;
revoke execute on function public.stock_movement_date_open() from public, anon, authenticated;

drop trigger if exists stock_movement_date_open on public.stock_transfers;
create trigger stock_movement_date_open
  before insert or update of transfer_date on public.stock_transfers
  for each row execute function public.stock_movement_date_open();
drop trigger if exists stock_movement_date_open on public.material_returns;
create trigger stock_movement_date_open
  before insert or update of mrn_date on public.material_returns
  for each row execute function public.stock_movement_date_open();
