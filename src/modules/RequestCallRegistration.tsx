import { useState } from 'react';
import { SchemaForm, type FieldDef, type FormValues } from '../components/form/Form';
import { PageHeader, SectionCard } from '../components/ui/ui';
import { ProductLookup } from './FieldCalls';
import { addCrnRequest, sheetsConfigured } from '../lib/sheets';
import { productToCallPrefill, toSheetDate } from '../lib/fieldcall';
import { useAuth } from '../lib/auth';
import './fieldcalls.css';

// ===========================================================================
// REQUEST CALL REGISTRATION — engineers submit a request that is appended to
// the 2026-CRNRequest tab. The sheet transforms it into Data-2026; UCN-less
// rows then appear in Pending Call Registrations for the Hotline Engineer.
// ===========================================================================

const OPT = (arr: string[]) => arr.map((v) => ({ value: v, label: v }));

const FIELDS: FieldDef[] = [
  { name: 'callType', label: 'Call Type', type: 'select', options: OPT(['FIELD', 'INSTALLATION CALL']), required: true, defaultValue: 'FIELD', span: 1 },
  { name: 'planDate', label: 'Planned Visit Date', type: 'date', span: 1 },
  { name: 'partyName', label: 'Party Name', required: true, span: 2 },
  { name: 'city', label: 'City', span: 1 },
  { name: 'state', label: 'State', span: 1 },
  { name: 'productName', label: 'Product', required: true, span: 1 },
  { name: 'serial', label: 'Serial No', span: 1 },
  { name: 'reportedProblem', label: 'Reported Problem', type: 'textarea', rows: 2, required: true, span: 2 },
  { name: 'customerName', label: 'Customer Name', span: 1 },
  { name: 'customerContact', label: 'Customer Contact Details', span: 1 },
  { name: 'customerNumber', label: 'Customer Contact Number', type: 'tel', span: 1 },
  { name: 'place', label: 'Place', span: 1 },
  { name: 'additionalComments', label: 'Additional Comments', type: 'textarea', rows: 2, span: 2 },
];

export function RequestCallRegistration() {
  const { user } = useAuth();
  const [prefill, setPrefill] = useState<FormValues | undefined>(undefined);
  const [prefillKey, setPrefillKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error' | 'info'; text: string } | null>(
    sheetsConfigured() ? null : { tone: 'info', text: 'Connect the Google Sheet in Settings to submit requests.' },
  );

  const submit = async (v: FormValues) => {
    setBusy(true);
    setMsg({ tone: 'info', text: 'Submitting request…' });
    const data: Record<string, unknown> = {
      'E-Mail ID': user?.email ?? '',
      'ENGINEER': user?.fullName ?? '',
      'CALL TYPE': v.callType,
      'PARTY NAME': v.partyName,
      'State': v.state,
      'City': v.city,
      'Reported Problem': v.reportedProblem,
      'PRODUCT': v.productName,
      'SERIAL NO (1)': v.serial,
      'CUSTOMER CONTACT DETAILS': v.customerContact,
      'CUSTOMER CONTACT Number': v.customerNumber,
      'CUSTOMER NAME': v.customerName,
      'PLACE': v.place,
      'PLAN DATE (Visit Planned Date)': v.planDate ? toSheetDate(v.planDate) : '',
      'Additional Comments': v.additionalComments,
    };
    try {
      const ok = await addCrnRequest(data);
      if (ok) {
        setMsg({ tone: 'ok', text: 'Request submitted. It will appear in Pending Call Registrations for the Hotline once the sheet processes it.' });
        setPrefill(undefined);
        setPrefillKey((k) => k + 1);
      } else {
        setMsg({ tone: 'error', text: 'Submit failed — check the connection in Settings.' });
      }
    } catch (e) {
      setMsg({ tone: 'error', text: `Submit failed: ${e instanceof Error ? e.message : String(e)}` });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <PageHeader title="Request Call Registration" subtitle="Raise a call registration request for the Hotline." icon="📝" />

      {msg && (
        <div className={`sheet-banner sheet-banner-${msg.tone}`}>
          <span>{msg.text}</span>
          <button className="btn btn-ghost btn-sm" onClick={() => setMsg(null)}>✕</button>
        </div>
      )}

      <SectionCard title="New Request">
        {sheetsConfigured() && (
          <ProductLookup onPick={(p) => { setPrefill(productToCallPrefill(p)); setPrefillKey((k) => k + 1); }} />
        )}
        <SchemaForm
          key={`req-${prefillKey}`}
          fields={FIELDS}
          initial={prefill}
          submitLabel={busy ? 'Submitting…' : 'Submit Request'}
          onSubmit={submit}
        />
      </SectionCard>
    </div>
  );
}
