// ===========================================================================
// Daily digest — a Supabase Edge Function (Deno) that emails a defined set of
// people a single mail with four sections, each also attached as a CSV:
//   1. Open / pending calls   (pending_calls)         — the actionable list
//   2. Complete call register (calls)                 — every call, as an archive
//   3. PM calls due soon      (open PM, reg_date ≤ +7) — plan the month's visits
//   4. Spares awaiting dispatch (spare_pending_dispatch)
//
// Reads with the service role (sees everything), sends via Resend. Triggered
// once a day by pg_cron (schedule_daily_digest.sql), guarded by a shared secret
// so only the schedule can invoke it. Deploy with --no-verify-jwt.
//
// Secrets (supabase secrets set):
//   RESEND_API_KEY · DIGEST_FROM · DIGEST_TO (comma-separated) · DIGEST_SECRET
//   (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected automatically.)
//   Optional: DIGEST_PM_DAYS (default 7).
// ===========================================================================

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

type Col = { key: string; header: string };
const CALL_COLS: Col[] = [
  { key: 'ucn', header: 'UCN' }, { key: 'call_number', header: 'Call Number' },
  { key: 'call_type', header: 'Type' }, { key: 'open_state', header: 'Status' },
  { key: 'reg_date', header: 'Registered' }, { key: 'party_name', header: 'Party' },
  { key: 'city', header: 'City' }, { key: 'product_name', header: 'Product' },
  { key: 'serial', header: 'Serial' }, { key: 'allocated_to', header: 'Engineer' },
  { key: 'complaint_reported', header: 'Complaint' },
];
const SPARE_COLS: Col[] = [
  { key: 'or_no', header: 'OR No' }, { key: 'part', header: 'Part' }, { key: 'qty', header: 'Qty' },
  { key: 'engineer', header: 'Engineer' }, { key: 'party_name', header: 'Party' },
  { key: 'product_name', header: 'Product' }, { key: 'ucn', header: 'UCN' },
  { key: 'call_number', header: 'Call Number' }, { key: 'waiting_since', header: 'Waiting Since' },
];

const csvCell = (v: unknown) => {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const toCsv = (cols: Col[], rows: Record<string, unknown>[]) =>
  [cols.map((c) => c.header).join(','), ...rows.map((r) => cols.map((c) => csvCell(r[c.key])).join(','))].join('\n');
const b64 = (s: string) => btoa(unescape(encodeURIComponent(s)));
const esc = (v: unknown) => String(v ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]!));

async function fetchAll(build: () => any): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build().range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

function tableHtml(cols: Col[], rows: Record<string, unknown>[], limit = 25): string {
  const head = cols.map((c) => `<th style="text-align:left;padding:6px 10px;border-bottom:2px solid #0b63b4;font-size:12px;white-space:nowrap">${c.header}</th>`).join('');
  const body = rows.slice(0, limit).map((r) =>
    `<tr>${cols.map((c) => `<td style="padding:5px 10px;border-bottom:1px solid #eef2f7;font-size:12px">${esc(r[c.key])}</td>`).join('')}</tr>`).join('');
  const more = rows.length > limit ? `<div style="color:#5a6b7e;font-size:12px;margin:6px 0 0">…and ${rows.length - limit} more — see the attached CSV.</div>` : '';
  return `<div style="overflow-x:auto"><table style="border-collapse:collapse;width:100%;min-width:520px"><tr>${head}</tr>${body}</table></div>${more}`;
}

function sectionHtml(title: string, icon: string, rows: Record<string, unknown>[], cols: Col[], extra = ''): string {
  return `
    <h3 style="margin:22px 0 6px;font-size:16px">${icon} ${esc(title)} <span style="color:#5a6b7e;font-weight:400">· ${rows.length}</span></h3>
    ${extra}
    ${rows.length ? tableHtml(cols, rows) : '<div style="color:#5a6b7e;font-size:13px">Nothing here today.</div>'}`;
}

