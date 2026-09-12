-- ===========================================================================
-- 0178 — THE VISITS AND SPARES BEHIND A FIELD FAILURE REPORT.
--
-- Reported from use, 2026-09-12, with two screenshots side by side: an
-- administrator saw the visit work and the spares in the register's right-hand
-- pane; a user on a role granted `ffr.view` saw "0 visits" and "Nothing booked
-- against this call" on the same report. The user's instruction: "If certain
-- Permissions are required, please add it under the Group."
--
-- WHY. 0176 made READING THE REGISTER a right. It did not — and could not on its
-- own — make the CALL readable. The right-hand pane loads `reports` and
-- `spare_consumption`, and both are scoped to CALL VISIBILITY:
--
--   reports_read : calls.view AND (can_view_all_calls() OR the call is allotted
--                  to somebody in your reporting tree)
--   cons_read    : can_view_all_calls() OR yours OR your tree
--
-- So a role that may read the whole register still saw an empty pane beside
-- every report — the same half-granted shape as the register itself, one layer
-- down. A right to read a failure report that does not carry the visits it was
-- raised from is not much of a right: the pane IS the evidence.
--
-- A FUNCTION, NOT FIVE POLICY EDITS, and that is a deliberate choice rather
-- than the easy one. Widening this through the policies would mean editing
-- `reports_read` (owned by call_requests), `cons_read` (owned through a GUARDED
-- MIRROR in 0121 — a verbatim copy that check:bundles compares word for word)
-- and the three call tables. Five policies across three modules, each one a
-- chance to widen something nobody asked for, in the most fragile corner of
-- this schema. A definer function is ONE object that says "elevated on purpose"
-- out loud and carries its own authority test.
--
-- AND IT IS NARROW BY CONSTRUCTION. It returns nothing at all unless:
--
--   * the caller may read the register (ffr.view, an office role, or admin);
--     AND
--   * the UCN actually HAS a Field Failure Report.
--
-- The second condition is what stops it being a general-purpose call reader: it
-- opens the calls somebody is entitled to examine and no others. A caller who
-- qualifies for neither gets NULL, and the application falls back to reading
-- the tables itself — so nobody loses the visits they can already see.
-- ===========================================================================

create or replace function public.ffr_call_context(p_ucn text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_ucn text := coalesce(nullif(btrim(p_ucn), ''), '');
begin
  if v_ucn = '' then return null; end if;

  -- MAY THIS PERSON EXAMINE FAILURE REPORTS AT ALL? Returning NULL rather than
  -- raising, because "not for you" here is not an error: the caller reads the
  -- tables directly instead and sees whatever their own policies allow.
  if not (public.has_perm('ffr.view')
          or public.can_view_all_calls()
          or public.is_admin()) then
    return null;
  end if;

  -- …AND IS THIS A CALL WITH A REPORT ON IT? Without this the function would be
  -- a way to read any call's visits by knowing its UCN, which is a far larger
  -- grant than the one being made.
  if not exists (select 1 from public.field_failure_reports f where f.ucn = v_ucn) then
    return null;
  end if;

  return jsonb_build_object(
    'visits', coalesce((
      select jsonb_agg(to_jsonb(r) order by r.visit_at desc nulls last, r.id desc)
        from public.reports r where r.ucn = v_ucn), '[]'::jsonb),
    'spares', coalesce((
      select jsonb_agg(to_jsonb(s) order by s.id)
        from public.spare_consumption s where s.ucn = v_ucn), '[]'::jsonb)
  );
end $$;

revoke all on function public.ffr_call_context(text) from public;
grant execute on function public.ffr_call_context(text) to authenticated;

comment on function public.ffr_call_context(text) is
  'The visits and spares behind a Field Failure Report, for somebody who may read the register. NULL when the caller may not, or when the UCN has no report — the caller then reads the tables under their own policies.';
