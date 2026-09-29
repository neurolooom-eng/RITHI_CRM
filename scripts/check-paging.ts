// ===========================================================================
// THE PAGER — `npm run check:paging`.
//
// PostgREST caps a response at 1,000 rows however large the `limit` says, and
// it does it SILENTLY. `src/lib/paging.ts` is the one place that deals with
// that, and every register-sized read in the application now goes through it,
// so it is worth testing as BEHAVIOUR rather than as source text.
//
// The fake server below is the whole point: it HONOURS THE CAP, returning at
// most PG_PAGE rows whatever is asked of it — which is exactly what the real
// one does and what `.limit(20000)` hid for a year.
//
// 2,547 is not an arbitrary number. It is ORION-G on the user's own register,
// the machine count in the report that started this: the serial picker offered
// 1,000 of them and said "Nothing matches" to a serial that was there.
// ===========================================================================

import { allRows, readUpTo, distinctValues, PG_PAGE } from '../src/lib/paging';
let fail = 0;
const eq = (n: string, a: unknown, b: unknown) => {
  const ok = JSON.stringify(a) === JSON.stringify(b);
  if (!ok) fail++;
  console.log(`  ${ok ? '✓' : '✗'} ${n}${ok ? '' : `\n      got ${JSON.stringify(a)}\n      want ${JSON.stringify(b)}`}`);
};
// A fake PostgREST that HONOURS THE CAP: it never returns more than PG_PAGE
// rows, which is the whole behaviour the real one has and `.limit()` hides.
const server = (total: number) => {
  let calls = 0;
  const fn = async (from: number, to: number) => {
    calls++;
    const n = Math.min(to - from + 1, PG_PAGE);
    return { data: Array.from({ length: Math.max(0, Math.min(n, total - from)) }, (_, i) => ({ i: from + i })), error: null };
  };
  return { fn, calls: () => calls };
};
async function main() {
console.log('-- allRows pages past the 1,000-row cap --');
for (const total of [0, 1, 999, 1000, 1001, 2547, 5000]) {
  const s = server(total);
  const got = await allRows<{ i: number }>(s.fn, 20000);
  eq(`${total} rows come back whole`, got.length, total);
  if (total) eq(`  ...in order, first and last`, [got[0].i, got[got.length - 1].i], [0, total - 1]);
}
// 2,547 is the user's ORION-G. Three requests, not one — and not four.
{
  const s = server(2547);
  await allRows(s.fn, 20000);
  eq('2,547 machines take three requests', s.calls(), 3);
}
// A SHORT PAGE ENDS IT: 1,000 exactly must not cost a wasted extra request...
{
  const s = server(2000);
  await allRows(s.fn, 20000);
  eq('an exact multiple asks once more and stops', s.calls(), 3);
}
// ...and the cap is honoured rather than ignored.
{
  const s = server(5000);
  const got = await allRows(s.fn, 1500);
  eq('the caller’s cap is respected', got.length, 1500);
}
// AN ERROR ON ANY PAGE THROWS, rather than returning a short list that reads
// as "that is all there is".
{
  let n = 0;
  const bad = async () => (++n === 2
    ? { data: null, error: { message: 'boom' } }
    : { data: Array.from({ length: PG_PAGE }, (_, i) => ({ i })), error: null });
  let threw = '';
  try { await allRows(bad, 20000); } catch (e) { threw = e instanceof Error ? e.message : String(e); }
  eq('a failing page throws instead of truncating', /boom/.test(threw), true);
}
console.log('\n-- readUpTo re-reads as far as the reader had got (finding 22) --');
{
  // The screen's own (limit, offset) list function, over the same capped server.
  const lister = (total: number) => {
    const s = server(total);
    return { fn: async (limit: number, offset: number) => (await s.fn(offset, offset + limit - 1)).data ?? [], calls: s.calls };
  };
  // Pressed Load more twice on a 5,000-row register: 3,000 loaded. The refresh
  // must come back with 3,000, not 1,000, and say there is more.
  let l = lister(5000);
  let r = await readUpTo(l.fn, 3000);
  eq('3,000 loaded of 5,000: re-reads 3,000', r.rows.length, 3000);
  eq('...in three requests', l.calls(), 3);
  eq('...and says there may be more', r.more, true);
  eq('...with no row twice', new Set(r.rows.map((x) => (x as { i: number }).i)).size, 3000);
  // The register shrank below what was loaded: it stops at the short page.
  l = lister(2547);
  r = await readUpTo(l.fn, 3000);
  eq('3,000 loaded, register now 2,547: re-reads all 2,547', r.rows.length, 2547);
  eq('...and says that is all', r.more, false);
  // Nothing loaded yet (or less than a page): still reads one page.
  l = lister(5000);
  r = await readUpTo(l.fn, 0);
  eq('nothing loaded yet: reads one page', r.rows.length, 1000);
  eq('...and says there is more', r.more, true);
  // Exactly one full page loaded of exactly one page: one request, then the
  // honest answer is "may be more", because a full page proves nothing.
  l = lister(1000);
  r = await readUpTo(l.fn, 1000);
  eq('a full page of a 1,000-row register: may be more', r.more, true);
  eq('...in one request', l.calls(), 1);
  // PAGES ARE FETCHED IN PARALLEL, so they can come back out of order. A server
  // that answers LATER pages FIRST must still give the rows in page order.
  {
    const slow = async (limit: number, offset: number) => {
      await new Promise((r) => setTimeout(r, 30 - offset / 200));   // page 3 first, page 1 last
      return Array.from({ length: Math.max(0, Math.min(limit, 4200 - offset)) }, (_, i) => ({ i: offset + i }));
    };
    const rr = await readUpTo(slow, 3000);
    const idx = rr.rows.map((x) => (x as { i: number }).i);
    eq('pages answered out of order still come back in page order',
      idx.every((v, k) => v === k) && idx.length === 3000, true);
  }
  // THE REGISTER SHRANK FAR BELOW WHAT WAS LOADED: later pages come back
  // empty and are ignored; nothing is invented.
  l = lister(500);
  r = await readUpTo(l.fn, 3000);
  eq('3,000 loaded, register now 500: exactly 500, and that is all',
    [r.rows.length, r.more], [500, false]);
}

// ---------------------------------------------------------------------------
// THE PRODUCT LIST THAT STOPPED AT 26 (2026-09-29). The register as it stood
// that day -- 44 product names with their real machine counts, 20,012 rows --
// read the way `distinctColumn` reads it: sorted by name, a thousand at a time.
// ---------------------------------------------------------------------------
{
  const reg: [string, number][] = [
    ['AIR COMPRESSOR', 17], ['AIR SUPPLY', 763], ['AMBU BAG', 16], ['ANAVENT', 654], ['BORA', 8],
    ['CESAR', 53], ['CLARYS', 201], ['CPX CARE', 3842], ['EC-VENT', 1], ['ECLIPSE DELTA', 5],
    ['EOVE', 35], ['EOVE-70', 1], ['EXTEND-XT', 2052], ['HORUS', 1274], ['HORUS EXTEND', 252],
    ['INT STAND MONNAL T75', 1], ['MDV SCREEN', 8], ['MONAL-D M', 328], ['MONNAL DS', 25],
    ['MONNAL INO', 1], ['MONNAL T20', 40], ['MONNAL T30', 40], ['MONNAL T50', 303], ['MONNAL T60', 622],
    ['MONNAL T60 ADVANCED', 44], ['MONNAL T75', 2298], ['MONNAL TEO NF', 117], ['MONNAL-D', 559],
    ['MONNAL-D ANASTESIA', 4], ['MONNAL-D COMPUTERISED', 10], ['MONNAL-D SIMV', 356], ['NA', 1],
    ['NEFTIS', 15], ['NITRIC OXIDE REGULATOR', 1], ['OPTI-NO INJECTOR', 5], ['ORION', 1975],
    ['ORION-G', 2549], ['OSIRIS - 2', 426], ['OSIRIS-3', 48], ['PO1', 2], ['SILENSIO', 5], ['VAL', 1],
    ['VEGA', 268], ['ZEFIR', 40],
  ];
  const rows = reg.flatMap(([n, k]) => Array.from({ length: k }, () => ({ item_name: n })));
  // `failAt` = the page that errors; `times` = how many times it errors before recovering.
  const flaky = (failAt: number, times: number) => {
    let left = times;
    return async (from: number, to: number) => {
      if (Math.floor(from / PG_PAGE) === failAt && left > 0) { left--; return { data: null, error: { message: 'canceling statement due to statement timeout' } }; }
      return { data: rows.slice(from, Math.min(to + 1, from + PG_PAGE)), error: null };
    };
  };
  const noWait = { wait: async () => {} };
  const all = await distinctValues(flaky(-1, 0), 'item_name', noWait);
  eq('the whole register gives all 44 names', all.length, 44);
  eq('  ...VEGA among them', all.includes('VEGA'), true);

  // THE FAULT, REPRODUCED: the old loop's behaviour, written out, stops at 26
  // ending at MONNAL T75 -- the screenshot, to the name.
  {
    const set = new Set<string>(); const pg = flaky(12, 99);
    for (let from = 0; from < 40000; from += PG_PAGE) {
      const { data, error } = await pg(from, from + PG_PAGE - 1);
      if (error) break;
      (data ?? []).forEach((r) => set.add(r.item_name));
      if ((data ?? []).length < PG_PAGE) break;
    }
    const old = [...set].sort();
    eq('THE OLD LOOP: one failed page returns 26 names as the whole list', old.length, 26);
    eq('  ...ending at MONNAL T75, as on screen', old[old.length - 1], 'MONNAL T75');
    eq('  ...and VEGA is not in it', old.includes('VEGA'), false);
  }

  // A PAGE THAT FAILS ONCE IS RETRIED, and the list comes back whole.
  eq('a page that fails twice then answers: all 44, retried', (await distinctValues(flaky(12, 2), 'item_name', noWait)).length, 44);

  // A PAGE THAT KEEPS FAILING IS REFUSED -- never handed back as a short list.
  let threw = '';
  let got: string[] | null = null;
  try { got = await distinctValues(flaky(12, 99), 'item_name', noWait); } catch (e) { threw = (e as Error).message; }
  eq('a page that keeps failing THROWS rather than returning a prefix', got, null);
  eq('  ...and says how far it got', /stopped after 26 values/.test(threw) && /incomplete/.test(threw), true);
}

console.log(fail ? `\n${fail} FAILED\n` : '\nall passed\n');

}
void main().then(() => process.exit(fail ? 1 : 0));
