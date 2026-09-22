-- ===========================================================================
-- THE SALE ENTRY DATE IS STAMPED, NOT TYPED.
--
--   The user, 2026-09-22: "Warranty Entry date - Automatic - Timestamp".
--
-- A DEFAULT RATHER THAN A TRIGGER, and the difference matters here. The
-- 0113/0114 rule is that a stamped column DISCARDS what the caller sends --
-- right where the value is a claim about the session (who created this row).
-- This one is not: the AppSheet cover export carries a real Sale Entry Date for
-- every historical sale, and a trigger that discarded it would rewrite four
-- years of the register to the afternoon it was imported.
--
-- So: supplied, it is kept (the import); absent, the database stamps it (the
-- form, which no longer offers the field). The screen renders it read-only
-- either way.
--
-- THE FORM DOES NOT DEPEND ON THIS FILE. It sends the timestamp itself when it
-- creates an entry, so a project that has not run this still stamps the date.
-- The default is what makes the rule true for everything ELSE that inserts --
-- an import, a script, the SQL editor -- rather than only for one screen.
-- ===========================================================================
alter table public.sale_entries alter column entry_at set default now();

comment on column public.sale_entries.entry_at is
  'When the Sale Entry was made. Stamped by default; a value supplied by an import is kept, because the AppSheet export carries the real historical date. Not typed on the form.';
