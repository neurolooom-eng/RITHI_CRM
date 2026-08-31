#!/usr/bin/env node
// ===========================================================================
// Bulk-provision Supabase Auth logins for the field team.
// ---------------------------------------------------------------------------
// First-time users set their own password from an invite or reset email
// (the app handles both — see takeRecoveryFromUrl in src/lib/supabase.ts).
// This script creates the underlying Auth accounts so those emails have
// somewhere to land. It reads the SERVICE_ROLE key (admin API) from the
// environment — never commit it.
//
//   export SUPABASE_URL="https://xxxx.supabase.co"
//   export SUPABASE_SERVICE_ROLE_KEY="eyJ...service_role..."   # NOT the anon key
//
//   node scripts/create-auth-users.mjs                 # from user_directory (validity = true)
//   node scripts/create-auth-users.mjs --invite        # + email each an invite link
//   node scripts/create-auth-users.mjs --csv people.csv # from a CSV with an `email` column
//   node scripts/create-auth-users.mjs a@x.com b@y.com  # just these addresses
//   node scripts/create-auth-users.mjs --redirect https://neurolooom-eng.github.io/RITHI_CRM/
//
// Modes:
//   default  — creates accounts with email already CONFIRMED and a random
//              throwaway password. Tell users to open the app and click
//              "Forgot password?" to set their own. No SMTP needed.
//   --invite — also calls inviteUserByEmail so each person gets an invite
//              email straight away. Requires SMTP configured in Supabase
//              (Authentication -> Emails), and the redirect URL allow-listed
//              (Authentication -> URL Configuration -> Redirect URLs).
//
// Idempotent: an address that already has an account is reported and skipped.
// ===========================================================================

import { readFileSync, existsSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY first (see the header of this file).');
  process.exit(1);
}

// ---- args -----------------------------------------------------------------
const args = process.argv.slice(2);
const invite = args.includes('--invite');
const csvIdx = args.indexOf('--csv');
const csvPath = csvIdx >= 0 ? args[csvIdx + 1] : null;
const redirIdx = args.indexOf('--redirect');
const redirectTo = redirIdx >= 0 ? args[redirIdx + 1] : (process.env.APP_URL || undefined);
// Bare positional args (not flags or their values) are treated as emails.
const consumed = new Set([csvPath, redirIdx >= 0 ? args[redirIdx + 1] : null].filter(Boolean));
const literalEmails = args.filter((a) => !a.startsWith('--') && !consumed.has(a));

const admin = createClient(URL, KEY, { auth: { autoRefreshToken: false, persistSession: false } });

const isEmail = (s) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(s || '').trim());
const randomPassword = () => randomBytes(18).toString('base64url'); // never shown; users reset it

// ---- gather the people to provision ---------------------------------------
// Each entry: { email, name, designation }.
async function gather() {
  if (literalEmails.length) return literalEmails.map((email) => ({ email: email.trim(), name: '', designation: '' }));

  if (csvPath) {
    if (!existsSync(csvPath)) { console.error(`CSV not found: ${csvPath}`); process.exit(1); }
    const rows = parseCSV(readFileSync(csvPath, 'utf8'));
    const header = rows.shift() || [];
    const col = (names) => header.findIndex((h) => names.includes(h.trim().toLowerCase()));
    const ei = col(['email', 'email id', 'gmail', 'gmail id']);
    const ni = col(['name', 'user name', 'full name']);
    const di = col(['designation', 'role']);
    if (ei < 0) { console.error('CSV needs an "email" (or "gmail") column.'); process.exit(1); }
    return rows.map((r) => ({ email: (r[ei] || '').trim(), name: ni >= 0 ? (r[ni] || '').trim() : '', designation: di >= 0 ? (r[di] || '').trim() : '' }));
  }

  // Default: the user_directory table (people marked valid).
  const { data, error } = await admin
    .from('user_directory')
    .select('name, email, gmail, designation, validity')
    .eq('validity', true);
  if (error) { console.error('Could not read user_directory:', error.message); process.exit(1); }
  return (data || []).map((d) => ({ email: (d.email || d.gmail || '').trim(), name: d.name || '', designation: d.designation || '' }));
}

// Minimal CSV parser (quoted fields, commas, CRLF) — same shape as load-clean.
function parseCSV(text) {
  const rows = []; let row = []; let field = ''; let q = false;
  const s = text.replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === '"') { if (s[i + 1] === '"') { field += '"'; i++; } else q = false; }
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c === '\r') { /* skip */ }
    else field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

// ---- provision one address ------------------------------------------------
async function provision(person) {
  const email = person.email;
  if (!isEmail(email)) return { email, status: 'skip', why: 'not an email' };

  // Create with email pre-confirmed so the account exists and can sign in /
  // reset without an SMTP confirmation round-trip.
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: randomPassword(),
    email_confirm: true,
    user_metadata: { full_name: person.name || '' },
  });

  let userId = data?.user?.id ?? null;
  if (error) {
    if (/already|registered|exists/i.test(error.message)) {
      // Fine — the account is there. Look up the id so we can still upsert the profile.
      userId = await findUserId(email);
    } else {
      return { email, status: 'error', why: error.message };
    }
  }

  // Give them a profile row so the app has a role for them immediately.
  if (userId) {
    const { error: pErr } = await admin.from('profiles').upsert({
      id: userId,
      email,
      full_name: person.name || '',
      designation: person.designation || '',
      role: 'engineer',
    }, { onConflict: 'id' });
    if (pErr) console.warn(`  profile upsert failed for ${email}: ${pErr.message}`);
  }

  // Optionally send the invite email now.
  if (invite) {
    const { error: iErr } = await admin.auth.admin.inviteUserByEmail(email, redirectTo ? { redirectTo } : undefined);
    if (iErr && !/already|registered|confirmed/i.test(iErr.message)) {
      return { email, status: 'created-no-invite', why: iErr.message };
    }
  }

  return { email, status: error ? 'exists' : 'created' };
}

// Page through admin.listUsers to find an existing account's id.
async function findUserId(email) {
  const target = email.toLowerCase();
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error || !data?.users?.length) return null;
    const hit = data.users.find((u) => (u.email || '').toLowerCase() === target);
    if (hit) return hit.id;
    if (data.users.length < 1000) return null;
  }
  return null;
}

// ---- run ------------------------------------------------------------------
const people = await gather();
// De-dup by email, keep the first name/designation seen.
const seen = new Map();
for (const p of people) { const k = p.email.toLowerCase(); if (p.email && !seen.has(k)) seen.set(k, p); }
const list = [...seen.values()];

console.log(`Provisioning ${list.length} account(s)${invite ? ' with invite emails' : ''}${redirectTo ? ` (redirect ${redirectTo})` : ''}…\n`);

const tally = { created: 0, exists: 0, skip: 0, error: 0, 'created-no-invite': 0 };
for (const p of list) {
  const r = await provision(p);
  tally[r.status] = (tally[r.status] || 0) + 1;
  const mark = r.status === 'created' ? '✓' : r.status === 'exists' ? '·' : r.status === 'skip' ? '–' : '✗';
  console.log(`  ${mark} ${r.email}${r.why ? `  (${r.why})` : ''}`);
}

console.log(`\nDone. created=${tally.created} existing=${tally.exists} skipped=${tally.skip} errors=${tally.error}${tally['created-no-invite'] ? ` invite-failed=${tally['created-no-invite']}` : ''}`);
if (!invite) console.log('Next: tell users to open the app and click "Forgot password?" to set their password.');
