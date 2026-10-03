-- ===========================================================================
-- 0326 — A PARTY HAS A COUNTRY
--
-- The user, 2026-10-03: "In Party Master, City, State, Country can be in 1
-- row" -- and, asked whether to add the field the Party Master did not have:
-- "Add Country". Plain text, blank by default, so every existing party reads
-- exactly as it did; the Party Master upload fills it from a Country column,
-- and the Add / Edit forms set it.
-- ===========================================================================

alter table public.parties add column if not exists country text not null default '';

-- THE VALUE MAY ALREADY BE HERE. The Party Master export has a COUNTRY
-- heading, and with no column for it the upload kept it on the row (`extra`,
-- as it keeps every heading it cannot place). Copied across, whatever its
-- spelling of the heading; only a BLANK is filled, so a re-run, or a country
-- typed on the screen, is never overwritten. `extra` itself is left as it is.
update public.parties p
   set country = (select btrim(e.value) from jsonb_each_text(coalesce(p.extra, '{}'::jsonb)) e
                   where lower(btrim(e.key)) = 'country' and coalesce(btrim(e.value), '') <> ''
                   limit 1)
 where coalesce(btrim(p.country), '') = ''
   and exists (select 1 from jsonb_each_text(coalesce(p.extra, '{}'::jsonb)) e
                where lower(btrim(e.key)) = 'country' and coalesce(btrim(e.value), '') <> '');
