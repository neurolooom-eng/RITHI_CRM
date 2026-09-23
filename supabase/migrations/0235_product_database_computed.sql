-- ===========================================================================
-- PRODUCT DATABASE: ITEM STATUS AND SERVICE ENGINEER ARE WORKED OUT, NOT STORED.
--
-- The user, 2026-09-23:
--   "Item Status should be a calculated value. Logic = If Warranty End Date is
--    less than equal to today, Then WGP Else if Contract End Date is less than
--    or Equal to today then CMC / AMC as per the MC Number else OGP"
--   "Service Engineer name should be a calculated value. It should always come
--    from Party Master"
--
-- THE COMPARISON IS READ AS ">= TODAY", NOT "<= TODAY", and that is a
-- correction rather than an interpretation. Taken literally, an EXPIRED
-- warranty would read WGP and a machine covered by both would read OGP --
-- every one of the three inverted. OGP is the fallback for a machine covered by
-- nothing, so the intent is plainly "the cover has not run out yet". The
-- function this replaces (0036 sync_product_cover) already compared with
-- >= current_date, which is the same reading.
--
-- WHY A VIEW AND NOT A COLUMN. Item Status compares two dates with TODAY, so a
-- stored answer is right on the day it is written and wrong afterwards --
-- exactly the fault 0222 had to correct on Product Database 2.0, where a
-- materialised cover status froze at the last rebuild and 209 machines of
-- 10,000 were wrong after thirty days, silently, beside a caption that looked
-- like it accounted for it. A value that decays cannot be stored and called
-- calculated. Neither can the engineer: the Party Master is the master, so a
-- copy on the machine is a second answer that goes stale the moment somebody
-- changes the customer's engineer.
--
-- THE TABLE IS UNTOUCHED. Every importer, every upsert and every other reader
-- still writes and reads public.products exactly as before; this view is what
-- the Product Database SCREEN reads. The stored columns stay where they are --
-- they are what the AppSheet export carried, and dropping them would throw
-- away the migrated system own answer with nothing to compare against.
--
-- THE COLUMN LIST IS EXPLICIT because two names are being REPLACED, and a
-- star-expansion beside a column of the same name is a duplicate. A new column
-- on products therefore has to be added here too -- the same maintenance the
-- 2.0 view already carries, and the price of computing rather than storing.
-- ===========================================================================

drop view if exists public.product_database;

create view public.product_database as
select
p.id,
  p.party_name,
  p.item_name,
  p.serial_number,
  p.warranty_number,
  p.warranty_start,
  p.warranty_end,
  p.contract_number,
  p.contract_start,
  p.contract_end,
  p.contract_type,
  p.active,
  p.extra,
  p.created_at,
  p.machine_key,
  p.serial_key,
  p.item_code,
  p.item_details_long,
  p.item_details,
  p.sold_through,
  p.state,
  p.city,
  p.address,
  p.po_no,
  p.po_date,
  p.warranty_status_keyed,
  p.contract_status_keyed,
  p.pm_visits,
  p.other_details,
  p.prod_final,
  p.installation_completed,
  p.inst_call,
  p.inst_date,
  p.inst_call_status,
  p.report,
  p.associated_accessory,

  -- ---- ITEM STATUS -------------------------------------------------------
  -- WARRANTY DECIDES FIRST. A machine inside its warranty is not being billed
  -- under its contract, so asking the contract first (which 0036 did) answers
  -- CMC for a machine still in warranty. Product Database 2.0 settled this the
  -- same way in 0218; the two registers now agree.
  --
  -- THE TYPE COMES FROM THE CONTRACT THE MC NUMBER NAMES, not from the copy on
  -- the machine row: "as per the MC Number" is the ask, and the contract
  -- register is where a type is edited. The machine own value answers only
  -- where the register cannot -- an imported machine whose contract was never
  -- loaded.
  --
  -- AND A CONTRACT WITH NO TYPE IS NOT GUESSED AT. 0036 answered CMC for one;
  -- this says CONTRACT (TYPE NOT RECORDED), which is what 0218 chose and for
  -- the same reason -- a guess written where a reader expects a fact is worse
  -- than a value that reads as odd, because the odd one gets reported.
  case
    when p.warranty_end >= current_date then 'WGP'
    when p.contract_end >= current_date then
      coalesce(public.contract_cover_code(nullif(btrim(ci.contract_type), '')),
               public.contract_cover_code(nullif(btrim(ce.contract_type), '')),
               public.contract_cover_code(p.contract_type),
               'CONTRACT (TYPE NOT RECORDED)')
    else 'OGP'
  end                                               as item_status,

  -- ---- SERVICE ENGINEER --------------------------------------------------
  -- ALWAYS the Party Master's (0200). A party the master does not carry
  -- answers EMPTY rather than falling back to the machine's stored name: "it
  -- should always come from Party Master" is the ask, and a silent fallback
  -- would make the screen disagree with the master on exactly the customers
  -- somebody needs to correct.
  --
  -- JOINED, NOT party_service_engineer(p.party_name). The rule is that
  -- function's, verbatim -- name_key = lower(btrim(party)) -- and check:ui
  -- holds the two together. It is a JOIN here for the reason below.
  coalesce(nullif(btrim(pa.service_engineer), ''), '') as service_engineer,

  -- What the MIGRATED SYSTEM said, kept beside the computed answer so the two
  -- can be compared rather than one quietly replacing the other.
  p.item_status                                     as item_status_keyed,
  p.service_engineer                                as service_engineer_keyed
