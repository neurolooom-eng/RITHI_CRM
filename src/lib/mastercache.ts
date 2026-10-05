// ===========================================================================
// WHAT A DEVICE DOES WITH ITS STORED COPY OF A DROPDOWN LIST.
//
// The user, 2026-09-29: "Engineers are often in remote location and Product
// Database doesn't change every minute - so my thought is we can refresh it
// every 6 hrs and load a cached database for the users so that they never hit
// a load error."
//
// TWO RULES, and the first was a fault before it was a feature. Until now a
// refresh that FAILED returned an empty list, and the hook put that empty list
// on screen IN PLACE OF the good copy it had just shown -- so on a weak signal a
// phone holding yesterday's perfectly good list flashed it for one frame and
// then offered nothing. Poor signal did not mean "a slightly old list"; it
// meant no list at all.
//
//   1. A FAILED OR EMPTY REFRESH NEVER REPLACES A GOOD LIST. For every list. An
//      empty answer counts as a failure here too: no register in this system is
//      legitimately empty in use, and the one time it was -- the Product
//      Database between its delete and its reload on 2026-09-25 -- keeping the
//      previous copy was exactly right.
//   2. SOME LISTS ARE NOT RE-READ WHILE THE COPY IS YOUNG. The product list
//      changes when somebody loads a sale, not by the minute, so inside six
//      hours it opens from the device with no network call at all. "Clear Cache
//      and Update" still forces a fresh copy.
//
// PURE, AND IN ITS OWN MODULE, for the paging.ts reason: masters.ts reaches
// supabase.ts, which reads import.meta.env, so nothing there can be run by a
// check. check:paging exercises both rules.
// ===========================================================================

export const HOUR = 60 * 60 * 1000;
export const DAY = 24 * HOUR;

/** Lists that are served from the device while their stored copy is younger
 *  than this. A list not named here is re-read on every load, as before. */
export const REFRESH_EVERY: Record<string, number> = {
  product: 6 * HOUR,
  // The Standard Complaints WITH their products, which the Call Request and
  // every call form filter by (the user, 2026-09-29: "Since this is also
  // related to Call Request, make this offline"). Edited rarely, and an edit on
  // the Standard Complaint screen clears this device's copy at once.
  // ONCE IN TEN DAYS (the user, 2026-10-05: "Standard Complaint, Party Master
  // dont change Frequently, It can be downloaded Once in 10 Days. Only Product
  // Database and Part Master Can have frequent changes").
  complaintProducts: 10 * DAY,
  // THE PART MASTER the spare pickers read, with each part's products, and the
  // accessories of each product (the user, 2026-10-05: "Cache Part Master
  // along with Other Cached Registers"). The Part Master screen clears this
  // device's copy whenever it reloads, so an edit there reaches the pickers.
  spareProducts: 6 * HOUR,
  productAccessories: 6 * HOUR,
};

/** True when the stored copy is young enough to use without asking the server. */
export function isFresh(name: string, storedAt: number | null, now: number): boolean {
  const every = REFRESH_EVERY[name];
  if (!every || !storedAt) return false;
  const age = now - storedAt;
  return age >= 0 && age < every;
}

/** What to show after a refresh. `fetched` is null when the refresh FAILED. */
export function afterRefresh(
  stored: string[] | null,
  fetched: string[] | null,
): { values: string[]; failed: boolean; fromCache: boolean } {
  if (fetched && fetched.length) return { values: fetched, failed: false, fromCache: false };
  if (stored && stored.length) return { values: stored, failed: false, fromCache: true };
  // Nothing good to show. "Failed" only if the refresh actually failed -- an
  // honest empty answer with no copy to fall back on is not a failure.
  return { values: [], failed: fetched === null, fromCache: false };
}
