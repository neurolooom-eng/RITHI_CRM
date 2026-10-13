// ===========================================================================
// QUOTATION, PRINTABLE (0427) -- the document that goes to the customer, on
// the company's letterhead (lib/brand: COMPANY_LOGO, never the app's mark).
//
// A4 portrait. The machines on contract and the spares print as two separate
// tables, each with its own columns, because they are priced differently: a
// contract line is a machine, its cover and a period at a rate; a spare line
// is a part at a unit price for a quantity. The totals, the amount in words,
// the terms and the signature block follow; a Draft, Declined or Cancelled
// quotation prints its status across the page so it cannot pass for a live
// offer.
//
// Every figure is READ from the database -- the generated columns on the
// lines -- never recomputed here; lib/quotes.ts sums them for the foot.
// ===========================================================================
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getQuotation, supabaseConfigured, type Quotation, type QuotationLine } from '../lib/supabase';
import { COMPANY } from '../lib/dc';
import { useMySignature, signatureBelongsTo } from '../lib/signature';
import { useAuth } from '../lib/auth';
import { logAudit } from '../lib/audit';
import { formatDay } from '../lib/dates';
import { amountInWords, money, periodText, quoteTotals } from '../lib/quotes';
// A printed document carries the COMPANY's mark, never the app's (lib/brand).
import { COMPANY_LOGO as logo } from '../lib/brand';
import './quote.css';

