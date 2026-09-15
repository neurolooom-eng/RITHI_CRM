-- ===========================================================================
-- ONE VOCABULARY FOR COVER (0208).
--
--   Reported from use: Failures per cover read WGP 56 and WARRANTY 1. A second
--   spelling of one cover does not read as a small error — it SPLITS a group-by
--   silently, and the reader believes both halves.
--
--   Two things this suite insists on that a normaliser usually gets wrong:
--   "OUT OF WARRANTY" must NOT become WGP because it contains the word, and an
--   unrecognised value must be left alone rather than guessed into a bucket.
--
-- Run ONCE after _stub.sql + every migration.
-- Every error printed is labelled `expect ERROR` — anything else is a failure.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off

-- NOBODY IS SIGNED IN for this suite. The sectional edit guard (0127) lets an
-- unauthenticated writer through — `me is null` — and gates everyone else, so
-- a harness left pointing at a user by an earlier suite turns section 4's
-- UPDATE into a refusal and the assertion under it reads the value the INSERT
-- put there. Each suite gets its own database under `npm run validate`, so
-- this only bites a hand-run; it is reset anyway, because an assertion that
-- passes for the wrong reason is the failure mode this whole file is about.
update public.harness set uid = null, email = null;

\echo ''
\echo '--- 1. every spelling that MEANS one of the four becomes that code ---'
select v as given, public.cover_code(v) as code
  from (values ('WARRANTY'), ('Warranty'), ('  under warranty '), ('In Warranty'),
               ('WGP'), ('wgp'), ('W.G.P.'), ('Warranty / Guarantee Period'),
               ('OGP'), ('Out of Guarantee Period'), ('out-of-cover'),
               ('CMC'), ('Under CMC'), ('Comprehensive Maintenance Contract'),
               ('AMC'), ('annual maintenance contract')) as t(v);

\echo ''
\echo '--- 2. the trap: OUT OF WARRANTY is OGP, not WGP ---'
-- It contains the word "warranty", so a substring rule turns the one cover
-- into its opposite — which is a worse answer than the split it was fixing.
-- The match is on the WHOLE squashed string for exactly this reason.
select v as given, public.cover_code(v) as code, public.cover_code(v) = 'OGP' as correct
  from (values ('Out of Warranty'), ('OUT OF WARRANTY'), ('out_of_warranty')) as t(v);

\echo ''
\echo '--- 3. what the rule does not recognise is LEFT ALONE, not guessed ---'
-- A guess written into a quality record is worse than a value that reads as
-- odd: the odd one gets reported, which is how WARRANTY was found.
select v as given, public.cover_code(v) as code
  from (values ('Goodwill'), ('PO Raised'), (''), ('   ')) as t(v);
select 'null stays null' as check, public.cover_code(null) is null as ok;

\echo ''
\echo '--- 4. THE TRIGGER: a synonym cannot be stored, whoever writes it ---'
-- The rule has to live on the write path rather than in the chart. Rewriting
-- the label where it is drawn leaves the stored value wrong for the DCCR grid,
-- the exports and the spare-approval rule that asks whether an item is AMC.
-- A SECOND RUN ON THE SAME DATABASE MUST SAY THE SAME THING. Without this the
-- re-run inserts a SECOND COV-UCN-1 while the first is sitting at OGP from the
-- update below, and the assertion reads whichever row comes back first — which
-- reported "inserted as WARRANTY, stored as OGP" and looked like a broken
-- normaliser. Each suite gets its own database under `npm run validate`, so it
-- only bites a hand-run; an assertion that can read the wrong row is worth one
-- line either way.
delete from public.field_calls where ucn like 'COV-UCN-%';
insert into public.field_calls (ucn, party_name, product_name, item_status, reg_date)
 values ('COV-UCN-1','Hospital A','MONNAL T60','WARRANTY', current_date);
select 'inserted as WARRANTY, stored as' as check, item_status
  from public.field_calls where ucn = 'COV-UCN-1';

update public.field_calls set item_status = 'Out of Warranty' where ucn = 'COV-UCN-1';
select 'updated to Out of Warranty, stored as' as check, item_status
  from public.field_calls where ucn = 'COV-UCN-1';

insert into public.products (item_name, serial_number, party_name, item_status)
 values ('MONNAL T60','COV-SER-1','Hospital A','under warranty');
select 'the install base is stamped too' as check, item_status
  from public.products where serial_number = 'COV-SER-1';

insert into public.spare_requests (uid, engineer, item_status)
 values ('COV-SR-1','Some Engineer','Under CMC');
select 'and a spare request, which the approval rule reads' as check, item_status
  from public.spare_requests where uid = 'COV-SR-1';

\echo ''
\echo '--- 5. it is a stamp, not a constraint: a real value is not refused ---'
-- An unrecognised cover must still be STORABLE. Refusing it would turn a
-- vocabulary tidy-up into a load that fails on row 24,000, and the import is
-- how the odd values get seen in the first place.
insert into public.field_calls (ucn, party_name, product_name, item_status, reg_date)
 values ('COV-UCN-2','Hospital B','MONNAL T60','Goodwill Repair', current_date);
select 'an unknown cover is stored, unchanged' as check, item_status
  from public.field_calls where ucn = 'COV-UCN-2';

\echo ''
\echo '--- 6. and the backfill left nothing behind ---'
select 'rows still holding a synonym' as check, count(*) as should_be_0 from (
  select item_status from public.field_calls
  union all select item_status from public.installation_calls
  union all select item_status from public.pm_calls
  union all select item_status from public.products
  union all select item_status from public.spare_requests
) t where item_status is distinct from public.cover_code(item_status);

\echo ''
\echo '--- 7. the two AppSheet cover exports spell it in a column of their own ---'
-- `present_item_status` (0036: "OGP / WGP / CMC / AMC") is read by
-- `machine_cover` as a machine's cover alongside the rest, so a register left
-- out of the trigger list is exactly how one synonym survives.
-- `contract_details` carries the column too and is a VIEW over this table, so
-- it follows from here rather than being stamped itself.
insert into public.contract_items (uid, mc_number, present_item_status)
 values ('COV-CI-1','MC-COV-1','Warranty')
on conflict (uid) do update set present_item_status = excluded.present_item_status;
select 'contract_items.present_item_status' as check, present_item_status
  from public.contract_items where uid = 'COV-CI-1';

select 'rows still holding a synonym in either cover column' as check,
       count(*) as should_be_0 from (
  select item_status as v from public.field_calls
  union all select item_status from public.installation_calls
  union all select item_status from public.pm_calls
  union all select item_status from public.products
  union all select item_status from public.spare_requests
  union all select present_item_status from public.contract_items
  union all select present_item_status from public.contract_details
) t where v is distinct from public.cover_code(v);
