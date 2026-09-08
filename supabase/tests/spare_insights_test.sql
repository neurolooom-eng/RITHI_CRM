-- ===========================================================================
-- SPARE INSIGHTS (0148) + the Part Master's own fields (0149).
--
-- The figures on this dashboard sit next to consumption people act on, so what
-- is tested is mostly the ways a total can quietly be WRONG:
--
--   1. the five breakdowns agree with each other and with the total
--   2. a part nobody has classified is UNCLASSIFIED, never folded into a bucket
--   3. a VOIDED line is not consumption
--   4. the window is inclusive of both ends, and excludes what falls outside
--   5. the category vocabulary is the file's four, and nothing else is accepted
--   6. it reads as the READER — a definer here would show one engineer the
--      whole company's consumption
--
-- Run after _stub.sql + every migration.
-- Every error printed is labelled `expect ERROR` -- anything else is a failure.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off

update public.harness set uid = null, email = null;

delete from public.spare_consumption where ucn like 'SI-%';
delete from public.field_calls       where ucn like 'SI-%';
delete from public.parts             where code like 'SIP-%';
delete from public.handstock_opening where engineer = 'SI ENG';

insert into public.field_calls (ucn, call_type, product_name, serial, reg_date, party_name,
                                complaint_reported, standard_complaint, allocated_to, item_status)
values ('SI-1','FIELD','ORION-G','1',current_date,'HOSP A','x','y','SI ENG','AMC'),
       ('SI-2','FIELD','MONNAL T60','2',current_date,'HOSP B','x','y','SI ENG','OGP');

-- Two classified parts, and one consumed part that is NOT in the master at all
-- — which is the commonest way a category goes missing in practice.
insert into public.parts (code, description, item_detail, category, product, purchase_cost) values
 ('SIP-1','HEPA FILTER','SIP-1|HEPA FILTER','Consumable','MT75', 1500),
 ('SIP-2','O2 SENSOR','SIP-2|O2 SENSOR','Spare','ORG', 8200);

insert into public.handstock_opening (engineer, part, qty, as_of, source) values
 ('SI ENG','SIP-1|HEPA FILTER',100,current_date-60,'Opening'),
 ('SI ENG','SIP-2|O2 SENSOR',100,current_date-60,'Opening'),
 ('SI ENG','SIP-3|UNKNOWN THING',100,current_date-60,'Opening');

insert into public.spare_consumption (ucn, call_number, part, qty, engineer) values
 ('SI-1','C1','SIP-1|HEPA FILTER',  5,'SI ENG'),
 ('SI-1','C1','SIP-2|O2 SENSOR',    2,'SI ENG'),
 ('SI-2','C2','SIP-1|HEPA FILTER',  3,'SI ENG'),
 ('SI-2','C2','SIP-3|UNKNOWN THING',4,'SI ENG'),
 -- Booked and then corrected to nothing. Not consumption.
 ('SI-2','C2','SIP-2|O2 SENSOR',    9,'SI ENG');
update public.spare_consumption set qty = 0, adjustment_reason = 'Voided — wrong call'
 where ucn = 'SI-2' and part like 'SIP-2%';

\echo '--- 1. THE TOTAL, AND THE BREAKDOWNS THAT MUST AGREE WITH IT ---'
\echo 'expect: qty 14 (5+2+3+4; the voided 9 is not consumption), 4 lines,'
\echo 'expect: 3 parts, 2 calls — and every breakdown summing to the same 14.'
with i as (select public.spare_insights(current_date - 7, current_date) as j)
select (j->'total'->>'qty')::int                                                as total_qty,
       (j->'total'->>'lines')::int                                              as lines,
       (j->'total'->>'parts')::int                                              as parts,
       (j->'total'->>'calls')::int                                              as calls,
       (select sum((e->>'qty')::int) from jsonb_array_elements(j->'by_part') e)     as sum_by_part,
       (select sum((e->>'qty')::int) from jsonb_array_elements(j->'by_cover') e)    as sum_by_cover,
       (select sum((e->>'qty')::int) from jsonb_array_elements(j->'by_product') e)  as sum_by_product,
       (select sum((e->>'qty')::int) from jsonb_array_elements(j->'by_category') e) as sum_by_category
  from i;

