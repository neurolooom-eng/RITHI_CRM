-- ===========================================================================
-- D-175 (re-review 5, 2026-10-12): an FFR's number, its imported marker and
-- its raiser's name are not the caller's to choose.
--
-- ffr_stamp() kept a caller-supplied ffr_no on insert and blanked raised_by
-- whenever imported_from was non-blank, with no check that the caller is an
-- importer; ffr_history_created() then dated the "Report raised" entry at the
-- FFR Date under the caller's raised_by_name -- and for an ordinary raise the
-- log's "Who" was also the client's raised_by_name. Measured: an RM holding
-- ffr.manage and not bulk.upload raised FFR - 001/20 dated 2020, marked
-- imported under SOMEBODY ELSE, and the same number again on another machine.
--
-- A trigger running AS THE CALLER (not as the owner) applies three rules to a
-- signed-in caller writing DIRECTLY (current_user = authenticated) who is not
-- an importer (bulk.upload / import.panel):
--   * on insert the number is the database's: a supplied ffr_no is discarded,
--     so ffr_stamp issues the next one;
--   * imported_from is cleared on insert and kept as it was on an update, so
--     the import treatment (raised_by blank, the log dated at the FFR Date)
--     applies to imports alone;
--   * raised_by_name is the session's own name (my_display_name()), so the
--     log's "Who" is the person who raised it.
-- The reviewer's Raise FFR (ffr_from_review / raise_ffr) runs as the owner, so
-- current_user is not authenticated there and nothing it writes changes; the
-- FFR Register upload is an importer's. Named a_* so it fires before
-- ffr_customer_and_problem_required and zz_ffr_stamp (triggers fire by name).
-- ===========================================================================
create or replace function public.ffr_caller_rules()
returns trigger language plpgsql set search_path = public as $$
begin
  if current_user <> 'authenticated' or auth.uid() is null
     or public.has_perm('bulk.upload') or public.has_perm('import.panel') then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.ffr_no := null;
    new.imported_from := '';
    new.raised_by_name := coalesce(nullif(btrim(public.my_display_name()), ''), new.raised_by_name);
  else
    new.imported_from := old.imported_from;
    new.raised_by_name := old.raised_by_name;
  end if;
  return new;
end $$;
revoke execute on function public.ffr_caller_rules() from public, anon;

drop trigger if exists a_ffr_caller_rules on public.field_failure_reports;
create trigger a_ffr_caller_rules
  before insert or update on public.field_failure_reports
  for each row execute function public.ffr_caller_rules();
