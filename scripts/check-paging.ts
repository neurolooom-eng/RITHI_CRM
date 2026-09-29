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
import { isFresh, afterRefresh, HOUR } from '../src/lib/mastercache';
import * as mc from '../src/lib/machinecache';
import * as cp from '../src/lib/complaints';
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


// ---------------------------------------------------------------------------
// THE ENGINEER IN A NO-SIGNAL AREA (2026-09-29). What a device does with its
// stored copy of a dropdown list.
// ---------------------------------------------------------------------------
console.log('-- a stored list survives a failed refresh; products re-read every 6 hours --');
{
  const good = ['ORION-G', 'VEGA', 'MONNAL T75'];
  eq('a failed refresh KEEPS the stored list (it used to replace it with nothing)',
    afterRefresh(good, null), { values: good, failed: false, fromCache: true });
  eq('an EMPTY refresh keeps it too -- the register was empty mid-reload on 25-Sep',
    afterRefresh(good, []), { values: good, failed: false, fromCache: true });
  eq('a good refresh replaces it',
    afterRefresh(good, ['VEGA']), { values: ['VEGA'], failed: false, fromCache: false });
  eq('no copy and a failed refresh says FAILED, so the screen can say so',
    afterRefresh(null, null), { values: [], failed: true, fromCache: false });
  eq('no copy and an honest empty answer is empty, not failed',
    afterRefresh(null, []), { values: [], failed: false, fromCache: false });

  const now = 1_000_000_000_000;
  eq('products stored 1 hour ago are served without a network call', isFresh('product', now - 1 * HOUR, now), true);
  eq('...5h59m ago still are', isFresh('product', now - 6 * HOUR + 60_000, now), true);
  eq('...6 hours ago are re-read', isFresh('product', now - 6 * HOUR, now), false);
  eq('another list is re-read every time, as before', isFresh('party', now - 1 * HOUR, now), false);
  eq('no stored copy is never fresh', isFresh('product', null, now), false);
  eq('a copy dated in the future (a wrong phone clock) is not trusted', isFresh('product', now + HOUR, now), false);
}

