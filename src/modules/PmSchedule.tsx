import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../lib/auth';
import { listPmSchedule, supabaseConfigured, type PmScheduleRow } from '../lib/supabase';
import { createPmCalls } from '../lib/pmGenerate';
import { formatDay, todayLocal } from '../lib/dates';

// ===========================================================================
// THE PM SCHEDULE OF ONE WARRANTY OR CONTRACT ENTRY (0407, the user,
// 2026-10-09: "Can I have the schedules listed in Warranty and contract pages
// as well.. also a provision to generate from there").
//
// Every visit of every machine on the entry, by PM Due's rules: visit k on
// start + k x months x 30 / visits days; Generated when its "k / N" PM call
// exists and is not cancelled. A visit not generated is MISSED once its due
// month has passed, DUE in its own month, UPCOMING before it.
//
// GENERATE: "Due or past due, dated its due month" -- only a visit not
// generated whose due month has come, and the call is dated the 1st of THAT
// month, shaped and registered exactly as PM Due does it (createPmCalls). A
// future visit cannot be generated early.
// ===========================================================================

const monthOf = (d: string) => String(d ?? '').slice(0, 7);

export function PmScheduleSection({ source, refNo }: { source: 'Warranty' | 'Contract'; refNo: string }) {
  const { can } = useAuth();
  const mayList = can('pm.generate');
  const mayCreate = mayList && can('pm.create');
  const [rows, setRows] = useState<PmScheduleRow[] | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error' | 'info'; text: string } | null>(null);
  const [openUp, setOpenUp] = useState(true);
  const thisMonth = todayLocal().slice(0, 7);

  const load = useCallback(async () => {
    if (!mayList || !refNo || !supabaseConfigured()) return;
    setErr('');
    try { setRows(await listPmSchedule(source, refNo)); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); setRows([]); }
  }, [mayList, source, refNo]);
  useEffect(() => { setRows(null); void load(); }, [load]);

  const machines = useMemo(() => {
    const m = new Map<string, PmScheduleRow[]>();
    for (const r of rows ?? []) {
      const k = `${r.product_name}|${r.serial}`;
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(r);
    }
    return [...m.entries()];
  }, [rows]);
  const due = useMemo(() => (rows ?? []).filter((r) => !r.generated && monthOf(r.due_date) <= thisMonth), [rows, thisMonth]);

  if (!mayList) {
    return <div className="detail-hint">The PM schedule needs “Generate PM calls from the registers” on Roles &amp; Permissions.</div>;
  }

  const stateOf = (r: PmScheduleRow) => r.generated ? 'Generated'
    : monthOf(r.due_date) < thisMonth ? 'Missed PM'
    : monthOf(r.due_date) === thisMonth ? 'Due' : 'Upcoming';

  const generate = async (visits: PmScheduleRow[]) => {
    if (!visits.length) return;
    const months = [...new Set(visits.map((v) => monthOf(v.due_date)))].sort();
    const what = visits.length === 1
      ? `visit ${visits[0].visit_no} / ${visits[0].pm_visits} of ${visits[0].product_name} ${visits[0].serial}, dated 1st ${months[0]}`
      : `${visits.length} PM calls, each dated the 1st of its visit's due month (${months.join(', ')})`;
    if (!window.confirm(`Create ${what}?`)) return;
    setBusy(true); setMsg({ tone: 'info', text: 'Creating…' });
    try {
      const res = await createPmCalls(months.map((m) => ({ month: m, visits: visits.filter((v) => monthOf(v.due_date) === m) })));
      setMsg(res.ok
        ? { tone: 'ok', text: `Created ${res.written} PM call${res.written === 1 ? '' : 's'}. They are in the Preventive (PM) register.` }
        : { tone: 'error', text: `Created ${res.written} before an error: ${res.error}` });
    } catch (e) {
      setMsg({ tone: 'error', text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
      void load();
    }
  };

  return (
    <div className="req-act-sec">
      <div className="rep-sec-title" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button className="linklike" onClick={() => setOpenUp((v) => !v)}>{openUp ? '▾' : '▸'} PM schedule</button>
        {rows && <span className="muted">({rows.length} visit{rows.length === 1 ? '' : 's'}, {due.length} due or missed)</span>}
        <span style={{ flex: 1 }} />
        {mayCreate && due.length > 0 && (
          <button className="btn btn-sm btn-primary" disabled={busy} onClick={() => void generate(due)}>
            🗓️ Generate {due.length} due / missed
          </button>
        )}
      </div>
      {openUp && (
        <>
          {msg && <div className={`sheet-banner sheet-banner-${msg.tone}`}><span>{msg.text}</span>
            <button className="btn btn-ghost btn-sm" onClick={() => setMsg(null)}>✕</button></div>}
          {err && <div className="field-err">The PM schedule could not be read: {err}</div>}
          {rows === null && !err && <div className="muted">Working out the schedule…</div>}
          {rows && rows.length === 0 && !err && (
            <div className="detail-hint">No PM schedule — no machine here has a start date, a period and PM visits.</div>
          )}
          {machines.map(([k, vs]) => (
            <div key={k} style={{ marginTop: 8 }}>
              <div><b>{vs[0].product_name} {vs[0].serial}</b>{' '}
                <span className="muted">· {vs[0].pm_visits} visits over {vs[0].period_months} months, {formatDay(vs[0].cover_start)} – {formatDay(vs[0].cover_end)}
                  {vs[0].engineer ? ` · ${vs[0].engineer}` : ' · no engineer on the Product Database'}</span></div>
              <div className="assoc-scroll">
                <table className="assoc-table">
                  <thead><tr><th>Visit</th><th>Due</th><th>Status</th><th>PM call</th><th /></tr></thead>
                  <tbody>
                    {vs.map((r) => {
                      const st = stateOf(r);
                      return (
                        <tr key={r.visit_no}>
                          <td>{r.visit_no} / {r.pm_visits}</td>
                          <td style={{ whiteSpace: 'nowrap' }}>{formatDay(r.due_date)}</td>
                          <td>{st === 'Missed PM' ? <b>{st}</b> : st}</td>
                          <td>{r.generated_ucn ? <>{r.generated_ucn} <span className="muted">{formatDay(r.generated_on)}</span></> : <span className="muted">—</span>}</td>
                          <td>{mayCreate && !r.generated && monthOf(r.due_date) <= thisMonth && (
                            <button className="btn btn-sm" disabled={busy} onClick={() => void generate([r])}>Generate</button>
                          )}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
