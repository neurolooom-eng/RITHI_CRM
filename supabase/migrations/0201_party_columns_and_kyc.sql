-- ===========================================================================
-- THE PARTY MASTER'S OWN COLUMNS, AND SOMEWHERE TO PUT KYC.
--
-- The user, 2026-09-15: *"Additionally add provision to capture the KYC details
-- of the customer. Clean up the columns, de-dupe the column headers."*
--
-- WHAT THE SUPPLIED EXPORT ACTUALLY HOLDS, counted rather than assumed
-- (4,752 parties):
--
--   Profile          4752  PRIVATE / GOVERNMENT — 3 values. A real
--                          classification, and it was being THROWN AWAY: the
--                          importer aliased `party_type` to ['type','profile']
--                          and Type wins, so Profile only ever reached `extra`.
--   Route            4714  2,922 values — the territory.
--   Inst. Pincode    2469
--   Tel 1            4752  but only 922 distinct: the same switchboard number
--                          repeats over thousands of rows.
--   Tel 2             232   Fax 17   Email ID 73
--   Billing Address    26   Pincode 5   Tel 1 [2] 14   Tel 2 [2] 2   Fax [2] 1
--   Email ID [2]        0
--   Office Name      4752  ...and it is OUR OWN COMPANY on every row, not the
--                          customer. It gets no column: a column that says the
--                          same thing 4,752 times answers no question.
--   Under               0  Salesman 0  Tax 3 0 — EMPTY. No columns either.
--
-- DE-DUPED BY NAMING, not by numbering. The file carries `Tel 1`, `Tel 2`,
-- `Fax` and `Email ID` TWICE — once against the installation address and once
-- against the billing address — so the second set becomes billing_* here and
-- stops being a mystery second column. Until 0200 it was being dropped outright.
--
-- ---------------------------------------------------------------------------
-- KYC: THE FRAME, NOT THE FIELDS.
--
-- Asked which fields to capture, the user said: *"I don't know.. there is some
-- format for KYC, I will update."* So the fields are NOT invented here. What is
-- built is the part that was decided and the part the evidence settles:
--
--   • THE STATUS, and every party starts Pending (the user's answer). 4,752 of
--     them, because NOBODY HAS VERIFIED ANYTHING — a number on file is not a
--     verification, and marking five rows Verified because a spreadsheet had a
--     string in a Tax column would be inventing an audit record. Who verified
--     it and when are stamped by the database, not by the caller.
--   • GSTIN AND PAN, which are certain: they are statutory, they have a shape,
--     and the export already carries six of them.
--
-- The rest arrives as real columns when the format does. A jsonb bag "for the
-- fields we don't know yet" is what 0148 and 0194 both had to undo.
-- ===========================================================================

alter table public.parties
  add column if not exists profile          text default '',
  add column if not exists route            text default '',
  add column if not exists pincode          text default '',
  add column if not exists phone            text default '',
  add column if not exists phone_2          text default '',
  add column if not exists fax              text default '',
  add column if not exists email            text default '',
  add column if not exists billing_address  text default '',
  add column if not exists billing_pincode  text default '',
  add column if not exists billing_phone    text default '',
  add column if not exists billing_phone_2  text default '',
  add column if not exists billing_fax      text default '',
  add column if not exists billing_email    text default '',
  add column if not exists gstin            text default '',
  add column if not exists pan              text default '',
  add column if not exists kyc_status       text default 'Pending',
  add column if not exists kyc_notes        text default '',
  add column if not exists kyc_verified_by  uuid,
  add column if not exists kyc_verified_at  timestamptz;

comment on column public.parties.profile   is 'PRIVATE / GOVERNMENT — the export''s own Profile column, which Type used to swallow.';
comment on column public.parties.gstin     is 'GSTIN, 15 characters. Parsed out of the export''s free-text Tax columns.';
comment on column public.parties.pan       is 'PAN, 10 characters. A GSTIN contains one at characters 3-12, so it is derived where only a GSTIN is known.';
comment on column public.parties.kyc_status is 'Pending / Verified / Rejected. Every party starts Pending: nobody has verified anything yet.';

-- A STATUS WITH THREE VALUES, and the constraint says so. Not free text: this
-- one is COUNTED ("how many customers still need KYC?"), and a fourth spelling
-- makes every count wrong rather than merely untidy.
--
-- Added by NAME-independent inspection, because `add constraint if not exists`
-- does not exist and a bare add fails on a second run. `IF NOT EXISTS GUARDS A
-- NAME, NEVER A DEFINITION` (0186) — so it is dropped by name and recreated,
-- which is also what makes a changed list of values actually take.
alter table public.parties drop constraint if exists parties_kyc_status_check;
alter table public.parties
  add constraint parties_kyc_status_check
  check (coalesce(kyc_status, '') in ('', 'Pending', 'Verified', 'Rejected'));

-- ---------------------------------------------------------------------------
-- FINDING A STATUTORY NUMBER IN FREE TEXT.
--
-- The five values on record are `PAN NO:AAACI7716A`, `GST NO:33AADCK3295K2ZB`,
-- `GSTIN:33AAACL7222Q1ZB` and `GSTIN: 09AAACI7716A1ZV` — a label, a separator
-- that is sometimes a colon and sometimes a space, then the number. There is no
-- format to parse, so the number is found by its SHAPE, which is the only thing
-- all of them agree about.
--
--   GSTIN  a 2-digit state code, a 10-character PAN, an entity digit, `Z` and a
--          checksum — 15 characters. It cannot match a label, because it must
--          begin with two DIGITS.
--   PAN    five letters, four digits, a letter. SEARCHED, not anchored, because
--          the label is still attached: `PANNOAAACI7716A` must yield
--          `AAACI7716A`.
--
-- SPACES SURVIVE THE STRIP while punctuation does not, and that is deliberate:
-- the space is what separates `Tax 1` from `Tax 2` once they are concatenated,
-- so a number cannot be assembled across two fields that never held one.
--
-- ONE DEFINITION, called by the backfill below AND by the trigger, so an upload
-- next year is read exactly as the migration read the file today. The regex
-- was written out four times in the first draft, which is three chances for
-- them to drift apart.
-- ---------------------------------------------------------------------------
create or replace function public.kyc_gstin(p_text text)
returns text language sql immutable as $$
  select substring(upper(regexp_replace(coalesce(p_text, ''), '[^A-Za-z0-9 ]', '', 'g'))
                   from '[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]')
$$;

create or replace function public.kyc_pan(p_text text)
returns text language sql immutable as $$
  select substring(upper(regexp_replace(coalesce(p_text, ''), '[^A-Za-z0-9 ]', '', 'g'))
                   from '[A-Z]{5}[0-9]{4}[A-Z]')
$$;

grant execute on function public.kyc_gstin(text) to authenticated;
grant execute on function public.kyc_pan(text)   to authenticated;

-- WHO SAYS IT IS VERIFIED IS THE DATABASE'S TO RECORD, not the caller's — the
-- same rule 0113 applies to who registered a call and 0173 to who reviewed one.
-- A verification naming somebody who did not do it is worse than one naming
-- nobody, and on a KYC record that is the whole value of the field.
create or replace function public.parties_kyc_stamp()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if coalesce(btrim(new.kyc_status), '') = '' then new.kyc_status := 'Pending'; end if;
  end if;

  -- A LONE `Pincode` BESIDE AN `Inst. Pincode` IS THE BILLING ONE. The export
  -- names the installation pincode and leaves the billing one bare, so the
  -- importer cannot alias it without racing the installation column for the
  -- same heading. The pair is only ambiguous in isolation: where BOTH headings
  -- are on the row, which is which is not in doubt.
  if coalesce(btrim(new.billing_pincode), '') = ''
     and new.extra ? 'Inst. Pincode' and coalesce(btrim(new.extra ->> 'Pincode'), '') <> '' then
    new.billing_pincode := btrim(new.extra ->> 'Pincode');
  end if;

  -- THE NUMBERS ARE DERIVED HERE TOO, not only in the backfill below. An upload
  -- puts the Tax columns in `extra` and nothing else would ever read them, so a
  -- file loaded next year would land exactly as the file loaded today did
  -- BEFORE this migration — with its GSTIN sitting in a blob. Only ever fills a
  -- BLANK: a number typed on the screen is never overwritten by a spreadsheet.
  if coalesce(btrim(new.gstin), '') = '' then
    new.gstin := coalesce(public.kyc_gstin(concat_ws(' ',
      new.extra ->> 'Tax 1', new.extra ->> 'Tax 2', new.extra ->> 'Tax 3',
      new.extra ->> 'GSTIN', new.extra ->> 'GST No')), '');
  end if;
  -- AFTER the GSTIN, and reading it: a GSTIN contains a PAN at characters 3-12,
  -- so a customer who gave only a GSTIN is not asked for a PAN as well.
  if coalesce(btrim(new.pan), '') = '' then
    new.pan := coalesce(public.kyc_pan(concat_ws(' ', new.gstin,
      new.extra ->> 'Tax 1', new.extra ->> 'Tax 2', new.extra ->> 'Tax 3',
      new.extra ->> 'PAN', new.extra ->> 'PAN No')), '');
  end if;
  if new.kyc_status is distinct from (case when tg_op = 'UPDATE' then old.kyc_status else null end) then
    if new.kyc_status = 'Verified' then
      new.kyc_verified_by := auth.uid();
      new.kyc_verified_at := now();
    else
      -- Moving OFF Verified clears the stamp: a party sent back to Pending has
      -- not been verified by anybody, and leaving the old name on it would say
      -- it had.
      new.kyc_verified_by := null;
      new.kyc_verified_at := null;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists parties_kyc_stamp on public.parties;
create trigger parties_kyc_stamp
  before insert or update on public.parties
  for each row execute function public.parties_kyc_stamp();

-- ---------------------------------------------------------------------------
-- THE BACKFILL, out of `extra` — nobody is asked to upload the file again.
--
-- Every party already loaded came in through extraInto:'extra', so each of
-- these values is on the row under its ORIGINAL SPREADSHEET HEADING. The `[2]`
-- spellings are what the de-duped parse now produces for the billing block;
-- the bare ones are what earlier exports called the same thing.
--
-- A value already in the column is never overwritten, so this cannot undo a
-- correction somebody made on the screen.
-- ---------------------------------------------------------------------------
-- WRITTEN OUT, one column at a time. A loop building these with `format` was
-- the first draft and it is exactly the trap 0200 already hit: `update ... from
-- lateral (...)` CANNOT see the update's own target table. Thirteen plain
-- statements are longer and they are the ones that run.
update public.parties p set profile = coalesce(nullif(btrim(p.extra ->> 'Profile'), ''), p.profile)
 where coalesce(btrim(p.profile), '') = '' and coalesce(btrim(p.extra ->> 'Profile'), '') <> '';
update public.parties p set route = coalesce(nullif(btrim(p.extra ->> 'Route'), ''), p.route)
 where coalesce(btrim(p.route), '') = '' and coalesce(btrim(p.extra ->> 'Route'), '') <> '';
update public.parties p set pincode = coalesce(nullif(btrim(p.extra ->> 'Inst. Pincode'), ''), nullif(btrim(p.extra ->> 'Inst Pincode'), ''), nullif(btrim(p.extra ->> 'Pincode'), ''), p.pincode)
 where coalesce(btrim(p.pincode), '') = '';
update public.parties p set phone = coalesce(nullif(btrim(p.extra ->> 'Tel 1'), ''), nullif(btrim(p.extra ->> 'Phone'), ''), nullif(btrim(p.extra ->> 'Telephone'), ''), p.phone)
 where coalesce(btrim(p.phone), '') = '';
update public.parties p set phone_2 = coalesce(nullif(btrim(p.extra ->> 'Tel 2'), ''), p.phone_2)
 where coalesce(btrim(p.phone_2), '') = '';
update public.parties p set fax = coalesce(nullif(btrim(p.extra ->> 'Fax'), ''), p.fax)
 where coalesce(btrim(p.fax), '') = '';
update public.parties p set email = coalesce(nullif(btrim(p.extra ->> 'Email ID'), ''), nullif(btrim(p.extra ->> 'Email'), ''), p.email)
 where coalesce(btrim(p.email), '') = '';
update public.parties p set billing_address = coalesce(nullif(btrim(p.extra ->> 'Billing Address'), ''), p.billing_address)
 where coalesce(btrim(p.billing_address), '') = '';
update public.parties p set billing_pincode = coalesce(nullif(btrim(p.extra ->> 'Pincode [2]'), ''), nullif(btrim(p.extra ->> 'Billing Pincode'), ''), p.billing_pincode)
 where coalesce(btrim(p.billing_pincode), '') = '';
-- ...and the bare `Pincode` where an `Inst. Pincode` sits beside it to say
-- which is which. Same rule as the trigger, so a row already loaded and a row
-- loaded tomorrow are read the same way.
update public.parties p set billing_pincode = btrim(p.extra ->> 'Pincode')
 where coalesce(btrim(p.billing_pincode), '') = ''
   and p.extra ? 'Inst. Pincode' and coalesce(btrim(p.extra ->> 'Pincode'), '') <> '';
update public.parties p set billing_phone = coalesce(nullif(btrim(p.extra ->> 'Tel 1 [2]'), ''), nullif(btrim(p.extra ->> 'Billing Tel 1'), ''), p.billing_phone)
 where coalesce(btrim(p.billing_phone), '') = '';
update public.parties p set billing_phone_2 = coalesce(nullif(btrim(p.extra ->> 'Tel 2 [2]'), ''), nullif(btrim(p.extra ->> 'Billing Tel 2'), ''), p.billing_phone_2)
 where coalesce(btrim(p.billing_phone_2), '') = '';
update public.parties p set billing_fax = coalesce(nullif(btrim(p.extra ->> 'Fax [2]'), ''), nullif(btrim(p.extra ->> 'Billing Fax'), ''), p.billing_fax)
 where coalesce(btrim(p.billing_fax), '') = '';
update public.parties p set billing_email = coalesce(nullif(btrim(p.extra ->> 'Email ID [2]'), ''), nullif(btrim(p.extra ->> 'Billing Email'), ''), p.billing_email)
 where coalesce(btrim(p.billing_email), '') = '';

-- ---------------------------------------------------------------------------
-- GSTIN AND PAN, out of the export's free-text Tax columns.
--
-- The five values on record are `PAN NO:AAACI7716A`, `GST NO:33AADCK3295K2ZB`,
-- `GSTIN:33AAACL7222Q1ZB`, `GSTIN: 09AAACI7716A1ZV` and one more — a label, a
-- separator that is sometimes a colon and sometimes a space, then the number.
-- So the punctuation is STRIPPED and the number is FOUND BY ITS SHAPE, which is
-- the only thing all five agree about.
--
--   GSTIN  2-digit state code, a 10-character PAN, an entity digit, `Z`, a
--          checksum — 15 characters.
--   PAN    five letters, four digits, a letter.
--
-- Searched, not anchored, because the label is still attached: `PANNOAAACI7716A`
-- has to yield `AAACI7716A`. The GSTIN pattern cannot match a label, since it
-- must start with two DIGITS.
--
-- AND A GSTIN CONTAINS A PAN at characters 3-12, so a party that gave only a
-- GSTIN gets its PAN for nothing rather than being asked for it again.
-- ---------------------------------------------------------------------------
-- The same two derivations for the rows ALREADY loaded. It calls the helpers,
-- so the migration and the trigger cannot read a file differently.
update public.parties p
   set gstin = public.kyc_gstin(concat_ws(' ', p.extra ->> 'Tax 1', p.extra ->> 'Tax 2',
                 p.extra ->> 'Tax 3', p.extra ->> 'GSTIN', p.extra ->> 'GST No'))
 where coalesce(btrim(p.gstin), '') = ''
   and public.kyc_gstin(concat_ws(' ', p.extra ->> 'Tax 1', p.extra ->> 'Tax 2',
                 p.extra ->> 'Tax 3', p.extra ->> 'GSTIN', p.extra ->> 'GST No')) is not null;

update public.parties p
   set pan = public.kyc_pan(concat_ws(' ', p.gstin, p.extra ->> 'Tax 1', p.extra ->> 'Tax 2',
                 p.extra ->> 'Tax 3', p.extra ->> 'PAN', p.extra ->> 'PAN No'))
 where coalesce(btrim(p.pan), '') = ''
   and public.kyc_pan(concat_ws(' ', p.gstin, p.extra ->> 'Tax 1', p.extra ->> 'Tax 2',
                 p.extra ->> 'Tax 3', p.extra ->> 'PAN', p.extra ->> 'PAN No')) is not null;

-- EVERY PARTY STARTS PENDING (the user's answer). Including the handful whose
-- GSTIN came out of the spreadsheet: a number on file is not a verification,
-- and marking those Verified would be inventing an audit record nobody made.
update public.parties set kyc_status = 'Pending'
 where coalesce(btrim(kyc_status), '') = '';

do $$
declare n_gst int; n_pan int; n_pend int;
begin
  select count(*) filter (where coalesce(btrim(gstin), '') <> ''),
         count(*) filter (where coalesce(btrim(pan), '') <> ''),
         count(*) filter (where kyc_status = 'Pending')
    into n_gst, n_pan, n_pend from public.parties;
  raise notice 'Party Master KYC: % GSTIN, % PAN recovered; % part(y/ies) Pending.', n_gst, n_pan, n_pend;
end $$;