// ---------------------------------------------------------------------------
// THE MACHINE REGISTER ON THE DEVICE (2026-09-29): "Whole machine register on
// every phone / laptop as a cached data ... Search every thing relevant to
// Product Database from cached data." Each search must answer what its server
// twin answers, and the download must survive a signal that keeps dropping.
// ---------------------------------------------------------------------------
console.log('-- the machine register on the device --');
{
  const sheet = (item: string, serial: string, party: string, status = 'WGP', city = '') =>
    ({ 'Party Name': party, 'City': city, 'State': '', 'Address': '', 'Item Name': item, 'Item Serial Number': serial, 'Item Status': status });
  let n = 0;
  const m = (item: string, serial: string, party: string, created = '2026-09-01', status = 'WGP', city = '') =>
    mc.fromSheet(++n, created, sheet(item, serial, party, status, city));
  const reg = [
    m('ORION-G', '219', 'CITY HOSPITAL', '2026-09-01', 'WGP', 'Pune'),
    m('VEGA', '219', 'CITY HOSPITAL', '2026-09-02', 'AMC'),
    m('VEGA', '105', 'Apollo Clinic ', '2026-09-03', 'OGP'),
    m('EXTEND-XT ', 'X1', 'APOLLO CLINIC', '2026-09-03'),
    m('ORION-G', 'INXT 0105', 'RURAL PHC', ''),
    m('ORION-G', 'X105161', 'RURAL PHC', '2026-08-01'),
  ];

  eq('product names: every name, counted, as stored (the stray space kept)',
    mc.productNames(reg), [{ name: 'EXTEND-XT ', machines: 1 }, { name: 'ORION-G', machines: 3 }, { name: 'VEGA', machines: 2 }]);
  eq('a product offered with its stray space finds its machine (the Extend XT fault)',
    mc.productSerials(reg, 'EXTEND-XT '), ['X1']);
  eq('...and a trimmed one does not -- the same equality the server does',
    mc.productSerials(reg, 'EXTEND-XT'), []);
  eq('serials sort as numbers', mc.productSerials(reg, 'ORION-G'), ['219', 'INXT 0105', 'X105161']);

  eq('A SERIAL ALONE THAT TWO MACHINES WEAR IS AMBIGUOUS -> null, never a guess',
    mc.bySerial(reg, '219'), null);
  eq('...with the product it is one machine',
    (mc.bySerial(reg, ' 219 ', 'vega') as Record<string, unknown>)['Item Status'], 'AMC');
  eq('a serial not on the device is undefined, so the server is asked',
    mc.bySerial(reg, '999'), undefined);

  eq('a party\'s products match however it is cased or spaced',
    mc.partyProducts(reg, 'apollo clinic'), ['VEGA', 'EXTEND-XT ']);
  eq('a party\'s machines, narrowed to one product',
    mc.partyItems(reg, 'City Hospital', 'VEGA').map((r) => r['Item Serial Number']), ['219']);

  eq('the serial picker: typed "105" puts the machine ENDING in 105 before the mid-string one',
    mc.searchMachines(reg, 'ORION-G', '105').map((h) => h.serial), ['INXT 0105', 'X105161']);
  eq('...and it carries the site from the machine',
    mc.searchMachines(reg, 'ORION-G', '219')[0].city, 'Pune');
  eq('narrowed to one customer, matched exactly as the server does',
    mc.searchMachines(reg, 'VEGA', '', 50, 'CITY HOSPITAL').map((h) => h.serial), ['219']);

  eq('party search: distinct, trimmed, case-folded',
    mc.searchProductParties(reg, 'apollo'), ['Apollo Clinic']);

  eq('the register screen: NEWEST FIRST, blank dates last, id breaks ties',
    mc.searchProducts(reg, {}).map((r) => r['Item Serial Number']), ['X1', '105', '219', '219', 'X105161', 'INXT 0105']);
  eq('...one instant written two ways is one instant, so id decides',
    mc.searchProducts([mc.fromSheet(1, '2026-09-03T10:00:00.1+00:00', { 'Item Serial Number': 'A' }),
      mc.fromSheet(2, '2026-09-03T10:00:00.10+00:00', { 'Item Serial Number': 'B' })], {}).map((r) => r['Item Serial Number']), ['B', 'A']);
  eq('...a status filter is the worked-out status',
    mc.searchProducts(reg, { status: 'amc' }).map((r) => r['Item Name']), ['VEGA']);
  eq('...and paging continues where the last page stopped',
    mc.searchProducts(reg, {}, 2, 2).map((r) => r['Item Serial Number']), ['219', '219']);

  // EVERY COLUMN IS KEPT (the user: "keep all columns in the cache").
  const raw = [
    { id: 1, item_name: 'VEGA', serial_number: '105', extra: { 'PO No.': 'X/1' }, active: true, warranty_end: null },
    { id: 2, item_name: 'ORION-G', serial_number: '219', machine_key: 'orion-g|219' },
  ];
  eq('packed and unpacked, every column of every row comes back exactly',
    JSON.stringify(mc.unpackRows(mc.packRows(raw))), JSON.stringify(raw));
  eq('...a null stays a null, not a blank', mc.unpackRows(mc.packRows(raw))[0].warranty_end, null);
  eq('...and a column one row lacks is not invented on it', 'machine_key' in mc.unpackRows(mc.packRows(raw))[0], false);
  eq('a cached machine carries the whole row, not only the screen headings',
    mc.toCached(raw[0], {}).row, raw[0]);

  const ps = [
    { id: 1, party_name: 'City Hospital', name_key: 'city hospital', state: 'MH', city: 'Pune', service_engineer: 'SUDIP' },
    { id: 2, party_name: 'Apollo Clinic', name_key: 'apollo clinic', state: 'KA' },
    { id: 3, party_name: 'Rural PHC', name_key: 'rural phc' },
  ];
  eq('the customer is found by the unique key however the name is cased or spaced',
    mc.partyByName(ps, '  CITY hospital ')?.city, 'Pune');
  eq('...a customer not on the device is undefined, so the server is asked', mc.partyByName(ps, 'Nobody'), undefined);
  eq('...a blank name finds nobody', mc.partyByName(ps, '  '), undefined);
  eq('Party Master search: contains, any case, sorted, capped',
    mc.searchPartyMaster(ps, 'c', 2), ['Apollo Clinic', 'City Hospital']);
}

console.log('-- a Standard Complaint mapped to products --');
{
  eq('nothing mapped means ALL products -- every complaint that existed before',
    [cp.appliesToAllProducts({}), cp.appliesToAllProducts({ products: [] }), cp.productsLabel(undefined)], [true, true, 'All products']);
  eq('several products are kept, once each, as spelled', cp.complaintProducts({ products: ['ORION-G', ' VEGA ', 'orion-g', ''] }), ['ORION-G', 'VEGA']);
  eq('a comma-separated value (typed or uploaded) is read too', cp.complaintProducts({ products: 'VEGA, EXTEND-XT' }), ['VEGA', 'EXTEND-XT']);
  eq('a mapped complaint applies to its own products...', cp.complaintAppliesTo({ products: ['VEGA'] }, 'vega'), true);
  eq('...even when the product name carries a stray space (the Extend XT fault)', cp.complaintAppliesTo({ products: ['EXTEND-XT'] }, 'EXTEND-XT '), true);
  eq('...and not to another product', cp.complaintAppliesTo({ products: ['VEGA'] }, 'ORION-G'), false);
  eq('an ALL-products complaint applies to every product', cp.complaintAppliesTo({}, 'ORION-G'), true);
  eq('a call with no product chosen yet is offered everything', cp.complaintAppliesTo({ products: ['VEGA'] }, ''), true);
  eq('the single `product` key the per-product DCCR lists use is NOT read as this mapping',
    cp.complaintProducts({ product: 'T60' }), []);
}

