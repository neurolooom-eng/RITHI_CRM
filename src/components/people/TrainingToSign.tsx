// ===========================================================================
// TRAINING FORMS TO SIGN -- on My Profile -> Training (0454; the user,
// 2026-10-27: the Training Form "is mainly at the moment used for Getting
// Signatures"; asked, each person signs their own line or box).
//
// Every part of a training form that names the signed-in person -- a trainee's
// line, the Trainer Signature, the Signature of Evaluator -- and is not signed
// yet. Sign places the signature they saved on My Profile -> Signature; the
// database checks the part names them, so nobody can sign for somebody else.
// ===========================================================================
import { useCallback, useEffect, useState } from 'react';
import { SectionCard } from '../ui/ui';
import { listTrainingRequests, myPersonNames, partsToSign, signTrainingRequest, type ToSign } from '../../lib/training';
import { useMySignature } from '../../lib/signature';
import { formatDay } from '../../lib/dates';
import { logAudit } from '../../lib/audit';
import { supabaseConfigured } from '../../lib/supabase';

export function TrainingToSign() {
  const sig = useMySignature();
  const [items, setItems] = useState<ToSign[] | null>(null);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  const load = useCallback(async () => {
    if (!supabaseConfigured()) { setItems([]); return; }
    try {
      const [rows, names] = await Promise.all([listTrainingRequests(), myPersonNames()]);
      setItems(partsToSign(rows, names));
    } catch { setItems([]); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const sign = async (it: ToSign) => {
    const key = `${it.request.id}:${it.part}:${it.index ?? ''}`;
    setBusy(key); setMsg(null);
    const res = await signTrainingRequest(it.request.id, it.part, it.index);
    logAudit({ action: 'training.request.sign', target: it.request.req_no || `#${it.request.id}`, status: res.ok ? 'ok' : 'error', error: res.ok ? undefined : res.error, meta: { part: it.part, index: it.index } });
    setBusy('');
    setMsg(res.ok ? { tone: 'ok', text: `Signed${it.request.req_no ? ` Training Request ${it.request.req_no}` : ''}.` } : { tone: 'error', text: res.error ?? 'Could not sign.' });
    void load();
  };

  if (!items || !items.length) return null;
  return (
    <SectionCard title={`Training forms to sign (${items.length})`}>
      {msg && <div className={`sheet-banner sheet-banner-${msg.tone}`}><span>{msg.text}</span></div>}
      {!sig?.signature && (
        <div className="sheet-banner sheet-banner-info">
          <span>Save your signature first — it is what is placed on the form. <a href="#/profile?tab=signature">Go to Signature →</a></span>
        </div>
      )}
      <table className="table" style={{ width: '100%' }}>
        <thead><tr><th>Training Request</th><th>Topic</th><th>Dates</th><th>Your part</th><th /></tr></thead>
        <tbody>
          {items.map((it) => {
            const key = `${it.request.id}:${it.part}:${it.index ?? ''}`;
            const r = it.request;
            return (
              <tr key={key}>
                <td>{r.req_no || <span className="muted">no number yet</span>}</td>
                <td>{r.topic}</td>
                <td>{r.from_date ? `${formatDay(r.from_date)}${r.to_date ? ` – ${formatDay(r.to_date)}` : ''}` : <span className="muted">—</span>}</td>
                <td>{it.label}</td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  <a className="btn btn-sm" href={`#/training-form/${r.id}`} target="_blank" rel="noopener noreferrer">📄 Form</a>{' '}
                  <button className="btn btn-sm btn-primary" disabled={!sig?.signature || busy === key} onClick={() => void sign(it)}>
                    {busy === key ? 'Signing…' : '✍️ Sign'}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </SectionCard>
  );
}
