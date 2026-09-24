-- ===========================================================================
-- THE CONTRACT AND THE INSTALLATION CALL BELONG TO THE MACHINE'S CURRENT OWNER.
--
-- The user, 2026-09-24: "Contract has to match the product, serial no, party..
-- Same with Installation calls -- it should match Product, serial no, party ..
-- and party is decided by sale entry or ownership transfer whichever is latest."
--
-- 0238 decided the party. This is the other half: what is ATTACHED to a machine
-- is whatever names the machine AND its current owner. So a re-sale removes the
-- previous owner's contract and installation call by ceasing to match them --
-- nothing is deleted, the registers are untouched, and a machine that returns
-- to that customer gets its cover back by itself.
--
-- MATCHED ON READ, NOT STORED. The party can change, and a stored attachment
-- would then disagree with it until something rewrote the row. It also keeps
-- every trigger off `contract_items` and `installation_calls`, where a per-row
-- rule would make a twelve-thousand-row import pay for this twelve thousand
-- times.
--
-- DISTINCT ON, NOT A LATERAL PER ROW. Yesterday's timeout was a correlated
-- subquery evaluated once per machine; these are one pass over each register,
-- joined. MEASURED AT THE REGISTER'S REAL SIZE before shipping this time.
--
-- THE LATEST ONE WINS where a customer has held the machine under more than one
-- contract: the contract that ends last, then the newest row. A machine with
-- several installation calls to the same owner takes the most recent.
--
-- THE STORED VALUES ARE KEPT as *_keyed, beside the matched ones, so the
-- migrated system's answer can still be read and compared.
-- ===========================================================================

drop view if exists public.product_database;

create view public.product_database as
with contract_pick as (
  select distinct on (mk_name, mk_serial, party_key)
         mk_name, mk_serial, party_key,
         mc_number, contract_type, contract_start, contract_end
    from (
      select lower(btrim(coalesce(ci.product_name, '')))  as mk_name,
             lower(btrim(coalesce(ci.serial_number, ''))) as mk_serial,
             lower(btrim(coalesce(nullif(btrim(coalesce(ci.party_name, '')), ''),
                                  ce.party_name, '')))    as party_key,
             ci.mc_number,
             coalesce(nullif(btrim(coalesce(ci.contract_type, '')), ''), ce.contract_type) as contract_type,
             coalesce(ci.contract_start, ce.contract_start) as contract_start,
             coalesce(ci.contract_end,   ce.contract_end)   as contract_end,
             ci.id
        from public.contract_items ci
        join public.contract_entries ce on ce.mc_number = ci.mc_number
    ) c
   where mk_name <> '' and mk_serial <> ''
   order by mk_name, mk_serial, party_key, contract_end desc nulls last, id desc
),
install_pick as (
  select distinct on (mk_name, mk_serial, party_key)
         mk_name, mk_serial, party_key, ucn
    from (
      select lower(btrim(coalesce(c.product_name, ''))) as mk_name,
             lower(btrim(coalesce(c.serial, '')))       as mk_serial,
             lower(btrim(coalesce(c.party_name, '')))   as party_key,
             c.ucn, c.reg_date, c.id
        from public.installation_calls c
       where coalesce(c.cancelled_at, null) is null
    ) x
   where mk_name <> '' and mk_serial <> ''
   order by mk_name, mk_serial, party_key, reg_date desc nulls last, id desc
)
select
p.id,
  p.party_name,
  p.item_name,
  p.serial_number,
  p.warranty_number,
  p.warranty_start,
  p.warranty_end,
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
  p.inst_date,
  p.inst_call_status,
  p.report,
  p.associated_accessory,

  -- ---- ITEM STATUS -------------------------------------------------------
  -- Warranty first, then the contract THAT MATCHES THIS OWNER, else OGP. A
  -- machine whose only contract names the previous customer is out of contract,
  -- which is the point of the whole change.
  case
    when p.warranty_end >= current_date then 'WGP'
    when cp.contract_end >= current_date then
      coalesce(public.contract_cover_code(nullif(btrim(cp.contract_type), '')),
               'CONTRACT (TYPE NOT RECORDED)')
    else 'OGP'
  end                                               as item_status,

  -- ---- THE CONTRACT, where it names this owner ---------------------------
  coalesce(cp.mc_number, '')                        as contract_number,
  cp.contract_start                                 as contract_start,
  cp.contract_end                                   as contract_end,
  coalesce(cp.contract_type, '')                    as contract_type,

  -- ---- THE INSTALLATION CALL, where it names this owner ------------------
  coalesce(ip.ucn, '')                              as inst_call,

  -- ---- SERVICE ENGINEER, always the Party Master's -----------------------
  coalesce(nullif(btrim(pa.service_engineer), ''), '') as service_engineer,

  -- What the MIGRATED SYSTEM said, kept beside the matched answers.
  p.item_status                                     as item_status_keyed,
  p.service_engineer                                as service_engineer_keyed,
  p.contract_number                                 as contract_number_keyed,
  p.inst_call                                       as inst_call_keyed
from public.products p
left join public.parties pa
       on pa.name_key = lower(btrim(coalesce(p.party_name, '')))
-- THE PARTY IS PART OF THE JOIN KEY. That one clause is the whole rule: a
-- contract or a call that names a different customer simply does not join.
left join contract_pick cp
       on cp.mk_name   = lower(btrim(coalesce(p.item_name, '')))
      and cp.mk_serial = lower(btrim(coalesce(p.serial_number, '')))
      and cp.party_key = lower(btrim(coalesce(p.party_name, '')))
left join install_pick ip
       on ip.mk_name   = lower(btrim(coalesce(p.item_name, '')))
      and ip.mk_serial = lower(btrim(coalesce(p.serial_number, '')))
      and ip.party_key = lower(btrim(coalesce(p.party_name, '')));

alter view public.product_database set (security_invoker = on);
grant select on public.product_database to authenticated;

comment on view public.product_database is
  'The install base as it stands NOW: the party from the later of the latest sale and the latest ownership transfer (0238), and the contract and installation call that name that machine AND that party. Item Status is warranty-first over the matching contract; the engineer is always the Party Master''s. The stored values are kept beside them as *_keyed.';
