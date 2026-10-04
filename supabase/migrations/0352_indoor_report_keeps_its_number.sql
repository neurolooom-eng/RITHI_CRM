-- ===========================================================================
-- 0352 — AN UPLOADED INDOOR SERVICE REPORT KEEPS ITS NUMBER
--        (second re-review, 2026-10-03: D-115)
--
-- The stage guard (0323) refuses UPLOADING the report without its Indoor
-- Service Report No, but nothing refused BLANKING the number afterwards.
-- Measured: setting indoor_report_no to empty on a job with a report file
-- succeeded, and the register then shows a report with no number.
--
-- A TRIGGER OF ITS OWN, not another rule in indoor_jobs_guard: that function
-- has been rebuilt more than once, and a rebuild from an old revision is how
-- this project has lost rules before (0210 / 0217). This one says one thing:
-- while the job carries a report file, its number is not blank.
--
-- What keeps working: re-uploading a report sets the number and the file in
-- the same update (saveIndoorReport); correcting the number to another
-- non-blank value is still allowed; a connection with no session (a repair
-- in the SQL editor) is not stopped.
-- In the indoor module, after 0336.
-- ===========================================================================

create or replace function public.indoor_report_keeps_its_number()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;          -- a migration, a repair
  if btrim(coalesce(new.report_file_url, '')) <> ''
     and btrim(coalesce(new.indoor_report_no, '')) = '' then
    raise exception 'This job has an uploaded Indoor Service Report, so its Indoor Service Report No cannot be blank'
      using errcode = '23514';
  end if;
  return new;
end $$;
revoke execute on function public.indoor_report_keeps_its_number() from public, anon, authenticated;

drop trigger if exists indoor_report_keeps_its_number on public.indoor_jobs;
create trigger indoor_report_keeps_its_number
  before update on public.indoor_jobs
  for each row execute function public.indoor_report_keeps_its_number();
