-- ===========================================================================
-- A part is its ITEM DETAIL, not its code.
--
-- 0079/0081 keyed Part Master on the code. The real 1,324-row ITEM Master says
-- otherwise: YR134500 is used for TWO different parts —
--
--     YR134500|LOUDSPEAKER V2-MT50
--     YR134500|SPEAKER V2-MT75
--
-- — so keying on the code would have merged them and lost one, and the unique
-- index on the code would have REFUSED the load outright. `Item Details` is
-- distinct across all 1,324.
--
-- It is also the right key on its own merits: `CODE|Description` is how a part
-- is referenced everywhere else — on a consumption line, in hand stock, in the
-- engineer's picker — so the register now keys on the same thing the rest of
-- the system does.
--
-- The code keeps an index for lookups; it just is not unique, because it isn't.
-- ===========================================================================

alter table public.parts
  add column if not exists item_detail_key text generated always as (lower(btrim(item_detail))) stored;

-- The code is NOT unique in the real register — drop the constraint that says
-- it is, or the ITEM Master cannot be loaded at all.
drop index if exists public.parts_code_key_uniq;

do $$
begin
  if exists (select 1 from public.parts group by item_detail_key having count(*) > 1) then
    raise notice 'parts holds duplicate item details — de-duplicate, then re-run this file to build parts_item_detail_key_uniq.';
  else
    create unique index if not exists parts_item_detail_key_uniq on public.parts (item_detail_key);
  end if;
end $$;

create index if not exists parts_item_detail_key_idx on public.parts (item_detail_key);
