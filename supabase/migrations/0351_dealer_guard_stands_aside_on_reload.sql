-- ===========================================================================
-- 0351 — RE-LOADING THE INSTALLATION CALLS REGISTER IS NOT REFUSED FOR A CALL
--        ALREADY RAISED ON A DEALER  (second re-review, 2026-10-03: D-148)
--
-- installation_call_not_for_dealer (0328) is BEFORE INSERT OR UPDATE, and the
-- Installation Calls upload upserts on ucn. Postgres fires the BEFORE INSERT
-- trigger BEFORE it finds the conflict, so a call that already exists was
-- refused as if it were new. 0328 says calls already raised are left as they
-- are -- true for a plain UPDATE (measured: allowed), not for a re-load
-- (measured, signed in: refused with the dealer message), and one such row
-- stopped the whole upload.
--
-- THE RULE IS UNCHANGED for a new call and for a change of party: on INSERT
-- the guard now stands aside only when a call with that UCN ALREADY EXISTS
-- under the SAME party (case and outer spaces ignored) -- which is exactly
-- the row the upsert will turn into an UPDATE that leaves the party alone, the
-- case the UPDATE branch already lets through. A re-load that changes the
-- party to a dealer is still refused.
--
-- 0328's function VERBATIM with that one test added. Same module
-- (sales_contracts), after 0328.
-- ===========================================================================

create or replace function public.installation_call_not_for_dealer()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;          -- a migration, a repair
  if tg_op = 'UPDATE' and new.party_name is not distinct from old.party_name then return new; end if;
  -- An upsert of a call that is already there, party unchanged (D-148).
  if tg_op = 'INSERT' and btrim(coalesce(new.ucn, '')) <> ''
     and exists (select 1 from public.installation_calls ic
                  where ic.ucn = new.ucn
                    and lower(btrim(coalesce(ic.party_name, ''))) = lower(btrim(coalesce(new.party_name, '')))) then
    return new;
  end if;
  if public.party_is_dealer(new.party_name) then
    raise exception '% is a dealer: an installation call is not raised for a dealer -- it is raised from the Ownership Transfer when the dealer sells the machine (OT-PRODUCT-SERIAL)', btrim(new.party_name)
      using errcode = '23514';
  end if;
  return new;
end $$;
revoke execute on function public.installation_call_not_for_dealer() from public, anon, authenticated;
