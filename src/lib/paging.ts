// ---------------------------------------------------------------------------
// EVERY ROW A QUERY MATCHES, IN 1,000-ROW REQUESTS.
//
// POSTGREST CAPS A RESPONSE AT 1,000 ROWS HOWEVER LARGE THE `limit` SAYS, and
// it does it SILENTLY — no error, no flag, just a thousand rows. So
// `.limit(20000)` is not a bigger request, it is a lie that reads like a
// precaution, which is why this kept being written and kept not being noticed.
//
// Reported from use, 2026-09-14: Product & Party Search on ORION-G — 2,547
// machines on the register, and the serial box said "0 of 1000" and could not
// find serial 2410. The count beside the product was right (a VIEW computes it
// server-side); the list of serials was the first thousand of two and a half.
//
// It had been diagnosed ONCE, for `listCallRequests`, and the note there says
// exactly this. The fix went into that one function and the same `.limit(n)`
// was left in a dozen others — so this is the shared one, and `check:ui`
// refuses a new unpaged `.limit()` above the cap.
//
// ORDER IS NOT OPTIONAL WHEN PAGING. Without one, PostgREST may return page 2
// overlapping page 1 and a row is then dropped or doubled, which is worse than
// truncation because it looks complete. Every caller passes a deterministic
// order — the primary key where there is one.
export const PG_PAGE = 1000;
export async function allRows<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message?: string; code?: string } | null }>,
  cap = 100000,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; from < cap; from += PG_PAGE) {
    const { data, error } = await page(from, Math.min(from + PG_PAGE, cap) - 1);
    if (error) throw new Error(pageError(error));
    const rows = data ?? [];
    out.push(...rows);
    // A short page is the last page. Asking again would cost a request to be
    // told the same thing.
    if (rows.length < PG_PAGE) break;
  }
  return out;
}

// The message a failing page reports. Deliberately NOT `errMsg` from
// ./supabase: importing that file pulls in `import.meta.env` and the Supabase
// client, and this module exists to be importable without either. The two
// phrasings people act on are kept.
function pageError(e: { message?: string; code?: string }): string {
  const m = String(e?.message ?? 'Unknown error');
  if (m.startsWith('RBAC: ')) return m.slice(6).replace(/^./, (c) => c.toUpperCase()) + '.';
  if (e?.code === '42501' || /row-level security/i.test(m)) return 'Your role does not have permission for this action.';
  return m;
}

// ===========================================================================
// RE-READ AS FAR AS THE READER HAD GOT (finding 22).
//
// A register that loads a page at a time and refreshes itself every half hour
// used to refresh by reading PAGE ONE AGAIN -- so somebody who had pressed
// Load more twice was put back to the first thousand rows, with no word said.
// This re-reads the first `want` rows, a page at a time (the server caps every
// response at PG_PAGE, so one big request is not an option), and says whether
// more may exist beyond them: true only when the last page came back FULL,
// which is the same end-of-data signal the pagers use.
//
// `page(limit, offset)` is the screen's own list function, so the order is the
// one it already pages in -- which must be unique, or re-reading several pages
// can hand one row to two pages and another to none.
// ===========================================================================
export async function readUpTo<T>(
  page: (limit: number, offset: number) => Promise<T[]>,
  want: number,
  size = PG_PAGE,
): Promise<{ rows: T[]; more: boolean }> {
  const rows: T[] = [];
  let more = false;
  const upTo = Math.max(size, want);
  for (let from = 0; from < upTo; from += size) {
    const got = await page(size, from);
    rows.push(...got);
    more = got.length === size;
    if (!more) break;
  }
  return { rows, more };
}
