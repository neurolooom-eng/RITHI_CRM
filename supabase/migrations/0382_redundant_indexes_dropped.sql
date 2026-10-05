-- ===========================================================================
-- EIGHT INDEXES THAT COST WRITES AND SPACE AND SERVE NO LOOKUP OF THEIR OWN
-- (2026-10-05, the user: "I want efficient indexing, cost efficient").
--
-- Measured on a database built from every migration: 469 indexes in public,
-- and these eight are each a LEADING PREFIX of a wider btree on the same table
-- with the same predicate -- so every equality or range lookup they could
-- serve, the wider index serves from its first column(s). What they cost is
-- real: every INSERT and UPDATE on the table maintains them (a bulk load of
-- 20,000 machines writes products_machine_idx AND products_machine_key_uniq,
-- the same key twice), and they take their own disk and shared buffers.
--
--   masters_name_idx            (name)          <  masters_active_idx (name, active)
--   reports_ucn_idx             (ucn)           <  reports_ucn_entry_idx (ucn, updated_at desc, id desc)
--   reports_call_number_idx     (call_number)   <  reports_call_number_entry_idx (...)
--   material_returns_uid_idx    (uid)           <  material_returns_uid_part_idx (uid, part_code(part), ...)
--   documents_kind_idx          (kind)          <  documents_dated_idx (kind, dated desc)
--   handstock_opening_eng_idx   (engineer_key)  <  handstock_opening_uniq (engineer_key, part_code, source_key)
--   products_machine_idx        (machine_key)   =  products_machine_key_uniq (machine_key)
--   parts_item_detail_key_idx   (item_detail_key) = parts_item_detail_key_uniq (item_detail_key)
--
-- None is unique and none is an upsert target (check:upserts asks the UNIQUE
-- ones), so no ON CONFLICT changes. The eight `create index` lines are REMOVED
-- from the migrations that wrote them (0001, 0002, 0010, 0039, 0070, 0074,
-- 0079, 0082) as well as dropped here -- `if not exists` guards a NAME, and a
-- bundle replay would otherwise put each one straight back. check:replay does
-- not compare indexes, which is why both halves are needed; _status.sql row
-- 315 asserts they are absent.
--
-- NOT TOUCHED, deliberately: the 33 trigram GIN indexes on the three call
-- tables. They are the biggest indexes on the project and the global search
-- ORs eleven columns through them -- whether a single search column could
-- replace most of them is a decision for the LIVE sizes and scan counts, which
-- only the project knows: run supabase/apply/_which_indexes_earn_their_keep.sql.
-- ===========================================================================

drop index if exists public.masters_name_idx;
drop index if exists public.reports_ucn_idx;
drop index if exists public.reports_call_number_idx;
drop index if exists public.material_returns_uid_idx;
drop index if exists public.documents_kind_idx;
drop index if exists public.handstock_opening_eng_idx;
drop index if exists public.products_machine_idx;
drop index if exists public.parts_item_detail_key_idx;