Deno.serve(async (req) => {
  const secret = Deno.env.get('DIGEST_SECRET') ?? '';
  if (!secret || req.headers.get('x-digest-secret') !== secret) return new Response('Forbidden', { status: 403 });

  const supabase: SupabaseClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const callSel = CALL_COLS.map((c) => c.key).join(',');
  const spareSel = SPARE_COLS.map((c) => c.key).join(',');
  const pmDays = parseInt(Deno.env.get('DIGEST_PM_DAYS') ?? '7', 10) || 7;
  const dueBy = new Date(Date.now() + pmDays * 864e5).toISOString().slice(0, 10);

  let open: Record<string, unknown>[], all: Record<string, unknown>[], pm: Record<string, unknown>[], spares: Record<string, unknown>[];
  try {
    open = await fetchAll(() => supabase.from('pending_calls').select(callSel).order('reg_date', { ascending: false }));
    all = await fetchAll(() => supabase.from('calls').select(callSel).order('reg_date', { ascending: false }));
    pm = await fetchAll(() => supabase.from('calls').select(callSel).eq('call_type', 'P M VISIT').neq('open_state', 'Solved').lte('reg_date', dueBy).order('reg_date', { ascending: true }));
    spares = await fetchAll(() => supabase.from('spare_pending_dispatch').select(spareSel).order('waiting_since', { ascending: true }));
  } catch (e) {
    return new Response(`DB error: ${e instanceof Error ? e.message : String(e)}`, { status: 500 });
  }

  // Open-calls breakdown chips.
  const byType: Record<string, number> = {};
  for (const r of open) byType[String(r.call_type || '—')] = (byType[String(r.call_type || '—')] ?? 0) + 1;
  const chips = Object.entries(byType).sort((a, b) => b[1] - a[1])
    .map(([k, n]) => `<td style="padding:6px 12px;border:1px solid #dbe4ee"><b>${n}</b>&nbsp; ${esc(k)}</td>`).join('');

  const stamp = new Date().toISOString().slice(0, 10);
  const html = `
  <div style="font-family:Segoe UI,Arial,sans-serif;color:#0e2033;max-width:960px">
    <h2 style="margin:0 0 2px">RITHI CRM — Daily Digest</h2>
    <div style="color:#5a6b7e;font-size:13px;margin-bottom:14px">${new Date().toLocaleDateString('en-IN', { dateStyle: 'full' })}</div>
    <table style="border-collapse:collapse;margin-bottom:6px"><tr>${chips}</tr></table>
    ${sectionHtml('Open / pending calls', '🔥', open, CALL_COLS)}
    ${sectionHtml(`PM due within ${pmDays} days`, '🗓️', pm, CALL_COLS)}
    ${sectionHtml('Spares awaiting dispatch', '🚚', spares, SPARE_COLS)}
    ${sectionHtml('Complete call register', '🗂️', all, CALL_COLS, '<div style="color:#5a6b7e;font-size:12px">Full archive attached as CSV.</div>')}
    <div style="color:#8aa0b4;font-size:11px;margin-top:22px">Automated daily digest from RITHI CRM. To change recipients, update the DIGEST_TO secret.</div>
  </div>`;

  const to = (Deno.env.get('DIGEST_TO') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  if (to.length === 0) return new Response('No DIGEST_TO recipients set', { status: 400 });

  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${Deno.env.get('RESEND_API_KEY')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: Deno.env.get('DIGEST_FROM') ?? 'RITHI CRM <onboarding@resend.dev>',
      to,
      subject: `RITHI CRM Daily — ${open.length} open · ${pm.length} PM due · ${spares.length} to dispatch (${stamp})`,
      html,
      attachments: [
        { filename: `open-calls-${stamp}.csv`, content: b64(toCsv(CALL_COLS, open)) },
        { filename: `pm-due-${stamp}.csv`, content: b64(toCsv(CALL_COLS, pm)) },
        { filename: `spares-to-dispatch-${stamp}.csv`, content: b64(toCsv(SPARE_COLS, spares)) },
        { filename: `all-calls-${stamp}.csv`, content: b64(toCsv(CALL_COLS, all)) },
      ],
    }),
  });
  if (!resp.ok) return new Response(`Resend error: ${await resp.text()}`, { status: 502 });
  return new Response(JSON.stringify({ ok: true, open: open.length, pm: pm.length, spares: spares.length, all: all.length, to: to.length }), { headers: { 'Content-Type': 'application/json' } });
});
