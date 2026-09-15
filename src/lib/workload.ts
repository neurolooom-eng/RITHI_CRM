// ===========================================================================
// MY WORKLOAD — the counts that used to sit on top of every register.
//
// The user, 2026-09-15: "Remove such cards in Main Views. Move those to a
// Separate KPI Cards Page where ever applicable. It should be interactive -
// Say if i click on Pending, it should give me the List." Asked which cards,
// the answer was every card off every register; asked what to call it, My
// Workload, under Overview.
//
// A SECTION IS DEFINED HERE, NOT ON THE REGISTER, and the counts are derived
// with the register's OWN helpers (`spareflow.ts`, `callstate.tsx`) rather than
// re-implemented. A count that disagrees with the register it links to is worse
// than no count: somebody opens the list to find a different number and stops
// trusting both.
//
// TWO KINDS OF CARD AND THEY ARE NOT INTERCHANGEABLE:
//   • a QUEUE has a list behind it, so it opens the register with that filter;
//   • a FIGURE counts units, engineers or days. There is no list of 12 "units
//     in the field" and none of an ageing of 4.2 days, so it opens nothing and
//     does not look as though it would. `KpiCard` renders the two differently
//     by whether `onOpen` is given, which is why `to` is optional here.
//
// EVERY COUNT IS OVER WHAT LOADED. These registers page a thousand rows at a
// time, so a section that has not read everything says `more`, and the card
// shows `+` — the rule this project applies everywhere else and would be
// easiest to drop on a screen made of counts.
// ===========================================================================
import type { KpiTone } from '../components/kpi/Kpi';

export interface WorkloadCard {
  label: string;
  value: number;
  sub: string;
  icon: string;
  tone: KpiTone;
  /** The register this opens, with the filter it should arrive carrying.
   *  Absent = a figure, not a queue: it opens nothing and must not look as
   *  though it would. */
  to?: { path: string; state?: Record<string, unknown>; opens: string };
}

export interface WorkloadSection {
  key: string;
  title: string;
  /** The register these came off, for the "open the whole register" link. */
  path: string;
  /** Which permission the reader needs — a section whose register they cannot
   *  open is not shown at all, rather than shown and refused on the click. */
  needs: string;
  cards: WorkloadCard[];
  /** True while rows are still waiting behind Load more, so every count in the
   *  section is a lower bound. */
  more: boolean;
}
