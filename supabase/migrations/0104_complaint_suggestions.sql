-- ===========================================================================
-- SUGGESTING THE STANDARD COMPLAINT — from the register's own evidence.
--
-- The desk types what the customer said ("Oxygen sensor defective") into
-- Reported Problem, and must then find the right one of FIVE HUNDRED AND SEVEN
-- Standard Complaints. That is the field this suggests.
--
-- The evidence is already here: eighteen thousand past calls, each pairing a
-- reported problem with the standard complaint somebody chose for it. So the
-- first and best answer to "what is this?" is "here is what was chosen the last
-- twelve times somebody described it that way, on this product".
--
-- TWO SOURCES, IN THAT ORDER OF TRUST:
--   1. What was CHOSEN on past calls whose reported problem reads like this one
--      — a decision a person actually made, not a guess about words.
--   2. The wording of the complaint value itself, where no past call is close
--      enough. Weaker, and ranked below.
--
-- Both use the trigram indexes 0052 already built on complaint_reported and
-- standard_complaint, so `%` is an index lookup rather than a scan.
--
-- WHY SECURITY DEFINER. Read as the caller, an engineer would draw suggestions
-- only from their OWN calls, and the newest engineer would get the worst
-- suggestions — the opposite of what is wanted. It returns AGGREGATES ONLY:
-- a master-list value, a count and a score. No call, party, engineer or serial
-- crosses the boundary, so a reader learns nothing about a call they may not
-- see. That is the whole reason it is safe to define it this way.
--
-- WHERE THIS RUNS OUT. It is good at wording that recurs, which on a service
-- desk is most of it — the same fault gets typed the same way. It is weak on a
-- genuine paraphrase: "battery not holding charge" against "Internal battery
-- inoperant" shares one word and scores under any threshold worth using, and
-- pushing the threshold down far enough to catch it drags in everything else.
-- That gap is what the AI layer is for, and it is why the AI layer is worth
-- having rather than an ornament. This layer answers first, always, and the
-- screen works whether or not the other one is switched on.
--
-- IT SUGGESTS. IT DOES NOT DECIDE. The value is written by the person choosing
-- it, on their own authority, and `complaint_suggestions` records what was
-- offered and what was taken so the accept rate can be read rather than
-- assumed.
-- ===========================================================================

