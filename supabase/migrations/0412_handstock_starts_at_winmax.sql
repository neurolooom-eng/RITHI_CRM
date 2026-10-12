-- ===========================================================================
-- 0412 -- HAND STOCK STARTS AT THE WINMAX OPENING, 09-JUN-2022 (D-162; the
-- user, 2026-10-12: "Skip all consumption & Stockout before 10June2022 --
-- 10June2022 - Winmax Opening Resets all old transactions", then, on being
-- told the WinMax pool is dated 09-Jun-2022: "correct, its 9 Jun").
--
-- The WinMax HS pool is the balance as it stood when the sheet era began,
-- dated 09-Jun-2022. Everything before it is already inside that figure, so
-- counting it again is double counting -- MP-010 / SUNIL KUMAR.K.V read -2
-- because three consumptions of March 2022 were taken off a balance struck
-- three months after them.
--
-- NOTHING NEW IS BUILT FOR IT. 0096's period close is this exact line: every
-- arm of handstock_movements -- stock outs, consumption, transfers, returns,
-- adjustments, historical and live, and the opening pools themselves -- counts
-- only what falls at or after handstock_cutoff(). Closing through 08-Jun-2022
-- puts the line at the start of 09-Jun-2022, so the WinMax pool counts and
-- everything older does not. NOTHING IS DELETED: the old rows stay in their
-- tables and in every report that reads them; only hand stock stops counting
-- them.
--
-- Measured on the live project first (_winmax_cut_and_labour.sql): before the
-- line, 69 historical consumptions (76 units) and 10 returns (12 units), no
-- stock out; 41 engineer-and-part lines change, 10 stop being negative and
-- none becomes negative; MP-010 / SUNIL goes from -2 to 1.
--
-- THE LINE IS DRAWN AT MIDNIGHT IN INDIA, NOT AT MIDNIGHT UTC. 0096 cast the
-- date with `::timestamptz`, which takes the session's zone -- UTC on the
-- live project -- so the line fell at 05:30 IST, and three consumptions made
-- on 09-Jun-2022 before 05:30 (4 units) would have been cut with the day
-- before. A day here is an Indian day. handstock_line() is the ONE place the
-- line is computed, and close_handstock_period() now reads it too: 0096's
-- rule is that the close and the arms divide the SAME instant, and moving one
-- of them alone would put a few hours on both sides.
--
-- The close is written by a migration, which runs with no signed-in user, so
-- it updates handstock_period directly (set_handstock_cutoff() asks for a
-- role). It never moves an existing line BACKWARDS: a later close stands.
-- ===========================================================================

-- The first instant still open after closing through p_through: the start of
-- the next day in India.
create or replace function public.handstock_line(p_through date)
returns timestamptz language sql immutable set search_path = public as $$
  select ((p_through + 1)::timestamp at time zone 'Asia/Kolkata')
$$;
comment on function public.handstock_line(date) is
  'The first instant still open after closing hand stock through a date: the start of the next day in India (0412). handstock_cutoff() and close_handstock_period() both read it, so they divide the same instant.';

create or replace function public.handstock_cutoff()
returns timestamptz language sql stable security definer set search_path = public as $$
  select coalesce(public.handstock_line((select closed_through from public.handstock_period limit 1)),
                  '-infinity'::timestamptz);
$$;
grant execute on function public.handstock_cutoff() to authenticated;

-- 0096's body, read out of a database built from every migration; ONE line
-- changed -- the line is handstock_line(p_through), not a UTC cast.
create or replace function public.close_handstock_period(p_through date)
returns table(pools integer, parts numeric)
language plpgsql security definer set search_path = public as $function$
declare
  v_source text := 'Opening ' || to_char(p_through + 1, 'YYYY');
  v_name   text := coalesce((select full_name from public.profiles where id = auth.uid()), '');
begin
  if not (public.is_admin() or public.has_perm('consumption.reconcile')) then
    raise exception 'Closing a hand-stock period is the Spare Coordinator''s or an administrator''s to do';
  end if;
  if p_through is null or p_through >= current_date then
    raise exception 'Close a period that has ENDED — % is not in the past', p_through;
  end if;

  -- `< the first open instant` — the exact complement of what the arms keep, so
  -- the closing day belongs to the figure and to nothing else.
  create temp table _close on commit drop as
  select engineer_key,
         min(engineer) filter (where engineer <> '') as engineer,
         part_code,
         min(part)     filter (where part <> '')     as part,
         sum(case when direction = 'IN' then qty else -qty end) as on_hand
    from public.handstock_movements
   where moved_at is null
      or moved_at < public.handstock_line(p_through)
   group by engineer_key, part_code
  having sum(case when direction = 'IN' then qty else -qty end) <> 0;

  insert into public.handstock_opening (engineer, part, qty, as_of, source, remarks, recorded_by, recorded_by_name)
  select coalesce(engineer, engineer_key), coalesce(part, part_code), on_hand,
         p_through + 1, v_source,
         'Closed through ' || to_char(p_through, 'DD-Mon-YYYY') || ' — the net of every movement up to that date.',
         auth.uid(), v_name
    from _close
   where coalesce(engineer, engineer_key) <> '' and coalesce(part, part_code) <> ''
  on conflict (engineer_key, part_code, source_key) do update
     set qty = excluded.qty, as_of = excluded.as_of, remarks = excluded.remarks, updated_at = now();

  update public.handstock_period
     set closed_through = p_through, closed_at = now(), closed_by = auth.uid(), closed_by_name = v_name
   where singleton;

  return query select count(*)::int, coalesce(sum(on_hand), 0) from _close;
end $function$;
revoke all on function public.close_handstock_period(date) from public;
grant execute on function public.close_handstock_period(date) to authenticated;

-- The line itself: closed through 08-Jun-2022, so 09-Jun-2022 is the first
-- day counted. Only ever forward.
insert into public.handstock_period (singleton) values (true) on conflict (singleton) do nothing;
update public.handstock_period
   set closed_through = date '2022-06-08', closed_at = now(), closed_by = null,
       closed_by_name = 'WinMax opening 09-Jun-2022 (0412)'
 where singleton and (closed_through is null or closed_through < date '2022-06-08');
