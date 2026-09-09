-- ---------------------------------------------------------------------------
-- THE PART CATEGORY IS SOURCE DATA, NOT A CONTROLLED VOCABULARY.
--
-- Reported 2026-09-09, loading the Item Master through Bulk Uploads:
--
--   new row for relation "parts" violates check constraint
--   "parts_category_check" (row ~174) (173 written before it stopped.)
--
-- 0148 added that check with the four words the Item Master uses. The words
-- were right; the PLACE was wrong. Two things went wrong together and only one
-- of them was the importer's:
--
--   1. The importer's normaliser ran only where the file left the cell EMPTY,
--      so it never saw the values it existed to title-case, and every non-blank
--      row went in as the file's own SPARE / PRODUCT / CONSUMABLE / LABOUR.
--      Fixed in `uploads.ts` (`always: true`) and needs no SQL.
--
--   2. A CHECK on this column can ABORT AN IMPORT PART-WRITTEN. That is what
--      this migration is about, and it would still be true with the importer
--      fixed: the day the Item Master gains a fifth word, or somebody types one
--      on Part Master, a 1,300-row load stops in the middle again and leaves
--      the table half-updated. A vocabulary worth having is worth reporting on;
--      it is not worth refusing data over.
--
-- SO THE CONSTRAINT GOES AND NOTHING REPLACES IT. Spare Insights already deals
-- with a word it does not know -- it groups by whatever the column says and
-- reports blank as Unclassified -- so an unexpected category now appears in the
-- chart as its own bar, which is how somebody notices it and decides what it
-- ought to be. That is a better outcome than the value never arriving.
--
-- The column keeps `not null default ''`: blank still means "nobody has said",
-- which is a different statement from any word and must stay distinguishable.
--
-- Idempotent, and safe to run before or after a re-import.
-- ---------------------------------------------------------------------------

alter table public.parts drop constraint if exists parts_category_check;

comment on column public.parts.category is
  'The Item Master''s own Spare / Consumable word -- Spare, Consumable, Product, Labour, or anything else that file carries -- title-cased on import. '''' means nobody has said yet, and Spare Insights reports that as Unclassified rather than folding it into a bucket. Deliberately NOT constrained (0152): a check here aborts a bulk import part-written, and a category is worth reporting on rather than refusing data over.';
