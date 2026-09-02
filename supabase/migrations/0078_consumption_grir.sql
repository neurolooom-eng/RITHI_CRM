-- ===========================================================================
-- GRIR / TRACEABILITY on a consumed spare.
--
-- Which part was fitted is recorded; WHICH ONE is not. On a medical device that
-- is the difference between "an oxygen sensor was replaced" and being able to
-- answer, when a batch is recalled or a failure repeats, exactly which sensor
-- went into which machine. The engineers already capture it in the field — the
-- consumption export carries it on all 8,339 real rows — so it has had nowhere
-- to land.
--
-- Also gives the table a natural key at last. `spare_consumption` had none, so
-- re-running an import ADDED every row again; on 8,339 rows that is a hand-stock
-- figure quietly halved. `source_ref` is the export's own id, and the index is
-- partial because a line entered in the app has no such id and must not be
-- forced to collide with the others.
-- ===========================================================================

alter table public.spare_consumption add column if not exists grir       text not null default '';
alter table public.spare_consumption add column if not exists source_ref text not null default '';

comment on column public.spare_consumption.grir is
  'GRIR / traceability reference for the part actually fitted — batch, goods-receipt or serial. Recorded by the engineer at consumption.';
comment on column public.spare_consumption.source_ref is
  'The row id this line came from when it was imported. Lets a re-load correct rather than duplicate.';

create unique index if not exists spare_consumption_source_ref_uniq
  on public.spare_consumption (source_ref) where source_ref <> '';
create index if not exists spare_consumption_grir_idx
  on public.spare_consumption (grir) where grir <> '';
