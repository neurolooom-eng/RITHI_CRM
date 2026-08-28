import { useEffect, useMemo, useState } from 'react';
import { SchemaForm, type FieldDef, type FormValues } from '../components/form/Form';
import { Drawer } from '../components/ui/ui';
import { getReport, saveReport, sheetsConfigured } from '../lib/sheets';

// ===========================================================================
// CALL REPORTING — "Update Call" against a Field / Installation call.
// Reporting a call is not a separate view: it opens here from any call and the
// report is written to the Call Register's Reporting-N tab, keyed by UC Number
// (updated in place if a row exists, otherwise appended).
// ===========================================================================

const LONG = ['Job Done', 'Complaint Observation', 'Service Report', 'Standard Complaint', 'CALL PENDING REASON', 'Remarks', 'Action Taken'];
const READONLY = ['UC Number', 'Call Number', 'UID', 'Email-ID'];

// Identifying fields carried from the call onto a fresh report (only used when
// the Reporting-N row doesn't already have a value for that column).
const PREFILL_FROM_CALL: Record<string, string> = {
  'UC Number': 'ucn',
  'Call Number': 'callNumber',
  'Call Type': 'callType',
  'Party Name': 'partyName',
  'City': 'city',
  'State': 'state',
  'Product Name': 'productName',
  'Product Serial Number': 'serial',
  'Visiting Service Engineer': 'allocatedTo',
};

export interface CallLike { ucn?: unknown; [key: string]: unknown }

export function CallReportDrawer({
  call, open, onClose, onSaved,
}: {
  call: CallLike | null;
  open: boolean;
  onClose: () => void;
  onSaved?: (mode: string, ucn: string) => void;
}) {
  const ucn = String(call?.ucn ?? '');
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [headers, setHeaders] = useState<string[]>([]);
  const [existing, setExisting] = useState<Record<string, unknown>>({});

  useEffect(() => {
    if (!open || !ucn) return;
    if (!sheetsConfigured()) { setErr('Connect the Google Sheet in Settings to report calls.'); return; }
    let cancelled = false;
    setLoading(true); setErr('');
    getReport(ucn)
      .then((r) => { if (!cancelled) { setHeaders(r.headers); setExisting(r.row); } })
      .catch((e) => { if (!cancelled) setErr(`Couldn't load the report: ${e instanceof Error ? e.message : String(e)}`); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open, ucn]);

  const usableHeaders = useMemo(
    () => headers.filter((h) => h && !h.startsWith('_') && !/^Page.*Header$/i.test(h)),
    [headers],
  );

  // Initial values: the existing report row, back-filled with identifying data
  // from the call for any column that is still empty.
  const initial = useMemo<FormValues>(() => {
    const out: FormValues = {};
    usableHeaders.forEach((h) => {
      const cur = existing[h];
      if (cur != null && String(cur) !== '') { out[h] = cur as never; return; }
      const callKey = PREFILL_FROM_CALL[h];
      out[h] = (callKey && call ? String(call[callKey] ?? '') : '') as never;
    });
    return out;
  }, [usableHeaders, existing, call]);

  const fields: FieldDef[] = usableHeaders.map((h) => ({
    name: h,
    label: h,
    type: LONG.includes(h) ? 'textarea' : 'text',
    rows: LONG.includes(h) ? 2 : undefined,
    readOnly: READONLY.includes(h),
    span: LONG.includes(h) ? 2 : 1,
  }));

  const save = async (v: FormValues) => {
    if (!ucn) { setErr('This call has no UC Number to report against.'); return; }
    // Send only changed, editable fields (plus the UCN link, which the backend
    // fills anyway). Identifying prefills differ from the empty sheet value and
    // are therefore included on a first report.
    const patch: Record<string, unknown> = {};
    usableHeaders.forEach((h) => {
      if (READONLY.includes(h) && h !== 'UC Number') return;
      if (String(v[h] ?? '') !== String(existing[h] ?? '')) patch[h] = v[h];
    });
    if (Object.keys(patch).length === 0) { onClose(); return; }
    setBusy(true); setErr('');
    try {
      const res = await saveReport(ucn, patch);
      if (res.ok) { onSaved?.(res.mode ?? 'saved', ucn); onClose(); }
      else setErr(res.error ?? 'Save failed.');
    } catch (e) {
      setErr(`Save failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Drawer open={open} onClose={onClose} title={ucn ? `Update Call — ${ucn}` : 'Update Call'} width={760}>
      <div className="detail-hint">📝 Reporting is saved to the <b>Reporting-N</b> tab of the Call Register.</div>
      {err && <div className="sheet-banner sheet-banner-error"><span>{err}</span></div>}
      {loading ? (
        <div className="muted" style={{ padding: 16 }}>Loading report…</div>
      ) : usableHeaders.length > 0 ? (
        <SchemaForm
          key={ucn + (loading ? '-l' : '')}
          fields={fields}
          initial={initial}
          sectionOrderKey="callreport"
          submitLabel={busy ? 'Saving…' : 'Save Report'}
          onSubmit={save}
          onCancel={onClose}
        />
      ) : !err ? (
        <div className="muted" style={{ padding: 16 }}>No reporting columns found on the Reporting-N tab.</div>
      ) : null}
    </Drawer>
  );
}
