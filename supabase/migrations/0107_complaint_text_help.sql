-- ===========================================================================
-- THE COMPLAINT IS ALREADY WRITTEN IN A HOUSE STYLE. HELP PEOPLE KEEP IT.
--
-- Reported Problem is free text, but the register's is not freely written: the
-- alarm number is used wherever the machine gives one, the terms are the
-- manufacturer's, and the same fault comes back in the same words. That style
-- is worth something — it is why searching this register works at all, and why
-- the Standard Complaint suggestions in 0104 have anything to go on. It
-- survives on habit, and habit is what a new joiner does not have.
--
-- So the same treatment the Standard Complaint got, one field earlier, on the
-- text itself. TWO KINDS OF HELP, both drawn from things that already exist:
--
--   1. THE ALARM NUMBER, IN THE PRODUCT'S OWN FORM. The alarm list is already
--      curated, per product, in the `dccrgrouping` master — "ALARM 012" for
--      COMM, "Alarm 012" for MONNAL T75, and 54 more for T60. Somebody typing
--      "al 12" or "alarm12" gets offered the canonical spelling for THIS
--      product. It is the same alarm; the register just wants it written once.
--
--   2. HOW THIS FAULT HAS BEEN WRITTEN BEFORE, on this product, counted. Not a
--      style guide anyone has to maintain — the register's own most-used
--      wording for what is being described, so phrasing converges instead of
--      drifting a little further with each new joiner.
--
-- AND ONE CHECK, which is the part that catches a mistake rather than saving
-- keystrokes: an alarm number this product does not have. "Alarm 099" on a
-- MONNAL T60 is a typo, or the wrong machine, and today nothing says so until
-- somebody reads it months later in a review.
--
-- WHY SECURITY DEFINER — the same reason as 0104, and the same limit. Read as
-- the caller, an engineer would only ever be shown their own wording, so the
-- newest person gets the least help. It returns AGGREGATES ONLY: a phrase, a
-- count, a reason. No call, party, serial or engineer crosses the boundary.
--
-- IT SUGGESTS. IT DOES NOT REWRITE. Nothing here edits what somebody typed;
-- every value is offered, and taken or ignored by the person writing it.
-- ===========================================================================

-- pg_trgm, which `similarity` / `word_similarity` / `%` below all need. It is
-- installed by 0052 — but 0052 is in the `performance` module, which runs LAST,
-- and this one is in `call_requests`, which runs seventh. So a FRESH apply of
-- `all.sql` (or of `call_requests.sql` on a database that has not had 0052 yet)
-- stopped dead here: a `language sql` body is parsed when the function is
-- created, so the missing operator is an error at apply time, not at run time.
-- Idempotent, and a no-op on the live project, which has had it since 0052.
create extension if not exists pg_trgm;

-- ---------------------------------------------------------------------------
-- The alarm number as this product writes it.
--
-- Returns the canonical master value for an alarm number, preferring the
-- product's own list over COMM, so "al 12" on a MONNAL T75 comes back as
-- "Alarm 012" and on anything else as "ALARM 012". Empty when the product has
-- no such alarm — which is the whole point of the check above.
-- ---------------------------------------------------------------------------
create or replace function public.alarm_value_for(p_product text, p_number int)
returns text
language sql stable security definer set search_path = public as $$
  select m.value
    from public.masters m
   where m.name = 'dccrgrouping'
     and coalesce(m.active, true)
     -- The number, however the master spells it: ALARM 012 / Alarm 12 / AL 012.
     and (regexp_replace(upper(m.value), '^AL(ARM)?[^0-9]*([0-9]+).*$', '\2') ~ '^[0-9]+$')
     and upper(m.value) ~ '^AL(ARM)?[^0-9]*[0-9]+'
     and regexp_replace(upper(m.value), '^AL(ARM)?[^0-9]*([0-9]+).*$', '\2')::int = p_number
     and coalesce(m.extra->>'product', '') in (btrim(coalesce(p_product, '')), 'COMM')
   -- The product's own spelling wins over the common list.
   order by (coalesce(m.extra->>'product', '') = btrim(coalesce(p_product, ''))) desc, m.value
   limit 1;
$$;
revoke all on function public.alarm_value_for(text, int) from public;
grant execute on function public.alarm_value_for(text, int) to authenticated;

