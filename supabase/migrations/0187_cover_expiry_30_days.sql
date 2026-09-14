-- ===========================================================================
-- "ABOUT TO EXPIRE" IS THIRTY DAYS, NOT SIXTY.
--
-- 0036 wrote 60 and said so honestly: the threshold was "this application's,
-- stated rather than pretended", because the supplied AppSheet documentation
-- described the Status columns only as "a spreadsheet formula ... emits values
-- including ABOUT TO EXPIRE, ACTIVE, INACTIVE" and never printed the formula.
--
-- The formula has now been supplied (Appsheet - Forms.xlsx, formula export),
-- and all FOUR sheets that carry the column state the same band:
--
--   SaleEntry            M2  =IF(I2>=Today(),IF(I2<=(Today()+30),"ABOUT TO EXPIRE","ACTIVE"),"INACTIVE")
--   WarrantySaleDetails  V2  =IF(O2>=Today(),IF(O2<=(Today()+30),"ABOUT TO EXPIRE","ACTIVE"),"INACTIVE")
--   ContractEntry        L2  =IF(I2>=Today(),IF(I2<=(Today()+30),"ABOUT TO EXPIRE","ACTIVE"),"INACTIVE")
--   ContractDetails      W2  =IF(M2>=Today(),IF(M2<=(Today()+30),"ABOUT TO EXPIRE","ACTIVE"),"INACTIVE")
--
-- (I/O/I/M are Warranty End Date, Warranty End Date, Contract End Date and
-- Contract End Date on those four sheets respectively.)
--
-- The boundaries match this function's exactly once the number is right:
-- end = today is ABOUT TO EXPIRE, end = today+30 is ABOUT TO EXPIRE,
-- end = today+31 is ACTIVE, end = yesterday is INACTIVE.
--
-- THIS IS NOT A COSMETIC EDIT. The registers filter and count by this value,
-- so at 60 days a contract with 45 days to run was being listed as about to
-- expire and chased; the people renewing them work to the sheet's month.
--
-- THE ONE DIFFERENCE THAT IS KEPT: a NULL end date answers 'NOT COVERED'
-- rather than the sheet's answer. In Sheets a blank cell compared with
-- `>=Today()` is TRUE (text outranks numbers), so the sheet calls a machine
-- with no end date ACTIVE -- which is a comparison artefact, not a decision
-- anybody made, and calling an unknown "active" is the one wrong answer here.
--
-- Only the function changes. The views (warranty_sale_details,
-- contract_details, machine_cover) call it by name and pick this up with no
-- rebuild -- and therefore without touching their security_invoker settings.
-- ===========================================================================
create or replace function public.cover_state(p_end date)
returns text language sql immutable as $$
  select case
    when p_end is null then 'NOT COVERED'
    when p_end < current_date then 'INACTIVE'
    when p_end <= current_date + 30 then 'ABOUT TO EXPIRE'
    else 'ACTIVE' end;
$$;
