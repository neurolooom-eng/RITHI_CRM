// ===========================================================================
// PRE-DELIVERY QUALITY CHECK, PRINTABLE (0377) -- the same R/SER/QC/007 sheet
// as an Indoor job's test (PdtSheet), for a record of the register.
// ===========================================================================
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getPdqcRecord, supabaseConfigured, type PdqcRecord } from '../lib/supabase';
import { useMySignature, signatureBelongsTo } from '../lib/signature';
import { useAuth } from '../lib/auth';
import { logAudit } from '../lib/audit';
import { PdtSheet } from './IndoorPdtPrint';
import './indoorprint.css';

export function PdqcPrint() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const mySig = useMySignature();
  const [rec, setRec] = useState<PdqcRecord | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!supabaseConfigured()) { setErr('Connect the database in Settings to print this form.'); return; }
    let live = true;
    getPdqcRecord(Number(id))
      .then((r) => { if (live) { if (!r) setErr('That check was not found, or you cannot view it.'); else setRec(r); } })
      .catch((e) => { if (live) setErr(e instanceof Error ? e.message : String(e)); });
    return () => { live = false; };
  }, [id]);

  const back = <button className="btn btn-sm" onClick={() => navigate('/indoor/pdqc')}>← Back to the register</button>;
  if (err) return <div className="ip-page"><div className="ip-toolbar">{back}</div><div className="ip-missing"><p>{err}</p></div></div>;
  if (!rec) return <div className="ip-page"><div className="ip-missing"><p>Loading…</p></div></div>;

  const signature = signatureBelongsTo(rec.inspector_name, user) ? (mySig?.signature ?? '') : '';
  return (
    <div className="ip-page">
      <style>{'@media print { @page { size: A4 portrait; margin: 12.7mm 15mm 20mm; } }'}</style>
      <div className="ip-toolbar">
        {back}
        <button className="btn btn-sm btn-primary"
          onClick={() => { logAudit({ action: 'pdqc.print', target: rec.pdqc_no, status: 'ok', meta: { id: rec.id } }); window.print(); }}>
          🖨 Print
        </button>
        <span className="muted">{rec.pdqc_no} · {rec.product_name} · {rec.serial} · R/SER/QC/007</span>
      </div>
      <PdtSheet productName={rec.product_name} serial={rec.serial} pdt={rec} refText={rec.pdqc_no} signature={signature} />
    </div>
  );
}