create or replace function public.suggest_standard_complaint(
  p_text text, p_product text default '', p_limit int default 5
)
returns table (value text, chosen int, score real, why text)
language sql stable security definer set search_path = public as $$
  with asked as (
    select btrim(coalesce(p_text, '')) as t, btrim(coalesce(p_product, '')) as p
  ),
  -- 1. What a person chose, on a call whose reported problem reads like this.
  --    Narrowed to the product when one is given, because the same words mean
  --    different things on different machines.
  from_calls as (
    select c.standard_complaint as v,
           count(*)::int as n,
           max(greatest(similarity(c.complaint_reported, a.t),
                        word_similarity(a.t, c.complaint_reported))) as sim
      from public.calls c, asked a
     where a.t <> ''
       and coalesce(c.standard_complaint, '') <> ''
       and coalesce(c.complaint_reported, '') <> ''
       and (a.p = '' or c.product_name = a.p)
       -- TWO WAYS OF BEING ALIKE, because whole-string similarity alone misses
       -- the way people actually retype a fault. "O2 sensor faulty" against
       -- "Oxygen sensor defective" scores 0.24 on similarity() — under the 0.3
       -- threshold, so the twelve calls that settled exactly this question were
       -- invisible — and 0.41 on word_similarity(), which asks whether the words
       -- asked for appear in what was written rather than whether the two
       -- strings look alike end to end.
       --
       -- The `%` arm is index-backed (0052's trigram indexes). The word arm is
       -- not, which is why it is worth scoping to the product: a scan of one
       -- product's calls is small, a scan of every call is not.
       and (c.complaint_reported % a.t or word_similarity(a.t, c.complaint_reported) >= 0.35)
     group by c.standard_complaint
  ),
  -- 2. The complaint's own wording, for a description nothing has been called
  --    before. Only live values: a deactivated one must not be offered again.
  from_master as (
    select m.value as v, greatest(similarity(m.value, a.t), word_similarity(a.t, m.value)) as sim
      from public.masters m, asked a
     where a.t <> ''
       and m.name = 'complaint'
       and coalesce(m.active, true)
       and (m.value % a.t or word_similarity(a.t, m.value) >= 0.35)
  ),
  merged as (
    select coalesce(fc.v, fm.v) as v,
           coalesce(fc.n, 0) as n,
           greatest(coalesce(fc.sim, 0), coalesce(fm.sim, 0)) as sim,
           (fc.v is not null) as seen
      from from_calls fc
      full join from_master fm on fm.v = fc.v
  )
  select v,
         n,
         -- A decision somebody made outranks a resemblance between two strings,
         -- so evidence carries the weight and the wording breaks ties. The log
         -- is there to be argued with: if the ranking is wrong, the accept rate
         -- will say so.
         (sim + least(n, 20) * 0.05)::real as score,
         case
           when n >= 2 then 'chosen on ' || n || ' similar call' || case when n = 1 then '' else 's' end
           when n = 1 then 'chosen once on a similar call'
           else 'wording match'
         end as why
    from merged
   where v is not null and v <> ''
   order by score desc, n desc, v
   limit greatest(coalesce(p_limit, 5), 1);
$$;
revoke all on function public.suggest_standard_complaint(text, text, int) from public;
grant execute on function public.suggest_standard_complaint(text, text, int) to authenticated;

-- ---------------------------------------------------------------------------
-- WHAT WAS OFFERED, AND WHAT WAS TAKEN.
--
-- Without this the only honest thing that could be said about the feature is
-- "it seems to help". One row per registration where a suggestion was shown:
-- the list offered in order, and the value the person actually chose. The
-- accept rate falls out of it, and so does the answer to "is the AI adding
-- anything the register's own evidence did not already give us".
--
-- It records a SUGGESTION, not a quality record, so it is not in the
-- record_audit set and carries no before/after image.
-- ---------------------------------------------------------------------------
create table if not exists public.complaint_suggestions (
  id            bigint generated always as identity primary key,
  asked_at      timestamptz not null default now(),
  asked_by      uuid,
  asked_by_name text not null default '',
  product       text not null default '',
  reported      text not null default '',
  -- [{ value, why, rank, source }] — source is 'register' or 'ai'.
  suggested     jsonb not null default '[]'::jsonb,
  -- What the person chose. '' means they took none of them, which is the most
  -- interesting row in the table.
  accepted      text not null default '',
  accepted_rank int,
  ucn           text not null default ''
);
create index if not exists complaint_suggestions_at_idx on public.complaint_suggestions (asked_at desc);

alter table public.complaint_suggestions enable row level security;
grant select, insert on public.complaint_suggestions to authenticated;

drop policy if exists cs_insert on public.complaint_suggestions;
create policy cs_insert on public.complaint_suggestions for insert
  with check (auth.role() = 'authenticated');
drop policy if exists cs_read on public.complaint_suggestions;
create policy cs_read on public.complaint_suggestions for select
  using ((select public.is_admin()) or (select public.has_perm('audit.view')));

-- Stamp the author in the database rather than trusting the client with it.
create or replace function public.complaint_suggestions_bi()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.asked_by := auth.uid();
  new.asked_by_name := coalesce((select full_name from public.profiles where id = auth.uid()), '');
  return new;
end $$;
drop trigger if exists complaint_suggestions_bi on public.complaint_suggestions;
create trigger complaint_suggestions_bi before insert on public.complaint_suggestions
  for each row execute function public.complaint_suggestions_bi();