\echo '--- 2. A PART NOBODY CLASSIFIED IS UNCLASSIFIED, NOT GUESSED ---'
\echo 'expect: Unclassified 4 — SIP-3 is consumed and is not in the part master'
\echo 'expect: at all. It is never folded into Consumable or Spare: 86% of the'
\echo 'expect: Item Master has no category, so a tidy split would be a fiction.'
with i as (select public.spare_insights(current_date - 7, current_date) as j)
select e->>'category' as category, (e->>'qty')::int as qty
  from i, jsonb_array_elements(j->'by_category') e
 order by 2 desc;

\echo '--- 3. ...and the total says how much of itself is unclassified ---'
\echo 'expect: 4 of 14, on one line. This is on the screen for the same reason:'
\echo 'expect: the split cannot be read honestly without it.'
with i as (select public.spare_insights(current_date - 7, current_date) as j)
select (j->'total'->>'unclassified_qty')::int as unclassified_qty,
       (j->'total'->>'unclassified_lines')::int as unclassified_lines
  from i;

\echo '--- 4. THE COVER COMES FROM THE CALL ---'
\echo 'expect: AMC 7 and OGP 7 — the item status of the call the part went into,'
\echo 'expect: which is what decides whether it was billed.'
with i as (select public.spare_insights(current_date - 7, current_date) as j)
select e->>'cover' as cover, (e->>'qty')::int as qty
  from i, jsonb_array_elements(j->'by_cover') e order by 1;

\echo '--- 5. AND THE PRODUCT ---'
\echo 'expect: ORION-G 7, MONNAL T60 7.'
with i as (select public.spare_insights(current_date - 7, current_date) as j)
select e->>'product' as product, (e->>'qty')::int as qty
  from i, jsonb_array_elements(j->'by_product') e order by 1;

\echo '--- 6. A WINDOW THAT ENDS BEFORE THE DATA IS EMPTY ---'
\echo 'expect: 0. Not an error and not yesterday''s numbers — a window with'
\echo 'expect: nothing in it reports nothing.'
select (public.spare_insights(current_date - 400, current_date - 300)->'total'->>'qty')::int as qty;

\echo '--- 7. BOTH ENDS ARE INCLUDED ---'
\echo 'expect: 14. Today is booked today, and a window ending today must contain'
\echo 'expect: it — an exclusive end silently loses the most recent day, which is'
\echo 'expect: the one somebody is usually looking at.'
select (public.spare_insights(current_date, current_date)->'total'->>'qty')::int as qty;

\echo '--- 8. THE CATEGORY VOCABULARY IS THE FILE''S, AND CLOSED ---'
\echo 'expect ERROR: parts_category_check. Spare, Consumable, Product, Labour or'
\echo 'expect: empty — a fifth spelling would appear as its own slice of the'
\echo 'expect: chart and nobody would know which parts moved.'
insert into public.parts (code, description, item_detail, category)
values ('SIP-9','A PART','SIP-9|A PART','Spares');

\echo '--- 9. ...and empty stays legal ---'
\echo 'expect: the insert succeeds. 1,136 of 1,324 rows have no category, and a'
\echo 'expect: required column would have forced somebody to invent them.'
insert into public.parts (code, description, item_detail) values ('SIP-8','NO CATEGORY','SIP-8|NO CATEGORY');
select code, coalesce(nullif(category, ''), '(unclassified)') as category from public.parts where code = 'SIP-8';

\echo '--- 10. IT READS AS THE READER ---'
\echo 'expect: f — NOT security definer. The consumption policies decide what a'
\echo 'expect: reader sees; a definer here would hand an engineer the whole'
\echo 'expect: company''s figures through a dashboard.'
select p.prosecdef as is_definer
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname = 'spare_insights';

\echo '--- 11. THE PART MASTER CARRIES THE ITEM MASTER''S FIELDS ---'
\echo 'expect: all present — category, product, purchase_cost, purchase_cost_f'
\echo 'expect: and the superseded system''s own stamps, named source_* so they'
\echo 'expect: cannot be mistaken for this system''s created_at.'
select string_agg(column_name, ', ' order by column_name) as columns
  from information_schema.columns
 where table_schema = 'public' and table_name = 'parts'
   and column_name in ('category','product','purchase_cost','purchase_cost_f',
                       'source_added_by','source_added_on','source_modified_on','source_inactive_on');

-- Leave nothing behind.
delete from public.spare_consumption where ucn like 'SI-%';
delete from public.field_calls       where ucn like 'SI-%';
delete from public.parts             where code like 'SIP-%';
delete from public.handstock_opening where engineer = 'SI ENG';
