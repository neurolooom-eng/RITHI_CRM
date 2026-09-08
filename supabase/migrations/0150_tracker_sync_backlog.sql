-- ===========================================================================
-- THE TRACKER CATCHES UP WITH THE BACKLOG.
--
-- The user, 2026-09-08: "Update the Tracker as per backlog."
--
-- 0144 seeded the fifteen items open when the Tracker shipped. A day of work
-- has happened since: the 13485 review raised its own, three decisions were
-- PARKED at the user's direction, and Indoor Service went from an unanswered
-- question to a written plan. This adds what is open now and was not there
-- then.
--
-- ADDITIVE, AND IDEMPOTENT BY TITLE. Nothing is closed, renamed or deleted
-- here. An item somebody has since edited, re-owned or marked Done is left
-- exactly as they left it, and running the bundle twice adds nothing -- the
-- same rule 0144 follows, and the reason a seed can live in a bundle that is
-- replayed freely.
--
-- WHY NOT CLOSE THE ONES THAT ARE DONE. Because "done" is a judgement the
-- people using the list make, not one a migration should make for them: a row
-- closed by SQL is a row somebody has to re-open to argue with. The backlog
-- records what shipped; the Tracker records what those people are working on,
-- and the two are deliberately not the same list.
-- ===========================================================================

do $seed$
declare
  seeded int := 0;
  r      record;
begin
  if to_regclass('public.tracker_items') is null then
    raise notice 'tracker_items is missing -- run tracker.sql first';
    return;
  end if;

  for r in
    select * from (values
      -- ---- parked decisions (the user, 2026-09-08: "Park it in Backlog") ----
      (200, 'DECISION: Frequent Failure — the complaint condition, and old answers',
            'The rule is settled and written down: two or more failures INCLUDING the call under review, within a month, same equipment or the same part in the same machine, window and threshold editable in Admin Config. Two things block the build. (1) Does the same-equipment path still require a matching complaint? The rule of 2026-09-06 said yes; the written procedure does not mention it. (2) Review 2 auto-answers on a schedule (0124), so a new rule re-bases judgements already recorded — leave them as answered, or re-open them? Either way a quality record is being restated.',
            'Decision', 'DCCR'),
      (210, 'DECISION: ANNEXURE A — CMC''s bucket, and two missing call fields',
            'The SLA cannot express the procedure. sla_rules holds ONE target_hours per key; ANNEXURE A is a cover x problem-criticality x spare-availability matrix. Criticality and spare availability do not exist as fields on a call, so capturing them is a change to call registration rather than to a rules table. And CMC is a live cover type (WGP/OGP/CMC/AMC) that ANNEXURE A does not mention. Until then breach highlighting measures against targets the procedure does not set: closure = 5 days where it says 3, closure_spare_noncover = 10 where it says 15, and nothing at all for the four OGP rows.',
            'Decision', 'SLA'),
      (220, 'DECISION: Indoor Service — five questions before Phase 1',
            'The plan is written and phased (docs/INDOOR_SERVICE_PLAN.md). Five things to settle: does Central Service hold its own spare stock; must QC be done by somebody other than the person who did the work; does the SLA clock keep running while a machine is on the bench; the job-number series (IND26-0001?); and who may transfer a call to Indoor — Hotline only, as the procedure says, or managers too. Phase 1 stands alone and is what finally makes the Indoor Service heading appear, since a nav group with no pages renders as nothing.',
            'Decision', 'Indoor Service'),

      -- ---- the 13485 review ------------------------------------------------
      (230, 'Post-service verification against acceptance criteria (SR-006)',
            'The largest gap in the servicing requirements. §7.5.4 asks that it is verified that product requirements are met after servicing; "Solved" is a CALL outcome, not a statement that the device performs to specification. The Indoor procedure §4.5.6 already requires a quality check on completion — so the process exists and the RECORD lives outside this system. A per-product checklist of parameter, expected value and pass/fail, on the visit that closes a call.',
            'Claude', 'Quality'),
      (240, 'A measurement is not tied to a calibrated instrument (SR-020)',
            '§7.6. No instrument register, no calibration due dates, and a service report does not record WHICH instrument produced a reading — so a measurement does not evidence conformity, and an instrument later found out of calibration cannot be traced to the records it touched. Only worth building after SR-006 exists.',
            'Claude', 'Quality'),
      (250, 'The complaint determination is not recorded (SR-027)',
            'Cheapest real gain in the whole review, and now load-bearing: the field call register IS the complaint register by the decision of 2026-09-08, so a field marking WHICH calls are complaints is what makes the population producible. Without it the register says either that every field call is a complaint (untrue, and it inflates the rate) or that none is. One controlled field and a reason, on the Daily Call Review that already runs daily — plus SR-039, the recorded handoff to the system that holds CAPA, since §7.5.4(b) does not end at a system boundary.',
            'Claude', 'Quality'),
      (260, 'A complaint that never becomes a call has nowhere to live (SR-038)',
            'The exposure the boundary decision creates. If the field call register is the complaint register, a complaint arriving by any other route — a customer emailing Commercial about labelling, a distributor report on a device already replaced — is recorded nowhere. Either every complaint enters as a call, or the complaint register is elsewhere and this system feeds it. What cannot stand is the middle.',
            'Decision', 'Quality'),
      (270, 'Is any servicing subcontracted?',
            '§7.5.4 says "the organization OR ITS SUPPLIER". If any servicing is subcontracted, those records sit outside the daily analysis entirely and the gap is invisible from inside RITHI. Worth confirming either way — a no closes SR-035/036 permanently.',
            'Rithi Admin', 'Quality')
    ) as t(ord, title, detail, owner, area)
  loop
    if not exists (select 1 from public.tracker_items i where i.title = r.title) then
      insert into public.tracker_items (title, detail, owner, area, status, sort_order)
           values (r.title, r.detail, r.owner, r.area, 'Open', r.ord);
      seeded := seeded + 1;
    end if;
  end loop;

  raise notice 'Tracker: % item(s) added from the backlog (% already there)',
    seeded, 8 - seeded;
end $seed$;
