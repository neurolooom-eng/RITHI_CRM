// ---------------------------------------------------------------------------
// HOW OLD IS THIS CALL, AND WHEN DID IT STOP AGEING.
//
// The user, 2026-09-08: "Add Aging to All Calls - Field , Installation , PM --
// Counter should Stop once the Call is Solved."
//
// DERIVED, NOT STORED, and that is the whole design. Age depends on TODAY, so a
// stored column would be wrong by one every midnight and a generated column
// cannot hold it at all (`current_date` is not immutable). It could have gone
// in the `calls` view — and that view is the one whose rebuild has silently
// dropped `security_invoker` three times in this project, exposing every call
// to every user. The register already loads the registration date and the call's
// state, so the answer is arithmetic on rows that are already in the browser:
// no migration, no view, no risk.
//
// WHERE THE CLOCK STOPS. On the VISIT that closed the call, not on the day the
// report was typed up — the same rule the objectives use (0138), so a call that
// took nine days is nine days on both screens. A call solved with no visit date
// recorded stops at the registration date rather than running on: a missing
// keystroke should not age a finished call forever.
//
// CANCELLED STOPS TOO. The instruction named Solved, and a cancelled call is
// the same case for the same reason: nobody is waiting on it, so counting is
// reporting a delay that is not happening. It is called out here rather than
// left as an inference.
//
// A RE-OPENED CALL AGES AGAIN, because somebody is waiting again. It is open by
// definition (0057) and its clock restarts from the original registration —
// which is the honest number: the customer has been waiting since the day they
// first called, not since the day somebody re-opened the record.
// ---------------------------------------------------------------------------

const DAY = 24 * 60 * 60 * 1000;

/** Midnight, local, for a yyyy-mm-dd or an ISO timestamp. Ages are counted in
 *  whole days, so both ends are flattened before subtracting — otherwise a call
 *  raised at 9am and closed at 5pm the same day reads as 0.33 of a day. */
function dayOf(v: unknown): Date | null {
  const s = String(v ?? '').trim();
  if (!s) return null;
  const d = new Date(s.length <= 10 ? `${s}T00:00:00` : s);
  if (Number.isNaN(d.getTime())) return null;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export interface CallAging {
  days: number | null;      // null when the call has no registration date
  stopped: boolean;         // the clock has stopped (Solved or Cancelled)
  on: string;               // the day it stopped, where it has
}

export function callAging(row: {
  regDate?: unknown; callState?: unknown; lastVisitAt?: unknown; cancelledAt?: unknown;
}): CallAging {
  const start = dayOf(row.regDate);
  if (!start) return { days: null, stopped: false, on: '' };

  const state = String(row.callState ?? '');
  const cancelled = state === 'Cancelled';
  const solved = state === 'Solved';
  const stopped = solved || cancelled;

  // The day it stopped: the closing visit for a solved call, the cancellation
  // for a cancelled one. Where a solved call has no visit date, it stops at its
  // registration — see the note above.
  const end = !stopped ? new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate())
    : (cancelled ? dayOf(row.cancelledAt) : dayOf(row.lastVisitAt)) ?? start;

  const days = Math.max(0, Math.round((end.getTime() - start.getTime()) / DAY));
  return {
    days,
    stopped,
    on: stopped ? `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}` : '',
  };
}

/** The tone an age carries on the register. Thresholds are the SLA's own
 *  shape rather than invented ones: three days is the attending target across
 *  every row of ANNEXURE A, and fifteen is its longest completion target — so
 *  an open call past fifteen days is late by any reading of the procedure.
 *  A STOPPED clock is never coloured: the call is finished, and colouring a
 *  finished thing red says something is wrong when nothing is. */
export function agingTone(a: CallAging): 'ok' | 'warn' | 'late' | 'none' {
  if (a.days == null || a.stopped) return 'none';
  if (a.days > 15) return 'late';
  if (a.days > 3) return 'warn';
  return 'ok';
}
