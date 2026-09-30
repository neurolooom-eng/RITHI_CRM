-- ===========================================================================
-- A TECHNICAL / SERVICE NOTE CARRIES ITS DRIVE DETAILS.
--
--   The user, 2026-09-30, after loading the Technical Note list: "I didn't
--   want this '30-Sep-2026 10:27:25' in the updated date and time -- it has to
--   reflect the Meta data from Drive. Added also has to be mapped per the Drive
--   Details." Their answers: the shelf shows Added = Drive's Created,
--   Added By = Drive's Last Modified By, Updated = Drive's Last Modified; and
--   RITHI's own record of who loaded it and when is KEPT, shown in the record
--   details rather than the table.
--
-- SO THESE ARE THREE NEW COLUMNS, NOT created_at / updated_at REWRITTEN.
-- created_at, updated_at and uploaded_by answer "when and by whom was this
-- entered HERE" -- documents_before_write() (0070) stamps them and that is the
-- audit trail. What Drive says about the FILE is a different fact about a
-- different thing, and putting it in those columns would lose the first to
-- record the second. Blank for anything not loaded from a Drive listing.
-- ===========================================================================

alter table public.documents add column if not exists source_created_at  timestamptz;
alter table public.documents add column if not exists source_modified_at timestamptz;
alter table public.documents add column if not exists source_modified_by text not null default '';

comment on column public.documents.source_created_at  is 'Drive''s Created date-time of the file, from the listing it was loaded from (0299). Not when it was entered here -- that is created_at.';
comment on column public.documents.source_modified_at is 'Drive''s Last Modified date-time of the file (0299). Not when the row was last changed here -- that is updated_at.';
comment on column public.documents.source_modified_by is 'Drive''s Last Modified By, as the listing wrote it (0299). Not who entered it here -- that is uploaded_by.';
