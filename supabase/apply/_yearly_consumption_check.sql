-- ===========================================================================
-- WHICH YEARLY CONSUMPTION FILES ARE LOADED?
--
-- Every historical row records the body of data it came from, so the register
-- can answer this itself. `Consumption 2022` is the 22 H2 file: the Source is
-- taken from each row's own visit ENTRY date, which is what put it in that file.
--
-- Read-only. Expected, from the four exports:
--     Consumption 2022    5,233
--     Consumption 2023   10,261      (10,338 in the file — see below)
--     Consumption 2024   12,015      (11,938 of its own + 77 from the 2023 file)
--     Consumption 2025   12,292
--     total              39,801
--
-- 77 rows in the 2023 file were ENTERED in January for December work, so they
-- belong to 2024 and are counted there. That is deliberate.
-- ===========================================================================

select source,
       count(*)                                   as rows,
       min(consumed_at)::date                     as first_visit,
       max(consumed_at)::date                     as last_visit,
       round(sum(qty))                            as spares_used
  from public.spare_consumption_history
 group by source
 order by source;

select count(*) as total_rows, count(distinct source) as files_loaded
  from public.spare_consumption_history;

-- ---------------------------------------------------------------------------
-- IF THE TOTAL IS 39,724 RATHER THAN 39,801 you loaded before v0.9.64, whose
-- row reference was the position in the file alone — so the 2024 file's first
-- 77 rows overwrote those 77 December-entered ones instead of joining them.
--
-- To correct it: empty the four pools and load the four files again. They are
-- history, not a control point; nothing else points at these rows.
-- ---------------------------------------------------------------------------
-- delete from public.spare_consumption_history where source like 'Consumption 20%';
