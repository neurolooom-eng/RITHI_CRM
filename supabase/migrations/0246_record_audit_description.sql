-- ===========================================================================
-- record_audit's description says what is true again (finding 54).
--
-- 0112 switched the row audit off and described the table as "HISTORICAL ...
-- Retained, not maintained". 0225 switched it back on and left that
-- description in place, so for three weeks anybody reading the table's own
-- description in the dashboard was told the audit was off while its triggers
-- were writing to it. Found by the table review (2026-09-26), which read the
-- description beside the list of triggers that actually exist.
--
-- AFTER 0225 in this module, so replaying the bundle ends on this text rather
-- than 0112's.
-- ===========================================================================
comment on table public.record_audit is
  'The row-level audit trail: a before-and-after image of every row changed on the audited tables, written by the record_audit_* triggers (0048, switched off by 0112, back on since 0225). A statement changing more than 150 rows writes one summary row instead. Rows are never edited or deleted through the API.';
