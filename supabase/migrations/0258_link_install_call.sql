-- ===========================================================================
-- WHOEVER RAISES A MACHINE'S INSTALLATION CALL CAN MAP IT BACK (finding 31).
--
-- "+ Installation call" on the Warranty register is two writes: insert the
-- call (`calls_insert`: install.create), then write its UCN into the machine's
-- INST Call (`sale_items_write`: cover.edit). Hotline holds the first and not
-- the second, so the call was created and the mapping matched ZERO rows —
-- no error — and the button came back offering a second call for the same
-- machine. v0.9.373 made that failure honest; this makes it not happen.
--
-- THE USER'S DECISION (2026-09-30): "Let Hotline write the link" — and only
-- the link. Row-level security cannot grant ONE column, and a second UPDATE
-- policy on `sale_items` would let an install.create holder rewrite the whole
-- warranty line. So the write is a FUNCTION that does exactly one thing, and
-- checks everything that makes that one thing correct:
--
--   * the caller is admin, or holds cover.edit or install.create;
--   * INST Call does not already hold a call number — a machine's mapping is
--     never replaced here (the "To Check" placeholder is, as 0234 intends);
--   * the UCN is an INSTALLATION call for THIS machine — same product and
--     serial, compared as `raiseInstallCalls` builds the call — so it cannot
--     be used to attach an arbitrary call to an arbitrary machine.
--
-- Calling it with the UCN already in place is a no-op, so a retry is safe.
-- SECURITY DEFINER with the check inside, the pattern for a function the app
-- calls (0248): execute is withdrawn from the public and the not-signed-in
-- role and granted to signed-in users only.
-- ===========================================================================

create or replace function public.link_install_call(p_item_id bigint, p_ucn text)
returns void language plpgsql security definer set search_path = public as $$
declare
  it  public.sale_items%rowtype;
  v_ucn text := btrim(coalesce(p_ucn, ''));
begin
  if not (public.is_admin() or public.has_perm('cover.edit') or public.has_perm('install.create')) then
    raise exception 'RBAC: mapping an installation call needs install.create or cover.edit';
  end if;

  select * into it from public.sale_items where id = p_item_id for update;
  if not found then
    raise exception 'Machine line % is not on the warranty register', p_item_id;
  end if;

  if btrim(coalesce(it.inst_call, '')) = v_ucn then
    return;
  end if;
  if public.is_call_number(it.inst_call) then
    raise exception '% · % already has installation call %, which is not replaced here',
      it.product_name, it.serial_number, btrim(it.inst_call);
  end if;

  if not exists (
    select 1 from public.installation_calls c
     where c.ucn = v_ucn
       and lower(btrim(coalesce(c.serial, '')))       = lower(btrim(coalesce(it.serial_number, '')))
       and lower(btrim(coalesce(c.product_name, ''))) = lower(btrim(coalesce(it.product_name, '')))
  ) then
    raise exception 'Call % is not an installation call for % · %', v_ucn, it.product_name, it.serial_number;
  end if;

  update public.sale_items set inst_call = v_ucn where id = p_item_id;
end $$;

comment on function public.link_install_call(bigint, text) is
  'Write an installation call''s UCN into one warranty machine''s INST Call, and nothing else. For install.create or cover.edit holders; refuses to replace a call number and refuses a call that is not this machine''s installation (finding 31).';

revoke execute on function public.link_install_call(bigint, text) from public, anon;
grant  execute on function public.link_install_call(bigint, text) to authenticated;
