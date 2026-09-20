-- ===========================================================================
-- PRODUCT DATABASE 2.0 — THE MACHINE AS THE REGISTERS TOGETHER DESCRIBE IT.
--
--   The user, 2026-09-20: "All unique product+serial no should be listed
--   [ Source = Warranty Sale Details, Contract Details, Additional Entries ],
--   then arrange these sources + Ownership Transfer to come to a conclusion on
--   the Party, Warranty period, contract period, then derive the item status
--   based on the warranty period & Contract period."
--
-- THE EXISTING `products` TABLE IS NOT TOUCHED, and neither is `machine_cover`.
-- This is a VIEW beside them ("Do Not disturb the current product Database,
-- create this as Product Database 2.0"), so nothing that reads either changes
-- behaviour and the two can be compared on live data before anything moves.
--
-- WHY IT IS NOT `machine_cover` WITH MORE COLUMNS. That view answers the same
-- question and gets three things differently, each of which this one had to
-- settle rather than inherit:
--
--   1. IT KEYS ON THE SERIAL ALONE (`lower(btrim(serial_number))`). This
--      project's own `src/lib/machine.ts` says why that is wrong -- "a machine
--      is its MODEL plus its SERIAL, never the serial alone... the install base
--      has eleven machines numbered 219" -- and a serial-only key MERGES those
--      eleven into one row wearing one machine's cover. This view keys on
--      product + serial.
--   2. IT READS TWO REGISTERS. Additional Entries (0073 — the machines
--      recovered by hand, which exist precisely because the two registers
--      missed them) and Ownership Transfer (0072) are not consulted at all, so
--      a machine that changed hands still reads as the original buyer's.
--   3. ITS STATUS PUTS CONTRACT FIRST: `when contract_end >= today then
--      contract_type when warranty_end >= today then 'WGP'`. The user's rule is
--      the other way round -- "If it's under warranty then WGP, if it's under
--      Contract check the type" -- which changes the answer for every machine
--      that is inside both, and a machine in warranty is not being billed under
--      its contract.
--
-- EVERY DERIVED FIELD SAYS WHERE IT CAME FROM. `party_from`, `warranty_from`,
-- `contract_from` and `item_status_reason` are columns, not comments: a value
-- assembled from five registers that cannot show its evidence is one nobody can
-- check, and this whole view is an opinion about somebody's machine.
--
-- NOTHING IS INVENTED. A machine with no warranty date anywhere gets no
-- warranty, not a guessed one; an unrecognised contract type is carried through
-- UNCHANGED rather than bucketed (the 0208 rule -- "a guess written into a
-- quality record is worse than a value that reads as odd").
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- WHICH MACHINE — the SQL twin of `machineKey()` in `src/lib/machine.ts`.
--
-- Squashed, not merely lowercased: "ORION-G", "ORION G" and "ORIONG" are one
-- model, and splitting them would list one machine three times with a third of
-- its cover on each. That is the client's rule and `check:ui` compares the two
-- word for word, so there is ONE definition of which machine this is.
--
-- The generated `machine_key` columns on `products` and
-- `product_additional_entries` are `lower(btrim(...))` and are LEFT ALONE: they
-- exist to make those tables' own uniqueness indexes, and changing a stored
-- generated column is a rewrite of both tables for no gain here.
-- ---------------------------------------------------------------------------
create or replace function public.machine_key(p_product text, p_serial text)
returns text language sql immutable as $$
  select regexp_replace(lower(coalesce(p_product, '')), '[^a-z0-9]', '', 'g')
      || '|'
      || regexp_replace(lower(coalesce(p_serial, '')),  '[^a-z0-9]', '', 'g')
$$;
comment on function public.machine_key(text, text) is
  'Which machine: model + serial, squashed. The SQL twin of machineKey() in src/lib/machine.ts; check:ui compares them.';

-- ---------------------------------------------------------------------------
-- WHAT A CONTRACT COVERS — labour or comprehensive.
--
--   The user: "check the type of contract - labor/amc maps to AMC,
--   Comprehensive/CMC maps to CMC".
--
-- `cover_code()` (0208) already knows AMC and CMC; it does not know LABOUR or
-- COMPREHENSIVE, which are the words the contract register actually carries.
-- This adds those two families and then DEFERS to cover_code for everything
-- else, so there is still one vocabulary and one place that decides it.
--
-- AN UNRECOGNISED TYPE COMES BACK UNCHANGED. `machine_cover` defaults it to
-- 'CMC' (`coalesce(nullif(contract_type, ''), 'CMC')`), which silently upgrades
-- a labour contract to comprehensive on the strength of a blank cell -- and a
-- guess written into a quality record is worse than a value that reads as odd,
-- because the odd one gets reported.
-- ---------------------------------------------------------------------------
create or replace function public.contract_cover_code(p_type text)
returns text language sql immutable as $$
  select case
    when p_type is null or btrim(p_type) = '' then null
    when regexp_replace(lower(p_type), '[^a-z0-9]', '', 'g') in
         ('labour', 'labor', 'labourcontract', 'laborcontract',
          'amc', 'annualmaintenancecontract', 'underamc', 'labouramc', 'laboramc')
      then 'AMC'
    when regexp_replace(lower(p_type), '[^a-z0-9]', '', 'g') in
         ('comprehensive', 'comprehensivecontract', 'cmc',
          'comprehensivemaintenancecontract', 'undercmc')
      then 'CMC'
    else public.cover_code(p_type)
  end
$$;
comment on function public.contract_cover_code(text) is
  'Contract type -> AMC (labour) or CMC (comprehensive); anything else is returned unchanged, never bucketed.';

-- ---------------------------------------------------------------------------
-- WHEN A PERIOD ENDS — the application's rule, in SQL.
--
-- `addPeriod(start, 0, months)` in `src/lib/dates.ts` is what the app uses, and
-- it carries JAVASCRIPT's month arithmetic: `setMonth` OVERFLOWS rather than
-- clamping, so 31 January plus one month is 3 March (Feb 31 rolls forward), not
-- 28 February. Postgres's `+ interval '1 month'` CLAMPS to 28 February.
--
-- A plain `+ make_interval(months => n)` here would therefore disagree with
-- every end date the application has ever computed, on exactly the month-end
-- starts that a yearly warranty is most likely to have. So the overflow is
-- reproduced: go to the first of the start month, add the months, then add back
-- the day-of-month, then step back one day.
--
-- It is PROVED against `addPeriod` rather than reasoned about -- see
-- `product_database_v2_test.sql`, which walks every start day of every month
-- against a range of periods.
-- ---------------------------------------------------------------------------
create or replace function public.cover_period_end(p_start date, p_months numeric)
returns date language sql immutable as $$
  select case
    when p_start is null or p_months is null or p_months <= 0 then null
    else (date_trunc('month', p_start)::date
          + make_interval(months => round(p_months)::int)
          + make_interval(days   => extract(day from p_start)::int - 1))::date
         - 1
  end
$$;
comment on function public.cover_period_end(date, numeric) is
  'Start + period - 1 day, reproducing addPeriod() in src/lib/dates.ts including its JavaScript month overflow.';

-- ===========================================================================
-- THE VIEW.
--
-- One row per MACHINE that any of the three registers names. Everything else
-- is assembled around that row, and every assembled value carries the name of
-- the register it came from.
-- ===========================================================================
create or replace view public.product_database_v2 as
with w as (
  -- THE WARRANTY SALE — the machine's birth record. Latest by the cover it
  -- grants, so a re-sale or a corrected row wins over the one it replaced.
  select distinct on (public.machine_key(product_name, serial_number))
         public.machine_key(product_name, serial_number) as mkey,
         id, product_name, product_code, serial_number, party_name, sa_number,
         warranty_start, warranty_end, warranty_years, warranty_months,
         sale_entry_date, invoice_date, state, city, engineer
    from public.warranty_sale_details
   where coalesce(btrim(serial_number), '') <> ''
     and coalesce(btrim(product_name), '')  <> ''
   order by 1, warranty_end desc nulls last, id desc
), c as (
  -- THE CONTRACT — latest by the cover it grants, so a renewal wins over the
  -- contract it succeeded (0187/FRS-056: the successor starts the day after).
  select distinct on (public.machine_key(product_name, serial_number))
         public.machine_key(product_name, serial_number) as mkey,
         id, product_name, product_code, serial_number, party_name, mc_number,
         contract_type, contract_start, contract_end, contract_years,
         contract_months, contract_entry_date
    from public.contract_details
   where coalesce(btrim(serial_number), '') <> ''
     and coalesce(btrim(product_name), '')  <> ''
   order by 1, contract_end desc nulls last, id desc
), a as (
  -- ADDITIONAL ENTRIES (0073) — the machines recovered by hand because neither
  -- register had them. Already one row per machine by its own unique index.
  select public.machine_key(item_name, serial_number) as mkey,
         id, item_name, serial_number, party_name,
         warranty_number, warranty_start, warranty_end,
         contract_number, contract_type, contract_start, contract_end, created_at
    from public.product_additional_entries
   where coalesce(btrim(serial_number), '') <> ''
     and coalesce(btrim(item_name), '')     <> ''
), o as (
  -- OWNERSHIP TRANSFER (0072) — the explicit, dated record that the machine
  -- changed hands. Latest transfer wins; a machine can move more than once.
  select distinct on (public.machine_key(item_name, serial_number))
         public.machine_key(item_name, serial_number) as mkey,
         id, to_party, from_party, transfer_date, reference_no
    from public.ownership_transfers
   where coalesce(btrim(serial_number), '') <> ''
     and coalesce(btrim(item_name), '')     <> ''
   order by 1, transfer_date desc nulls last, id desc
), inst as (
  -- THE INSTALLATION CALL, which is where a warranty actually starts.
  --
  --   The user: "for warranty Start date check the installation call detail -
  --   in feedback/reporting there is a question - Warranty Start Date -- if
  --   it's call solved date then take the warranty Start date from the call
  --   solved date".
  --
  -- The answer is read through `imported_ts()` (0215) rather than cast: it is a
  -- cell somebody typed, and a bare `::date` on "n/a" would not spoil one row,
  -- it would take THE WHOLE VIEW down. The call's solved date is the fallback,
  -- which is the same date the question is asking the engineer to confirm.
  select distinct on (public.machine_key(cl.product_name, cl.serial))
         public.machine_key(cl.product_name, cl.serial) as mkey,
         cl.ucn,
         public.imported_ts(fb.answers, 'Warranty Start Date?')::date as answered_start,
         case when cl.open_state = 'Solved' then cl.last_visit_at::date end as solved_on
    from public.calls cl
    left join public.feedback fb on fb.ucn = cl.ucn
   where upper(coalesce(cl.call_type, '')) like 'INSTALL%'
     and coalesce(btrim(cl.serial), '')       <> ''
     and coalesce(btrim(cl.product_name), '') <> ''
   order by 1, cl.last_visit_at desc nulls last, cl.ucn desc
), keys as (
  select mkey from w union select mkey from c union select mkey from a
), base as (
  select
    k.mkey,
    coalesce(w.product_name, c.product_name, a.item_name)        as product_name,
    coalesce(w.serial_number, c.serial_number, a.serial_number)  as serial_number,
    coalesce(w.product_code, c.product_code)                     as product_code,
    -- ---- the warranty, in the order the user gave -------------------------
    coalesce(i.answered_start, i.solved_on, a.warranty_start, w.warranty_start) as warranty_start,
    coalesce(w.warranty_months, (w.warranty_years * 12)::int)                   as warranty_months,
    a.warranty_end  as a_warranty_end,
    w.warranty_end  as w_warranty_end,
    case when i.answered_start is not null then 'Installation call ' || i.ucn
         when i.solved_on      is not null then 'Installation call ' || i.ucn || ' (solved date)'
         when a.warranty_start is not null then 'Additional entry'
         when w.warranty_start is not null then 'Warranty sale ' || coalesce(w.sa_number, '')
         else null end                                           as warranty_from,
    -- ---- the contract -----------------------------------------------------
    coalesce(c.contract_start, a.contract_start)                 as contract_start,
    coalesce(c.contract_months, (c.contract_years * 12)::int)    as contract_months,
    coalesce(c.contract_end, a.contract_end)                     as contract_end_stored,
    coalesce(c.contract_type, a.contract_type)                   as contract_type_raw,
    coalesce(c.mc_number, a.contract_number)                     as contract_number,
    case when c.id is not null then 'Contract ' || coalesce(c.mc_number, '')
         when a.contract_start is not null or a.contract_end is not null then 'Additional entry'
         else null end                                           as contract_from,
    -- ---- who owns it ------------------------------------------------------
    p.party_name, p.party_from,
    w.sa_number, w.state, w.city, w.engineer,
    o.from_party, o.to_party, o.transfer_date, o.reference_no,
    (w.mkey is not null) as in_warranty_register,
    (c.mkey is not null) as in_contract_register,
    (a.mkey is not null) as in_additional_entries,
    i.ucn as installation_ucn
  from keys k
  left join w on w.mkey = k.mkey
  left join c on c.mkey = k.mkey
  left join a on a.mkey = k.mkey
  left join o on o.mkey = k.mkey
  left join inst i on i.mkey = k.mkey
  -- WHOSE MACHINE IS IT: the LATEST DATED EVIDENCE wins, not a fixed order of
  -- registers. A machine sold in 2020, transferred in 2021 and then put under a
  -- new contract in 2024 belongs to whoever the 2024 contract names -- an
  -- ownership transfer is not permanently the last word, it is one dated claim
  -- among several. Ties break towards the record that exists SPECIFICALLY to
  -- say the machine changed hands.
  left join lateral (
    select v.party_name, v.party_from
      from (values
        (o.to_party,    'Ownership transfer ' || coalesce(o.reference_no, ''), o.transfer_date,           1),
        (a.party_name,  'Additional entry',                                    a.created_at::date,        2),
        (c.party_name,  'Contract ' || coalesce(c.mc_number, ''),              c.contract_start,          3),
        (w.party_name,  'Warranty sale ' || coalesce(w.sa_number, ''),
                        coalesce(w.sale_entry_date::date, w.invoice_date),                                4)
      ) as v(party_name, party_from, on_date, rank)
     where coalesce(btrim(v.party_name), '') <> ''
     order by v.on_date desc nulls last, v.rank
     limit 1
  ) p on true
)
select
  b.mkey                                   as machine_key,
  b.product_name,
  b.serial_number,
  b.product_code,
  b.party_name,
  b.party_from,
  -- ---- warranty ----------------------------------------------------------
  b.warranty_start,
  b.warranty_months,
  -- DERIVED where the start and the period are both known -- which is what the
  -- user asked for ("derive at the warranty end date") -- and the register's
  -- own end date otherwise, so a machine whose period nobody recorded still
  -- shows the cover it was sold.
  case when b.warranty_start is not null and b.warranty_months is not null
       then public.cover_period_end(b.warranty_start, b.warranty_months)
       else coalesce(b.a_warranty_end, b.w_warranty_end) end     as warranty_end,
  b.warranty_from,
  public.cover_state(
    case when b.warranty_start is not null and b.warranty_months is not null
         then public.cover_period_end(b.warranty_start, b.warranty_months)
         else coalesce(b.a_warranty_end, b.w_warranty_end) end)  as warranty_state,
  -- ---- contract ----------------------------------------------------------
  b.contract_number,
  b.contract_type_raw                                            as contract_type_as_recorded,
  public.contract_cover_code(b.contract_type_raw)                as contract_type,
  b.contract_start,
  b.contract_months,
  coalesce(b.contract_end_stored,
           public.cover_period_end(b.contract_start, b.contract_months)) as contract_end,
  b.contract_from,
  public.cover_state(
    coalesce(b.contract_end_stored,
             public.cover_period_end(b.contract_start, b.contract_months))) as contract_state,
  -- ---- what it is under TODAY --------------------------------------------
  -- WARRANTY FIRST. The user's rule, and the opposite of `machine_cover`: a
  -- machine inside its warranty is not being billed under its contract, so the
  -- contract does not decide its status while the warranty runs.
  case
    when coalesce(
           case when b.warranty_start is not null and b.warranty_months is not null
                then public.cover_period_end(b.warranty_start, b.warranty_months)
                else coalesce(b.a_warranty_end, b.w_warranty_end) end,
           '-infinity'::date) >= current_date
      then 'WGP'
    when coalesce(b.contract_end_stored,
                  public.cover_period_end(b.contract_start, b.contract_months),
                  '-infinity'::date) >= current_date
      -- A CONTRACT WITH NO TYPE IS NOT GUESSED AT. `machine_cover` calls it
      -- CMC, which upgrades a labour contract to comprehensive on the strength
      -- of a blank cell; this says so instead, because that row needs fixing.
      then coalesce(public.contract_cover_code(b.contract_type_raw), 'CONTRACT (TYPE NOT RECORDED)')
    else 'OGP'
  end                                                            as item_status,
  case
    when coalesce(
           case when b.warranty_start is not null and b.warranty_months is not null
                then public.cover_period_end(b.warranty_start, b.warranty_months)
                else coalesce(b.a_warranty_end, b.w_warranty_end) end,
           '-infinity'::date) >= current_date
      then 'inside warranty — ' || coalesce(b.warranty_from, 'source not recorded')
    when coalesce(b.contract_end_stored,
                  public.cover_period_end(b.contract_start, b.contract_months),
                  '-infinity'::date) >= current_date
      then 'under contract — ' || coalesce(b.contract_from, 'source not recorded')
    else 'no warranty and no contract covers today'
  end                                                            as item_status_reason,
  -- ---- where it came from, so the row can be checked ---------------------
  b.sa_number, b.state, b.city, b.engineer,
  b.from_party, b.to_party, b.transfer_date, b.reference_no,
  b.in_warranty_register, b.in_contract_register, b.in_additional_entries,
  b.installation_ucn
  from base b;

-- RE-ASSERTED, as it must be on every rebuild: without it the view reads as its
-- OWNER and row-level security stops applying to whoever is reading, with no
-- error and no warning (0040/0050/0057).
alter view public.product_database_v2 set (security_invoker = on);

comment on view public.product_database_v2 is
  'Product Database 2.0: one row per machine (model + serial) assembled from Warranty Sale Details, Contract Details, Additional Entries, Ownership Transfer and the installation call. Every derived value names the register it came from. Does not replace public.products.';
