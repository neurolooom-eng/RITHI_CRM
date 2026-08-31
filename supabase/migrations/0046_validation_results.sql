-- ===========================================================================
-- Validation execution tracker — stores the executed result of each test case
-- (IQ/OQ/PQ) in the database instead of on paper, so the validation evidence
-- lives with the system. One current record per test id (latest execution).
-- QA / admins record results; everyone signed in may read them.
-- ===========================================================================

create table if not exists public.validation_results (
  test_id     text primary key,          -- e.g. 'OQ-02'
  result      text not null default '',   -- Pass | Fail | N/A | (blank = not executed)
  actual      text default '',
  tester      text default '',
  notes       text default '',
  executed_at timestamptz,
  recorded_by uuid references auth.users (id),
  updated_at  timestamptz not null default now()
);

create or replace function public.validation_results_stamp()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := now();
  if auth.uid() is not null then new.recorded_by := auth.uid(); end if;
  if new.result is not null and new.result <> '' and new.executed_at is null then
    new.executed_at := now();
  end if;
  return new;
end $$;
drop trigger if exists validation_results_stamp on public.validation_results;
create trigger validation_results_stamp before insert or update on public.validation_results
  for each row execute function public.validation_results_stamp();

alter table public.validation_results enable row level security;
grant select, insert, update on public.validation_results to authenticated;

drop policy if exists valres_read on public.validation_results;
create policy valres_read on public.validation_results for select using (auth.role() = 'authenticated');

drop policy if exists valres_write on public.validation_results;
create policy valres_write on public.validation_results for all
  using (public.is_admin() or public.has_perm('config.manage'))
  with check (public.is_admin() or public.has_perm('config.manage'));