export function QuotationPrint() {
  const { quoteNo = '' } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const mine = useMySignature();
  const [doc, setDoc] = useState<{ head: Quotation; lines: QuotationLine[] } | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!supabaseConfigured()) { setErr('Connect the database in Settings to print a quotation.'); return; }
    let live = true;
    getQuotation(decodeURIComponent(quoteNo))
      .then((d) => { if (live) { if (!d) setErr(`Quotation ${quoteNo} was not found, or you cannot view it.`); else setDoc(d); } })
      .catch((e) => { if (live) setErr(e instanceof Error ? e.message : String(e)); });
    return () => { live = false; };
  }, [quoteNo]);

  const back = <button className="btn btn-sm" onClick={() => navigate('/quotations')}>← Back to Quotations</button>;
  if (err) return <div className="qp-page"><div className="qp-toolbar">{back}</div><div className="qp-sheet"><p>{err}</p></div></div>;
  if (!doc) return <div className="qp-page"><div className="qp-sheet"><p>Loading quotation…</p></div></div>;

  const { head: h, lines } = doc;
  const contract = lines.filter((l) => l.line_type === 'Contract');
  const spares = lines.filter((l) => l.line_type === 'Spare');
  // The foot sums the database's own line figures.
  const totals = quoteTotals(lines.map((l) => ({ qty: 1, unit_price: l.taxable_amount ?? 0, discount_pct: 0, gst_pct: 0, line_type: l.line_type })));
  const gst = lines.reduce((t, l) => t + Number(l.tax_amount ?? 0), 0);
  const grand = lines.reduce((t, l) => t + Number(l.total_amount ?? 0), 0);
  const watermark = h.status === 'Draft' ? 'DRAFT' : h.status === 'Declined' ? 'DECLINED' : h.status === 'Cancelled' ? 'CANCELLED' : '';
  const signer = signatureBelongsTo(h.prepared_by_name, user) ? mine : null;

  return (
    <div className="qp-page">
      <div className="qp-toolbar">
        {back}
        <button className="btn btn-sm btn-primary"
          onClick={() => { logAudit({ action: 'quote.print', target: h.quote_no, status: 'ok', meta: { id: h.id, status: h.status } }); window.print(); }}>
          🖨 Print / Save as PDF
        </button>
        <span className="muted">{h.quote_no} · {h.party_name} · {h.status}{watermark ? ` — prints marked ${watermark}` : ''}</span>
      </div>

      <section className="qp-sheet">
        {watermark && <div className="qp-watermark">{watermark}</div>}
        <div className="qp-letterhead">
          <div className="qp-logo"><img src={logo} alt="Air Liquide Healthcare" /></div>
          <div className="qp-org">
            <div className="qp-org-name">{COMPANY.name}</div>
            <div>{COMPANY.address1}</div>
            <div>{COMPANY.address2}</div>
            <div>{COMPANY.phone}</div>
            <div>{COMPANY.email}</div>
            <div>GSTIN: {COMPANY.gstin} · PAN: {COMPANY.pan} · CIN: {COMPANY.cin}</div>
          </div>
        </div>

        <div className="qp-title">QUOTATION</div>

        <div className="qp-parties">
          <div className="qp-to">
            <div className="qp-label">To</div>
            <div className="qp-name">{h.party_name}</div>
            {!!h.party_address && <div className="qp-pre">{h.party_address}</div>}
            <div>{[h.party_city, h.party_state, h.party_pincode].filter(Boolean).join(', ')}</div>
            {!!h.party_gstin && <div>GSTIN: {h.party_gstin}</div>}
            {!!h.party_pan && !h.party_gstin && <div>PAN: {h.party_pan}</div>}
            {!!(h.contact_name || h.contact_phone || h.contact_email) && (
              <div className="qp-contact">Kind attention: {[h.contact_name, h.contact_phone, h.contact_email].filter(Boolean).join(' · ')}</div>
            )}
          </div>
          <div className="qp-meta">
            <div><b>Quotation No. :</b> {h.quote_no}</div>
            <div><b>Date :</b> {formatDay(h.quote_date)}</div>
            <div><b>Valid Until :</b> {h.valid_until ? formatDay(h.valid_until) : '—'}</div>
            <div><b>Your Ref. :</b> {h.customer_ref || '—'}</div>
            {!!h.revision_of && <div><b>Revises :</b> {h.revision_of}</div>}
            <div><b>Prepared By :</b> {h.prepared_by_name || '—'}</div>
          </div>
        </div>

        {!!h.subject && <div className="qp-subject"><b>Subject:</b> {h.subject}</div>}
        <p className="qp-intro">Dear Sir / Madam,<br />We thank you for your enquiry and are pleased to quote as follows:</p>

        {contract.length > 0 && (
          <>
            <div className="qp-section">A. Service Contract — per machine</div>
            <table className="qp-table">
              <colgroup>
                <col className="qp-c-sr" /><col /><col className="qp-c-serial" /><col className="qp-c-cover" /><col className="qp-c-period" />
                <col className="qp-c-amt" /><col className="qp-c-pct" /><col className="qp-c-amt" /><col className="qp-c-pct" /><col className="qp-c-amt" />
              </colgroup>
              <thead><tr>
                <th>Sr.</th><th>Machine / Description</th><th>Serial No.</th><th>Cover</th><th>Period</th>
                <th>Rate (₹)</th><th>Disc %</th><th>Taxable (₹)</th><th>GST %</th><th>Total (₹)</th>
              </tr></thead>
              <tbody>
                {contract.map((l, i) => (
                  <tr key={l.id ?? i}>
                    <td className="c">{i + 1}</td>
                    <td>{l.description}{l.product_name && !l.description.includes(l.product_name) ? <div className="qp-sub">{l.product_name}</div> : null}</td>
                    <td className="mono">{l.serial_number}</td>
                    <td className="c">{l.cover_type}</td>
                    <td>{periodText(l.period_start, l.period_end, l.period_months)}</td>
                    <td className="r mono">{money(l.unit_price)}</td>
                    <td className="r mono">{Number(l.discount_pct) ? money(l.discount_pct) : '—'}</td>
                    <td className="r mono">{money(l.taxable_amount)}</td>
                    <td className="r mono">{money(l.gst_pct)}</td>
                    <td className="r mono">{money(l.total_amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        {spares.length > 0 && (
          <>
            <div className="qp-section">{contract.length ? 'B. ' : ''}Spare Parts</div>
            <table className="qp-table">
              <colgroup>
                <col className="qp-c-sr" /><col className="qp-c-code" /><col /><col className="qp-c-hsn" /><col className="qp-c-qty" />
                <col className="qp-c-amt" /><col className="qp-c-pct" /><col className="qp-c-amt" /><col className="qp-c-pct" /><col className="qp-c-amt" />
              </colgroup>
              <thead><tr>
                <th>Sr.</th><th>Part Code</th><th>Description</th><th>HSN</th><th>Qty</th>
                <th>Unit Price (₹)</th><th>Disc %</th><th>Taxable (₹)</th><th>GST %</th><th>Total (₹)</th>
              </tr></thead>
              <tbody>
                {spares.map((l, i) => (
                  <tr key={l.id ?? i}>
                    <td className="c">{i + 1}</td>
                    <td className="mono">{l.part_code}</td>
                    <td>{l.description}</td>
                    <td className="mono">{l.hsn_code}</td>
                    <td className="r mono">{money(l.qty).replace(/\.00$/, '')}</td>
                    <td className="r mono">{money(l.unit_price)}</td>
                    <td className="r mono">{Number(l.discount_pct) ? money(l.discount_pct) : '—'}</td>
                    <td className="r mono">{money(l.taxable_amount)}</td>
                    <td className="r mono">{money(l.gst_pct)}</td>
                    <td className="r mono">{money(l.total_amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        <div className="qp-totals">
          <div className="qp-words"><b>Amount in words:</b> {amountInWords(grand)}</div>
          <table className="qp-sum mono">
            <tbody>
              <tr><td>Taxable value</td><td className="r">₹ {money(totals.taxable)}</td></tr>
              <tr><td>GST</td><td className="r">₹ {money(gst)}</td></tr>
              <tr className="qp-grand"><td>Grand total</td><td className="r">₹ {money(grand)}</td></tr>
            </tbody>
          </table>
        </div>

        {!!h.remarks && <div className="qp-block"><div className="qp-block-title">Remarks</div><div className="qp-pre">{h.remarks}</div></div>}
        {!!h.terms && <div className="qp-block"><div className="qp-block-title">Terms &amp; Conditions</div><div className="qp-pre qp-terms">{h.terms}</div></div>}

        <div className="qp-signs">
          <div>
            <div>We trust the above is in line with your requirement and look forward to your valued order.</div>
            <div className="qp-sign-space" />
            <div className="qp-strong">For {COMPANY.name}</div>
            <div className="qp-sign-ink-box">{signer?.signature && <img className="qp-sign-ink" src={signer.signature} alt="" />}</div>
            <div>{h.prepared_by_name || ''}</div>
            <div>Authorised Signatory</div>
          </div>
          <div>
            <div className="qp-label">Accepted on behalf of {h.party_name}</div>
            <div className="qp-sign-space qp-sign-space-tall" />
            <div>Name, designation, seal &amp; date</div>
          </div>
        </div>
        <div className="qp-pagenote">{h.quote_no} · {h.status}{h.valid_until ? ` · valid until ${formatDay(h.valid_until)}` : ''} · generated by RITHI CRM</div>
      </section>
    </div>
  );
}
