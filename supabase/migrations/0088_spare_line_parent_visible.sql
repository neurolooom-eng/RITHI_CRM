-- ===========================================================================
-- "Your role does not have permission for this action." on the first spare
-- line — still, after 0087.
--
-- 0087 hoisted `is_admin()` out of the EXISTS, which fixes the upload for an
-- administrator and nobody else. But the real fault is not WHO is uploading, it
-- is that the check cannot SEE what it is checking: 0084's stub parent is
-- written by a BEFORE trigger, and a command cannot see rows the SQL its own
-- triggers ran has inserted. So for anyone who is not an admin — a Spare
-- Coordinator, an RM, whoever actually loads the register — the row is still
-- refused, and one such line still fails all 8,571.
--
-- Ask the question in a place that can see the answer. A VOLATILE plpgsql
-- function takes a FRESH SNAPSHOT for each statement it runs (read committed),
-- so the stub its caller's trigger just wrote is visible to it. Same question,
-- same rule — a line must belong to a request you raised (or you are an
-- admin) — asked where it can be answered truthfully.
--
-- It is SECURITY DEFINER so the lookup is not itself filtered by `sr_read`
-- (a request you own but cannot yet read would otherwise answer "no"), and it
-- returns a BOOLEAN and nothing else, so it discloses nothing.
-- ===========================================================================

create or replace function public.spare_line_parent_ok(p_uid text)
returns boolean language plpgsql volatile security definer set search_path = public as $$
declare ok boolean;
begin
  if btrim(coalesce(p_uid, '')) = '' then
    return false;                                 -- no parent named; the FK will say so
  end if;
  select exists (
    select 1 from public.spare_requests r
     where r.uid = p_uid
       and (r.created_by = auth.uid() or public.is_admin())
  ) into ok;
  return coalesce(ok, false);
end $$;

grant execute on function public.spare_line_parent_ok(text) to authenticated;

drop policy if exists srl_insert on public.spare_request_lines;
create policy srl_insert on public.spare_request_lines for insert
  with check (
    public.has_perm('spare.request')
    and public.spare_line_parent_ok(request_uid)
  );
