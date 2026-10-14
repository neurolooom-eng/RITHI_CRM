-- ===========================================================================
-- 0375 — STOCK IS TRANSFERRED FROM YOUR OWN HAND STOCK OR YOUR TEAM'S, TO A
--        PERSON ON THE USER MASTER (second re-review D-049; the user, 2026-10-05)
--
-- st_insert (0020) is has_perm('stock.transfer') and nothing else, and From and
-- To were free text: measured, an engineer holding the permission moved
-- another engineer's stock to "NOBODY AT ALL" (INSERT 1); the stock guard
-- checks only the From balance.
-- THE USER'S DECISION: "Same rule as spares" (D-125, 0369) --
--   * From: your own name, or an engineer below you in the User Master (by
--     Reporting / Regional Manager, visible_engineer_names()); anybody else's
--     only with the new key stock.transfer.others, given to NOBODY here (an
--     administrator holds every key; tick it per role or per person);
--   * To: a name on the User Master.
-- Checked on INSERT; the header's engineers cannot change afterwards
-- (stock_transfer_header_fixed). Not stopped: an import (bulk.upload /
-- import.panel), a connection with no session, a function running as its
-- owner (a User Master rename carries transfers by design).
-- In the handstock module, after 0373 (is_me() is 0369's).
-- ===========================================================================

create or replace function public.stock_transfer_own_or_team()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;
  if current_user <> 'authenticated' then return new; end if;
  if public.has_perm('bulk.upload') or public.has_perm('import.panel') then return new; end if;

  if not (public.is_me(new.from_engineer)
          or lower(btrim(coalesce(new.from_engineer, ''))) in
             (select lower(btrim(v.n)) from public.visible_engineer_names() v(n))
          or public.has_perm('stock.transfer.others')) then
    raise exception '% is not you or an engineer in your team, so their stock cannot be transferred by you (it needs "Transfer stock from any engineer")',
      coalesce(nullif(btrim(new.from_engineer), ''), 'The From engineer') using errcode = '42501';
  end if;

  if not exists (select 1 from public.user_directory d
                  where lower(btrim(d.name)) = lower(btrim(coalesce(new.to_engineer, '')))
                    and btrim(coalesce(d.name, '')) <> '') then
    raise exception '% is not a person on the User Master -- stock is transferred to somebody who is',
      coalesce(nullif(btrim(new.to_engineer), ''), 'The To engineer') using errcode = '23503';
  end if;
  return new;
end $$;
revoke execute on function public.stock_transfer_own_or_team() from public, anon, authenticated;
drop trigger if exists stock_transfer_own_or_team on public.stock_transfers;
create trigger stock_transfer_own_or_team
  before insert on public.stock_transfers
  for each row execute function public.stock_transfer_own_or_team();