console.log('-- the device, named for the administrator --');
{
  const chrome = 'Mozilla/5.0 (Linux; Android 14; SM-A546E) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36';
  const edge = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36 Edg/129.0.0.0';
  const samsung = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.36';
  const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
  eq('an Android phone on Chrome', mc.deviceLabel(chrome), 'Android · Chrome');
  eq('Edge says Chrome too, and is still Edge', mc.deviceLabel(edge), 'Windows · Edge');
  eq('Samsung Internet says Chrome too, and is still Samsung Internet', mc.deviceLabel(samsung), 'Android · Samsung Internet');
  eq('an iPhone on Safari', mc.deviceLabel(iphone), 'iPhone · Safari');
  eq('nothing to read is said so', mc.deviceLabel(''), 'Unknown device · browser');
}

console.log('-- the download on a signal that keeps dropping --');
{
  const total = 2547;
  const all = Array.from({ length: total }, (_, i) => mc.fromSheet(i + 1, '', { 'Item Name': 'ORION-G', 'Item Serial Number': String(i + 1) }));
  // A server that honours the cap and whose connection drops on chosen calls.
  const flaky = (dropOn: Set<number>) => {
    let calls = 0; const asked: number[] = [];
    const fn = async (after: number, size: number) => {
      calls++; asked.push(after);
      if (dropOn.has(calls)) throw new Error('Failed to fetch');
      return all.filter((x) => x.id > after).slice(0, Math.min(size, PG_PAGE));
    };
    return { fn, asked, calls: () => calls };
  };
  const noWait = async () => {};

  const ok = await mc.downloadAfter(flaky(new Set()).fn, { rows: [], lastId: 0 }, { wait: noWait });
  eq('a clean walk is complete with every machine', [ok.complete, ok.rows.length], [true, total]);

  const f = flaky(new Set([2, 3]));
  const r = await mc.downloadAfter(f.fn, { rows: [], lastId: 0 }, { wait: noWait });
  eq('two dropped requests are retried and the walk still completes', [r.complete, r.rows.length], [true, total]);
  eq('...each retry asks for the SAME page, never from the start', f.asked, [0, 1000, 1000, 1000, 2000]);

  const dead = flaky(new Set([2, 3, 4, 5, 6, 7, 8, 9]));
  const stop = await mc.downloadAfter(dead.fn, { rows: [], lastId: 0 }, { wait: noWait, waits: [1, 1] });
  eq('a signal that stays down ends the walk INCOMPLETE -- it is not the register',
    [stop.complete, stop.rows.length, stop.lastId], [false, 1000, 1000]);
  const resumed = await mc.downloadAfter(flaky(new Set()).fn, stop, { wait: noWait });
  eq('...and the next attempt carries on from machine 1000 to the end',
    [resumed.complete, resumed.rows.length, new Set(resumed.rows.map((x) => x.id)).size], [true, total, total]);

  // THE SAME MACHINE TWICE (2026-09-29: "machine ids out of order after 4375").
  const twice = [...all.slice(0, 1500), all[1499], ...all.slice(1500)];
  const dupServer = async (after: number, size: number) => twice.filter((x) => x.id > after).slice(0, size);
  const d = await mc.downloadAfter(dupServer, { rows: [], lastId: 0 }, { wait: noWait });
  eq('a machine the server lists twice does not stop the walk, is kept once, and is COUNTED',
    [d.complete, d.rows.length, d.duplicates], [true, total, 1]);
  const backwards = async (after: number) => (after === 0 ? [all[4], all[2]] : []);
  eq('...but an id going BACKWARDS still stops it',
    (await mc.downloadAfter(backwards, { rows: [], lastId: 0 }, { wait: noWait })).complete, false);

  const liar = async () => [all[0]];
  const bad = await mc.downloadAfter(liar, { rows: [], lastId: 5 }, { wait: noWait });
  eq('a server that ignores the filter cannot loop the walk for ever', bad.complete, false);
}

console.log(fail ? `\n${fail} FAILED\n` : '\nall passed\n');

}
void main().then(() => process.exit(fail ? 1 : 0));
