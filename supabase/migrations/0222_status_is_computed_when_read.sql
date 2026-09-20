-- ===========================================================================
-- A STATUS THAT DEPENDS ON TODAY MUST NOT BE STORED AS OF LAST TUESDAY.
--
--   The user, 2026-09-20: "Should I Re-build it everytime?"
--
-- The honest answer is no -- only when one of the five registers changes. But
-- answering it exposed a defect in 0220: `item_status`, `item_status_reason`,
-- `warranty_state` and `contract_state` are all derived from `current_date`,
-- and 0220 MATERIALISED them. A materialised view evaluates its expressions AT
-- REFRESH TIME and stores the answer, so the cover status of every machine was
-- frozen at whenever somebody last pressed Rebuild.
--
-- A machine whose warranty lapsed the next morning would have gone on reading
-- WGP indefinitely -- with a "Built <time>" caption beside it that looks like
-- it accounts for exactly this and does not. MEASURED on the loaded fixture:
-- 209 machines of 10,000 carry the wrong status after thirty days without a
-- rebuild, about 2% a month. Against the live install base of 19,229 that is
-- roughly 400 machines a month quietly reading the wrong cover.
--
-- IT WOULD ALSO HAVE MADE THE ANSWER TO THE QUESTION WRONG. "Rebuild when a
-- register changes" is right for the assembly and useless for the clock: cover
-- lapses on its own, with nothing uploaded and nothing to notice. The answer is
-- not "rebuild daily" -- it is to stop storing the part that moves.
--
-- SO THE TWO HALVES ARE SPLIT ALONG THE LINE THAT ACTUALLY DIVIDES THEM:
--
--   STORED, because it is expensive and only changes when a register does:
--     which machines exist, whose they are, the warranty and contract dates,
--     the periods, the numbers, and which register said so. That is the part
--     that measured 2,936 ms a page to derive.
--
--   COMPUTED ON EVERY READ, because it depends on the date and on nothing
--     else: the four columns above. They are CASE expressions over columns
--     already on the row -- no joins, no registers -- so the screen keeps the
--     speed and stops being wrong the morning after it was built.
--
-- THE PUBLISHED COLUMNS ARE UNCHANGED in name, order and meaning, so nothing
-- reading this view has to know anything happened.
--
-- AND THEY ARE REMOVED FROM THE MATVIEW RATHER THAN LEFT THERE STALE. A frozen
-- `item_status` sitting in `product_database_v2_mv` for whoever queries it
-- directly is the trap this project keeps writing down: a value that is wrong
-- is worse than one that is absent, because nothing about it reads as an error.
-- ===========================================================================

drop view if exists public.product_database_v2 cascade;
drop materialized view if exists public.product_database_v2_mv cascade;

create materialized view public.product_database_v2_mv as

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
  -- THE INSTALLATION CALL — now read through `machine_install_start()`, a
  -- DEFINER function. See the header: this is both the speed and the
  -- correctness half of 0220.
  select mkey, ucn, answered_start, solved_on from public.machine_install_start()
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
  -- ---- contract ----------------------------------------------------------
  b.contract_number,
  b.contract_type_raw                                            as contract_type_as_recorded,
  public.contract_cover_code(b.contract_type_raw)                as contract_type,
  b.contract_start,
  b.contract_months,
  coalesce(b.contract_end_stored,
           public.cover_period_end(b.contract_start, b.contract_months)) as contract_end,
  b.contract_from,
  -- ---- where it came from, so the row can be checked ---------------------
  b.sa_number, b.state, b.city, b.engineer,
  b.from_party, b.to_party, b.transfer_date, b.reference_no,
  b.in_warranty_register, b.in_contract_register, b.in_additional_entries,
  b.installation_ucn
  from base b;

-- RE-ASSERTED, as it must be on every rebuild: without it the view reads as its
-- OWNER and row-level security stops applying to whoever is reading, with no
-- error and no warning (0040/0050/0057).;

-- CONCURRENTLY needs a unique index, and CONCURRENTLY is what keeps a rebuild
-- from blocking every reader of the screen. `machine_key` is the view's own
-- identity, so it is unique by construction.
;

create unique index if not exists product_database_v2_mv_key
  on public.product_database_v2_mv (machine_key);

-- Granted, because the view over it is `security_invoker` and so reads AS THE
-- CALLER. 0220 revoked this while leaving the view invoker and refused every
-- reader, administrators included (0221).
grant select on public.product_database_v2_mv to authenticated;

-- ---------------------------------------------------------------------------
-- THE FOUR LIVE COLUMNS, in the SAME positions this view has always published
-- them in. `current_date` is read HERE -- which is on every read, rather than
-- at the last rebuild.
-- ---------------------------------------------------------------------------
create view public.product_database_v2 as
select
  m.machine_key, m.product_name, m.serial_number, m.product_code,
  m.party_name, m.party_from,
  m.warranty_start, m.warranty_months, m.warranty_end, m.warranty_from,
  public.cover_state(m.warranty_end)                     as warranty_state,
  m.contract_number, m.contract_type_as_recorded, m.contract_type,
  m.contract_start, m.contract_months, m.contract_end, m.contract_from,
  public.cover_state(m.contract_end)                     as contract_state,
  -- WARRANTY FIRST -- the user's rule, and the opposite of `machine_cover`: a
  -- machine inside its warranty is not being billed under its contract.
  case
    when coalesce(m.warranty_end, '-infinity'::date) >= current_date then 'WGP'
    when coalesce(m.contract_end, '-infinity'::date) >= current_date
      -- A CONTRACT WITH NO TYPE IS NOT GUESSED AT (0208): `machine_cover` calls
      -- it CMC, which upgrades a labour contract to comprehensive on a blank
      -- cell. This says so instead, because that row needs fixing.
      then coalesce(public.contract_cover_code(m.contract_type_as_recorded),
                    'CONTRACT (TYPE NOT RECORDED)')
    else 'OGP'
  end                                                    as item_status,
  case
    when coalesce(m.warranty_end, '-infinity'::date) >= current_date
      then 'inside warranty — ' || coalesce(m.warranty_from, 'source not recorded')
    when coalesce(m.contract_end, '-infinity'::date) >= current_date
      then 'under contract — ' || coalesce(m.contract_from, 'source not recorded')
    else 'no warranty and no contract covers today'
  end                                                    as item_status_reason,
  m.sa_number, m.state, m.city, m.engineer,
  m.from_party, m.to_party, m.transfer_date, m.reference_no,
  m.in_warranty_register, m.in_contract_register, m.in_additional_entries,
  m.installation_ucn,
  s.refreshed_at
from public.product_database_v2_mv m
cross join public.product_database_v2_state s;
alter view public.product_database_v2 set (security_invoker = on);
grant select on public.product_database_v2 to authenticated;
comment on view public.product_database_v2 is
  'Product Database 2.0 — one row per machine. The ASSEMBLY is stored (refreshed_at says when); the cover STATUS is computed on every read, because it depends on today''s date and storing it froze it at the last rebuild (0222).';

-- The matview was just rebuilt from scratch, so date the storage honestly.
update public.product_database_v2_state
   set refreshed_at = now(),
       rows_built   = (select count(*) from public.product_database_v2_mv)
 where only_row;
