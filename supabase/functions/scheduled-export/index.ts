// ===========================================================================
// SCHEDULED EXPORT — the tables an administrator chose, as CSV, by mail.
//
// The user, 2026-09-22: "Or can we have Scheduled Export option in the UI
// itself so that i will schedule which ever is necessary."
//
// WHAT THIS DOES NOT DECIDE. It does not decide who receives the mail. The
// recipients are EXPORT_TO, a secret set with the Supabase CLI by somebody
// holding the project keys; they are not in the database and not in this
// repository, and nothing on any screen can change them. That separation is
// the whole reason a scheduled export is safe to offer at all: the first
// design held the destination in a settings row, which made the nightly copy
// of the entire customer base redirectable by any administrator, and it was
// refused. What the screen decides is WHICH TABLES and WHEN. See 0228.
//
// It does not decide WHEN either, beyond asking. `due_export_schedules()` (SQL,
// and therefore testable) returns the schedules whose most recent due instant
// is later than their last run. pg_cron pokes this function every fifteen
// minutes; a night the container was restarting is caught up at the next tick
// rather than lost, and nothing is ever sent twice.
//
// It reads with the SERVICE ROLE, past row-level security, because a schedule
// has no signed-in person behind it. That is exactly why the table names are
// guarded in the database (`is_exportable_table()`) rather than here: a name in
// export_schedules cannot be one of the audit trails, and the trigger that
// enforces that is the same rule the Data Export picker offers.
//
// Secrets (supabase secrets set):
//   RESEND_API_KEY · EXPORT_FROM · EXPORT_TO (comma-separated) · EXPORT_SECRET
//   (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected automatically.)
//   Optional: EXPORT_MAX_MB (attachment cap, default 20)
//             EXPORT_MAX_RAW_MB (refuse-to-try cap, default 120)
// Deploy with --no-verify-jwt; the shared secret is what admits the schedule.
// ===========================================================================

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { zipDeflate } from './zip.ts';
import { toCsv, columnsOf, dayTime, IST_MINUTES } from './shape.ts';

const PAGE = 1000;
// A ceiling, not an expectation. Without one, a table that grew unnoticed takes
// the whole run down with an out-of-memory the log does not explain.
const MAX_ROWS_PER_TABLE = 500_000;

interface Schedule { id: number; label: string; tables: string[]; due_at: string }

const enc = (s: string) => new TextEncoder().encode(s);
const esc = (v: unknown) => String(v ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]!));
const mb = (n: number) => `${(n / 1048576).toFixed(1)} MB`;

/** Base64 of bytes, in chunks — `String.fromCharCode(...bytes)` on a
 *  multi-megabyte array overflows the argument stack and throws. */
function b64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(s);
}

/** Today in IST, for the file name — the day the reader will call it. */
function istDay(): string {
  const d = new Date(Date.now() + IST_MINUTES * 60000);
  return d.toISOString().slice(0, 10);
}

async function readTable(db: SupabaseClient, name: string): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = [];
  for (let from = 0; from < MAX_ROWS_PER_TABLE; from += PAGE) {
    // PAGED. PostgREST caps a response at 1,000 rows however large the limit
    // says, and silently — the fault this project has had thirteen times.
    const { data, error } = await db.from(name).select('*').range(from, from + PAGE - 1);
    if (error) throw new Error(`${name}: ${error.message}`);
    out.push(...(data ?? []));
    if (!data || data.length < PAGE) return out;
  }
  throw new Error(`${name} holds more than ${MAX_ROWS_PER_TABLE.toLocaleString()} rows — split this schedule.`);
}

async function sendMail(subject: string, html: string, attachments: { filename: string; content: string }[]) {
  const to = (Deno.env.get('EXPORT_TO') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!to.length) throw new Error('No EXPORT_TO recipients are set on this function.');
  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${Deno.env.get('RESEND_API_KEY')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: Deno.env.get('EXPORT_FROM') ?? 'RITHI CRM <onboarding@resend.dev>',
      to, subject, html, attachments,
    }),
  });
  if (!resp.ok) throw new Error(`Resend refused it: ${await resp.text()}`);
  return to.length;
}

