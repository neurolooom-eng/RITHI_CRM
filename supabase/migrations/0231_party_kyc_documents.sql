-- ===========================================================================
-- THE KYC RECORDS THEMSELVES, ATTACHED TO THE PARTY.
--
--   The user, 2026-09-22: "In Party Master, add a provision to attach the KYC
--   records. If the customer is already KYC Verified, then display as KYC
--   Verified so that commercial department can proceed with Sale Entry and
--   Installation call."
--
-- 0201 gave a party a KYC STATUS, a note and a stamp of who verified it and
-- when. What it did not give it is the EVIDENCE: the GST certificate, the PAN
-- card, the registration that somebody looked at before writing "Verified".
-- A verification with no record behind it is an assertion, and the person who
-- has to rely on it downstream -- Commercial, before a sale entry and an
-- installation call -- cannot check it.
--
-- A JSONB LIST ON THE PARTY, NOT A TABLE, and the reason is what an attachment
-- IS here: the file lives in Drive, so this column holds a link and a name, not
-- a document. A table of two text columns keyed to the party, with its own
-- policies and its own cascade, buys nothing over a list that is read and
-- written exactly when the party is.
--
-- EACH ENTRY RECORDS WHO ATTACHED IT AND WHEN, because a KYC record whose
-- provenance is unknown is the same problem one step along. The shape is
-- { name, url, at, by } and the CHECK below refuses anything that is not a
-- list -- a single object written here by a mistaken client would make every
-- reader's `jsonb_array_elements` fail rather than show nothing.
-- ===========================================================================
alter table public.parties
  add column if not exists kyc_docs jsonb not null default '[]'::jsonb;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'parties_kyc_docs_is_list') then
    alter table public.parties add constraint parties_kyc_docs_is_list
      check (jsonb_typeof(kyc_docs) = 'array');
  end if;
end $$;

comment on column public.parties.kyc_docs is
  'The KYC records attached to this party: a list of { name, url, at, by }. The files live in Drive; this holds the link, the file name and who attached it when. Evidence for kyc_status — a verification with no record behind it is an assertion.';

-- ---------------------------------------------------------------------------
-- IS THIS PARTY CLEARED TO BUY? One expression, so the screen that offers a
-- Sale Entry and the screen that lists what Commercial is waiting on cannot
-- come to different answers about the same customer.
--
-- VERIFIED IS VERIFIED WHETHER OR NOT A FILE IS ATTACHED. The status is the
-- decision and a person made it; refusing to honour it because the evidence was
-- filed elsewhere would make this function stricter than the people it serves,
-- and the screens say separately whether a record is attached. What it will not
-- do is infer the other way: a party with documents and no verification is NOT
-- verified, because attaching a file is not a decision.
-- ---------------------------------------------------------------------------
create or replace function public.party_kyc_verified(p_status text)
returns boolean language sql immutable as $$
  select lower(btrim(coalesce(p_status, ''))) = 'verified';
$$;

grant execute on function public.party_kyc_verified(text) to authenticated;

comment on function public.party_kyc_verified(text) is
  'Is this party KYC verified? The status alone decides it — attaching a document is not a decision, and a verification recorded without one is still a decision somebody made.';
