#!/usr/bin/env node
// ===========================================================================
// THE SCHEDULED EXPORT'S TWO TESTABLE HALVES.
//
// The Edge Function itself cannot be run by any suite here — it is Deno on
// Supabase, it holds the service role, and it talks to Resend. So everything
// that CAN be taken out of it has been: when a schedule is due is SQL
// (export_run_due_at, exercised by supabase/tests/export_schedule_test.sql),
// and the two pure modules below are exercised here.
//
// PART ONE — THE ARCHIVE, READ BACK BY SOMETHING THAT IS NOT THIS CODE.
//
// `supabase/functions/scheduled-export/zip.ts` writes a DEFLATED zip by hand —
// headers, a CRC and two offset tables. Nothing about that is provable by
// reading it: a wrong compressed size or a stale CRC produces a file that is
// exactly the right shape and that no archiver will open, and the only place
// that shows up is a mailbox, once a night, after the person has stopped
// watching.
//
// So this builds real archives with the real module and hands them to `unzip`,
// which checks every member's CRC itself (`unzip -t`), and then compares the
// extracted bytes with what went in. It also asserts the thing the deflate is
// FOR — that a register-shaped CSV gets materially smaller — and the fallback,
// that incompressible bytes are stored rather than grown.
//
// The Edge Function cannot be run by any suite here. This is the part of it
// that can be, so it is.
// ===========================================================================
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { zipDeflate } from '../supabase/functions/scheduled-export/zip.ts';
import { dayTime, cell, toCsv, columnsOf } from '../supabase/functions/scheduled-export/shape.ts';
import { formatDayTime } from '../src/lib/dates.ts';

let fail = 0;
const ok = (label, cond, extra = '') => {
  if (cond) console.log(`  ok   ${label}`);
  else { console.log(`  FAIL ${label}${extra ? ` — ${extra}` : ''}`); fail++; }
};

const enc = (s) => new TextEncoder().encode(s);
const dir = mkdtempSync(join(tmpdir(), 'export-zip-'));

// A register-shaped CSV: the same handful of words over and over, which is
// what every table in this database actually looks like.
const rows = [];
rows.push('ucn,party_name,city,product_name,serial,open_state,reg_date');
for (let i = 0; i < 4000; i++) {
  rows.push(`26H26F${String(i).padStart(4, '0')},AIR LIQUIDE MEDICAL SYSTEMS,CHENNAI,ORION-G,${2000 + i},Solved,2026-09-${String((i % 28) + 1).padStart(2, '0')}`);
}
const bigCsv = enc(rows.join('\r\n'));

// Bytes that cannot compress — the store fallback's reason to exist.
// A CHAINED HASH, not an LCG. The first draft of this file built them with
// `seed = seed * 1103515245 + 12345` and took the low byte, and this assertion
// FAILED: the low bits of a linear congruential generator have a period of a
// couple of hundred values, so "random" bytes deflated to a third of their
// size. Deterministic and incompressible are both wanted here, which is what a
// hash chain gives and a cheap PRNG does not.
const random = (() => {
  const out = Buffer.alloc(0);
  const parts = [];
  let h = createHash('sha256').update('rithi-export').digest();
  for (let i = 0; i < 128; i++) { parts.push(h); h = createHash('sha256').update(h).digest(); }
  return new Uint8Array(Buffer.concat([out, ...parts]));
})();

const parts = [
  { path: 'calls.csv', data: bigCsv },
  { path: 'tiny.csv', data: enc('a,b\r\n1,2\r\n') },
  { path: 'empty.csv', data: new Uint8Array(0) },
  { path: 'quoted.csv', data: enc('name,note\r\n"COMMA, INC","said ""yes"""\r\n') },
  { path: 'incompressible.bin', data: random },
];

console.log('\nscheduled-export archive\n');
const bytes = await zipDeflate(parts);
const file = join(dir, 'export.zip');
writeFileSync(file, bytes);

// 1. Every member's CRC, checked by an archiver rather than by us.
let testOut = '';
try {
  testOut = execFileSync('unzip', ['-t', file], { encoding: 'utf8' });
  ok('unzip reads the archive and every CRC checks out', /No errors detected/.test(testOut));
} catch (e) {
  ok('unzip reads the archive and every CRC checks out', false, String(e.stdout || e.message).trim());
}

// 2. The member list is what went in, in order.
const listed = (testOut.match(/testing:\s+(\S+)/g) ?? []).map((s) => s.replace(/testing:\s+/, ''));
ok('every file is present, in the order given',
  listed.join('|') === parts.map((p) => p.path).join('|'), listed.join(', '));

