// A SEARCHING PICKER MUST NOT LOOP.
//
// PickList's search effect once depended on the onSearch FUNCTION IDENTITY. A
// caller passing a stable module-level function was fine; one writing the
// handler inline — as the call-request machine picker must, because it keeps
// the customer that came back with the machine — got a new function every
// render, and the loop closed: search, setState, re-render, new identity,
// search again. One keystroke fired thirteen searches in three seconds and the
// box never stopped saying "searching…".
//
// A regex cannot catch that. This mounts the REAL component in a real browser,
// types one character, and counts.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';

const dir = mkdtempSync(join(tmpdir(), 'picklist-'));
try {
  execFileSync('npx', ['esbuild', 'scripts/ui/picklist-loop.tsx', '--bundle',
    `--outfile=${join(dir, 'b.js')}`, '--jsx=automatic', '--format=iife', '--log-level=error'],
    { stdio: 'inherit' });
  writeFileSync(join(dir, 'i.html'), '<!doctype html><div id="root"></div><script src="b.js"></script>');

  const srv = createServer((req, res) => {
    const f = req.url === '/b.js' ? 'b.js' : 'i.html';
    res.end(readFileSync(join(dir, f)));
  });
  await new Promise((r) => srv.listen(4178, r));

  const { chromium } = await import('playwright');
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const p = await b.newPage();
  await p.goto('http://localhost:4178/', { waitUntil: 'networkidle' });
  await p.click('.picklist-value');
  await p.fill('.picklist-input', '99');
  await p.waitForTimeout(2500);
  const calls = await p.evaluate(() => window.CALLS);
  const stuck = await p.evaluate(() => document.body.innerText.includes('searching'));
  await b.close();
  srv.close();

  // One keystroke, one search. A debounce may coalesce but must never multiply.
  const ok = calls === 1 && !stuck;
  console.log(ok
    ? `\n  ✓ one keystroke fired ${calls} search and the box settled\n\nall passed\n`
    : `\n  ✗ one keystroke fired ${calls} search(es); still spinning: ${stuck}\n\n1 FAILED\n`);
  process.exit(ok ? 0 : 1);
} finally { rmSync(dir, { recursive: true, force: true }); }
