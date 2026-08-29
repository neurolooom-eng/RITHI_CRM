-- ===========================================================================
-- Hand stock — what an engineer is actually holding.
--
-- Every spare an engineer acknowledges (Dispatched → Received) goes INTO their
-- hand stock; every spare consumed against a call report comes OUT of it. The
-- difference is the stock in hand, per engineer, per part. Nothing new is
-- entered anywhere: both movements already exist, they had just never been put
-- side by side, so nobody could say what the field was carrying.
--
--   handstock_movements — one row per movement (IN receipt / OUT consumption).
--   handstock_balance   — the netted position per engineer + part.
--
-- Both run with the caller's rights, so the register is scoped exactly like the
-- tables under it: an engineer sees their own stock, an RM their team's, an
-- admin everyone's.
-- ===========================================================================

-- Consumption is keyed by the engineer's NAME (that is all the report form ever
-- wrote). The name is what the two sides are matched on; the email is carried
-- alongside so a rename can be untangled later, and so new rows can be matched
-- on it once the field has been filled for a while.
alter table public.spare_consumption
  add column if not exists engineer_email text default '';

create index if not exists spare_consumption_engineer_idx   on public.spare_consumption (lower(btrim(engineer)));
create index if not exists spare_consumption_created_at_idx on public.spare_consumption (created_at desc);
create index if not exists spare_requests_received_at_idx   on public.spare_requests (received_at) where received_at is not null;

-- ---------------------------------------------------------------------------
-- The two things a movement is matched on. Names arrive with stray case and
-- spacing from three different screens; a part is stored as its catalogue
-- string "CODE|Description", and only the CODE identifies it.
-- ---------------------------------------------------------------------------
create or replace function public.handstock_key(p text)
returns text language sql immutable as $$ select lower(btrim(coalesce(p, ''))) $$;

create or replace function public.part_code(p text)
returns text language sql immutable as $$ select upper(btrim(split_part(coalesce(p, ''), '|', 1))) $$;

grant execute on function public.handstock_key(text) to authenticated;
grant execute on function public.part_code(text)     to authenticated;

-- ---------------------------------------------------------------------------
-- Movements. A receipt is dated by the acknowledgement, not by the request:
-- the parts entered hand stock when the engineer said they arrived.
-- ---------------------------------------------------------------------------
create or replace view public.handstock_movements as
select
  'IN'::text                                        as direction,
  public.handstock_key(r.engineer)                  as engineer_key,
  coalesce(r.engineer, '')                          as engineer,
  coalesce(r.engineer_email, '')                    as engineer_email,
  public.part_code(l.part)                          as part_code,
  coalesce(l.part, '')                              as part,
  coalesce(l.qty, 0)                                as qty,
  r.received_at                                     as moved_at,
  coalesce(r.or_no, '')                             as ref,
  'Spare request'::text                             as ref_type,
  coalesce(r.uid, '')                               as ref_uid,
  coalesce(r.ucn, '')                               as ucn,
  coalesce(r.call_number, '')                       as call_number,
  coalesce(r.party_name, '')                        as party_name,
  coalesce(r.receipt_remarks, '')                   as remarks
from public.spare_request_lines l
join public.spare_requests r on r.uid = l.request_uid
where r.received_at is not null
union all
select
  'OUT'::text,
  public.handstock_key(c.engineer),
  coalesce(c.engineer, ''),
  coalesce(c.engineer_email, ''),
  public.part_code(c.part),
  coalesce(c.part, ''),
  coalesce(c.qty, 0),
  c.created_at,
  coalesce(nullif(btrim(c.call_number), ''), coalesce(c.ucn, '')),
  'Consumption'::text,
  ''::text,
  coalesce(c.ucn, ''),
  coalesce(c.call_number, ''),
  ''::text,
  ''::text
from public.spare_consumption c;

-- ---------------------------------------------------------------------------
-- The netted position. A negative on_hand is not an error to hide: it means
-- parts were consumed that this module never saw received (consumed from stock
-- carried before the receipt step existed, or a receipt nobody acknowledged),
-- and the register says so.
-- ---------------------------------------------------------------------------
create or replace view public.handstock_balance as
select
  m.engineer_key,
  max(m.engineer)                                                   as engineer,
  max(m.engineer_email)                                             as engineer_email,
  m.part_code,
  -- the catalogue string as the parts master spells it: prefer the receipt's,
  -- since a consumption row may carry an older or re-worded description.
  coalesce(max(m.part) filter (where m.direction = 'IN'), max(m.part))
                                                                    as part,
  sum(case when m.direction = 'IN'  then m.qty else 0 end)          as received,
  sum(case when m.direction = 'OUT' then m.qty else 0 end)          as consumed,
  sum(case when m.direction = 'IN'  then m.qty else -m.qty end)     as on_hand,
  max(m.moved_at) filter (where m.direction = 'IN')                 as last_in,
  max(m.moved_at) filter (where m.direction = 'OUT')                as last_out,
  max(m.moved_at)                                                   as last_movement,
  count(*)                                                          as movements
from public.handstock_movements m
where m.engineer_key <> '' and m.part_code <> ''
group by m.engineer_key, m.part_code;

alter view public.handstock_movements set (security_invoker = on);
alter view public.handstock_balance   set (security_invoker = on);

grant select on public.handstock_movements to authenticated;
grant select on public.handstock_balance   to authenticated;

-- ---------------------------------------------------------------------------
-- Module access. `mod:/handstock` is on no role until it is granted; append it
-- — additively — to every role that can already open the Spare Requests
-- register, leaving anything an admin has since edited alone.
-- ---------------------------------------------------------------------------
update public.app_roles
   set permissions = coalesce(permissions, '[]'::jsonb) || '["mod:/handstock"]'::jsonb,
       updated_at  = now()
 where coalesce(permissions, '[]'::jsonb) ? 'mod:/spare-requests'
   and not coalesce(permissions, '[]'::jsonb) ? 'mod:/handstock';