// 3. THE BYTES COME BACK. A CRC that matches a body that is not the body is
//    still possible; comparing what extracts is the claim that matters.
for (const p of parts) {
  let got;
  try { got = execFileSync('unzip', ['-p', file, p.path], { maxBuffer: 64 << 20 }); }
  catch (e) { got = Buffer.alloc(0); void e; }
  const want = Buffer.from(p.data);
  ok(`${p.path} extracts to exactly what went in (${want.length} bytes)`,
    got.length === want.length && got.equals(want), `got ${got.length} bytes`);
}

// 4. THE POINT OF DEFLATING. A stored archive of this would be bigger than the
//    payload; a deflated one is a fraction of it. Stated as a ratio rather than
//    a byte count so it does not become a test of zlib's tuning.
ok(`a register-shaped CSV compresses (${bigCsv.length} bytes in, archive ${bytes.length})`,
  bytes.length < bigCsv.length / 3, `ratio ${(bytes.length / bigCsv.length).toFixed(2)}`);

// 5. ...and the fallback. An incompressible member must be STORED, not grown:
//    method 0 in its local header. Read out of the bytes, because "it still
//    extracts" is true either way and says nothing.
const methodOf = (name) => {
  const target = Buffer.from(name);
  const buf = Buffer.from(bytes);
  for (let i = 0; i + 30 < buf.length; i++) {
    if (buf.readUInt32LE(i) !== 0x04034b50) continue;
    const nameLen = buf.readUInt16LE(i + 26);
    if (buf.subarray(i + 30, i + 30 + nameLen).equals(target)) return buf.readUInt16LE(i + 8);
  }
  return -1;
};
ok('an incompressible member is stored, not grown', methodOf('incompressible.bin') === 0,
  `method ${methodOf('incompressible.bin')}`);
ok('a compressible member is deflated', methodOf('calls.csv') === 8,
  `method ${methodOf('calls.csv')}`);
ok('an empty member is stored', methodOf('empty.csv') === 0, `method ${methodOf('empty.csv')}`);

// 6. THE LOCAL HEADER AND THE CENTRAL DIRECTORY MUST AGREE, AND `unzip` DOES
//    NOT CHECK THAT. Proved by mutation while this file was written: writing
//    the UNCOMPRESSED length into the local header's compressed-size field
//    leaves an archive `unzip -t` calls clean and every assertion above passes,
//    because `unzip` takes its sizes from the central directory. Plenty of
//    readers do not — a streaming extractor and some of Windows' own paths take
//    the local header — so an archive that only one of them can open is exactly
//    the failure this whole check exists to keep out of a mailbox.
const zipEntries = (buf) => {
  const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const count = buf.readUInt16LE(eocd + 10);
  let at = buf.readUInt32LE(eocd + 16);
  const out = [];
  for (let i = 0; i < count; i++) {
    const nameLen = buf.readUInt16LE(at + 28);
    const extraLen = buf.readUInt16LE(at + 30);
    const cmtLen = buf.readUInt16LE(at + 32);
    const lo = buf.readUInt32LE(at + 42);
    out.push({
      name: buf.subarray(at + 46, at + 46 + nameLen).toString(),
      central: { method: buf.readUInt16LE(at + 10), crc: buf.readUInt32LE(at + 16),
                 comp: buf.readUInt32LE(at + 20), raw: buf.readUInt32LE(at + 24) },
      local: { method: buf.readUInt16LE(lo + 8), crc: buf.readUInt32LE(lo + 14),
               comp: buf.readUInt32LE(lo + 18), raw: buf.readUInt32LE(lo + 22) },
    });
    at += 46 + nameLen + extraLen + cmtLen;
  }
  return out;
};
const entries = zipEntries(Buffer.from(bytes));
ok('the central directory lists every member', entries.length === parts.length, `${entries.length}`);
for (const e of entries) {
  ok(`${e.name}: the local header and the central directory agree`,
    e.local.method === e.central.method && e.local.crc === e.central.crc
    && e.local.comp === e.central.comp && e.local.raw === e.central.raw,
    `local ${JSON.stringify(e.local)} vs central ${JSON.stringify(e.central)}`);
  const want = parts.find((p) => p.path === e.name);
  ok(`${e.name}: the declared uncompressed size is the real one`,
    want != null && e.central.raw === want.data.length, `${e.central.raw}`);
}