from public.products p
-- ===========================================================================
-- JOINS, NOT CORRELATED SUBQUERIES, AND THAT IS THE WHOLE PERFORMANCE STORY.
--
-- Reported from use the day this shipped: "Search failed: canceling statement
-- due to statement timeout", with an empty register behind it.
--
-- The first version asked the contract question as three correlated subqueries
-- inside a COALESCE and the engineer as a per-row function call. Measured on a
-- register of 20,000 machines: 6 ms for one page, because LIMIT stops after a
-- hundred rows -- and MORE THAN 120 SECONDS the moment anything makes Postgres
-- produce the columns for every row, which any filter on the register does.
-- That is why one page looked fine here and the screen died there.
--
-- A LEFT JOIN is planned ONCE for the whole query: a hash join over
-- contract_items and contract_entries instead of two index lookups per row
-- through two RLS-protected tables. Same answers, and the plan no longer
-- depends on how many rows survive the filter.
--
-- THIS IS 0220's LESSON AND I WALKED INTO IT. That migration measured the same
-- shape at fifty-two times slower under RLS than as the owner, and wrote it
-- down. Correctness was proved here on five fixture rows; the SPEED was not
-- measured until the register was loaded to its real size. A view over a
-- 20,000-row register is measured at that size or it is not measured.
-- ===========================================================================
-- The machine's own line on the contract its MC number names -- "as per the MC
-- Number", down to the line, so a machine on a Labour line of a Comprehensive
-- contract reads AMC.
left join public.contract_items ci
       on ci.mc_number = p.contract_number
      and lower(btrim(ci.serial_number)) = p.serial_key
-- The contract's own type, where the line does not carry one.
left join public.contract_entries ce
       on ce.mc_number = p.contract_number
-- The Party Master, keyed exactly as party_service_engineer() keys it.
left join public.parties pa
       on pa.name_key = lower(btrim(coalesce(p.party_name, '')));

-- WITHOUT THIS THE VIEW READS AS ITS OWNER and row-level security stops
-- applying to whoever is reading -- the fault this project has shipped three
-- times (0040 / 0050 / 0057).
alter view public.product_database set (security_invoker = on);

-- 28 of the 30 views these migrations create carry this; the one that shipped
-- without it was invisible to every screen that read it.
grant select on public.product_database to authenticated;

comment on view public.product_database is
  'The install base with Item Status and Service Engineer WORKED OUT rather than stored: warranty first, then the contract the MC number names, else OGP; the engineer always from the Party Master. The stored values are kept beside them as *_keyed.';