-- ---------------------------------------------------------------------------
-- What to offer under Reported Problem.
--
-- `kind` says which of the two it is, because they are not the same claim and
-- the screen must not present them as if they were:
--   'alarm'   — the canonical spelling of an alarm number already typed
--   'phrase'  — how this fault has been written on past calls
--   'unknown' — an alarm number this product does not have (a warning, and the
--               only row that is not something to click)
-- ---------------------------------------------------------------------------
create or replace function public.suggest_complaint_text(
  p_text text, p_product text default '', p_limit int default 4
)
returns table (value text, used int, kind text, why text)
language sql stable security definer set search_path = public as $$
  with asked as (
    select btrim(coalesce(p_text, '')) as t, btrim(coalesce(p_product, '')) as p
  ),
  -- The alarm number as typed, in any of the forms people use for it. Only the
  -- FIRST is considered: a complaint naming two alarms is describing two
  -- things, and picking one of them to canonicalise would be a guess.
  typed as (
    select a.p,
           (regexp_match(upper(a.t), '\mAL(?:ARM)?[[:space:]._-]*0*([0-9]{1,3})\M'))[1]::int as num
      from asked a
     where a.t <> ''
  ),
  -- 1. The canonical spelling — offered only when it differs from what is
  --    already written, since offering somebody the text they just typed is
  --    noise.
  alarm as (
    select public.alarm_value_for(t.p, t.num) as v, t.num
      from typed t
     where t.num is not null
  ),
  alarm_rows as (
    select al.v as value,
           (select count(*)::int from public.calls c, asked a
             where (a.p = '' or c.product_name = a.p)
               and c.complaint_reported ilike '%' || al.v || '%') as used,
           'alarm'::text as kind,
           'how ' || coalesce(nullif(btrim(a.p), ''), 'the register') || ' writes alarm ' || al.num as why
      from alarm al, asked a
     where al.v is not null
       and position(lower(al.v) in lower(a.t)) = 0
    union all
    -- The check. A number the product's alarm list does not carry.
    select 'Alarm ' || lpad(al.num::text, 3, '0'),
           0,
           'unknown'::text,
           coalesce(nullif(btrim(a.p), ''), 'This product') || ' has no alarm ' || al.num || ' — check the number'
      from alarm al, asked a
     where al.v is null
       and a.p <> ''
       -- Only worth saying when this product HAS a curated alarm list; silence
       -- is right where there is nothing to check against.
       and exists (select 1 from public.masters m
                    where m.name = 'dccrgrouping' and coalesce(m.active, true)
                      and upper(m.value) ~ '^AL(ARM)?[^0-9]*[0-9]+'
                      and coalesce(m.extra->>'product', '') = a.p)
  ),
  -- 2. How this fault has been written before, on this product. Grouped on the
  --    text itself, so the count is "written this way N times" — the phrasing
  --    that has already won.
  phrases as (
    select btrim(c.complaint_reported) as v, count(*)::int as n,
           max(greatest(similarity(c.complaint_reported, a.t),
                        word_similarity(a.t, c.complaint_reported))) as sim
      from public.calls c, asked a
     where a.t <> ''
       and coalesce(c.complaint_reported, '') <> ''
       and (a.p = '' or c.product_name = a.p)
       -- Index-backed arm first (0052's trigram index on complaint_reported),
       -- then the word arm for a retyping that does not look alike end to end.
       and (c.complaint_reported % a.t or word_similarity(a.t, c.complaint_reported) >= 0.4)
       -- Not the text already written, and not a one-off: a phrasing used once
       -- is not a house style, it is somebody's sentence.
       and lower(btrim(c.complaint_reported)) <> lower(a.t)
     group by btrim(c.complaint_reported)
    having count(*) >= 2
  )
  select value, used, kind, why from alarm_rows
  union all
  select v,
         n,
         'phrase'::text,
         'written this way on ' || n || ' calls'
    from (select v, n, sim from phrases order by (sim + least(n, 20) * 0.03) desc, n desc limit 6) p
  limit greatest(coalesce(p_limit, 4), 1);
$$;
revoke all on function public.suggest_complaint_text(text, text, int) from public;
grant execute on function public.suggest_complaint_text(text, text, int) to authenticated;
