// A DROPDOWN MUST CLOSE: when you choose, when you open another, and when you
// tap away.
//
// READ THIS BEFORE TRUSTING IT. It is a REGRESSION GUARD, not evidence that the
// reported fault is fixed, and the difference was established rather than
// assumed: with the fix REMOVED -- back to a `mousedown`-only listener, and
// again with the one-open-at-a-time registry deleted -- all six assertions
// still pass. Headless Chromium synthesises `mousedown` from a tap, so the old
// code behaves correctly HERE, and the `away` handler alone already closes the
// first list, so the registry is not load-bearing for these six cases either.
//
// SO THE USER'S REPORT ("the drop-down is not disappearing once selected") IS
// NOT REPRODUCED BY THIS FILE. What it does hold is that the three closes work
// today and will keep working -- worth having, and NOT the same claim. A check
// that cannot fail on the bug it names is the thing this project keeps warning
// about, so it says so at the top instead of reading as proof.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';

const CSS_PATH = 'src/components/ui/ui.css';
const dir = mkdtempSync(join(tmpdir(), 'picklist-open-'));
let fail = 0;
const eq = (label, got, want) => {
  const ok = got === want;
  if (!ok) fail++;
  console.log(`  ${ok ? '✓' : '✗'} ${label}${ok ? '' : `  (got ${got}, want ${want})`}`);
};
try {
  execFileSync('npx', ['esbuild', 'scripts/ui/picklist-open.tsx', '--bundle',
    `--outfile=${join(dir, 'b.js')}`, '--jsx=automatic', '--format=iife', '--log-level=error'],
    { stdio: 'inherit' });
  // THE STYLESHEET IS PART OF THE BEHAVIOUR HERE, not decoration. `.picklist-menu`
  // is `position: absolute`; without the CSS it sits in normal flow, so closing
  // one list MOVES the next field up and the tap that was meant for it lands
  // somewhere else. That is an artefact of an unstyled harness -- but it cost an
  // hour to tell apart from a real regression, which is the reason for this note.
  writeFileSync(join(dir, 'i.html'),
    '<!doctype html><link rel="stylesheet" href="app.css"><div id="root"></div><script src="b.js"></script>');
  const srv = createServer((req, res) => {
    if (req.url === '/app.css') { res.setHeader('content-type', 'text/css'); return res.end(readFileSync(CSS_PATH)); }
    res.end(readFileSync(join(dir, req.url === '/b.js' ? 'b.js' : 'i.html')));
  });
  await new Promise((r) => srv.listen(4179, r));

  const { chromium } = await import('playwright');
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  // A PHONE, and that is the whole point: hasTouch makes Playwright's tap()
  // dispatch pointer/touch events, which is what stopped reaching the
  // `mousedown` listener this component used to rely on.
  const ctx = await b.newContext({ hasTouch: true, viewport: { width: 390, height: 780 } });
  const p = await ctx.newPage();
  await p.goto('http://localhost:4179/', { waitUntil: 'networkidle' });

  const panels = () => p.locator('.picklist-menu, .picklist-pop, [class*="picklist"] .picklist-opt').count();
  const openCount = async () => p.evaluate(() =>
    document.querySelectorAll('.picklist input.picklist-input').length);

  // 1. open the first
  await p.locator('#one .picklist-value').tap();
  eq('tapping a closed list opens it', await openCount(), 1);

  // 2. open the second WITHOUT choosing in the first
  await p.locator('#two .picklist-value').tap();
  eq('opening another list closes the first', await openCount(), 1);
  eq('...and the one now open is the second',
    await p.evaluate(() => !!document.querySelector('#two .picklist input.picklist-input')), true);

  // 3. choose a value — the list must go
  await p.locator('#two .picklist-opt').first().tap();
  eq('choosing closes the list', await openCount(), 0);

  // 4. open one and TAP AWAY. This is the case `mousedown` never saw.
  await p.locator('#one .picklist-value').tap();
  eq('open again', await openCount(), 1);
  await p.locator('#elsewhere').tap();
  eq('tapping away on a touchscreen closes it', await openCount(), 0);

  await b.close();
  srv.close();
  console.log(fail ? `\n${fail} FAILED\n` : '\nall passed\n');
  process.exit(fail ? 1 : 0);
} finally { rmSync(dir, { recursive: true, force: true }); }
