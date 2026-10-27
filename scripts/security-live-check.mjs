// ===========================================================================
// THE LIVE, READ-ONLY HALF OF THE SECURITY SCAN (2026-10-27; the user, asked
// where the scan may run: "Local copy + read-only live checks").
//
// What anybody on the internet can do with the PUBLIC key that ships in the
// website -- asked of the live project and the live site, with GET requests
// only. Nothing is written, no function is called, no login is attempted.
//
// IT PRINTS COUNTS AND STATUSES, NEVER A ROW. This repository is public and so
// are its Actions logs: a check that printed what it could read would publish
// it. Run by .github/workflows/security-live-check.yml (the sandbox the
// project is built in cannot reach the live hosts).
// ===========================================================================
import { readdirSync, readFileSync } from 'node:fs';

const SITE = 'https://neurolooom-eng.github.io/RITHI_CRM/';
const src = readFileSync('src/lib/supabase.ts', 'utf8');
const URL = /DEFAULT_SUPABASE_URL = '([^']+)'/.exec(src)?.[1];
const KEY = /DEFAULT_SUPABASE_ANON = '([^']+)'/.exec(src)?.[1];
if (!URL || !KEY) { console.error('Could not read the public URL and key from src/lib/supabase.ts'); process.exit(2); }

// Every table and view the migrations create in public.
const rels = new Set();
for (const f of readdirSync('supabase/migrations').filter((x) => x.endsWith('.sql'))) {
  const s = readFileSync(`supabase/migrations/${f}`, 'utf8');
  for (const m of s.matchAll(/create\s+(?:or\s+replace\s+)?(?:materialized\s+)?(?:table|view)\s+(?:if\s+not\s+exists\s+)?public\.([a-z0-9_]+)/gi)) rels.add(m[1].toLowerCase());
}
const headers = { apikey: KEY, Authorization: `Bearer ${KEY}` };
const out = { readable: [], refused: 0, empty: 0, missing: 0, other: [] };

for (const r of [...rels].sort()) {
  try {
    const res = await fetch(`${URL}/rest/v1/${r}?select=*&limit=1`, { headers });
    if (res.status === 200) {
      const body = await res.json();
      if (Array.isArray(body) && body.length) out.readable.push(r); else out.empty++;
    } else if (res.status === 401 || res.status === 403) out.refused++;
    else if (res.status === 404) out.missing++;
    else out.other.push(`${r}: HTTP ${res.status}`);
  } catch (e) { out.other.push(`${r}: ${e.message}`); }
}
console.log(`LIVE-1 relations asked: ${rels.size}`);
console.log(`LIVE-1 returned a row to the public key: ${out.readable.length ? out.readable.join(', ') : 'none'}`);
console.log(`LIVE-1 empty answer (row-level security): ${out.empty}; refused: ${out.refused}; not exposed: ${out.missing}`);
if (out.other.length) console.log(`LIVE-1 other: ${out.other.join('; ')}`);

// Can anybody make themselves a login? The settings endpoint answers that
// without creating anything.
try {
  const res = await fetch(`${URL}/auth/v1/settings`, { headers });
  const s = await res.json();
  console.log(`LIVE-2 self sign-up: ${s.disable_signup ? 'DISABLED' : 'ENABLED'}; email confirmation: ${s.mailer_autoconfirm ? 'NOT required' : 'required'}; providers: ${Object.entries(s.external ?? {}).filter(([, v]) => v === true).map(([k]) => k).join(', ') || 'none'}`);
} catch (e) { console.log(`LIVE-2 could not read the auth settings: ${e.message}`); }

// The site: what it tells a browser to enforce, and what it serves besides the app.
try {
  const res = await fetch(SITE);
  const h = (n) => res.headers.get(n) ?? 'absent';
  console.log(`LIVE-3 site HTTP ${res.status}; strict-transport-security: ${h('strict-transport-security')}; content-security-policy: ${h('content-security-policy')}; x-frame-options: ${h('x-frame-options')}; x-content-type-options: ${h('x-content-type-options')}; referrer-policy: ${h('referrer-policy')}`);
  const html = await res.text();
  const meta = /<meta[^>]+http-equiv=["']Content-Security-Policy["'][^>]*>/i.exec(html);
  console.log(`LIVE-3 CSP in the page itself: ${meta ? 'present' : 'absent'}`);
  const js = /src="([^"]+\.js)"/.exec(html)?.[1];
  if (js) {
    const map = await fetch(new globalThis.URL(js + '.map', SITE));
    console.log(`LIVE-4 source map served: ${map.status === 200 ? 'YES' : `no (HTTP ${map.status})`}`);
    const bundle = await (await fetch(new globalThis.URL(js, SITE))).text();
    const secret = /sb_secret_[A-Za-z0-9_-]{10,}|"role":\s*"service_role"/.test(bundle);
    console.log(`LIVE-4 a secret key in the shipped code: ${secret ? 'YES' : 'none'}`);
  }
  const http = await fetch(SITE.replace('https://', 'http://'), { redirect: 'manual' });
  console.log(`LIVE-5 plain http: HTTP ${http.status} -> ${http.headers.get('location') ?? '(no redirect)'}`);
} catch (e) { console.log(`LIVE-3 could not read the site: ${e.message}`); }