async function runSchedule(db: SupabaseClient, s: Schedule) {
  const started = new Date().toISOString();
  const { data: runRow } = await db.from('export_runs')
    .insert({ schedule_id: s.id, label: s.label, started_at: started, tables: s.tables })
    .select('id').single();
  const runId = runRow?.id as number | undefined;

  const finish = async (status: string, detail: string, extra: Record<string, unknown> = {}) => {
    if (runId) {
      await db.from('export_runs')
        .update({ finished_at: new Date().toISOString(), status, detail, ...extra }).eq('id', runId);
    }
    await db.from('export_schedules')
      .update({ last_run_at: new Date().toISOString(), last_status: status, last_detail: detail })
      .eq('id', s.id);
  };

  const day = istDay();
  const capMb = Number(Deno.env.get('EXPORT_MAX_MB') ?? '20') || 20;
  const rawCapMb = Number(Deno.env.get('EXPORT_MAX_RAW_MB') ?? '120') || 120;

  let files: { path: string; data: Uint8Array; rows: number }[] = [];
  let rowTotal = 0;
  try {
    for (const name of s.tables) {
      const rows = await readTable(db, name);
      const cols = columnsOf(rows);
      files.push({ path: `${name}.csv`, data: enc(toCsv(cols, rows)), rows: rows.length });
      rowTotal += rows.length;
    }
  } catch (e) {
    const why = e instanceof Error ? e.message : String(e);
    // THE FAILURE IS MAILED TOO. A scheduled job that goes quiet is one nobody
    // notices has stopped, which is worse than one that says it broke.
    try {
      await sendMail(`RITHI CRM export FAILED — ${s.label} (${day})`,
        `<p>The scheduled export <b>${esc(s.label)}</b> did not run.</p><p><b>${esc(why)}</b></p>
         <p style="color:#5a6b7e">Tables: ${esc(s.tables.join(', '))}</p>`, []);
    } catch { /* the mail failing is already the thing being reported */ }
    await finish('failed', why);
    return { id: s.id, status: 'failed', detail: why };
  }

  const rawBytes = files.reduce((a, f) => a + f.data.length, 0);
  if (rawBytes > rawCapMb * 1048576) {
    const why = `The tables came to ${mb(rawBytes)}, over the ${rawCapMb} MB this job will attempt. Split the schedule.`;
    try {
      await sendMail(`RITHI CRM export FAILED — ${s.label} (${day})`,
        `<p>The scheduled export <b>${esc(s.label)}</b> is too large to build.</p><p><b>${esc(why)}</b></p>`, []);
    } catch { /* as above */ }
    await finish('failed', why, { row_count: rowTotal, bytes: rawBytes });
    return { id: s.id, status: 'failed', detail: why };
  }

  // THE CAP IS HONOURED BY LEAVING TABLES OUT AND SAYING WHICH — never by
  // truncating one, which would send a file that looks complete and is not.
  // The largest goes first, because dropping it is what buys the most room.
  const dropped: string[] = [];
  let archive = await zipDeflate(files);
  while (archive.length * 4 / 3 > capMb * 1048576 && files.length > 1) {
    files.sort((a, b) => b.data.length - a.data.length);
    dropped.push(files.shift()!.path.replace(/\.csv$/, ''));
    files.sort((a, b) => a.path.localeCompare(b.path));
    archive = await zipDeflate(files);
  }
  const overCap = archive.length * 4 / 3 > capMb * 1048576;

  const kept = files.map((f) => `<tr><td style="padding:4px 10px;border-bottom:1px solid #eef2f7">${esc(f.path)}</td>`
    + `<td style="padding:4px 10px;border-bottom:1px solid #eef2f7;text-align:right">${f.rows.toLocaleString()}</td></tr>`).join('');

  const html = `
  <div style="font-family:Segoe UI,Arial,sans-serif;color:#0e2033;max-width:720px">
    <h2 style="margin:0 0 2px">RITHI CRM — ${esc(s.label)}</h2>
    <div style="color:#5a6b7e;font-size:13px;margin-bottom:14px">Scheduled export · ${esc(dayTime(s.due_at))} IST</div>
    <p style="font-size:13px">${files.length} table${files.length === 1 ? '' : 's'},
       ${rowTotal.toLocaleString()} rows, attached as one ZIP of CSV files (${mb(archive.length)}).</p>
    <table style="border-collapse:collapse;font-size:12px;min-width:320px">
      <tr><th style="text-align:left;padding:4px 10px;border-bottom:2px solid #0b63b4">File</th>
          <th style="text-align:right;padding:4px 10px;border-bottom:2px solid #0b63b4">Rows</th></tr>
      ${kept}
    </table>
    ${dropped.length ? `<p style="color:#b23b2e;font-size:13px"><b>Left out to stay under the ${capMb} MB
       attachment limit:</b> ${esc(dropped.join(', '))}. Give those a schedule of their own, or download them
       from Administration → Data Export.</p>` : ''}
    ${overCap ? `<p style="color:#b23b2e;font-size:13px"><b>This attachment is still over the limit</b> — it is
       one table and cannot be split further. The mail may be refused.</p>` : ''}
    <div style="color:#8aa0b4;font-size:11px;margin-top:22px">
      Sent by the RITHI CRM scheduled export. What is exported and when is set on
      Administration → Data Export. Who receives it is a deployment secret and is not changeable from the
      application.
    </div>
  </div>`;

  const recipients = await sendMail(
    `RITHI CRM export — ${s.label} · ${files.length} table${files.length === 1 ? '' : 's'}, ${rowTotal.toLocaleString()} rows (${day})`,
    html,
    [{ filename: `rithi-${s.label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${day}.zip`, content: b64(archive) }]);

  const status = dropped.length ? 'partial' : 'sent';
  const detail = dropped.length
    ? `Sent ${files.length} of ${files.length + dropped.length} tables; left out ${dropped.join(', ')} (over ${capMb} MB).`
    : `Sent ${files.length} table(s), ${rowTotal.toLocaleString()} rows, ${mb(archive.length)}.`;
  await finish(status, detail, { row_count: rowTotal, bytes: archive.length, recipients });
  return { id: s.id, status, detail };
}

Deno.serve(async (req) => {
  const secret = Deno.env.get('EXPORT_SECRET') ?? '';
  if (!secret || req.headers.get('x-export-secret') !== secret) return new Response('Forbidden', { status: 403 });

  const db: SupabaseClient = createClient(
    Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  const { data, error } = await db.rpc('due_export_schedules');
  if (error) return new Response(`DB error: ${error.message}`, { status: 500 });
  const due = (data ?? []) as Schedule[];

  const results = [];
  for (const s of due) {
    try { results.push(await runSchedule(db, s)); }
    catch (e) { results.push({ id: s.id, status: 'failed', detail: e instanceof Error ? e.message : String(e) }); }
  }
  return new Response(JSON.stringify({ ok: true, due: due.length, results }),
    { headers: { 'Content-Type': 'application/json' } });
});