// 7. One member on its own — the everyday case, and the one where an offset
//    table off by a header is easiest to get away with.
const one = await zipDeflate([{ path: 'products.csv', data: bigCsv }]);
const solo = join(dir, 'one.zip');
writeFileSync(solo, one);
try {
  ok('a single-member archive reads too', /No errors detected/.test(
    execFileSync('unzip', ['-t', solo], { encoding: 'utf8' })));
} catch (e) { ok('a single-member archive reads too', false, String(e.stdout || e.message).trim()); }
ok('and gives its bytes back',
  Buffer.from(execFileSync('unzip', ['-p', solo, 'products.csv'], { maxBuffer: 64 << 20 }))
    .equals(Buffer.from(bigCsv)));

void readFileSync;

// ===========================================================================
// PART TWO — WHAT A CELL LOOKS LIKE ON THE WAY OUT.
//
// A DOWNLOAD IS NOT THE WIRE, and this job is the one place in the system with
// no reader's timezone to stand in: Deno runs in UTC, so an un-thought-about
// formatter prints every Indian timestamp five and a half hours early and
// looks completely correct doing it.
// ===========================================================================
console.log('\nscheduled-export cell shaping\n');

const eq = (label, got, want) => ok(label, got === want, `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

eq('an instant is shown in IST, not UTC', dayTime('2026-09-18T08:51:02.55+00:00'), '18-Sep-2026 14:21:02');
eq('...including one that crosses midnight backwards', dayTime('2026-09-19T00:20:00Z'), '19-Sep-2026 05:50:00');
eq('...and one that crosses the day forwards', dayTime('2026-09-18T19:30:00Z'), '19-Sep-2026 01:00:00');
eq('an offset that is already IST is not moved twice', dayTime('2026-09-18T14:21:02+05:30'), '18-Sep-2026 14:21:02');
eq('a wall clock with no offset is printed as written', dayTime('2026-09-18 08:51:02'), '18-Sep-2026 08:51:02');
eq('a date with no time gains no midnight', dayTime('2026-09-18'), '18-Sep-2026');
eq('a remark that merely begins with a date survives',
  dayTime('2026-09-18 pump replaced'), '2026-09-18 pump replaced');
eq('a part code is not a date', dayTime('MP-010'), 'MP-010');
eq('nothing is nothing', dayTime(null), '');

// THE TWO COPIES MUST AGREE. `shape.ts` is a deliberate second copy of
// `formatDayTime` — the browser cannot be imported into Deno — so the one
// thing that makes a second copy acceptable is a test that fails when they
// drift. Run with the reader standing in IST, which is the case where the
// browser's "where the reader is" and this job's "Asia/Kolkata" are the same
// question. (The harness sets TZ; if it has not, this is skipped rather than
// asserted against the wrong clock, and says so.)
if (process.env.TZ === 'Asia/Kolkata') {
  const cases = ['2026-09-18T08:51:02.55+00:00', '2026-09-19T00:20:00Z', '2026-01-31T18:30:00Z',
                 '2026-09-18 08:51:02', '2026-09-18', 'MP-010', '', '2026-09-18 pump replaced'];
  for (const c of cases) {
    eq(`shape.ts agrees with src/lib/dates.ts on ${JSON.stringify(c)}`, dayTime(c), formatDayTime(c));
  }
} else {
  console.log(`  --   the two-formatter comparison needs TZ=Asia/Kolkata (TZ is ${process.env.TZ ?? 'unset'})`);
  fail++;
  console.log('  FAIL run this check with TZ=Asia/Kolkata — the package script does');
}

eq('a structured column goes out as it is stored', cell({ a: 1 }), '{"a":1}');
eq('a number stays readable', cell(42), '42');

// RFC 4180, every field quoted. The comma in a party name and the quote in a
// complaint are the two that have actually happened.
eq('every field is quoted, and an embedded quote is doubled',
  toCsv(['name', 'note'], [{ name: 'COMMA, INC', note: 'said "yes"' }]),
  '"name","note"\r\n"COMMA, INC","said ""yes"""');
eq('a missing key is an empty field, not a gap',
  toCsv(['a', 'b'], [{ a: 1 }]), '"a","b"\r\n"1",""');
ok('columns keep the table\'s own order across rows',
  columnsOf([{ ucn: 1, party: 2 }, { ucn: 3, party: 4, city: 5 }]).join(',') === 'ucn,party,city');

console.log(fail ? `\n${fail} FAILED\n` : '\nall passed\n');
process.exit(fail ? 1 : 0);
