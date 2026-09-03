import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  listSpareDispatches, listDispatchLines, engineerAddress, saveEngineerAddress, supabaseConfigured,
} from '../lib/supabase';
import { buildDc, paginate, type DcDocument, type DcPage, mergeDcLines } from '../lib/dc';
import {
  DECLARATION_FORM, DECLARATION_ROWS_PER_PAGE, addressBlock, courierLine, defaultInput, gaps,
  type DeclarationInput,
} from '../lib/declaration';
import { useAuth } from '../lib/auth';
import logo from '../assets/alms-logo.jpg';
import './dc.css';

// ===========================================================================
// DECLARATION FORM — the sheet that travels with the parcel.
//
// "TO WHOMSOEVER IT MAY CONCERN": what is inside, why it is being sent, its
// approximate value, and that no money changes hands — the paper a courier or
// a checkpoint asks for. Second sheet of v2_DCTemplate.
//
// Printed the same way as the challan (A4, narrow margins, one complete
// <section> per sheet so the heading and the sender block are on every page),
// and from the same stock out, so both documents describe the same delivery.
//
// The three things the app cannot know are collected on screen before
// printing. The address is remembered against the engineer, so it is typed
// once; the value and the purpose belong to this parcel and are not.
// ===========================================================================

export function Declaration() {
  const { stockOut = '' } = useParams();
  const navigate = useNavigate();
  const { can } = useAuth();
  const [doc, setDoc] = useState<DcDocument | null>(null);
  const [input, setInput] = useState<DeclarationInput | null>(null);
  // The address as the User Master holds it, to tell an edit from a correction.
  const [known, setKnown] = useState('');
  const [err, setErr] = useState('');
  const [note, setNote] = useState('');

  useEffect(() => {
    if (!supabaseConfigured()) { setErr('Connect the database in Settings to print a declaration.'); return; }
    let live = true;
    (async () => {
      try {
        const heads = await listSpareDispatches(500);
        const head = heads.find((h) => String(h.uid) === stockOut);
        if (!head) { if (live) setErr(`Stock out ${stockOut} was not found, or you cannot view it.`); return; }
        const lines = await listDispatchLines(stockOut);
        // One line per PART on a declaration: the parcel holds two of it,
        // not two parcels of one.
        const raw = buildDc(head, lines);
        const built = { ...raw, lines: mergeDcLines(raw.lines) };
        const dir = await engineerAddress(built.engineer);
        if (!live) return;
        setDoc(built);
        setKnown(JSON.stringify(dir ?? {}));
        setInput(defaultInput(built.engineer, built.courier, dir ?? {}));
      } catch (e) {
        if (live) setErr(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => { live = false; };
  }, [stockOut]);

  const set = (patch: Partial<DeclarationInput>) => setInput((cur) => (cur ? { ...cur, ...patch } : cur));

  // Correcting the address here writes it back to the User Master, which is
  // where it is maintained — so the next parcel to this engineer is right too.
  const rememberAddress = async () => {
    if (!doc || !input) return;
    const fields = { address: input.address, city: input.city, state: input.state, phone: input.phone };
    const res = await saveEngineerAddress(doc.engineer, fields);
    setNote(res.ok
      ? `Saved to the User Master — ${doc.engineer}'s address will fill itself in next time.`
      : res.error ?? 'Could not save the address.');
    if (res.ok) setKnown(JSON.stringify(fields));
  };

  if (err) {
    return (
      <div className="dc-page">
        <div className="dc-toolbar"><button className="btn btn-sm" onClick={() => navigate('/spare-dispatch')}>← Back</button></div>
        <div className="dc-sheet"><p>{err}</p></div>
      </div>
    );
  }
  if (!doc || !input) return <div className="dc-page"><div className="dc-sheet"><p>Loading declaration…</p></div></div>;

  const missing = gaps(input);
  const pages = paginate(doc.lines, DECLARATION_ROWS_PER_PAGE);
  const edited = JSON.stringify({ address: input.address, city: input.city, state: input.state, phone: input.phone });
  const addressChanged = edited !== known && !!addressBlock(input).length;

  return (
    <div className="dc-page">
      <div className="dc-toolbar">
        <button className="btn btn-sm" onClick={() => navigate('/spare-dispatch')}>← Back to dispatch</button>
        <button className="btn btn-sm" onClick={() => navigate(`/dc/${encodeURIComponent(doc.stockOutNo)}`)}>📄 Challan</button>
        <button className="btn btn-sm btn-primary" onClick={() => window.print()}>🖨 Print</button>
        {!!missing.length && <span className="badge badge-warning">Still to fill in: {missing.join(' · ')}</span>}
      </div>

      {/* Not printed — what the form needs and the app cannot know. */}
      <div className="dc-sheet dc-noprint dc-fillin">
        <h3>Before printing</h3>
        <label className="field">
          <span className="field-label">To *</span>
          <input className="input" value={input.to} onChange={(e) => set({ to: e.target.value })} />
        </label>
        <label className="field">
          <span className="field-label">Address *</span>
          <textarea className="input" rows={2} value={input.address} onChange={(e) => set({ address: e.target.value })} />
        </label>
        <div className="decl-fill-row">
          <label className="field">
            <span className="field-label">City</span>
            <input className="input" value={input.city} onChange={(e) => set({ city: e.target.value })} />
          </label>
          <label className="field">
            <span className="field-label">State</span>
            <input className="input" value={input.state} onChange={(e) => set({ state: e.target.value })} />
          </label>
          <label className="field">
            <span className="field-label">Contact No</span>
            <input className="input" value={input.phone} onChange={(e) => set({ phone: e.target.value })} />
          </label>
        </div>
        {addressChanged && can('spare.dispatch') && (
          <button className="btn btn-sm" onClick={() => void rememberAddress()}>
            💾 Save to the User Master as {doc.engineer}&rsquo;s address
          </button>
        )}
        <label className="field">
          <span className="field-label">Approximate value (Rs.) *</span>
          <input className="input" value={input.value} onChange={(e) => set({ value: e.target.value })} placeholder="e.g. 12,500" />
        </label>
        <label className="field">
          <span className="field-label">Purpose</span>
          <textarea className="input" rows={2} value={input.purpose} onChange={(e) => set({ purpose: e.target.value })} />
        </label>
        <label className="field">
          <span className="field-label">Sent by</span>
          <input className="input" value={input.courier} onChange={(e) => set({ courier: e.target.value })} placeholder="DTDC, hand delivery…" />
        </label>
        {!!note && <p className="muted">{note}</p>}
      </div>

      {pages.map((p) => <DeclarationSheet key={p.page} doc={doc} page={p} input={input} />)}
    </div>
  );
}

function DeclarationSheet({ doc, page, input }: { doc: DcDocument; page: DcPage; input: DeclarationInput }) {
  return (
    <section className="dc-sheet">
      <div className="decl-head">
        <div className="dc-logo"><img src={logo} alt="Air Liquide Healthcare" /></div>
        <div className="decl-title">{DECLARATION_FORM.title}</div>
        <div className="decl-meta">
          <div><b>DATE</b><span>{doc.stockOutDate}</span></div>
          <div><b>SO NO</b><span>{doc.stockOutNo}</span></div>
        </div>
      </div>

      <div className="decl-ids">
        <div><b>GST NO:</b> {DECLARATION_FORM.gstNo}</div>
        <div><b>AREA CODE:</b> {DECLARATION_FORM.areaCode}</div>
      </div>

      <div className="decl-heading">{DECLARATION_FORM.heading}</div>

      <div className="decl-body">
        <p>{DECLARATION_FORM.contains}</p>
        <p>{input.purpose}</p>
        <p>{DECLARATION_FORM.valueLabel}<b>{input.value}</b></p>
        <p>{DECLARATION_FORM.noTransaction}</p>
      </div>

      <table className="dc-table decl-table">
        <colgroup><col className="decl-c-sno" /><col className="decl-c-part" /><col /><col className="dc-c-qty" /></colgroup>
        <thead>
          <tr>
            <th className="dc-th">SNO</th>
            <th className="dc-th">Part Number</th>
            <th className="dc-th">Part Description</th>
            <th className="dc-th">Qty</th>
          </tr>
        </thead>
        <tbody>
          {page.rows.map((r, i) => (
            <tr key={r ? `l${r.sr}` : `e${i}`} className={r ? '' : 'dc-empty'}>
              <td className="dc-c-sr">{r ? r.sr : ''}</td>
              <td>{r?.itemCode ?? ''}</td>
              <td>{r?.description ?? ''}</td>
              <td className="dc-c-qty">{r ? r.qty : ''}</td>
            </tr>
          ))}
          <tr>
            <td className="dc-c-sr" /><td />
            <td className="dc-strong" style={{ textAlign: 'right' }}>
              {page.last ? 'Total' : `Continued on sheet ${page.page + 1}`}
            </td>
            <td className="dc-c-qty dc-strong">{page.last ? doc.totalQty : ''}</td>
          </tr>
        </tbody>
      </table>

      <div className="decl-foot">
        <div className="decl-to">
          <div>{courierLine(input.courier)}</div>
          <div className="decl-to-label">TO,</div>
          <div className="dc-strong">{input.to}</div>
          {addressBlock(input).map((line, i) => <div key={i}>{line}</div>)}
        </div>
        <div className="decl-from">
          <div className="dc-strong">{DECLARATION_FORM.forCompany}</div>
          <div className="dc-sign-space" />
          <div>{DECLARATION_FORM.senderName}</div>
          <div>{DECLARATION_FORM.senderDept}</div>
        </div>
      </div>

      {page.pages > 1 && (
        <div className="dc-pagenote">Sheet {page.page} of {page.pages} · Stock Out {doc.stockOutNo}</div>
      )}
    </section>
  );
}
