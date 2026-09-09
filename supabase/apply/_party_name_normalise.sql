-- ---------------------------------------------------------------------------
-- ONE PARTY, ONE SPELLING.  DRY RUN BY DEFAULT — change nothing to look.
--
-- Reported 2026-09-09: "CAPTAIN SAURABH KALIA MEMORIAL KAYDEE HOSPITAL — This
-- party has Products, but this Party Doesnt — Captain Saurabh Kalia Memorial
-- Kaydee Hospital. NORMALIZE it."
--
-- WHERE THE DUPLICATE ACTUALLY LIVES, which is not where it looks. `parties`
-- cannot hold two spellings: 0076 put a unique index on
-- `lower(btrim(party_name))`. `products.party_name` has no such constraint and
-- is plain text — so an import can leave a machine filed under CAPITALS while
-- the party row spells it in Title Case. The party picker reads `parties`, the
-- product lookup read `products`, and the two never met.
--
-- THE APP NO LONGER DEPENDS ON THIS. As of v0.9.174 the product lookups match
-- the party case-insensitively, so both spellings find the machines and the
-- register is correct without running anything here. This is the tidy-up:
-- bring the stored text into line so exports, groupings and any future
-- equality match agree too.
--
-- THE PARTY ROW'S SPELLING WINS. It is the one the pickers offer and the one a
-- human maintains on Party Master; the product rows are import output. Nothing
-- changes meaning — only capitalisation.
--
-- WHAT IT DOES NOT TOUCH: calls, spare requests, contracts and covers each
-- carry their own `party_name` copy, written when the record was made.
-- Rewriting those would be editing history — a call says what the customer was
-- called on the day it was raised — and they read fine, because the app matches
-- case-insensitively.
--
-- TO APPLY: change v_apply to true and run again. Read the dry run first.
-- ---------------------------------------------------------------------------

do $norm$
declare
  v_apply boolean := false;    -- <<< true to actually write
  r       record;
  n_grp   integer := 0;
  n_rows  integer := 0;
  n_done  integer := 0;
begin
  for r in
    select p.party_name              as correct_spelling,
           pr.party_name             as product_spelling,
           count(*)                  as product_rows
      from public.products pr
      join public.parties  p
        on lower(btrim(p.party_name)) = lower(btrim(pr.party_name))
     where btrim(pr.party_name) <> btrim(p.party_name)   -- same party, different text
     group by 1, 2
     order by 3 desc, 1
  loop
    n_grp  := n_grp + 1;
    n_rows := n_rows + r.product_rows;
    raise notice '% product row(s): "%"  ->  "%"', r.product_rows, r.product_spelling, r.correct_spelling;

    if v_apply then
      update public.products
         set party_name = r.correct_spelling
       where btrim(party_name) = btrim(r.product_spelling);
      get diagnostics n_done = row_count;
      raise notice '   applied: % row(s)', n_done;
    end if;
  end loop;

  if n_grp = 0 then
    raise notice 'Every product already spells its party exactly as the party row does.';
  elsif not v_apply then
    raise notice '--- DRY RUN: % spelling(s) across % product row(s). NOTHING CHANGED. Set v_apply := true to write. ---', n_grp, n_rows;
  else
    raise notice '--- DONE: % spelling(s) normalised. ---', n_grp;
  end if;
end $norm$;

-- 1. Should be empty once applied: a product spelling that differs from its party.
select pr.party_name as product_spells_it, p.party_name as party_spells_it, count(*) as rows
  from public.products pr
  join public.parties p on lower(btrim(p.party_name)) = lower(btrim(pr.party_name))
 where btrim(pr.party_name) <> btrim(p.party_name)
 group by 1, 2 order by 3 desc;

-- 2. NOT fixed by the above, and worth seeing: a product whose party has no row
--    in Party Master at all. Nothing to normalise TO — somebody has to add the
--    party, or the import named it something the register does not know.
select pr.party_name as product_party_with_no_party_row, count(*) as rows
  from public.products pr
 where coalesce(btrim(pr.party_name), '') <> ''
   and not exists (select 1 from public.parties p
                    where lower(btrim(p.party_name)) = lower(btrim(pr.party_name)))
 group by 1 order by 2 desc limit 50;
