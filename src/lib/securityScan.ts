// ===========================================================================
// THE SECURITY SCAN OF 27-OCT-2026 -- one record, read by the Software
// Validation page's Security Scan tab and by the Word report
// (npm run docs:validation). The user: "Also Do a Security Scan - Both
// Penetration Testing and Vulnerabilities Scan"; asked where it may run:
// "Local copy + read-only live checks".
//
// What is RE-RUN rather than recorded: the penetration test is
// supabase/tests/security_pentest_test.sql, run by every `npm run validate`;
// the live half is scripts/security-live-check.mjs (Actions -> "Security scan
// (live, read-only)"). This file is the dated finding, kept as it was found.
// ===========================================================================

export type Severity = 'Critical' | 'High' | 'Medium' | 'Low' | 'Info';
export interface ScanFinding {
  id: string;
  title: string;
  severity: Severity;
  status: 'Fixed' | 'Open — owner decision' | 'Accepted';
  found: string;
  what: string;
  fix: string;
  refs: string[];
}

/** A later run of the same scan, with what it found (the user, 2026-11-07:
 *  "Re-scan for vulnerabilities"). Its findings are in `findings`, found by
 *  "Re-scan …". */
export interface ScanRun { date: string; version: string; summary: string }

export const SECURITY_SCAN = {
  date: '2026-10-27',
  version: '0.10.226',
  rescans: [
    { date: '2026-11-07', version: '0.10.228', summary: 'The same method again, on the code of v0.10.228, plus a search for every route round the profile rule: owner-rights views and functions a signed-in login can reach, and the Knowledge Base sanitiser tested in a browser. Four new findings, F-10 to F-13 (two High, one Medium, one Low), all fixed in v0.10.229 and re-tested; the penetration test gained PT-8 for them. Live: still no table or view returns a row to the public key; self sign-up is still open with no email confirmation (F-05); no secret in the 4,316 commits of the repository\'s history.' },
  ] as ScanRun[],
  scope: [
    'The RITHI web application (the code shipped to every browser) and its database: every table, view, row-level-security policy and owner-rights function created by the migrations.',
    'The live project and site, read only: what the public key built into the website can read, the sign-in settings, the site\'s security headers, and whether any secret is shipped.',
  ],
  method: [
    { name: 'Vulnerability scan — dependencies', how: 'npm audit of every package the build uses; non-breaking fixes applied.' },
    { name: 'Vulnerability scan — secrets', how: 'Every file in the repository and the built website searched for secret keys, tokens and private keys.' },
    { name: 'Vulnerability scan — code', how: 'The front end searched for script-injection paths: raw HTML, links taken from stored data, window.open, message listeners; dynamic SQL in database functions checked for injection.' },
    { name: 'Penetration test — local copy', how: 'A database built from every migration, attacked as three people: nobody signed in (the public key alone), a login with no profile, and a signed-in engineer going after another engineer\'s records and after rights they do not hold. Every table and view read, every table written, every owner-rights function called. Kept as supabase/tests/security_pentest_test.sql and run on every validation.' },
    { name: 'Read-only checks — live', how: 'GET requests only, with the public key: every table and view asked for one row; the sign-in settings read; the site\'s headers, source map and shipped code inspected. Counts and statuses printed, never a row.' },
  ],
  findings: [
    { id: 'F-01', title: 'The public key alone carried an engineer\'s permissions', severity: 'High', status: 'Fixed',
      found: 'Penetration test; confirmed live (read only)',
      what: 'With nobody signed in, the permission check fell back to the Engineer role\'s permissions. Anybody holding the public key — which is in the website for anyone to read — could read call, visit-report, sale, contract, feedback and quality-objective records (25 tables and views on the live project returned rows), and could add call requests, spare requests, feedback, consumption lines and pending registrations.',
      fix: 'Migration 0461: a caller who is not signed in holds no permission. Re-checked live after the release: no table or view returns a row to the public key.',
      refs: ['D-174', 'FRS-285.1', 'OQ-304', '0461_anonymous_caller_holds_nothing.sql'] },
    { id: 'F-02', title: 'Anybody could make a login and hold an engineer\'s rights', severity: 'High', status: 'Fixed',
      found: 'Live read-only check; penetration test',
      what: 'Self sign-up is open on the live project with no email confirmation (email and Google). At first sign-in every login was given a profile with the Engineer role, whether or not the person was on the User Master. A login with no profile could also read the Party Master, Product Database, User Master, master lists and settings. Two live profiles were found on no User Master row: one administrator, one engineer made this month.',
      fix: 'Migration 0463: a profile only for an address on an active User Master row. Migration 0464: a login with no profile reads and writes no row of the 24 tables readable by "any signed-in user". The two profiles are for the owner to review (SQL editor: _profiles_not_on_user_master.sql).',
      refs: ['D-175', 'FRS-285.2', 'FRS-285.3', '0463_profile_only_for_the_user_master.sql', '0464_no_profile_no_rows.sql'] },
    { id: 'F-03', title: 'Internal functions callable through the API', severity: 'Medium', status: 'Fixed',
      found: 'Penetration test',
      what: 'spare_request_rollup() — which re-derives a request\'s stage past the stage guard — was callable by any API role, and the dispatch and receipt actions by the not-signed-in role.',
      fix: 'Migration 0462: the rollup withdrawn from every API role; dispatch and receipt from the not-signed-in role.',
      refs: ['FRS-285.4', '0462_security_scan_lockdown.sql'] },
    { id: 'F-04', title: 'A link saved as javascript: would have run inside RITHI', severity: 'Medium', status: 'Fixed',
      found: 'Code review',
      what: '30 links built from stored data — call-request documents, attachments, KYC records, Drive links — were used as given. A link saved as javascript:… would run inside RITHI, under whoever clicked it; an engineer can attach links to a call request that office users open. The rich editor also loaded stored article HTML without sanitising it.',
      fix: 'safeUrl() on every such link: only web, email, phone and in-app links open. The editor sanitises what it loads. check:ui refuses a raw link.',
      refs: ['D-176', 'FRS-285.5'] },
    { id: 'F-05', title: 'Email confirmation is off', severity: 'Medium', status: 'Open — owner decision',
      found: 'Live read-only check; still so on the re-scan of 07-Nov-2026',
      what: 'With confirmation off, an address on the User Master that has not signed in yet (77 counted) can be claimed by whoever signs up with it first, and that login then gets that person\'s role. Open sign-up is also what made F-10 and F-11 reachable by anybody on the internet.',
      fix: 'Turn on "Confirm email" in the Supabase project (Authentication). A new login then confirms its address before it can sign in.',
      refs: ['D-175'] },
    { id: 'F-06', title: 'The repository and its workflow logs are public', severity: 'Medium', status: 'Open — owner decision',
      found: 'Repository settings',
      what: 'The repository is public, so the schema, the policies and the logs of its workflows can be read by anybody. Two diagnostic runs on 27-Oct-2026 printed customer names into a workflow log. Diagnostics run through the workflow now print counts only.',
      fix: 'Make the repository private (GitHub → Settings → Danger Zone → Change visibility). Before doing so: on GitHub\'s free plan, Pages publishes only from a public repository, so a private repository needs a paid plan (or another host) to keep the live site up.',
      refs: ['CLAUDE.md'] },
    { id: 'F-07', title: 'Front-end library advisories', severity: 'Low', status: 'Accepted',
      found: 'npm audit',
      what: 'Nine advisories; five fixed without breaking changes. Left: react-router\'s open-redirect advisories, fixed only in version 7 (RITHI navigates only to its own routes, so no attacker-controlled redirect was found), and vite / esbuild, which affect the local development server only and are not in the published site. Re-scan 07-Nov-2026: four packages (react-router, react-router-dom, vite, esbuild); new since then are a react-router advisory for server-side rendering, which RITHI does not use (it renders in the browser), and launch-editor advisories inside vite\'s development server -- none reaches the published site.',
      fix: 'Upgrade react-router to version 7 and vite to its next major version as planned work.',
      refs: [] },
    { id: 'F-08', title: 'No Content-Security-Policy on the site', severity: 'Low', status: 'Open — owner decision',
      found: 'Live read-only check',
      what: 'GitHub Pages sends HSTS and redirects plain http to https, but no Content-Security-Policy, X-Frame-Options or X-Content-Type-Options. A Content-Security-Policy limits the damage of any script-injection fault.',
      fix: 'Add a Content-Security-Policy meta tag to the page (GitHub Pages cannot set headers), after confirming every domain the app loads from.',
      refs: [] },
    { id: 'F-09', title: 'One table answers the public key with a server error', severity: 'Info', status: 'Open — owner decision',
      found: 'Live read-only check',
      what: 'record_audit answers HTTP 500 to a not-signed-in request instead of an empty answer. No data is returned.',
      fix: 'To be looked at in a later release.',
      refs: [] },
    { id: 'F-10', title: 'A self-made login could read the whole install base', severity: 'High', status: 'Fixed',
      found: 'Re-scan 07-Nov-2026 — penetration test, local copy',
      what: 'Product Database 2.0\'s stored copy (product_database_v2_mv) is a materialised view, which cannot carry row-level security, and it was granted to every signed-in login so the screen\'s view could read it. A login with no profile -- which anybody can make while self sign-up is open (F-05) -- read every machine, serial, customer, city and cover straight through the API. 0464\'s "no profile, no rows" rule covers tables, and could not reach it.',
      fix: 'Migration 0465: the copy is granted to no API role and is read through a gate that answers a website caller only while they have a profile; the screen reads the gate. Measured: 8 ms a page with 20,000 machines.',
      refs: ['D-177', 'FRS-285.7', 'OQ-304', '0465_product_database_2_needs_a_profile.sql', 'PT-8.1'] },
    { id: 'F-11', title: 'A self-made login could read the staff name list', severity: 'Medium', status: 'Fixed',
      found: 'Re-scan 07-Nov-2026 — penetration test, local copy',
      what: 'app_user_names maps every login to a name -- the person\'s email where no name is recorded -- through an owner-rights function, so the "no profile, no rows" rule never reached it.',
      fix: 'Migration 0466: the list answers only a caller who has a profile.',
      refs: ['D-178', 'FRS-285.7', '0466_staff_names_need_a_profile.sql', 'PT-8.2'] },
    { id: 'F-12', title: 'Anybody signed in could burn Field Failure Report numbers', severity: 'Low', status: 'Fixed',
      found: 'Re-scan 07-Nov-2026 — penetration test, local copy',
      what: 'next_ffr_no() advances the year\'s FFR counter each time it is called and was callable through the API by any signed-in login, so the controlled FFR - 001/26 series could be left with gaps.',
      fix: 'Migration 0467: withdrawn from the API roles; raising a report (raise_ffr, ffr_stamp) still numbers it.',
      refs: ['D-178', 'FRS-285.4', '0467_ffr_number_not_public.sql', 'PT-8.3'] },
    { id: 'F-13', title: 'A Knowledge Base article could carry script past the sanitiser', severity: 'High', status: 'Fixed',
      found: 'Re-scan 07-Nov-2026 — code review, confirmed in a browser',
      what: 'The sanitiser unwrapped a tag it does not allow and moved its contents up without cleaning them, so <section><img onerror=…></section> kept the handler -- run by Chromium in the test. Anybody with a profile may write an article, and it runs in whoever opens it, an administrator included: a route from an engineer to an administrator\'s session.',
      fix: 'sanitizeHtml(): what an unwrapped tag held is cleaned too, and script, style, svg, math, iframe, object, embed, template, form controls and the like are dropped with their contents. Already-saved articles are cleaned as they are shown.',
      refs: ['D-179', 'FRS-285.5', 'src/lib/sanitizeHtml.ts'] },
  ] as ScanFinding[],
  clean: [
    'No secret key, token or private key in the repository or the published site; only the publishable key, public by design.',
    'No source map published.',
    'Dynamic SQL in database functions uses fixed table lists, quoted identifiers and parameters — no injection path.',
    'A signed-in engineer could not see another engineer\'s calls, requests, signatures, notifications, hand stock or the audit log, and could not gain any right: role, permission, new role, super admin, setting, Audit Mode, password reset or another person\'s signature were all refused, and the audit log was untouched.',
    'Every table has row-level security on (one test-only table aside), and every view over a protected table applies it to the reader.',
    'Re-scan 07-Nov-2026: the penetration test PT-1 to PT-7 still passes on v0.10.228; the live check asked 162 tables and views and none returned a row to the public key; no source map and no secret key in the published site; plain http redirects to https.',
  ],
};
