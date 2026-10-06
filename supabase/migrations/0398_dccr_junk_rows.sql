-- ===========================================================================
-- 0398  THE DCCR ROWS WHOSE "UC NUMBER" IS AN EXCEL DATE (2026-10-06).
--
-- _dccr_reviews_on_no_call.sql, run on the live project: about 10,000 DCCR
-- rows whose UC Number is a bare five-digit number -- 41099, 42672, 42673 ...
-- -- which are Excel DATE SERIALS (42672 is 28-Oct-2016): a load on
-- 14-Sep-2026 read a date column as the UC Number. They match no call and
-- carry no review answer (at most PENDING / COMPLETED in one field), plus one
-- row whose UC Number is "-". The user, shown them: "Delete them".
--
-- ONLY THOSE: a UC Number that is five digits or "-", on NO call of any
-- register. Every real UC Number has letters (25A02F0001); a five-digit one
-- that IS a call is left alone by the NOT EXISTS. The count is printed.
-- Re-runnable: a second run finds nothing.
-- ===========================================================================
do $$
declare n integer;
begin
  delete from public.call_reviews r
   where (btrim(r.ucn) ~ '^[0-9]{5}$' or btrim(r.ucn) = '-')
     and not exists (select 1 from public.field_calls f where f.ucn = r.ucn)
     and not exists (select 1 from public.installation_calls i where i.ucn = r.ucn)
     and not exists (select 1 from public.pm_calls m where m.ucn = r.ucn);
  get diagnostics n = row_count;
  raise notice '0398: % DCCR row(s) with an Excel date for a UC Number removed', n;
end $$;
